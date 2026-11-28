// Tests for the keyed path's request builders and response readers. No network: these are pure functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INTENTS, findDate } from '../src/parse.js';
import { TODAY } from '../src/lines.js';
import {
  MODEL, TTS_MODEL, TTS_VOICES, LISTEN_LANGUAGES, buildExtractRequest, buildClassifyRequest, readJsonResult,
  validateClassification, validateExtraction, buildTtsRequest, buildSttBody, readSttResult,
} from '../src/ai.js';

const answer = (json, extra = {}) => ({
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(json), refusal: null }, ...extra }],
});

test('the classification request asks GPT for one of the seven intents as strict JSON, with no reasoning', () => {
  const body = buildClassifyRequest('30 tareekh tak kar denge', 'By what date can you clear it?');
  assert.equal(body.model, MODEL);
  assert.equal(MODEL, 'gpt-6-luna');
  assert.equal(body.reasoning_effort, 'none');
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  const { schema } = body.response_format.json_schema;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.intent.enum, INTENTS);
  assert.equal(body.messages[0].role, 'developer');
  assert.match(body.messages[1].content, /30 tareekh tak kar denge/);
});

test('the extraction request lists the known contacts and asks for names and dates in English letters', () => {
  const body = buildExtractRequest('Ramesh-ku call pannu', [{ name: 'Ramesh', business: 'Sharma Garments' }]);
  assert.match(body.messages[1].content, /Ramesh \(Sharma Garments\)/);
  assert.match(body.messages[0].content, /English letters/);
  assert.equal(body.response_format.json_schema.schema.additionalProperties, false);
});

test('every date example in the prompts is one the code can resolve', () => {
  const prompts = [buildExtractRequest('x', []), buildClassifyRequest('x', '')].map((body) => body.messages[0].content);
  const examples = prompts.flatMap((p) => [...p.matchAll(/for example "([^"]+)" or "([^"]+)"/g)].flatMap((m) => [m[1], m[2]]));
  assert.equal(examples.length, 4);
  for (const example of examples) {
    assert.ok(findDate(example, TODAY, 'past') || findDate(example, TODAY, 'future'), example);
  }
});

test('reads the JSON answer from the first choice', () => {
  const result = readJsonResult(
    answer({ intent: 'promised', date_text: '30th', reason: '', tone: 'calm' }),
    validateClassification,
  );
  assert.deepEqual(result, { intent: 'promised', dateText: '30th', reason: '', tone: 'calm' });
});

test('a refusal, a cut-off answer and bad JSON all fall back to the rules', () => {
  const ok = { intent: 'paid', date_text: '', reason: '', tone: 'calm' };
  const refused = answer(ok, { message: { role: 'assistant', content: null, refusal: 'I cannot help with that.' } });
  assert.equal(readJsonResult(refused, validateClassification), null);
  assert.equal(readJsonResult(answer(ok, { finish_reason: 'length' }), validateClassification), null);
  assert.equal(readJsonResult({ choices: [{ finish_reason: 'stop', message: { content: '{oops' } }] }, validateClassification), null);
  assert.equal(readJsonResult({ choices: [] }, validateClassification), null);
  assert.equal(readJsonResult(null, validateClassification), null);
});

test('labels outside the seven intents are rejected, and tone defaults to calm', () => {
  assert.equal(validateClassification({ intent: 'refund', date_text: '', reason: '', tone: 'calm' }), null);
  assert.equal(validateClassification({ intent: 'vague', date_text: '', reason: '', tone: 'furious' }).tone, 'calm');
});

test('an extraction is cleaned before the code uses it', () => {
  assert.deepEqual(
    validateExtraction({ contact_name: ' Ramesh ', business: 'Sharma Garments', amount_rupees: 40000, bill_date_text: 'October 12', call_language: 'hi' }),
    { contactName: 'Ramesh', business: 'Sharma Garments', amount: 40000, billDateText: 'October 12', language: 'hi' },
  );
  const odd = validateExtraction({ contact_name: '', business: '', amount_rupees: -5, bill_date_text: '', call_language: 'fr' });
  assert.equal(odd.amount, null);
  assert.equal(odd.language, null);
  assert.equal(validateExtraction('nope'), null);
});

test('the ElevenLabs request speaks each line with the voice for its language, as MP3', () => {
  const hindi = buildTtsRequest('नमस्ते', 'hi-IN');
  assert.equal(TTS_MODEL, 'eleven_multilingual_v2');
  assert.deepEqual(hindi.body, { text: 'नमस्ते', model_id: TTS_MODEL }); // Multilingual v2 takes no language code
  assert.equal(hindi.url, `https://api.elevenlabs.io/v1/text-to-speech/${TTS_VOICES['hi-IN']}?output_format=mp3_44100_128`);
  assert.ok(buildTtsRequest('வணக்கம்', 'ta-IN').url.includes(`/${TTS_VOICES['ta-IN']}?`));
  assert.notEqual(TTS_VOICES['ta-IN'], TTS_VOICES['hi-IN']);
  assert.equal(TTS_VOICES['en-IN'], TTS_VOICES['ta-IN']); // Harini speaks Indian English too
  assert.ok(buildTtsRequest('வணக்கம்', 'ta-IN', 'pcm_16000').url.endsWith('output_format=pcm_16000'));
  assert.throws(() => buildTtsRequest('hello', 'fr-FR'));
});

test('the Wispr body sends base64 WAV, the languages to listen for, the names and the question just asked', () => {
  const wav = new Uint8Array([82, 73, 70, 70]); // "RIFF"
  const body = buildSttBody(wav, LISTEN_LANGUAGES.hi, { dictionary: ['Ramesh'], asked: 'Kis tareekh tak?' });
  assert.equal(Buffer.from(body.audio, 'base64').toString('latin1'), 'RIFF');
  assert.deepEqual(body.language, ['hi', 'en']);
  assert.equal(body.context.app.type, 'ai');
  assert.deepEqual(body.context.dictionary_context, ['Ramesh']);
  assert.deepEqual(body.context.conversation.messages, [{ role: 'assistant', content: 'Kis tareekh tak?' }]);
  assert.equal(buildSttBody(wav, LISTEN_LANGUAGES.en, { dictionary: [] }).context.conversation, undefined);
  assert.deepEqual(LISTEN_LANGUAGES, { owner: ['ta', 'en'], hi: ['hi', 'en'], ta: ['ta', 'en'], en: ['en'] });
});

test('Wispr answers are read defensively', () => {
  assert.deepEqual(readSttResult({ text: ' 30 tareekh ', detected_language: 'hi' }), { transcript: '30 tareekh', language: 'hi' });
  assert.equal(readSttResult({ detail: 'No audio data provided!' }), null);
  assert.equal(readSttResult(null), null);
});
