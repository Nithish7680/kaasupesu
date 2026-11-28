// The server's address rule, checked on a real child process. With no keys, any address gets the page, because a
// judge may open the Docker port by IP. With any key set, only 127.0.0.1 and localhost, so a DNS-rebinding page
// can't spend it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));

// Keys are always given explicitly, so a developer's own .env never decides the result.
function start(port, keys = {}) {
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', OPENAI_API_KEY: '', WISPR_API_KEY: '', ELEVENLABS_API_KEY: '', ...keys };
  const child = spawn(process.execPath, [SERVER], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('KaasuPesu prototype')) resolve(child);
    });
    child.on('exit', (code) => reject(new Error(`server exited with code ${code}`)));
  });
}

function statusFor(port, host) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/', headers: { host } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject);
  });
}

const configFor = async (port) => (await fetch(`http://127.0.0.1:${port}/api/config`)).json();

test('with no keys, the page opens at any address, as a judge may open the Docker port by IP', async (t) => {
  const child = await start(8791);
  t.after(() => child.kill());
  assert.equal(await statusFor(8791, '192.168.1.20:8791'), 200);
  assert.equal(await statusFor(8791, 'localhost:8791'), 200);
  const tts = await fetch('http://127.0.0.1:8791/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"text":"hello","language":"en-IN"}' });
  assert.equal(tts.status, 503); // no ElevenLabs key: the browser's voice speaks
});

test('with an OpenAI key set, only 127.0.0.1 and localhost are answered, and the voice stays off', async (t) => {
  const child = await start(8792, { OPENAI_API_KEY: 'test-placeholder' });
  t.after(() => child.kill());
  assert.deepEqual(await configFor(8792), { stt: false, tts: false, llm: true });
  assert.equal(await statusFor(8792, '192.168.1.20:8792'), 403);
  assert.equal(await statusFor(8792, 'localhost:8792'), 200);
  assert.equal(await statusFor(8792, '127.0.0.1:8792'), 200);
});

test('an ElevenLabs key alone turns on only the voice, and the address rule with it', async (t) => {
  const child = await start(8794, { ELEVENLABS_API_KEY: 'test-placeholder' });
  t.after(() => child.kill());
  assert.deepEqual(await configFor(8794), { stt: false, tts: true, llm: false });
  assert.equal(await statusFor(8794, '192.168.1.20:8794'), 403);
});
