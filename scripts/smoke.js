// Live check of the keyed path: `npm run smoke`, with OPENAI_API_KEY, ELEVENLABS_API_KEY and WISPR_API_KEY in .env.
// Starts the server on a spare port and calls each AI route once: GPT reads the scripted owner note and labels a
// promise in Roman and Devanagari Hindi, ElevenLabs speaks a Hindi and a Tamil line, and Wispr transcribes the owner
// note spoken by ElevenLabs. Prints what each step returned; exits 1 if any check fails.
import { once } from 'node:events';
import { TODAY, CONTACTS, OWNER_SCRIPT } from '../src/lines.js';
import { findDate } from '../src/parse.js';
import { buildTtsRequest } from '../src/ai.js';
import { WAV_RATE, encodeWav } from '../src/audio.js';

process.env.PORT = process.env.SMOKE_PORT ?? '8797';
const { server } = await import('../server.js');
if (!server.listening) await once(server, 'listening');

const BASE = `http://127.0.0.1:${process.env.PORT}`;
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

// The owner's note as speech, for Wispr to hear: ElevenLabs speaks it as raw 16-bit PCM at Wispr's 16 kHz.
async function spokenOwnerNote() {
  const { url, body } = buildTtsRequest(OWNER_SCRIPT, 'ta-IN', `pcm_${WAV_RATE}`);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`ElevenLabs answered ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return encodeWav(Float32Array.from({ length: bytes.length >> 1 }, (_, i) => bytes.readInt16LE(i * 2) / 0x8000), WAV_RATE);
}

const config = await (await fetch(`${BASE}/api/config`)).json();
if (!config.llm) {
  console.log('OPENAI_API_KEY is not set. Copy .env.example to .env, add OPENAI_API_KEY, ELEVENLABS_API_KEY and WISPR_API_KEY, then run again.');
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

const SPOKEN = [
  ['Hindi', 'hi-IN', 'नमस्ते रमेश जी, यह लक्ष्मी फैब्रिक्स का ऑटोमेटेड असिस्टेंट है।'],
  ['Tamil', 'ta-IN', 'வணக்கம், இது லக்ஷ்மி ஃபேப்ரிக்ஸ்.'],
];
for (const [name, language, text] of SPOKEN) {
  const voice = config.tts ? await post('/api/tts', { text, language }) : { status: 0, json: {} };
  const chars = voice.json.audio?.length ?? 0;
  const isMp3 = /^(SUQz|\/\/)/.test(voice.json.audio ?? ''); // an ID3 tag or an MPEG frame header, in base64
  check(`ElevenLabs speaks a ${name} line`, voice.status === 200 && chars > 1000 && isMp3,
    config.tts ? `${chars} base64 characters of MP3` : 'ELEVENLABS_API_KEY is not set');
}

if (!config.stt || !config.tts) {
  const missing = config.stt ? 'ELEVENLABS_API_KEY is not set: ElevenLabs speaks the note for Wispr' : 'WISPR_API_KEY is not set';
  check('Wispr transcribes the owner note', false, missing);
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
