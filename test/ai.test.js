// Tests for the keyed path's request builders and response readers. No network: these are pure functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INTENTS } from '../src/parse.js';
import {
  MODEL, buildExtractRequest, buildClassifyRequest, readJsonResult, validateClassification,
  validateExtraction, buildTtsBody, buildSttForm, readSttResult, readTtsResult,
} from '../src/ai.js';

const answer = (json, stop = 'end_turn') => ({
  stop_reason: stop,
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(json) }],
});

test('the classification request asks Claude for one of the seven intents as JSON, at low effort', () => {
  const params = buildClassifyRequest('30 tareekh tak kar denge', 'By what date can you clear it?');
  assert.equal(params.model, MODEL);
  assert.equal(MODEL, 'claude-opus-5-5');
  assert.equal(params.output_config.effort, 'low');
  assert.equal(params.output_config.format.type, 'json_schema');
  const { schema } = params.output_config.format;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.intent.enum, INTENTS);
  assert.deepEqual(params.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(params.fallbacks, 'default');
  assert.match(params.messages[0].content, /30 tareekh tak kar denge/);
  assert.equal(params.thinking, undefined, 'thinking cannot be disabled on this model, so it is not sent');
});

test('the extraction request lists the known contacts', () => {
  const params = buildExtractRequest('Ramesh-ku call pannu', [{ name: 'Ramesh', business: 'Sharma Garments' }]);
  assert.match(params.messages[0].content, /Ramesh \(Sharma Garments\)/);
  assert.equal(params.output_config.format.schema.additionalProperties, false);
});

test('reads the JSON answer from the text block after a thinking block', () => {
  const result = readJsonResult(
    answer({ intent: 'promised', date_text: '30 tareekh', reason: '', tone: 'calm' }),
    validateClassification,
  );
  assert.deepEqual(result, { intent: 'promised', dateText: '30 tareekh', reason: '', tone: 'calm' });
});

test('a refusal, a truncated answer and bad JSON all fall back to the rules', () => {
  const ok = { intent: 'paid', date_text: '', reason: '', tone: 'calm' };
  assert.equal(readJsonResult(answer(ok, 'refusal'), validateClassification), null);
  assert.equal(readJsonResult(answer(ok, 'max_tokens'), validateClassification), null);
  assert.equal(readJsonResult({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{oops' }] }, validateClassification), null);
  assert.equal(readJsonResult({ stop_reason: 'end_turn', content: [] }, validateClassification), null);
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

test('the Sarvam text-to-speech body matches the documented fields', () => {
  assert.deepEqual(buildTtsBody('नमस्ते', 'hi-IN'), {
    text: 'नमस्ते', language_code: 'hi-IN', model: 'bulbul:v3', output_audio_codec: 'mp3', enable_preprocessing: true,
  });
  assert.throws(() => buildTtsBody('hello', 'fr-FR'));
});

test('the Sarvam speech-to-text form transcribes code-mixed speech in Roman script', () => {
  const form = buildSttForm(new Uint8Array([1, 2, 3]), 'audio/webm');
  assert.equal(form.get('model'), 'saaras:v4');
  assert.equal(form.get('mode'), 'translit');
  assert.equal(form.get('language_code'), 'unknown');
  assert.ok(form.get('file') instanceof Blob);
});

test('Sarvam answers are read defensively', () => {
  assert.deepEqual(readSttResult({ transcript: ' 30 tareekh ', language_code: 'hi-IN' }), { transcript: '30 tareekh', language: 'hi-IN' });
  assert.equal(readSttResult({}), null);
  assert.equal(readTtsResult({ audios: ['UklGRg=='] }), 'UklGRg==');
  assert.equal(readTtsResult({ audios: [] }), null);
});
