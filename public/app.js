// The KaasuPesu screen: owner chat, call simulator and bills. Vanilla JS over the same pure modules the tests
// drive (src/flows.js). App data is never mutated: update() swaps in a new object and re-renders.
// Device handles (microphone, recorder) and the speech queue are the only mutable pieces, by necessity.
import {
  TODAY, OWNER, CONTACTS, BILLS, OWNER_SCRIPT, SAMPLE_REPLIES, SAMPLE_YES_NO, INTENT_LABELS,
  ownerLines, rupees, dayMonth, shortDate,
} from '/src/lines.js';
import { daysBetween } from '/src/parse.js';
import { WAV_RATE, encodeWav } from '/src/audio.js';
import {
  initialOwnerState, ownerStep, startCall, callStep, summarizeCall, billStatus, applyCallOutcome, formatOffset,
} from '/src/flows.js';

const MIN_RECORDING_MS = 1000; // a recording under one second counts as a failed one
const SILENCE_SECONDS = 8; // what the "stay silent" button stands for
const SPEECH_TIMEOUT_MS = 20000;
const TOAST_MS = 4000;
const ASKED_MAX_CHARS = 300; // the server's limit for the question sent to Wispr as context
const FREE_TEXT_STEPS = new Set(['idle', 'collecting', 'correcting', 'ready']);
const SAMPLES_BY_PHASE = { awaitDate: SAMPLE_REPLIES, awaitBillOffer: SAMPLE_YES_NO };
const LANGUAGE_LABEL = { hi: 'Hindi', ta: 'Tamil', en: 'English' };

const $screen = document.getElementById('screen');
const $mode = document.getElementById('mode');
const $sound = document.getElementById('sound');
const $toast = document.getElementById('toast');
const $tabs = document.querySelectorAll('[data-tab]');

let app = {
  tab: 'owner',
  config: { stt: false, tts: false, llm: false },
  sound: true,
  busy: false,
  listening: null,
  contacts: CONTACTS,
  bills: BILLS,
  chat: [{ who: 'bot', line: ownerLines.greeting() }],
  owner: initialOwnerState(),
  call: null,
  openBill: null,
};

function update(patch) {
  app = { ...app, ...patch };
  render();
}

// --- Small helpers --------------------------------------------------------------------------------

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
const contactById = (id) => app.contacts.find((c) => c.id === id);
const billById = (id) => app.bills.find((b) => b.id === id);
const elapsed = (call) => Math.round((performance.now() - call.startedAt) / 1000);
const glossOf = (line) => (line.gloss && line.gloss !== line.text ? `<span class="gloss">${esc(line.gloss)}</span>` : '');
const chip = (action, value, label) => `<button type="button" class="chip" data-action="${action}" data-value="${esc(value)}">${esc(label)}</button>`;

