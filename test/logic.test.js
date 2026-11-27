// Tests for the two conversations. Every line quoted in the Activity 2 prompt (docs/round1.md) is a fixture here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TODAY, OWNER, CONTACTS, BILLS, SAMPLE_REPLIES } from '../src/lines.js';
import {
  parseAmount, soundAlike, findDate, extractOwnerNote, classifyConfirm, classifyReply,
} from '../src/parse.js';
import {
  initialOwnerState, ownerStep, startCall, callStep, summarizeCall,
  billStatus, legalLineApplies, formatOffset, applyCallOutcome,
} from '../src/flows.js';

const OWNER_NOTE = 'Delhi-la Sharma Garments kitta ₹40,000 baakki irukku. October 12 bill. Avanga accountant Ramesh-ku call pannu.';
const READ_BACK = 'Sharma Garments, ₹40,000, October 12 bill. Ramesh-ku Hindi-la call pannattuma?';
const RAMESH_OPENING = "Hello Ramesh ji, this is Lakshmi Fabrics' automated assistant from Tiruppur. "
  + 'The ₹40,000 bill from 12 October is still pending. By what date can you clear it?';
const LEGAL = 'Under the MSME law, a small supplier must be paid within 45 days. After that, interest at three times '
  + "the RBI bank rate applies, and the expense can't be claimed for tax until paid.";
const INTENT_ORDER = ['promised', 'vague', 'paid', 'dispute', 'call_later', 'wrong_person'];

const contact = (id) => CONTACTS.find((c) => c.id === id);
const bill = (id) => BILLS.find((b) => b.id === id);
const ownerCtx = { contacts: CONTACTS, owner: OWNER, today: TODAY };
const rameshBill = {
  id: 'b-ramesh', contactId: 'ramesh', amount: 40000, billDate: '2026-10-12', promisedDate: null,
  paid: false, disputed: false, calls: [],
};

const say = (text, source = 'text') => ({ kind: 'utterance', text, source });
const reply = (text, at = 0, classified = null) => ({ kind: 'reply', text, at, classified });
const silence = (at = 0) => ({ kind: 'silence', at });
const glosses = (lines) => lines.map((line) => line.gloss);

function runOwner(inputs) {
  let state = initialOwnerState();
  const out = [];
  for (const input of inputs) {
    const step = ownerStep(state, input, ownerCtx);
    state = step.state;
    out.push(step);
  }
  return { state, out };
}

function runCall(callBill, callContact, inputs, owner = OWNER) {
  const ctx = { bill: callBill, contact: callContact, owner, today: TODAY };
  const opening = startCall(ctx);
  let { state } = opening;
  const out = [opening.replies];
  for (const input of inputs) {
    const step = callStep(state, input, ctx);
    state = step.state;
    out.push(step.replies);
  }
  return { state, out, ctx };
}

// --- Reading amounts and dates -------------------------------------------------------------------

test('reads amounts written as digits, shorthand and spoken words', () => {
  const cases = [
    ['₹40,000 baakki', 40000], ['40k pending', 40000], ['forty thousand', 40000],
    ['naarpadhaayiram baakki', 40000], ['chaalees hazaar', 40000], ['1.5 lakh', 150000], ['Rs. 2,500', 2500],
  ];
  for (const [text, value] of cases) assert.equal(parseAmount(text)?.value, value, text);
});

test('does not read a bill date as an amount', () => {
  assert.equal(parseAmount('October 12 bill'), null);
});

test('pairs sound-alike amounts and leaves the rest alone', () => {
  assert.equal(soundAlike(40000), 14000);
  assert.equal(soundAlike(14000), 40000);
  assert.equal(soundAlike(90000), 19000);
  assert.equal(soundAlike(25000), null);
  assert.equal(soundAlike(40500), null);
});

test('bill dates resolve to the most recent past date', () => {
  assert.equal(findDate('October 12', TODAY, 'past'), '2026-10-12');
  assert.equal(findDate('December 5 bill', TODAY, 'past'), '2025-12-05');
  // The prompt's example maps a bare "12-aam thethi" to 12 October, but its own rule (most recent past date)
  // gives 12 November. The rule wins; saying the month gives October.
  assert.equal(findDate('12-aam thethi', TODAY, 'past'), '2026-11-12');
  assert.equal(findDate('October 12-aam thethi', TODAY, 'past'), '2026-10-12');
});

