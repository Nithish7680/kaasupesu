// The two conversations as pure decision functions: ownerStep (the owner's note) and callStep (the call).
// Each takes the current state and one input, and returns a new state plus the lines to say. Nothing here
// mutates its arguments, talks to the network or reads the clock, so the tests can drive every path.
import { ownerLines, ownerNextStep, buyerLine, rupees, dayMonth, monthDay } from './lines.js';
import {
  INTENTS, extractOwnerNote, findContact, findDate, classifyConfirm, classifyReply, parseAmount,
  soundAlike, matchChoice, digitsIn, groupDigits, daysBetween, isPlausiblePromise,
} from './parse.js';

export const LEGAL_DAYS = 45;
const MAX_FAILED_RECORDINGS = 2; // "After two failures, show a text box."
const MAX_UNCLEAR = 2; // "after two unclear replies ..."
const MAX_SILENCES = 2; // "... or two eight-second silences"
const MIN_PHONE_DIGITS = 10;
const FREE_TEXT_LIMIT = 80;
const TONES = ['calm', 'annoyed', 'unsure'];

const result = (state, replies, events = []) => ({ state, replies, events });
const clip = (text) => String(text ?? '').trim().slice(0, FREE_TEXT_LIMIT);

// --- The owner's note -----------------------------------------------------------------------------

function emptyDraft() {
  return {
    contactId: null, newContact: null, unknownName: null, phone: null,
    amount: null, amountHeard: false, amountConfirmed: false, billDate: null, language: null,
  };
}

export function initialOwnerState() {
  return { step: 'idle', draft: emptyDraft(), failures: 0, textBoxRequired: false };
}

// input: { kind: 'utterance', text, source: 'speech' | 'text', extracted? } or { kind: 'silence' }
export function ownerStep(state, input, ctx) {
  const text = String(input.text ?? '').trim();
  if (input.kind === 'silence' || !text) return failedRecording(state);
  const live = { ...state, failures: 0, textBoxRequired: false };
  const said = { ...input, text };
  switch (state.step) {
    case 'askNumber': return onNumber(live, said, ctx);
    case 'confirmNumber': return onNumberAnswer(live, said, ctx);
    case 'choosingAmount': return onAmountChoice(live, said, ctx);
    case 'confirming': return onReadBackAnswer(live, said, ctx);
    case 'correcting': return onCorrection(live, said, ctx);
    default: return onNote(live, said, ctx);
  }
}

function failedRecording(state) {
  const failures = state.failures + 1;
  if (failures >= MAX_FAILED_RECORDINGS) {
    return result({ ...state, failures, textBoxRequired: true }, [ownerLines.typeInstead()]);
  }
  return result({ ...state, failures }, [ownerLines.notHeard()]);
}

function onNote(state, input, ctx) {
  const base = state.step === 'ready' ? emptyDraft() : state.draft;
  const draft = mergeFields(base, readFields(input, ctx), input.source);
  return askNext({ ...state, draft }, ctx);
}

// Model fields (keyed path) win where present; the rules fill the gaps. Code re-resolves everything.
function readFields(input, ctx) {
  const rules = extractOwnerNote(input.text, ctx.contacts, ctx.today, ctx.owner.business);
  if (!input.extracted) return rules;
  const model = fromModel(input.extracted, ctx);
  return Object.fromEntries(Object.entries(rules).map(([key, value]) => [key, model[key] ?? value]));
}

function fromModel(x, ctx) {
  const contact = findContact(`${x.contactName ?? ''} ${x.business ?? ''}`, ctx.contacts);
  return {
    contactId: contact?.id ?? null,
    unknownName: contact ? null : (x.business || x.contactName || null),
    amount: Number.isInteger(x.amount) && x.amount > 0 ? x.amount : null,
    billDate: x.billDateText ? findDate(x.billDateText, ctx.today, 'past') : null,
    language: ['hi', 'ta', 'en'].includes(x.language) ? x.language : null,
  };
}

function mergeFields(draft, fields, source) {
  const amountChanged = fields.amount != null && fields.amount !== draft.amount;
  const contactId = fields.contactId ?? draft.contactId;
  return {
    ...draft,
    contactId,
    unknownName: contactId ? null : (fields.unknownName ?? draft.unknownName),
    amount: fields.amount ?? draft.amount,
    amountHeard: amountChanged ? source === 'speech' : draft.amountHeard,
    amountConfirmed: amountChanged ? false : draft.amountConfirmed,
    billDate: fields.billDate ?? draft.billDate,
    language: fields.language ?? draft.language,
  };
}

