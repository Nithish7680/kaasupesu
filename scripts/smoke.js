// Live check of the keyed path: `npm run smoke`, with OPENAI_API_KEY and WISPR_API_KEY in .env.
// Starts the server on a spare port and calls each AI route once: GPT reads the scripted owner note and labels a
// promise in Roman and Devanagari Hindi, OpenAI speaks a Hindi line, and Wispr transcribes the owner note spoken
// by OpenAI's voice. Prints what each step returned; exits 1 if any check fails.
import { once } from 'node:events';
import { TODAY, CONTACTS, OWNER_SCRIPT } from '../src/lines.js';
import { findDate } from '../src/parse.js';
import { OPENAI_SPEECH_URL, buildTtsBody } from '../src/ai.js';
import { WAV_RATE, encodeWav } from '../src/audio.js';

process.env.PORT = process.env.SMOKE_PORT ?? '8797';
const { server } = await import('../server.js');
if (!server.listening) await once(server, 'listening');

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const PCM_RATE = 24000; // OpenAI's "pcm" speech format: 24 kHz, 16-bit, mono, no header
const ASKED = 'By what date can you clear it?';
const results = [];

function check(name, passed, detail) {
  results.push(passed);
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
}

async function post(route, body, type = 'application/json') {
  const response = await fetch(`${BASE}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': type },
    body: type === 'application/json' ? JSON.stringify(body) : body,
  });
  return { status: response.status, json: await response.json() };
}

// The owner's note as speech, for Wispr to hear: OpenAI speaks it as raw 24 kHz PCM, resampled here to 16 kHz.
async function spokenOwnerNote() {
  const response = await fetch(OPENAI_SPEECH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...buildTtsBody(OWNER_SCRIPT, 'ta-IN'), response_format: 'pcm' }),
  });
  if (!response.ok) throw new Error(`OpenAI speech answered ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const pcm = Float32Array.from({ length: bytes.length >> 1 }, (_, i) => bytes.readInt16LE(i * 2) / 0x8000);
  const step = PCM_RATE / WAV_RATE;
  const resampled = Float32Array.from({ length: Math.floor((pcm.length - 1) / step) }, (_, i) => {
    const at = i * step;
    const j = Math.floor(at);
    return pcm[j] + (pcm[j + 1] - pcm[j]) * (at - j); // linear interpolation between neighbouring samples
  });
  return encodeWav(resampled, WAV_RATE);
}

const config = await (await fetch(`${BASE}/api/config`)).json();
if (!config.llm) {
  console.log('OPENAI_API_KEY is not set. Copy .env.example to .env, add OPENAI_API_KEY and WISPR_API_KEY, then run again.');
  process.exit(1);
}

const note = await post('/api/extract', { text: OWNER_SCRIPT, contacts: CONTACTS.map(({ name, business }) => ({ name, business })) });
check(
  'GPT reads the owner note (Ramesh, 40000, 12 October)',
  note.status === 200 && note.json.contactName === 'Ramesh' && note.json.amount === 40000
    && findDate(note.json.billDateText ?? '', TODAY, 'past') === '2026-10-12',
  JSON.stringify(note.json),
);

for (const reply of ['30 tareekh tak kar denge', '30 तारीख तक कर देंगे']) {
  const label = await post('/api/classify', { text: reply, asked: ASKED });
  check(
    `GPT labels "${reply}" as a promise for 30 November`,
    label.status === 200 && label.json.intent === 'promised' && findDate(label.json.dateText ?? '', TODAY, 'future') === '2026-11-30',
    JSON.stringify(label.json),
  );
}

const voice = await post('/api/tts', { text: 'नमस्ते रमेश जी, यह लक्ष्मी फैब्रिक्स का ऑटोमेटेड असिस्टेंट है।', language: 'hi-IN' });
check('OpenAI speaks a Hindi line', voice.status === 200 && (voice.json.audio?.length ?? 0) > 1000, `${voice.json.audio?.length ?? 0} base64 characters of MP3`);

if (!config.stt) {
  check('Wispr transcribes the owner note', false, 'WISPR_API_KEY is not set');
} else {
  try {
    const query = new URLSearchParams({ lang: 'owner', asked: 'Yaar kitta baakki irukku?' });
    const heard = await post(`/api/stt?${query}`, await spokenOwnerNote(), 'audio/wav');
    const transcript = heard.json.transcript ?? '';
    // Any of the note's names or its amount, in English letters, Tamil script or Devanagari.
    const fromNote = /ramesh|sharma|40[,\s]?000|forty|ரமேஷ|ஷர்மா|रमेश|शर्मा/i.test(transcript);
    check('Wispr transcribes the owner note', heard.status === 200 && fromNote, JSON.stringify(heard.json));
    const read = await post('/api/extract', { text: transcript || '-', contacts: CONTACTS.map(({ name, business }) => ({ name, business })) });
    check(
      'Wispr then GPT: the spoken note reads as Ramesh, 40000',
      read.status === 200 && read.json.contactName === 'Ramesh' && read.json.amount === 40000,
      JSON.stringify(read.json),
    );
  } catch (err) {
    check('Wispr transcribes the owner note', false, err.message);
  }
}

const failed = results.filter((passed) => !passed).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