test('promised dates resolve to the next future date', () => {
  assert.equal(findDate('30 tareekh tak kar denge', TODAY, 'future'), '2026-11-30');
  assert.equal(findDate('November 30-kulla', TODAY, 'future'), '2026-11-30');
  assert.equal(findDate('10 tareekh', TODAY, 'future'), '2026-12-10');
  assert.equal(findDate('kal tak kar denge', TODAY, 'future'), '2026-11-21');
});

// --- Reading the owner ----------------------------------------------------------------------------

test('reads the scripted owner note', () => {
  const note = extractOwnerNote(OWNER_NOTE, CONTACTS, TODAY, OWNER.business);
  assert.deepEqual(
    { contactId: note.contactId, amount: note.amount, billDate: note.billDate },
    { contactId: 'ramesh', amount: 40000, billDate: '2026-10-12' },
  );
});

test('names an unknown business instead of guessing a contact', () => {
  const note = extractOwnerNote('Gupta Traders kitta 15,000 baakki, October 2 bill', CONTACTS, TODAY, OWNER.business);
  assert.equal(note.contactId, null);
  assert.equal(note.unknownName, 'Gupta Traders');
});

test("reads the owner's yes and no words", () => {
  for (const word of ['Aamaa', 'seri', 'ok', 'pannu']) assert.equal(classifyConfirm(word), 'yes', word);
  for (const word of ['Illa', 'vendaam']) assert.equal(classifyConfirm(word), 'no', word);
  for (const word of ['hmm', 'paakalam']) assert.equal(classifyConfirm(word), 'unclear', word);
});

// --- Reading the buyer ----------------------------------------------------------------------------

test('labels each sample buyer reply from the prompt, in Hindi, Tamil and English', () => {
  for (const language of ['hi', 'ta', 'en']) {
    SAMPLE_REPLIES[language].forEach((text, i) => {
      assert.equal(classifyReply(text, TODAY).intent, INTENT_ORDER[i], `${language}: ${text}`);
    });
  }
});

test('a reply that fits no intent is unclear', () => {
  assert.equal(classifyReply('haan haan theek hai', TODAY).intent, 'unclear');
});

test('a promise carries its resolved date', () => {
  assert.equal(classifyReply('30 tareekh tak kar denge', TODAY).date, '2026-11-30');
});

// --- The owner conversation -----------------------------------------------------------------------

test('a typed owner note is read back, then confirmed into a bill', () => {
  const { state, out } = runOwner([say(OWNER_NOTE), say('Aamaa')]);
  assert.equal(out[0].replies[0].text, READ_BACK);
  assert.equal(state.step, 'ready');
  const ready = out[1].events.find((e) => e.type === 'billReady');
  assert.deepEqual(
    { contactId: ready.bill.contactId, amount: ready.bill.amount, billDate: ready.bill.billDate, language: ready.bill.language },
    { contactId: 'ramesh', amount: 40000, billDate: '2026-10-12', language: 'hi' },
  );
});

test('replies to the owner are short Tanglish lines', () => {
  const { out } = runOwner([say(OWNER_NOTE)]);
  for (const line of out[0].replies) {
    assert.ok(line.text.split(/\s+/).length < 15, line.text);
    assert.equal(line.speak.lang, 'ta-IN');
  }
});

test('a heard sound-alike amount is asked as a choice before the read-back', () => {
  const { out, state } = runOwner([say(OWNER_NOTE, 'speech'), say('forty', 'speech')]);
  assert.equal(out[0].replies[0].text, 'Forty thousand-aa, fourteen thousand-aa?');
  assert.equal(out[1].replies[0].text, READ_BACK);
  assert.equal(state.step, 'confirming');
});

test('"Illa" asks what to change, and only the corrected field changes', () => {
  const { out, state } = runOwner([say(OWNER_NOTE), say('Illa'), say('amount 14,000')]);
  assert.equal(out[1].replies[0].text, 'Edhu maaththanum?');
  assert.equal(out[2].replies[0].text, 'Sharma Garments, ₹14,000, October 12 bill. Ramesh-ku Hindi-la call pannattuma?');
  assert.equal(state.step, 'confirming');
});

test('anything else, like "hmm", is asked again and no call starts', () => {
  const { out, state } = runOwner([say(OWNER_NOTE), say('hmm')]);
  assert.equal(out[1].replies[0].text, READ_BACK);
  assert.equal(state.step, 'confirming');
  assert.equal(out[1].events.length, 0);
});

