// Server-side helpers for the keyed path: request builders and response readers for OpenAI and Wispr Flow.
// Pure functions, tested without network. Any failure returns null; the caller then falls back to the rules
// in parse.js, and flows.js re-checks whatever a model returns.
import { INTENTS } from './parse.js';

export const MODEL = 'gpt-6-luna'; // OpenAI's most efficient current model; this is labelling, not reasoning
export const TTS_MODEL = 'gpt-4o-mini-tts'; // deprecated by OpenAI: the speech endpoint works until 6 January 2027
export const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
export const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
export const WISPR_STT_URL = 'https://platform-api.wisprflow.ai/api/v1/dash/api';
export const TONES = Object.freeze(['calm', 'annoyed', 'unsure']);
export const LANGUAGE_CODES = Object.freeze(['hi-IN', 'ta-IN', 'en-IN']);
// What Wispr listens for: the owner speaks Tanglish; each buyer speaks their saved language, often mixed with English.
export const LISTEN_LANGUAGES = Object.freeze({ owner: ['ta', 'en'], hi: ['hi', 'en'], ta: ['ta', 'en'], en: ['en'] });

const TTS_VOICE = 'marin';
const MAX_OUTPUT_TOKENS = 400;
const LIMITS = { name: 60, business: 80, dateText: 60, reason: 120 };

// Names and dates come back in English letters because the code re-reads them with the Roman-script rules.
const EXTRACT_SYSTEM = `You read the transcript of a short voice note from an Indian small-business owner who wants an unpaid bill chased. It is usually Tanglish (Tamil mixed with English), may be in Tamil script, English letters or both, and may be transcribed imperfectly.
Return:
- contact_name: the person to call, in English letters ('' if not said)
- business: the buyer's business name, in English letters ('' if not said)
- amount_rupees: the unpaid amount in rupees as a whole number (0 if not said)
- bill_date_text: the bill date in English words or digits, for example "October 12" or "12th" ('' if not said)
- call_language: hi, ta or en if the owner asked for a calling language, otherwise ''
Use only what the transcript says. Never guess a value.`;

const CLASSIFY_SYSTEM = `You label one reply from a buyer's accounts person, said on a phone call about an unpaid bill. Replies are often Hinglish, Tanglish or English, in Devanagari, Tamil script or English letters.
intent, exactly one of:
- promised: gives a specific payment date
- vague: no specific date ("next week", "soon", "let's see")
- paid: says it is already paid
- dispute: complains about the goods or the bill
- call_later: asks to be called at another time
- wrong_person: says they don't handle payments
- unclear: anything else
date_text: the payment date the buyer said, in English words or digits, for example "30 November" or "30th" ('' if none).
reason: for dispute, the complaint in a few English words; for call_later, when to call, in English letters; otherwise ''.
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

// A labelling task: no reasoning, and a short answer that must match the JSON schema.
function request(system, content, name, schema) {
  return {
    model: MODEL,
    reasoning_effort: 'none',
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: 'developer', content: system }, { role: 'user', content }],
    response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
  };
}

export function buildExtractRequest(text, contacts) {
  const known = contacts.map((c) => `${c.name} (${c.business})`).join(', ') || 'none';
  return request(EXTRACT_SYSTEM, `Known contacts: ${known}\n\nVoice note transcript:\n${text}`, 'owner_note', EXTRACT_SCHEMA);
}

export function buildClassifyRequest(text, asked) {
  const content = `KaasuPesu asked: ${asked || 'By what date can you clear the bill?'}\n\nThe buyer replied:\n${text}`;
  return request(CLASSIFY_SYSTEM, content, 'buyer_reply', CLASSIFY_SCHEMA);
}

// Only a finished, non-refused answer that parses and validates is used.
export function readJsonResult(response, validate) {
  const choice = response?.choices?.[0];
  const content = choice?.message?.content;
  if (choice?.finish_reason !== 'stop' || choice.message?.refusal || typeof content !== 'string') return null;
  try {
    return validate(JSON.parse(content));
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

// Wispr Flow speech-to-text: base64 16 kHz WAV, the languages to expect, and context that helps it get names
// and short answers right: the contact names, and the question KaasuPesu just asked.
export function buildSttBody(wavBytes, languages, { dictionary, asked = '' }) {
  const conversation = asked ? { conversation: { id: 'kaasupesu', messages: [{ role: 'assistant', content: asked }] } } : {};
  return {
    audio: Buffer.from(wavBytes).toString('base64'),
    language: languages,
    context: { app: { name: 'KaasuPesu', type: 'ai' }, dictionary_context: dictionary, ...conversation },
  };
}

export function readSttResult(json) {
  if (typeof json?.text !== 'string') return null;
  return { transcript: json.text.trim(), language: typeof json.detected_language === 'string' ? json.detected_language : null };
}

const VOICE_STYLE = {
  'hi-IN': 'Speak natural Hindi with an Indian accent, politely and clearly.',
  'ta-IN': 'Speak natural Tamil with a Tamil Nadu accent, politely and clearly.',
  'en-IN': 'Speak English with an Indian accent, politely and clearly.',
};

// OpenAI text-to-speech: one voice, told which language and accent to use; MP3 out.
export function buildTtsBody(text, languageCode) {
  if (!LANGUAGE_CODES.includes(languageCode)) throw new Error(`unsupported language: ${languageCode}`);
  return { model: TTS_MODEL, voice: TTS_VOICE, input: text, instructions: VOICE_STYLE[languageCode], response_format: 'mp3' };
}
