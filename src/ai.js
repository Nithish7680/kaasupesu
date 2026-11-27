// Server-side helpers for the keyed path: request builders and response readers for Claude and Sarvam.
// Pure functions, tested without network. Any failure returns null; the caller then falls back to the rules
// in parse.js, and flows.js re-checks whatever a model returns.
import { INTENTS } from './parse.js';

export const MODEL = 'claude-opus-5-5';
export const TONES = Object.freeze(['calm', 'annoyed', 'unsure']);
export const LANGUAGE_CODES = Object.freeze(['hi-IN', 'ta-IN', 'en-IN']);
export const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';
export const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_TOKENS = 4096; // thinking is always on for this model; leave room for it
const LIMITS = { name: 60, business: 80, dateText: 60, reason: 120 };

const EXTRACT_SYSTEM = `You read the transcript of a short voice note from an Indian small-business owner who wants an unpaid bill chased. It is usually Tanglish (Tamil mixed with English) and may be transliterated imperfectly.
Return:
- contact_name: the person to call, as spoken ('' if not said)
- business: the buyer's business name, as spoken ('' if not said)
- amount_rupees: the unpaid amount in rupees as a whole number (0 if not said)
- bill_date_text: the bill date words exactly as spoken, for example "October 12" ('' if not said)
- call_language: hi, ta or en if the owner asked for a calling language, otherwise ''
Use only what the transcript says. Never guess a value.`;

const CLASSIFY_SYSTEM = `You label one reply from a buyer's accounts person, said on a phone call about an unpaid bill. Replies are often Hinglish, Tanglish or English.
intent, exactly one of:
- promised: gives a specific payment date
- vague: no specific date ("next week", "soon", "let's see")
- paid: says it is already paid
- dispute: complains about the goods or the bill
- call_later: asks to be called at another time
- wrong_person: says they don't handle payments
- unclear: anything else
date_text: the payment date words exactly as said ('' if none).
reason: for dispute, the complaint in a few English words; for call_later, when to call; otherwise ''.
tone: calm, annoyed or unsure.`;

const EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['contact_name', 'business', 'amount_rupees', 'bill_date_text', 'call_language'],
  properties: {
    contact_name: { type: 'string' },
    business: { type: 'string' },
    amount_rupees: { type: 'integer' },
    bill_date_text: { type: 'string' },
    call_language: { type: 'string', enum: ['hi', 'ta', 'en', ''] },
  },
};

const CLASSIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'date_text', 'reason', 'tone'],
  properties: {
    intent: { type: 'string', enum: [...INTENTS] },
    date_text: { type: 'string' },
    reason: { type: 'string' },
    tone: { type: 'string', enum: [...TONES] },
  },
};

// Thinking cannot be turned off on this model, so no `thinking` field is sent; effort `low` keeps it short.
function request(system, content, schema) {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    system,
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  };
}

export function buildExtractRequest(text, contacts) {
  const known = contacts.map((c) => `${c.name} (${c.business})`).join(', ') || 'none';
  return request(EXTRACT_SYSTEM, `Known contacts: ${known}\n\nVoice note transcript:\n${text}`, EXTRACT_SCHEMA);
}

export function buildClassifyRequest(text, asked) {
  return request(CLASSIFY_SYSTEM, `KaasuPesu asked: ${asked || 'By what date can you clear the bill?'}\n\nThe buyer replied:\n${text}`, CLASSIFY_SCHEMA);
}

export function readJsonResult(response, validate) {
  if (!response || response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;
  const block = (response.content ?? []).find((b) => b.type === 'text');
  if (!block) return null;
  try {
    return validate(JSON.parse(block.text));
  } catch {
    return null;
  }
}

const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export function validateClassification(x) {
  if (!x || typeof x !== 'object' || !INTENTS.includes(x.intent)) return null;
  return {
    intent: x.intent,
    dateText: clean(x.date_text, LIMITS.dateText),
    reason: clean(x.reason, LIMITS.reason),
    tone: TONES.includes(x.tone) ? x.tone : 'calm',
  };
}

export function validateExtraction(x) {
  if (!x || typeof x !== 'object') return null;
  const amount = Number.isInteger(x.amount_rupees) && x.amount_rupees > 0 && x.amount_rupees < 1e9 ? x.amount_rupees : null;
  return {
    contactName: clean(x.contact_name, LIMITS.name),
    business: clean(x.business, LIMITS.business),
    amount,
    billDateText: clean(x.bill_date_text, LIMITS.dateText),
    language: ['hi', 'ta', 'en'].includes(x.call_language) ? x.call_language : null,
  };
}

const EXTENSIONS = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };

// Sarvam speech-to-text: saaras:v4, auto-detected language, Roman-script ("translit") output for code-mixed speech.
export function buildSttForm(bytes, mimeType) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), `voice-note.${EXTENSIONS[mimeType] ?? 'webm'}`);
  form.append('model', 'saaras:v4');
  form.append('mode', 'translit');
  form.append('language_code', 'unknown');
  return form;
}

export function readSttResult(json) {
  if (typeof json?.transcript !== 'string') return null;
  return { transcript: json.transcript.trim(), language: typeof json.language_code === 'string' ? json.language_code : null };
}

// Sarvam text-to-speech: bulbul:v3 with its default speaker (speakers are model-specific), MP3 out.
export function buildTtsBody(text, languageCode) {
  if (!LANGUAGE_CODES.includes(languageCode)) throw new Error(`unsupported language: ${languageCode}`);
  return { text, language_code: languageCode, model: 'bulbul:v3', output_audio_codec: 'mp3', enable_preprocessing: true };
}

export function readTtsResult(json) {
  const audio = json?.audios?.[0];
  return typeof audio === 'string' && audio.length > 0 ? audio : null;
}