test('two failed recordings show the text box', () => {
  const { out, state } = runOwner([{ kind: 'silence' }, say('   ', 'speech')]);
  assert.equal(out[0].replies[0].text, 'Sariya kekkala, innoru thadava sollunga.');
  assert.equal(state.textBoxRequired, true);
});

test('only the missing detail is asked for', () => {
  const { out } = runOwner([say('Sharma Garments kitta baakki irukku, October 12 bill')]);
  assert.equal(out[0].replies[0].key, 'askAmount');
});

test('an unknown contact is asked for a number, read back in groups, then saved', () => {
  const { out, state } = runOwner([
    say('Gupta Traders kitta 15,000 baakki, October 2 bill'), say('98400 12345'), say('aamaa'),
  ]);
  assert.equal(out[0].replies[0].text, 'Gupta Traders number illa. Number sollunga.');
  assert.equal(out[1].replies[0].text, '98400 12345, sariyaa?');
  assert.equal(out[2].events[0].type, 'contactCreated');
  assert.equal(
    out[2].replies[0].text,
    'Gupta Traders, ₹15,000, October 2 bill. Gupta Traders-ku English-la call pannattuma?',
  );
  assert.equal(state.step, 'confirming');
});

// --- The call -------------------------------------------------------------------------------------

test('Ramesh: opening, promise repeated, bill offered and sent on a yes', () => {
  const { state, out, ctx } = runCall(rameshBill, contact('ramesh'), [
    reply('30 tareekh tak kar denge', 42), reply('haan, bhej do', 51),
  ]);
  assert.equal(glosses(out[0]).join(' '), RAMESH_OPENING);
  assert.equal(out[0][0].speak.lang, 'hi-IN');
  assert.deepEqual(glosses(out[1]), ['So, 30 November.', 'Shall I send the bill and payment link on WhatsApp?']);
  assert.deepEqual(
    { outcome: state.outcome, promisedDate: state.promisedDate, billSent: state.billSent, ended: state.ended },
    { outcome: 'promised', promisedDate: '2026-11-30', billSent: true, ended: true },
  );
  const summary = summarizeCall(state, ctx);
  assert.equal(`${summary.keyMoment.label} at ${formatOffset(summary.keyMoment.at)}`, 'Promise at 0:42');
  assert.equal(
    summary.voiceNote.text,
    'Ramesh sir November 30-kulla pay pannidrennu sonnaru. Bill-um link-um WhatsApp-la anuppitten.',
  );
});

test('yes and no in Tamil and Devanagari script, as Wispr may write them', () => {
  for (const text of ['ஆமா', 'சரி', 'हाँ, भेज दो', 'जी हां', 'भेज दो ना']) assert.equal(classifyConfirm(text), 'yes', text);
  for (const text of ['இல்ல', 'வேண்டாம்', 'नहीं', 'मत भेजो']) assert.equal(classifyConfirm(text), 'no', text);
});

test('a native-script yes with "later", "wait" or "wrong" in it is not a yes', () => {
  for (const text of ['जी, बाद में भेजना', 'ठीक है, रुको', 'हाँ पर बिल गलत है', 'சரி, அப்புறம் பண்ணலாம்', 'சரி, பிறகு', 'தப்பு']) {
    assert.equal(classifyConfirm(text), 'no', text);
  }
  assert.equal(classifyConfirm('धन्यवाद, भेज दो'), 'yes', 'बाद inside धन्यवाद is not "later"');
});

test('a read-back confirmed in Tamil script starts the call, and a Devanagari yes sends the bill', () => {
  const owner = runOwner([say(OWNER_NOTE), say('ஆமா', 'speech')]);
  assert.equal(owner.state.step, 'ready');
  const call = runCall(rameshBill, contact('ramesh'), [reply('30 tareekh tak kar denge', 10), reply('हाँ, भेज दो', 15)]);
  assert.equal(call.state.billSent, true);
});

test('no bill is sent without a clear yes', () => {
  const { state } = runCall(rameshBill, contact('ramesh'), [reply('30 tareekh tak kar denge', 10), reply('hmm', 15)]);
  assert.equal(state.billSent, false);
  assert.equal(state.ended, true);
});