function callClock() {
  const time = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${shortDate(TODAY)}, ${time.toLowerCase()}`;
}

let toastTimer = null;
function notice(message) {
  $toast.textContent = message;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.hidden = true; }, TOAST_MS);
}

async function postJson(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

async function postAudio(url, blob) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

// The AI path is optional: any failure here means "use the built-in rules".
async function tryPost(url, body) {
  try {
    return await postJson(url, body);
  } catch (err) {
    console.warn(err.message);
    notice('AI reading unavailable; used the built-in rules.');
    return null;
  }
}

// --- Speaking -------------------------------------------------------------------------------------

let speechQueue = Promise.resolve();
const ttsCache = new Map();

function speakAll(lines) {
  for (const line of lines) speechQueue = speechQueue.then(() => speakLine(line));
  return speechQueue;
}

async function speakLine(line, force = false) {
  if ((!app.sound && !force) || !line?.speak) return;
  if (app.config.tts) {
    try {
      await playUrl(await ttsUrl(line.speak));
      return;
    } catch (err) {
      console.warn('OpenAI voice unavailable, using the browser voice:', err.message);
    }
  }
  await browserSpeak(line);
}

async function ttsUrl(speak) {
  const key = `${speak.lang}|${speak.text}`;
  if (!ttsCache.has(key)) {
    const { audio, mime } = await postJson('/api/tts', { text: speak.text, language: speak.lang });
    ttsCache.set(key, `data:${mime};base64,${audio}`);
  }
  return ttsCache.get(key);
}

function playUrl(url) {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.onended = resolve;
    audio.onerror = resolve;
    audio.play().catch(resolve);
  });
}

// Without a voice for the line's language, speak the Roman line (Tanglish, or the English gloss) in en-IN.
function browserSpeak(line) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }
    const voices = speechSynthesis.getVoices();
    if (!voices.length) {
      resolve(); // no voices installed: show the text, don't wait on speech that will never end
      return;
    }
    const lang = line.speak.lang;
    const native = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang?.startsWith(lang.slice(0, 2)));
    const english = voices.find((v) => v.lang === 'en-IN') ?? voices.find((v) => v.lang?.startsWith('en'));
    const utterance = new SpeechSynthesisUtterance(native ? line.speak.text : line.fallback);
    utterance.lang = native ? native.lang : 'en-IN';
    const voice = native ?? english;
    if (voice) utterance.voice = voice;
    const timer = setTimeout(resolve, SPEECH_TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    utterance.onend = done;
    utterance.onerror = done;
    speechSynthesis.speak(utterance);
  });
}

async function playTurns(turns, from) {
  for (const turn of turns.slice(from)) {
    if (turn.silent) continue;
    if (turn.audioUrl) await playUrl(turn.audioUrl);
    else if (turn.line) await speakLine(turn.line, true);
    else await browserSpeak({ speak: { lang: 'en-IN', text: turn.text }, fallback: turn.text });
  }
}

// --- Listening ------------------------------------------------------------------------------------
// With a Wispr key: record, convert to 16 kHz WAV and send to /api/stt. Without: the browser's en-IN recognition.

const mic = { target: null, stopping: false, startedAt: 0, ready: Promise.resolve(), stream: null, recorder: null, chunks: [], recognition: null, transcript: '' };

function resetMic() {
  Object.assign(mic, { target: null, stopping: false, stream: null, recorder: null, chunks: [], recognition: null, transcript: '' });
  update({ listening: null });
}

function startListening(target) {
  if (mic.target || app.busy) return;
  // Chrome allows the microphone only on localhost or HTTPS; opened by IP, say why instead of failing silently.
  if (!window.isSecureContext) {
    notice(`The microphone works only on localhost or HTTPS: open http://localhost${location.port ? `:${location.port}` : ''}, or type.`);
    return;
  }
  Object.assign(mic, { target, startedAt: performance.now(), chunks: [], transcript: '' });
  update({ listening: target });
  mic.ready = app.config.stt ? openRecorder() : openRecognition();
}

async function openRecorder() {
  try {
    mic.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mic.recorder = new MediaRecorder(mic.stream);
    mic.recorder.ondataavailable = (event) => {
      if (event.data.size) mic.chunks = [...mic.chunks, event.data];
    };
    mic.recorder.start();
  } catch (err) {
    console.warn('Microphone unavailable:', err.message);
    notice('Microphone unavailable. Type instead.');
  }
}

async function openRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    notice('This browser has no speech recognition. Type instead.');
    return;
  }
  const recognition = new Recognition();
  recognition.lang = 'en-IN';
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    mic.transcript = Array.from(event.results).map((result) => result[0].transcript).join(' ');
  };
  recognition.onerror = (event) => console.warn('Speech recognition error:', event.error);
  recognition.start();
  mic.recognition = recognition;
}

function stopRecorder() {
  return new Promise((resolve) => {
    const { recorder } = mic;
    recorder.onstop = () => {
      mic.stream?.getTracks().forEach((track) => track.stop());
      resolve(new Blob(mic.chunks, { type: recorder.mimeType || 'audio/webm' }));
    };
    recorder.stop();
  });
}

// Wispr takes 16 kHz mono PCM16 WAV: decode the recording, render it to one 16 kHz channel, then encode it.
async function toWav(blob) {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * WAV_RATE)), WAV_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return new Blob([encodeWav(rendered.getChannelData(0), WAV_RATE)], { type: 'audio/wav' });
  } finally {
    context.close();
  }
}

// Wispr is told which languages to expect from this speaker and the question KaasuPesu just asked.
function sttUrl(target) {
  const lang = target === 'owner' ? 'owner' : app.call?.state.language ?? 'en';
  return `/api/stt?${new URLSearchParams({ lang, asked: lastQuestion(target) })}`;
}

function lastQuestion(target) {
  const lines = target === 'owner'
    ? app.chat.filter((item) => item.who === 'bot').map((item) => item.line)
    : (app.call?.turns ?? []).filter((turn) => turn.who === 'agent').map((turn) => turn.line);
  return lines.at(-1)?.text.slice(0, ASKED_MAX_CHARS) ?? '';
}