// Ask only for what is missing; then the sound-alike choice (heard amounts only); then the read-back.
function askNext(state, ctx) {
  const d = state.draft;
  if (!d.contactId && !d.unknownName) return result({ ...state, step: 'collecting' }, [ownerLines.askContact()]);
  if (!d.contactId) return result({ ...state, step: 'askNumber' }, [ownerLines.askNumber(d.unknownName)]);
  if (d.amount == null) return result({ ...state, step: 'collecting' }, [ownerLines.askAmount()]);
  if (!d.billDate) return result({ ...state, step: 'collecting' }, [ownerLines.askBillDate()]);
  const other = soundAlike(d.amount);
  if (d.amountHeard && other && !d.amountConfirmed) {
    return result({ ...state, step: 'choosingAmount' }, [ownerLines.amountChoice(d.amount, other)]);
  }
  return result({ ...state, step: 'confirming' }, [ownerLines.readBack(readBackView(d, ctx))]);
}

function contactFor(d, ctx) {
  return d.newContact?.id === d.contactId ? d.newContact : ctx.contacts.find((c) => c.id === d.contactId);
}

function readBackView(d, ctx) {
  const contact = contactFor(d, ctx);
  return {
    business: contact.business, contactName: contact.name, amount: d.amount, billDate: d.billDate,
    language: d.language ?? contact.language,
  };
}

// Digits win ("ph no 98400 12345" is a number). Otherwise naming a saved contact switches to it, and "illa"
// goes back to who to call.
function onNumber(state, input, ctx) {
  const digits = digitsIn(input.text);
  if (digits.length >= MIN_PHONE_DIGITS) {
    return result(
      { ...state, step: 'confirmNumber', draft: { ...state.draft, phone: digits } },
      [ownerLines.readDigits(groupDigits(digits))],
    );
  }
  const contact = findContact(input.text, ctx.contacts);
  if (contact) return askNext({ ...state, draft: { ...state.draft, contactId: contact.id, unknownName: null } }, ctx);
  if (classifyConfirm(input.text) === 'no') return askNext({ ...state, draft: { ...state.draft, unknownName: null } }, ctx);
  return result(state, [ownerLines.askNumber(state.draft.unknownName)]);
}

function onNumberAnswer(state, input, ctx) {
  const digits = digitsIn(input.text);
  if (digits.length >= MIN_PHONE_DIGITS) {
    return result({ ...state, draft: { ...state.draft, phone: digits } }, [ownerLines.readDigits(groupDigits(digits))]);
  }
  const answer = classifyConfirm(input.text);
  if (answer === 'no') {
    return result({ ...state, step: 'askNumber', draft: { ...state.draft, phone: null } }, [ownerLines.askNumber(state.draft.unknownName)]);
  }
  if (answer !== 'yes') return result(state, [ownerLines.readDigits(groupDigits(state.draft.phone))]);
  const contact = newContact(state.draft);
  const next = askNext({ ...state, draft: { ...state.draft, contactId: contact.id, newContact: contact, unknownName: null } }, ctx);
  return { ...next, events: [{ type: 'contactCreated', contact }, ...next.events] };
}