test('the legal line follows the bill age and the owner type', () => {
  const ramesh = runCall(rameshBill, contact('ramesh'), []);
  assert.ok(!ramesh.out[0].some((line) => line.key === 'legal'), 'Ramesh: 39 days');
  const john = runCall(bill('b-john'), contact('john'), []);
  assert.ok(glosses(john.out[0]).includes(LEGAL), 'John: 66 days');
  const trader = runCall(bill('b-john'), contact('john'), [], { ...OWNER, kind: 'trader' });
  assert.ok(!trader.out[0].some((line) => line.key === 'legal'), 'a trader owner never says it');
  assert.equal(legalLineApplies(bill('b-john'), OWNER, TODAY), true);
  assert.equal(legalLineApplies(rameshBill, OWNER, TODAY), false);
});

test("Priya's call opens in Tamil with her missed promise", () => {
  const { out } = runCall(bill('b-priya'), contact('priya'), []);
  assert.equal(out[0][0].speak.lang, 'ta-IN');
  assert.ok(glosses(out[0]).includes('You had said 15 November.'));
  assert.ok(!out[0].some((line) => line.key === 'legal'), 'Priya: 31 days');
});

test('a vague reply is asked for a date once, then logged as no date', () => {
  const { state, out, ctx } = runCall(rameshBill, contact('ramesh'), [
    reply('agle hafte dekhte hain', 8), reply('jaldi', 16),
  ]);
  assert.deepEqual(glosses(out[1]), ['Could you give me a date?']);
  assert.equal(state.outcome, 'vague');
  assert.equal(state.ended, true);
  assert.equal(summarizeCall(state, ctx).keyMoment.label, 'No date');
});

test('a vague reply followed by a date is a promise', () => {
  const { state } = runCall(rameshBill, contact('ramesh'), [
    reply('agle hafte dekhte hain', 8), reply('30 tareekh tak kar denge', 16),
  ]);
  assert.equal(state.outcome, 'promised');
  assert.equal(state.promisedDate, '2026-11-30');
});

test('paid asks for the date and the reference', () => {
  const { state, out } = runCall(rameshBill, contact('ramesh'), [
    reply('payment kal hi kar diya', 9), reply('UTR 4521, 19 November', 20),
  ]);
  assert.deepEqual(glosses(out[1]), ['Thank you. On what date did you pay, and what is the payment reference?']);
  assert.equal(state.outcome, 'paid');
  assert.equal(state.reference, 'UTR 4521, 19 November');
});

test('a dispute is acknowledged, logged and never argued', () => {
  const { state, out } = runCall(rameshBill, contact('ramesh'), [reply('maal mein defect tha', 12)]);
  assert.deepEqual(glosses(out[1]), ["I'll tell Lakshmi Fabrics.", 'Thank you, Ramesh ji.']);
  assert.equal(state.outcome, 'dispute');
  assert.equal(state.reason, 'maal mein defect tha');
});

test('call later asks when, and books it', () => {
  const { state, out } = runCall(rameshBill, contact('ramesh'), [
    reply('meeting mein hoon, shaam ko call karo', 6), reply('shaam 5 baje', 12),
  ]);
  assert.deepEqual(glosses(out[1]), ['Sure. When should I call back?']);
  assert.equal(out[2][0].gloss, "Okay, I'll call shaam 5 baje.");
  assert.equal(state.callback, 'shaam 5 baje');
});

test('the wrong person gets an apology and a question', () => {
  const { out } = runCall(rameshBill, contact('ramesh'), [reply('main accounts mein nahi hoon', 7)]);
  assert.deepEqual(glosses(out[1]), ['Sorry to bother you. Who handles payments?']);
});

test('two unclear replies end the call with "I\'ll call back later"', () => {
  const { state, out } = runCall(rameshBill, contact('ramesh'), [reply('xyz', 5), reply('abc', 9)]);
  assert.deepEqual(glosses(out[1]), ["Sorry, I didn't catch that. Could you say it again?"]);
  assert.deepEqual(glosses(out[2]), ["I'll call back later."]);
  assert.equal(state.outcome, 'unclear');
});

test('two silences end the call the same way', () => {
  const { state, out } = runCall(rameshBill, contact('ramesh'), [silence(8), silence(16)]);
  assert.deepEqual(glosses(out[2]), ["I'll call back later."]);
  assert.equal(state.outcome, 'unclear');
});

test('a model label outside the seven is ignored in favour of the rules', () => {
  const odd = { intent: 'refund', dateText: '', reason: '', tone: 'calm' };
  const { state } = runCall(rameshBill, contact('ramesh'), [reply('30 tareekh tak kar denge', 5, odd)]);
  assert.equal(state.outcome, 'promised');
});