function stopRecognition() {
  return new Promise((resolve) => {
    const { recognition } = mic;
    const timer = setTimeout(resolve, 1500);
    recognition.onend = () => {
      clearTimeout(timer);
      resolve();
    };
    recognition.stop();
  });
}

async function stopListening() {
  const { target } = mic;
  if (!target || mic.stopping) return; // a second Stop tap or release must not run this twice
  mic.stopping = true;
  await mic.ready;
  const heldMs = performance.now() - mic.startedAt;
  let text = '';
  let audioUrl = null;
  if (mic.recorder) {
    const blob = await stopRecorder();
    if (heldMs >= MIN_RECORDING_MS && blob.size > 0) {
      audioUrl = URL.createObjectURL(blob);
      try {
        text = (await postAudio(sttUrl(target), await toWav(blob))).transcript ?? '';
      } catch (err) {
        console.warn(err.message);
        notice('Could not transcribe that. Type instead.');
      }
    }
  } else if (mic.recognition) {
    await stopRecognition();
    text = heldMs >= MIN_RECORDING_MS ? mic.transcript : '';
  }
  resetMic();
  if (target === 'owner') await ownerSays(text, 'speech', audioUrl);
  else await buyerSays(text, 'speech', audioUrl);
}

// --- The owner's side -----------------------------------------------------------------------------

async function ownerSays(raw, source, audioUrl = null) {
  if (app.busy) return;
  const text = String(raw ?? '').trim();
  if (!text) {
    applyOwner({ kind: 'silence' });
    return;
  }
  update({ chat: [...app.chat, { who: 'owner', text, source, audioUrl }], busy: true });
  const extracted = app.config.llm && FREE_TEXT_STEPS.has(app.owner.step)
    ? await tryPost('/api/extract', { text, contacts: app.contacts.map((c) => ({ name: c.name, business: c.business })) })
    : null;
  update({ busy: false });
  applyOwner({ kind: 'utterance', text, source, extracted });
}

function applyOwner(input) {
  const { state, replies, events } = ownerStep(app.owner, input, { contacts: app.contacts, owner: OWNER, today: TODAY });
  const created = events.filter((e) => e.type === 'contactCreated').map((e) => e.contact);
  const fresh = events.find((e) => e.type === 'billReady')?.bill ?? null;
  // Chasing the same bill again keeps its calls and promise; only the amount and call language update.
  const existing = fresh ? billById(fresh.id) : null;
  const ready = existing ? { ...existing, amount: fresh.amount, language: fresh.language } : fresh;
  update({
    owner: state,
    contacts: [...app.contacts, ...created],
    bills: ready ? [...app.bills.filter((b) => b.id !== ready.id), ready] : app.bills,
    chat: [
      ...app.chat,
      ...created.map((c) => ({ who: 'note', text: `Saved ${c.name} (${c.phone}).` })),
      ...replies.map((line) => ({ who: 'bot', line })),
    ],
  });
  speakAll(replies);
  // The call screen opens at once; its lines queue behind "Seri, ... call pannren" instead of waiting on it.
  if (ready) beginCall(ready.id);
}

// --- The call -------------------------------------------------------------------------------------

function beginCall(billId) {
  if (app.call && !app.call.state.ended) {
    notice('Finish the current call first.');
    return;
  }
  const bill = billById(billId);
  const contact = contactById(bill.contactId);
  const { state, replies } = startCall({ bill, contact, owner: OWNER, today: TODAY });
  const call = {
    billId, contactId: contact.id, state, startedAt: performance.now(), callTime: callClock(),
    turns: replies.map((line) => ({ who: 'agent', line, at: 0 })), summary: null, callIndex: null,
  };
  update({ call, tab: 'call', chat: [...app.chat, { who: 'note', text: `Calling ${contact.name} (${contact.business})…` }] });
  speakAll(replies);
}

async function buyerSays(raw, source, audioUrl = null) {
  const { call } = app;
  if (!call || call.state.ended || app.busy) return;
  const at = elapsed(call);
  const text = String(raw ?? '').trim();
  if (!text) {
    applyCall({ kind: 'silence', at });
    return;
  }
  const asked = [...call.turns].reverse().find((turn) => turn.who === 'agent')?.line.gloss ?? '';
  update({ call: { ...call, turns: [...call.turns, { who: 'buyer', text, at, audioUrl, source }] }, busy: true });
  const classified = app.config.llm && call.state.phase === 'awaitDate' ? await tryPost('/api/classify', { text, asked }) : null;
  update({ busy: false });
  applyCall({ kind: 'reply', text, at, classified });
}