// A new contact is called in English until the owner says otherwise at the read-back.
function newContact(d) {
  const name = d.unknownName;
  return {
    id: `c-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, business: name, city: '',
    language: d.language ?? 'en', phone: d.phone, callName: name, ownerRef: name, pronoun: 'they',
    aliases: [name.toLowerCase()],
  };
}

// Any amount said here is the owner's answer; "forty" or "fourteen" picks one; "illa" asks for the amount again.
function onAmountChoice(state, input, ctx) {
  const heard = state.draft.amount;
  const other = soundAlike(heard);
  const chosen = parseAmount(input.text)?.value ?? matchChoice(input.text, [heard, other]);
  if (chosen != null) return askNext({ ...state, draft: { ...state.draft, amount: chosen, amountConfirmed: true } }, ctx);
  if (classifyConfirm(input.text) === 'no') {
    return result({ ...state, step: 'collecting', draft: { ...state.draft, amount: null, amountHeard: false } }, [ownerLines.askAmount()]);
  }
  return result(state, [ownerLines.amountChoice(heard, other)]);
}

function onReadBackAnswer(state, input, ctx) {
  const answer = classifyConfirm(input.text);
  if (answer === 'no') return result({ ...state, step: 'correcting' }, [ownerLines.whatToChange()]);
  const view = readBackView(state.draft, ctx);
  if (answer !== 'yes') return result(state, [ownerLines.readBack(view)]); // "hmm" is asked again
  const d = state.draft;
  const bill = {
    id: `b-${d.contactId}-${d.billDate}`, contactId: d.contactId, amount: d.amount, billDate: d.billDate,
    promisedDate: null, paid: false, disputed: false, language: view.language, calls: [],
  };
  return result({ ...state, step: 'ready' }, [ownerLines.calling(view.contactName)], [{ type: 'billReady', bill }]);
}

function onCorrection(state, input, ctx) {
  const draft = mergeFields(state.draft, readFields(input, ctx), input.source);
  const changed = ['contactId', 'unknownName', 'amount', 'billDate', 'language'].some((key) => draft[key] !== state.draft[key]);
  if (!changed) return result(state, [ownerLines.whatToChange()]);
  return askNext({ ...state, draft }, ctx);
}

// --- The call -------------------------------------------------------------------------------------

function callVars(ctx) {
  return {
    callName: ctx.contact.callName ?? ctx.contact.name, owner: ctx.owner.business, city: ctx.owner.city,
    amount: rupees(ctx.bill.amount), day: dayMonth(ctx.bill.billDate),
  };
}

export function legalLineApplies(bill, owner, today) {
  const covered = owner.udyamRegistered && ['micro', 'small'].includes(owner.size)
    && ['manufacturer', 'service'].includes(owner.kind);
  return covered && daysBetween(bill.billDate, today) > LEGAL_DAYS;
}

// ctx: { bill, contact, owner, today }
export function startCall(ctx) {
  const language = ctx.bill.language ?? ctx.contact.language;
  const vars = callVars(ctx);
  const say = (key, extra = {}) => buyerLine(key, language, { ...vars, ...extra });
  const missed = ctx.bill.promisedDate && ctx.bill.promisedDate < ctx.today
    ? [say('missedPromise', { date: dayMonth(ctx.bill.promisedDate) })] : [];
  const legal = legalLineApplies(ctx.bill, ctx.owner, ctx.today) ? [say('legal')] : [];
  const state = {
    phase: 'awaitDate', language, vagueAsked: false, unclear: 0, silences: 0, outcome: null, promisedDate: null,
    reason: '', reference: '', callback: '', tone: 'calm', billSent: false, ended: false, keyMoment: null,
  };
  return { state, replies: [say('greeting'), ...missed, ...legal, say('askDate')] };
}

// input: { kind: 'reply', text, at, classified? } or { kind: 'silence', at }. `at` is seconds into the call.
export function callStep(state, input, ctx) {
  if (state.ended) return { state, replies: [] };
  const vars = callVars(ctx);
  const say = (key, extra = {}) => buyerLine(key, state.language, { ...vars, ...extra });
  const text = String(input.text ?? '').trim();
  if (input.kind === 'silence' || !text) return onSilence(state, input.at, say);
  const live = { ...state, silences: 0 }; // only silences in a row end the call
  switch (state.phase) {
    case 'awaitBillOffer': return onBillOffer(live, text, say);
    case 'awaitPaidReference': return endCall({ ...live, reference: clip(text) }, [say('willTellOwner'), say('thanks')]);
    case 'awaitCallbackTime': return endCall({ ...live, callback: clip(text) }, [say('callbackBooked', { when: clip(text) }), say('thanks')]);
    case 'awaitPaymentContact': return endCall({ ...live, reason: clip(text) }, [say('thanks')]);
    default: return onDateAnswer(live, { ...input, text }, ctx.today, say);
  }
}

const endCall = (state, replies) => ({ state: { ...state, phase: 'ended', ended: true }, replies });
const moment = (label, at) => ({ label, at: Math.max(0, Math.round(Number(at) || 0)) });

function onSilence(state, at, say) {
  const silences = state.silences + 1;
  if (silences < MAX_SILENCES) return { state: { ...state, silences }, replies: [say('notCaught')] };
  if (state.outcome) return endCall({ ...state, silences }, [say('thanks')]);
  return endCall({ ...state, silences, outcome: 'unclear', keyMoment: moment('No answer', at) }, [say('callBackLater')]);
}

// The model proposes a label; code checks it against the seven and re-resolves the date itself.
function readReply(input, today) {
  const model = input.classified;
  if (!model || !INTENTS.includes(model.intent)) return classifyReply(input.text, today);
  const tone = TONES.includes(model.tone) ? model.tone : 'calm';
  if (model.intent !== 'promised') {
    const reason = clip(model.reason) || (model.intent === 'dispute' ? clip(input.text) : '');
    return { intent: model.intent, date: null, reason, tone };
  }
  const date = findDate(model.dateText || input.text, today, 'future');
  return isPlausiblePromise(date, today)
    ? { intent: 'promised', date, reason: '', tone }
    : { intent: 'vague', date: null, reason: '', tone };
}

function onDateAnswer(state, input, today, say) {
  const reading = readReply(input, today);
  const next = { ...state, tone: reading.tone };
  const at = input.at;
  switch (reading.intent) {
    case 'promised':
      return {
        state: { ...next, phase: 'awaitBillOffer', outcome: 'promised', promisedDate: reading.date, keyMoment: moment('Promise', at) },
        replies: [say('confirmPromise', { date: dayMonth(reading.date) }), say('offerBill')],
      };
    case 'vague':
      if (!state.vagueAsked) return { state: { ...next, vagueAsked: true }, replies: [say('askDateAgain')] };
      return endCall({ ...next, outcome: 'vague', keyMoment: moment('No date', at) }, [say('noDate'), say('thanks')]);
    case 'paid':
      return { state: { ...next, phase: 'awaitPaidReference', outcome: 'paid', keyMoment: moment('Says paid', at) }, replies: [say('askPaidRef')] };
    case 'dispute':
      return endCall({ ...next, outcome: 'dispute', reason: reading.reason, keyMoment: moment('Dispute', at) }, [say('willTellOwner'), say('thanks')]);
    case 'call_later':
      return { state: { ...next, phase: 'awaitCallbackTime', outcome: 'call_later', keyMoment: moment('Call later', at) }, replies: [say('askWhenLater')] };
    case 'wrong_person':
      return { state: { ...next, phase: 'awaitPaymentContact', outcome: 'wrong_person', keyMoment: moment('Wrong person', at) }, replies: [say('wrongPerson')] };
    default: {
      const unclear = state.unclear + 1;
      if (unclear < MAX_UNCLEAR) return { state: { ...next, unclear }, replies: [say('notCaught')] };
      return endCall({ ...next, unclear, outcome: 'unclear', keyMoment: moment('Unclear', at) }, [say('callBackLater')]);
    }
  }
}

// Never send the bill without a clear yes.
function onBillOffer(state, text, say) {
  if (classifyConfirm(text) === 'yes') return endCall({ ...state, billSent: true }, [say('billSent'), say('thanks')]);
  return endCall(state, [say('thanks')]);
}

// --- After the call -------------------------------------------------------------------------------

const DETAIL = {
  promised: (s) => dayMonth(s.promisedDate),
  call_later: (s) => s.callback,
  paid: (s) => s.reference,
};

export function summarizeCall(state, ctx) {
  const outcome = state.outcome ?? 'unclear';
  const details = {
    ref: ctx.contact.ownerRef ?? ctx.contact.name,
    pronoun: ctx.contact.pronoun ?? 'they',
    date: state.promisedDate ? monthDay(state.promisedDate) : '',
    when: state.callback,
    billSent: state.billSent,
  };
  return {
    intent: outcome,
    detail: (DETAIL[outcome] ?? ((s) => s.reason))(state),
    tone: state.tone,
    nextStep: ownerNextStep(outcome, details),
    keyMoment: state.keyMoment,
    voiceNote: ownerLines.voiceNote(outcome, details),
  };
}

export function applyCallOutcome(bill, state, record) {
  return {
    ...bill,
    promisedDate: state.outcome === 'promised' ? state.promisedDate : bill.promisedDate,
    paid: bill.paid || state.outcome === 'paid',
    disputed: bill.disputed || state.outcome === 'dispute',
    calls: [...bill.calls, record],
  };
}

export function billStatus(bill, today) {
  if (bill.paid) return 'Paid';
  if (bill.disputed) return 'Disputed';
  if (bill.promisedDate) return bill.promisedDate >= today ? 'Promised' : 'Missed';
  return daysBetween(bill.billDate, today) > LEGAL_DAYS ? 'Past 45 days' : 'Waiting';
}

export function formatOffset(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