test('a model "promised" with no date the code can read is not recorded as a promise', () => {
  const noDate = { intent: 'promised', dateText: '', reason: '', tone: 'calm' };
  const { state, out } = runCall(rameshBill, contact('ramesh'), [reply('jaldi', 5, noDate)]);
  assert.deepEqual(glosses(out[1]), ['Could you give me a date?']);
  assert.equal(state.promisedDate, null);
});

test('a model promise is re-dated by code', () => {
  const promised = { intent: 'promised', dateText: '30 tareekh', reason: '', tone: 'calm' };
  const { state } = runCall(rameshBill, contact('ramesh'), [reply('thirty tak', 5, promised)]);
  assert.equal(state.promisedDate, '2026-11-30');
});

// --- Bills ----------------------------------------------------------------------------------------

test('status chips follow the bill', () => {
  assert.equal(billStatus(bill('b-priya'), TODAY), 'Missed');
  assert.equal(billStatus(bill('b-john'), TODAY), 'Past 45 days');
  assert.equal(billStatus(rameshBill, TODAY), 'Waiting');
  assert.equal(billStatus({ ...rameshBill, promisedDate: '2026-11-30' }, TODAY), 'Promised');
  assert.equal(billStatus({ ...rameshBill, disputed: true }, TODAY), 'Disputed');
  assert.equal(billStatus({ ...rameshBill, paid: true }, TODAY), 'Paid');
});

test('a call outcome updates a copy of the bill, never the original', () => {
  const { state } = runCall(rameshBill, contact('ramesh'), [reply('30 tareekh tak kar denge', 42), reply('haan', 50)]);
  const updated = applyCallOutcome(rameshBill, state, { time: '20 Nov, 3:42 pm' });
  assert.equal(updated.promisedDate, '2026-11-30');
  assert.equal(updated.calls.length, 1);
  assert.equal(rameshBill.calls.length, 0);
  assert.equal(rameshBill.promisedDate, null);
});

// --- The keyed path: model output is used, but code re-checks it ------------------------------------

test("a model's reading of the owner's note is used, and the rules fill its gaps", () => {
  const extracted = { contactName: 'Ramesh', business: '', amount: null, billDateText: 'October 12', language: 'hi' };
  const { out } = runOwner([{ kind: 'utterance', text: 'Ramesh-ku call pannu, naarpadhaayiram baakki', source: 'text', extracted }]);
  assert.equal(out[0].replies[0].text, READ_BACK);
});

test("a model's unknown business still asks the owner for a number", () => {
  const extracted = { contactName: '', business: 'Gupta Traders', amount: 15000, billDateText: 'October 2', language: null };
  const { out } = runOwner([{ kind: 'utterance', text: 'gupta kitta baakki', source: 'text', extracted }]);
  assert.equal(out[0].replies[0].text, 'Gupta Traders number illa. Number sollunga.');
});

test('a wrong number read back is asked for again', () => {
  const { out, state } = runOwner([
    say('Gupta Traders kitta 15,000 baakki, October 2 bill'), say('98400 12345'), say('illa'),
  ]);
  assert.equal(out[2].replies[0].key, 'askNumber');
  assert.equal(state.draft.phone, null);
});

test('model labels other than "promised" are used as given, with a dispute reason kept', () => {
  const dispute = { intent: 'dispute', dateText: '', reason: '', tone: 'annoyed' };
  const { state } = runCall(rameshBill, contact('ramesh'), [reply('pora maal waapas le lo', 4, dispute)]);
  assert.deepEqual({ outcome: state.outcome, reason: state.reason, tone: state.tone },
    { outcome: 'dispute', reason: 'pora maal waapas le lo', tone: 'annoyed' });
  const later = { intent: 'call_later', dateText: '', reason: 'evening', tone: 'calm' };
  const { out } = runCall(rameshBill, contact('ramesh'), [reply('baad me', 4, later)]);
  assert.deepEqual(glosses(out[1]), ['Sure. When should I call back?']);
});

// --- Code review findings, 26 Nov 2026 (each one was reproduced before the fix) ----------------------

test('any negation at a yes/no question is not a yes', () => {
  for (const text of ["please don't send it", "don't send it", 'do not send', 'ok but not now', 'not sure']) {
    assert.equal(classifyConfirm(text), 'no', text);
  }
});

test('a negated "send it" never sends the bill', () => {
  const { state } = runCall(rameshBill, contact('ramesh'), [reply('30 tareekh tak kar denge', 5), reply("please don't send it", 9)]);
  assert.equal(state.billSent, false);
});