function applyCall(input) {
  const { call } = app;
  const ctx = { bill: billById(call.billId), contact: contactById(call.contactId), owner: OWNER, today: TODAY };
  const { state, replies } = callStep(call.state, input, ctx);
  const at = elapsed(call);
  const silent = input.kind === 'silence' ? [{ who: 'buyer', text: '(no answer)', at: input.at, silent: true }] : [];
  const next = { ...call, state, turns: [...call.turns, ...silent, ...replies.map((line) => ({ who: 'agent', line, at }))] };
  if (!state.ended) {
    update({ call: next });
    speakAll(replies);
    return;
  }
  finishCall(next, ctx, replies);
}

function finishCall(call, ctx, replies) {
  const summary = summarizeCall(call.state, ctx);
  const record = { time: call.callTime, turns: call.turns, summary };
  const bills = app.bills.map((b) => (b.id === call.billId ? applyCallOutcome(b, call.state, record) : b));
  const callIndex = bills.find((b) => b.id === call.billId).calls.length - 1;
  update({
    call: { ...call, summary, callIndex },
    bills,
    chat: [...app.chat, { who: 'summary', billId: call.billId, callIndex }, { who: 'bot', line: summary.voiceNote }],
  });
  speakAll(replies).then(() => speakAll([summary.voiceNote]));
}

function turnsFor(scope, billId, callIndex) {
  if (scope === 'live') return app.call?.turns ?? [];
  return billById(billId)?.calls[Number(callIndex)]?.turns ?? [];
}

function playMoment(billId, callIndex) {
  const record = billById(billId)?.calls[callIndex];
  if (!record?.summary.keyMoment) return;
  const { at } = record.summary.keyMoment;
  const index = record.turns.findIndex((turn) => turn.who === 'buyer' && turn.at >= at);
  playTurns(record.turns, Math.max(0, index));
}

// --- Rendering ------------------------------------------------------------------------------------

function render() {
  const focusedForm = document.activeElement?.closest?.('form')?.dataset.form;
  $tabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.tab === app.tab)));
  const { stt, tts, llm } = app.config;
  const keyNote = llm ? '' : ' · OpenAI key not set'; // so a judge running without keys sees why it's the rules
  $mode.textContent = `${stt ? 'Wispr' : 'browser'} listening · ${tts ? 'OpenAI' : 'browser'} voice · ${llm ? 'GPT' : 'rules'} reading${keyNote}`;
  $sound.textContent = app.sound ? 'Sound on' : 'Sound off';
  $sound.setAttribute('aria-pressed', String(app.sound));
  const views = { owner: renderOwner, call: renderCall, bills: renderBills };
  $screen.innerHTML = views[app.tab]();
  const chat = $screen.querySelector('.chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
  if (focusedForm) $screen.querySelector(`form[data-form="${focusedForm}"] input`)?.focus();
}

function renderOwner() {
  const required = app.owner.textBoxRequired;
  const listening = app.listening === 'owner';
  return `
    <section class="chat" aria-label="Owner chat">${app.chat.map(renderChatItem).join('')}</section>
    <div class="chips" aria-label="Quick inputs">
      ${chip('owner-say', OWNER_SCRIPT, 'Say the script')}
      ${['Aamaa', 'Illa', 'hmm'].map((word) => chip('owner-say', word, word)).join('')}
      ${chip('owner-silence', '', 'Failed recording')}
    </div>
    ${required ? '<p class="hint">Couldn\'t hear you twice. Type below.</p>' : ''}
    <form class="composer" data-form="owner">
      <button type="button" class="mic${listening ? ' live' : ''}" data-hold="owner">${listening ? 'Listening…' : 'Hold to talk'}</button>
      <input name="text" autocomplete="off" aria-label="Type a message" placeholder="Type in Tanglish, Tamil or English"${required ? ' class="attention"' : ''}>
      <button type="submit"${app.busy ? ' disabled' : ''}>Send</button>
    </form>`;
}

function renderChatItem(item) {
  if (item.who === 'owner') {
    return `<div class="bubble owner">${item.source === 'speech' ? '<span class="tag">voice</span> ' : ''}${esc(item.text)}</div>`;
  }
  if (item.who === 'note') return `<p class="note">${esc(item.text)}</p>`;
  if (item.who === 'summary') {
    const bill = billById(item.billId);
    const record = bill?.calls[item.callIndex];
    return record ? renderSummary(bill, record, item.callIndex) : '';
  }
  return `<div class="bubble bot">${esc(item.line.text)}${glossOf(item.line)}</div>`;
}

