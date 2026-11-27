// Local server for the KaasuPesu prototype. Serves the screen and, when keys are set in .env, forwards speech
// to Sarvam and reading to Claude. Listens on 127.0.0.1 only; keys never reach the browser.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ai from './src/ai.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(ROOT, '.env'));

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 8787;
const SARVAM_KEY = process.env.SARVAM_API_KEY ?? '';
const TIMEOUT_MS = 20_000;
const LIMITS = { json: 16 * 1024, audio: 5 * 1024 * 1024, text: 2000, speech: 1000, asked: 300, contacts: 50 };
const JS = 'text/javascript; charset=utf-8';
const STATIC = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['public/app.js', JS]],
  ['/src/lines.js', ['src/lines.js', JS]],
  ['/src/parse.js', ['src/parse.js', JS]],
  ['/src/flows.js', ['src/flows.js', JS]],
]);
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob: data:; connect-src 'self'",
};

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

// Minimal .env reader: KEY=value lines; never overrides a variable that is already set.
function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

async function createClaude() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    return new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  } catch (err) {
    console.error(`[claude] could not load @anthropic-ai/sdk (${err.message}); run npm install. Using the built-in rules.`);
    return null;
  }
}
const claude = await createClaude();

// --- Request helpers ------------------------------------------------------------------------------

async function readBody(req, limit) {
  if (Number(req.headers['content-length']) > limit) throw new HttpError(413, 'too_large');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'json_required');
  const raw = await readBody(req, LIMITS.json);
  let parsed;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'bad_json');
  }
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function requireText(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new HttpError(400, 'bad_text');
  return value.trim();
}

function sendJson(res, status, body) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...HEADERS });
  res.end(JSON.stringify(body));
}

async function sendStatic(res, pathname) {
  const [file, type] = STATIC.get(pathname);
  const data = await readFile(path.join(ROOT, file));
  res.writeHead(200, { 'Content-Type': type, ...HEADERS });
  res.end(data);
}

// --- Sarvam (speech) ------------------------------------------------------------------------------

async function sarvam(url, init) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'api-subscription-key': SARVAM_KEY, ...init.headers },
      body: init.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`[sarvam] ${url}: ${err.message}`);
    throw new HttpError(502, 'speech_unavailable');
  }
  if (!response.ok) {
    console.error(`[sarvam] ${url} answered ${response.status}`);
    throw new HttpError(502, 'speech_unavailable');
  }
  return response.json();
}

async function handleStt(req, res) {
  if (!SARVAM_KEY) throw new HttpError(503, 'stt_not_configured');
  const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (!type.startsWith('audio/') && type !== 'video/webm') throw new HttpError(415, 'audio_required');
  const audio = await readBody(req, LIMITS.audio);
  if (!audio.length) throw new HttpError(400, 'empty_audio');
  const form = ai.buildSttForm(audio, type === 'video/webm' ? 'audio/webm' : type);
  const result = ai.readSttResult(await sarvam(ai.SARVAM_STT_URL, { body: form }));
  if (!result) throw new HttpError(502, 'stt_unusable');
  sendJson(res, 200, result);
}

async function handleTts(req, res) {
  if (!SARVAM_KEY) throw new HttpError(503, 'tts_not_configured');
  const body = await readJson(req);
  if (!ai.LANGUAGE_CODES.includes(body.language)) throw new HttpError(400, 'bad_language');
  const payload = ai.buildTtsBody(requireText(body.text, LIMITS.speech), body.language);
  const audio = ai.readTtsResult(await sarvam(ai.SARVAM_TTS_URL, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
  if (!audio) throw new HttpError(502, 'tts_unusable');
  sendJson(res, 200, { audio, mime: 'audio/mpeg' });
}

// --- Claude (reading) -----------------------------------------------------------------------------

async function askClaude(params, validate) {
  let response;
  try {
    response = await claude.beta.messages.create(params);
  } catch (err) {
    console.error(`[claude] ${err?.constructor?.name ?? 'Error'} status=${err?.status ?? '-'}: ${err?.message}`);
    throw new HttpError(502, 'llm_unavailable');
  }
  const result = ai.readJsonResult(response, validate);
  if (!result) {
    console.error(`[claude] unusable answer (stop_reason=${response?.stop_reason})`);
    throw new HttpError(502, 'llm_unusable');
  }
  return result;
}

async function handleExtract(req, res) {
  if (!claude) throw new HttpError(503, 'llm_not_configured');
  const body = await readJson(req);
  const contacts = (Array.isArray(body.contacts) ? body.contacts : []).slice(0, LIMITS.contacts)
    .map((c) => ({ name: String(c?.name ?? '').slice(0, 60), business: String(c?.business ?? '').slice(0, 80) }));
  const params = ai.buildExtractRequest(requireText(body.text, LIMITS.text), contacts);
  sendJson(res, 200, await askClaude(params, ai.validateExtraction));
}

async function handleClassify(req, res) {
  if (!claude) throw new HttpError(503, 'llm_not_configured');
  const body = await readJson(req);
  const asked = typeof body.asked === 'string' ? body.asked.slice(0, LIMITS.asked) : '';
  const params = ai.buildClassifyRequest(requireText(body.text, LIMITS.text), asked);
  sendJson(res, 200, await askClaude(params, ai.validateClassification));
}

// --- Server ---------------------------------------------------------------------------------------

const ROUTES = {
  'GET /api/config': (req, res) => sendJson(res, 200, { stt: Boolean(SARVAM_KEY), tts: Boolean(SARVAM_KEY), llm: Boolean(claude) }),
  'POST /api/stt': handleStt,
  'POST /api/tts': handleTts,
  'POST /api/extract': handleExtract,
  'POST /api/classify': handleClassify,
};

// Only answer requests addressed to this machine, so a DNS-rebinding page cannot spend the API keys.
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

const server = http.createServer(async (req, res) => {
  try {
    if (!ALLOWED_HOSTS.has(String(req.headers.host ?? '').toLowerCase())) return sendJson(res, 403, { error: 'wrong_host' });
    const { pathname } = new URL(req.url ?? '/', `http://${HOST}`);
    const route = ROUTES[`${req.method} ${pathname}`];
    if (route) return await route(req, res);
    if (req.method === 'GET' && STATIC.has(pathname)) return await sendStatic(res, pathname);
    return sendJson(res, 404, { error: 'not_found' });
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.code });
    console.error('[server] unexpected error:', err);
    return sendJson(res, 500, { error: 'server_error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`KaasuPesu prototype: http://${HOST}:${PORT}`);
  console.log(`  speech: ${SARVAM_KEY ? 'Sarvam (saaras:v4, bulbul:v3)' : 'browser'} · reading: ${claude ? `Claude (${ai.MODEL})` : 'built-in rules'}`);
});