test('"not sure" at the read-back does not start a call', () => {
  const { out, state } = runOwner([say(OWNER_NOTE), say('not sure')]);
  assert.notEqual(state.step, 'ready');
  assert.equal(out[1].events.length, 0);
});

test('a date that is negated, hedged or implausible is not a promise', () => {
  const notPromises = ['30 tak nahi ho payega', "I can't pay by the 30th", 'maybe by the 30th', '30 tak koshish karenge',
    "tomorrow is a holiday, can't pay", '12 October ka bill? haan dekhte hain'];
  for (const text of notPromises) assert.equal(classifyReply(text, TODAY).intent, 'vague', text);
  assert.equal(classifyReply('no problem, 30 tak kar denge', TODAY).intent, 'promised');
});

test('"I am from accounts" with a date is a promise, not the wrong person', () => {
  assert.equal(classifyReply('main accounts se hoon, 30 tak kar denge', TODAY).intent, 'promised');
});

test('"I\'ll pay later" is vague, not a request to call later', () => {
  assert.equal(classifyReply("I'll pay later", TODAY).intent, 'vague');
});

test('a model promise dated far ahead is not recorded', () => {
  const far = { intent: 'promised', dateText: '12 October', reason: '', tone: 'calm' };
  const { state } = runCall(rameshBill, contact('ramesh'), [reply('12 October ka bill', 5, far)]);
  assert.equal(state.promisedDate, null);
});

test('amounts: plain numbers that look like years, and compound lakh amounts', () => {
  const cases = [['2000', 2000], ['October 12 2026 bill 40000', 40000], ['one lakh fifty thousand', 150000],
    ['ek lakh pachaas hazaar', 150000], ['1 lakh 50 thousand', 150000], ['forty five thousand', 45000]];
  for (const [text, value] of cases) assert.equal(parseAmount(text)?.value, value, text);
});

test('at the amount choice, any amount is a correction and "illa" asks for the amount again', () => {
  const corrected = runOwner([say(OWNER_NOTE, 'speech'), say('45,000')]);
  assert.match(corrected.out[1].replies[0].text, /₹45,000/);
  const refused = runOwner([say(OWNER_NOTE, 'speech'), say('illa')]);
  assert.equal(refused.out[1].replies[0].key, 'askAmount');
});

test('naming a saved contact while asked for a number uses that contact', () => {
  const { out } = runOwner([say('Gupta Traders kitta 15,000 baakki, October 2 bill'), say('Ramesh')]);
  assert.equal(out[1].replies[0].text, 'Sharma Garments, ₹15,000, October 2 bill. Ramesh-ku Hindi-la call pannattuma?');
});

test('a number said with "no" in it ("ph no ...") is still read as the number', () => {
  const { out } = runOwner([say('Gupta Traders kitta 15,000 baakki, October 2 bill'), say('ph no 98400 12345')]);
  assert.equal(out[1].replies[0].text, '98400 12345, sariyaa?');
});

test('a corrected number replaces the one read back', () => {
  const { out } = runOwner([say('Gupta Traders kitta 15,000 baakki, October 2 bill'), say('98400 12345'), say('98400 54321')]);
  assert.equal(out[2].replies[0].text, '98400 54321, sariyaa?');
});

test('the contact named last wins, so "Ramesh illa, John-ku" switches to John', () => {
  const { out } = runOwner([say(OWNER_NOTE), say('Illa'), say('Ramesh illa, John-ku')]);
  assert.equal(out[2].replies[0].text, 'Metro Retail, ₹40,000, October 12 bill. John-ku English-la call pannattuma?');
});

test('only silences in a row end the call', () => {
  const { state, out } = runCall(rameshBill, contact('ramesh'), [silence(5), reply('agle hafte dekhte hain', 9), silence(15)]);
  assert.equal(state.ended, false);
  assert.deepEqual(glosses(out[3]), ["Sorry, I didn't catch that. Could you say it again?"]);
});

test('the text box hint clears after a note that was heard', () => {
  const { state } = runOwner([{ kind: 'silence' }, { kind: 'silence' }, say(OWNER_NOTE)]);
  assert.equal(state.textBoxRequired, false);
});

test('call offsets read as minutes and seconds', () => {
  assert.equal(formatOffset(0), '0:00');
  assert.equal(formatOffset(42), '0:42');
  assert.equal(formatOffset(75), '1:15');
});