function renderSummary(bill, record, index) {
  const s = record.summary;
  const contact = contactById(bill.contactId);
  const moment = s.keyMoment
    ? `<button type="button" class="link" data-action="play-moment" data-bill="${esc(bill.id)}" data-call="${index}">${esc(s.keyMoment.label)} at ${formatOffset(s.keyMoment.at)}</button>`
    : '';
  return `<article class="card summary" aria-label="Call summary">
    <header><strong>${esc(contact.name)} · call summary</strong><span class="muted small">${esc(record.time)}</span></header>
    <dl>
      <dt>Intent</dt><dd>${esc(INTENT_LABELS[s.intent])}</dd>
      <dt>${s.intent === 'promised' ? 'Promised' : 'Details'}</dt><dd>${esc(s.detail || '—')}</dd>
      <dt>Tone</dt><dd>${esc(s.tone)}</dd>
      <dt>Next step</dt><dd>${esc(s.nextStep)}</dd>
    </dl>
    ${moment}
  </article>`;
}

function renderTurn(turn, index, scope, billId = '', callIndex = '') {
  const who = turn.who === 'agent' ? 'KaasuPesu' : 'Buyer';
  const body = turn.line ? `${esc(turn.line.text)}${glossOf(turn.line)}` : esc(turn.text);
  return `<li class="turn ${turn.who}">
    <button type="button" class="time" data-action="play-from" data-scope="${scope}" data-bill="${esc(billId)}" data-call="${esc(callIndex)}" data-turn="${index}" aria-label="Play from ${formatOffset(turn.at)}">▶ ${formatOffset(turn.at)}</button>
    <div><span class="who">${who}</span>${body}</div>
  </li>`;
}

function renderCall() {
  const { call } = app;
  if (!call) return '<p class="empty">No call yet. Confirm a bill in Owner chat, or press Call on the Bills screen.</p>';
  const contact = contactById(call.contactId);
  const bill = billById(call.billId);
  const { language } = call.state;
  return `
    <header class="callhead">
      <div><strong>${esc(contact.name)}</strong> · ${esc(contact.business)}</div>
      <span class="muted small">${esc(LANGUAGE_LABEL[language])} · ${esc(call.callTime)}</span>
    </header>
    <p class="muted small">Simulated call. You are ${esc(contact.name)}: reply by voice or type.</p>
    <ol class="turns">${call.turns.map((turn, i) => renderTurn(turn, i, 'live')).join('')}</ol>
    ${call.state.billSent ? renderWhatsAppBill(bill, contact, call.state) : ''}
    ${call.state.ended ? renderCallEnd(call) : renderCallControls(call, language)}`;
}

function renderCallControls(call, language) {
  const samples = SAMPLES_BY_PHASE[call.state.phase]?.[language] ?? [];
  const listening = app.listening === 'buyer';
  return `
    <div class="chips" aria-label="Sample replies">
      ${samples.map((sample) => chip('buyer-say', sample, sample)).join('')}
      ${chip('buyer-silence', '', `Stay silent (${SILENCE_SECONDS} s)`)}
    </div>
    <form class="composer" data-form="buyer">
      <button type="button" class="mic${listening ? ' live' : ''}" data-action="buyer-mic">${listening ? 'Stop' : 'Tap to talk'}</button>
      <input name="text" autocomplete="off" aria-label="Type the buyer's reply" placeholder="Reply as the buyer">
      <button type="submit"${app.busy ? ' disabled' : ''}>Send</button>
    </form>`;
}

function renderWhatsAppBill(bill, contact, state) {
  return `<article class="card wa" aria-label="Simulated WhatsApp bill">
    <p class="muted small">Simulated WhatsApp message to ${esc(contact.name)}. Nothing is sent.</p>
    <strong>${esc(OWNER.business)} · Bill</strong>
    <p>₹${rupees(bill.amount)} · billed ${dayMonth(bill.billDate)} · promised ${dayMonth(state.promisedDate)}</p>
    <button type="button" disabled title="Simulated in the prototype">Pay now (UPI)</button>
  </article>`;
}

function renderCallEnd(call) {
  const bill = billById(call.billId);
  const record = bill.calls[call.callIndex];
  return `<p class="note">Call ended.</p>
    ${record ? renderSummary(bill, record, call.callIndex) : ''}
    <div class="row">
      <button type="button" data-action="tab" data-value="owner">Back to chat</button>
      <button type="button" class="ghost" data-action="tab" data-value="bills">See bills</button>
    </div>`;
}

