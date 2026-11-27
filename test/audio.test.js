// Tests for the WAV encoder the browser uses before sending speech to Wispr Flow.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WAV_RATE, encodeWav } from '../src/audio.js';

const tag = (bytes, offset) => String.fromCharCode(...bytes.slice(offset, offset + 4));

test('encodes 16 kHz mono PCM16 WAV, the format Wispr Flow takes', () => {
  const bytes = encodeWav(new Float32Array([0, 0.5, -0.5, 1]), WAV_RATE);
  const view = new DataView(bytes.buffer);
  assert.equal(WAV_RATE, 16000);
  assert.equal(tag(bytes, 0), 'RIFF');
  assert.equal(view.getUint32(4, true), bytes.length - 8);
  assert.equal(tag(bytes, 8), 'WAVE');
  assert.equal(tag(bytes, 12), 'fmt ');
  assert.equal(view.getUint16(20, true), 1, 'PCM');
  assert.equal(view.getUint16(22, true), 1, 'mono');
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint32(28, true), 32000, 'bytes per second');
  assert.equal(view.getUint16(34, true), 16, '16-bit');
  assert.equal(tag(bytes, 36), 'data');
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(bytes.length, 44 + 8);
});

test('samples are scaled to 16-bit and clipped', () => {
  const bytes = encodeWav(new Float32Array([1, -1, 2, -2, 0]), WAV_RATE);
  const view = new DataView(bytes.buffer);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => view.getInt16(44 + i * 2, true)), [32767, -32768, 32767, -32768, 0]);
});