function renderBills() {
  return app.bills.length ? app.bills.map(renderBill).join('') : '<p class="empty">No bills yet.</p>';
}

function renderBill(bill) {
  const contact = contactById(bill.contactId);
  const status = billStatus(bill, TODAY);
  const open = app.openBill === bill.id;
  const promised = bill.promisedDate ? ` · promised ${dayMonth(bill.promisedDate)}` : '';
  const calledBefore = bill.calls.length > 0 || Boolean(bill.promisedDate);
  const records = open ? bill.calls.map((record, i) => renderCallRecord(bill, record, i)).join('') : '';
  const toggle = bill.calls.length
    ? `<button type="button" class="ghost" data-action="toggle-bill" data-bill="${esc(bill.id)}">${open ? 'Hide calls' : `Calls (${bill.calls.length})`}</button>`
    : '';
  return `<article class="card bill">
    <header>
      <div><strong>${esc(contact.name)}</strong> · ${esc(contact.business)}</div>
      <span class="status s-${status.toLowerCase().replace(/\s+/g, '-')}">${esc(status)}</span>
    </header>
    <p>₹${rupees(bill.amount)} · billed ${dayMonth(bill.billDate)} · ${daysBetween(bill.billDate, TODAY)} days${promised}</p>
    <div class="row">
      <button type="button" data-action="call-bill" data-bill="${esc(bill.id)}">${calledBefore ? 'Call again' : 'Call'}</button>
      ${toggle}
    </div>
    ${records}
  </article>`;
}

function renderCallRecord(bill, record, index) {
  const turns = record.turns.map((turn, i) => renderTurn(turn, i, 'record', bill.id, index)).join('');
  return `${renderSummary(bill, record, index)}<ol class="turns">${turns}</ol>`;
}

// --- Events ---------------------------------------------------------------------------------------

$screen.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const { action, value, bill, call, turn, scope } = el.dataset;
  const handlers = {
    'owner-say': () => ownerSays(value, 'text'),
    'owner-silence': () => applyOwner({ kind: 'silence' }),
    'buyer-say': () => buyerSays(value, 'text'),
    'buyer-silence': () => buyerSays('', 'speech'),
    'buyer-mic': () => (mic.target === 'buyer' ? stopListening() : startListening('buyer')),
    'call-bill': () => beginCall(bill),
    'toggle-bill': () => update({ openBill: app.openBill === bill ? null : bill }),
    'play-from': () => playTurns(turnsFor(scope, bill, call), Number(turn)),
    'play-moment': () => playMoment(bill, Number(call)),
    tab: () => update({ tab: value }),
  };
  handlers[action]?.();
});

$screen.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  const input = form.elements.text;
  const text = input.value.trim();
  if (!text) return; // an empty typed message is not a failed recording
  input.value = '';
  if (form.dataset.form === 'owner') ownerSays(text, 'text');
  else buyerSays(text, 'text');
});

// Hold to talk: pointer or keyboard (Space / Enter) on the owner's mic button.
$screen.addEventListener('pointerdown', (event) => {
  const el = event.target.closest('[data-hold]');
  if (!el) return;
  event.preventDefault();
  startListening(el.dataset.hold);
});
$screen.addEventListener('keydown', (event) => {
  const el = event.target.closest?.('[data-hold]');
  if (el && (event.key === ' ' || event.key === 'Enter') && !event.repeat) {
    event.preventDefault();
    startListening(el.dataset.hold);
  }
});
const releaseHold = () => {
  if (mic.target === 'owner') stopListening();
};
document.addEventListener('pointerup', releaseHold);
document.addEventListener('pointercancel', releaseHold);
document.addEventListener('keyup', (event) => {
  if (event.key === ' ' || event.key === 'Enter') releaseHold();
});

$tabs.forEach((tab) => tab.addEventListener('click', () => update({ tab: tab.dataset.tab })));
$sound.addEventListener('click', () => {
  if (app.sound && 'speechSynthesis' in window) speechSynthesis.cancel();
  update({ sound: !app.sound });
});

async function init() {
  try {
    const response = await fetch('/api/config');
    if (response.ok) app = { ...app, config: await response.json() };
  } catch (err) {
    console.warn('Config unavailable; running the demo path.', err.message);
  }
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  render();
}

init();
