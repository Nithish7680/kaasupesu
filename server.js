// Local server for the KaasuPesu prototype. Serves the screen and, when keys are set in .env, forwards speech
// to Wispr Flow and reading and voice to OpenAI. Listens on 127.0.0.1 unless HOST says otherwise (the Docker image
// sets 0.0.0.0 and never gets keys); keys never reach the browser.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ai from './src/ai.js';
import { CONTACTS, OWNER } from './src/lines.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(ROOT, '.env'));

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 8787;
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? '';
const WISPR_KEY = process.env.WISPR_API_KEY ?? '';
const TIMEOUT_MS = 20_000;
const LIMITS = { json: 16 * 1024, audio: 5 * 1024 * 1024, text: 2000, speech: 1000, asked: 300, contacts: 50 };
// Names Wispr should spell right: every saved contact and business, and the owner's own.
const STT_DICTIONARY = [...CONTACTS.flatMap((c) => [c.name, c.business]), OWNER.business, OWNER.city];
const JS = 'text/javascript; charset=utf-8';
const STATIC = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['public/app.js', JS]],
  ['/src/lines.js', ['src/lines.js', JS]],
  ['/src/parse.js', ['src/parse.js', JS]],
  ['/src/flows.js', ['src/flows.js', JS]],
  ['/src/audio.js', ['src/audio.js', JS]],
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

// --- OpenAI and Wispr Flow ------------------------------------------------------------------------

// One POST to a provider. Failures are logged here (never the key) and reach the browser as a 502.
async function callProvider(label, url, key, body) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`[${label}] ${url}: ${err.message}`);
    throw new HttpError(502, `${label}_unavailable`);
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    console.error(`[${label}] ${url} answered ${response.status}: ${detail}`);
    throw new HttpError(502, `${label}_unavailable`);
  }
  return response;
}

const jsonOf = (response) => response.json().catch(() => null);

// The browser sends 16 kHz WAV plus who is speaking (lang) and the question KaasuPesu just asked (asked).
async function handleStt(req, res) {
  if (!WISPR_KEY) throw new HttpError(503, 'stt_not_configured');
  const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'audio/wav') throw new HttpError(415, 'wav_required');
  const params = new URL(req.url ?? '/', `http://${HOST}`).searchParams;
  const lang = params.get('lang') ?? '';
  if (!Object.hasOwn(ai.LISTEN_LANGUAGES, lang)) throw new HttpError(400, 'bad_language');
  const audio = await readBody(req, LIMITS.audio);
  if (audio.toString('latin1', 0, 4) !== 'RIFF' || audio.toString('latin1', 8, 12) !== 'WAVE') throw new HttpError(400, 'not_wav');
  const asked = (params.get('asked') ?? '').slice(0, LIMITS.asked);
  const body = ai.buildSttBody(audio, ai.LISTEN_LANGUAGES[lang], { dictionary: STT_DICTIONARY, asked });
  const result = ai.readSttResult(await jsonOf(await callProvider('wispr', ai.WISPR_STT_URL, WISPR_KEY, body)));
  if (!result) throw new HttpError(502, 'stt_unusable');
  sendJson(res, 200, result);
}

async function handleTts(req, res) {
  if (!OPENAI_KEY) throw new HttpError(503, 'tts_not_configured');
  const body = await readJson(req);
  if (!ai.LANGUAGE_CODES.includes(body.language)) throw new HttpError(400, 'bad_language');
  const payload = ai.buildTtsBody(requireText(body.text, LIMITS.speech), body.language);
  const response = await callProvider('openai', ai.OPENAI_SPEECH_URL, OPENAI_KEY, payload);
  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) throw new HttpError(502, 'tts_unusable');
  sendJson(res, 200, { audio: audio.toString('base64'), mime: 'audio/mpeg' });
}

async function askOpenAi(params, validate) {
  const json = await jsonOf(await callProvider('openai', ai.OPENAI_CHAT_URL, OPENAI_KEY, params));
  const result = ai.readJsonResult(json, validate);
  if (!result) {
    console.error(`[openai] unusable answer (finish_reason=${json?.choices?.[0]?.finish_reason})`);
    throw new HttpError(502, 'llm_unusable');
  }
  return result;
}

async function handleExtract(req, res) {
  if (!OPENAI_KEY) throw new HttpError(503, 'llm_not_configured');
  const body = await readJson(req);
  const contacts = (Array.isArray(body.contacts) ? body.contacts : []).slice(0, LIMITS.contacts)
    .map((c) => ({ name: String(c?.name ?? '').slice(0, 60), business: String(c?.business ?? '').slice(0, 80) }));
  const params = ai.buildExtractRequest(requireText(body.text, LIMITS.text), contacts);
  sendJson(res, 200, await askOpenAi(params, ai.validateExtraction));
}

async function handleClassify(req, res) {
  if (!OPENAI_KEY) throw new HttpError(503, 'llm_not_configured');
  const body = await readJson(req);
  const asked = typeof body.asked === 'string' ? body.asked.slice(0, LIMITS.asked) : '';
  const params = ai.buildClassifyRequest(requireText(body.text, LIMITS.text), asked);
  sendJson(res, 200, await askOpenAi(params, ai.validateClassification));
}

// --- Server ---------------------------------------------------------------------------------------

// Wispr listening is offered only with GPT reading on: Wispr may write Tamil or Devanagari, which the rules can't read.
const ROUTES = {
  'GET /api/config': (req, res) => sendJson(res, 200, { stt: Boolean(WISPR_KEY && OPENAI_KEY), tts: Boolean(OPENAI_KEY), llm: Boolean(OPENAI_KEY) }),
  'POST /api/stt': handleStt,
  'POST /api/tts': handleTts,
  'POST /api/extract': handleExtract,
  'POST /api/classify': handleClassify,
};

// With a key set, only answer requests addressed to this machine, so a DNS-rebinding page cannot spend it.
// Without keys there is nothing to spend, and a judge may open the Docker port by IP.
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const CHECK_HOST = Boolean(OPENAI_KEY || WISPR_KEY);

export const server = http.createServer(async (req, res) => {
  try {
    if (CHECK_HOST && !ALLOWED_HOSTS.has(String(req.headers.host ?? '').toLowerCase())) return sendJson(res, 403, { error: 'wrong_host' });
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

// 0.0.0.0 means every address of the machine, so point people at localhost: Chrome allows the mic only there or on HTTPS.
const SHOWN_HOST = HOST === '0.0.0.0' ? 'localhost' : HOST;

server.listen(PORT, HOST, () => {
  console.log(`KaasuPesu prototype: http://${SHOWN_HOST}:${PORT}`);
  const voice = OPENAI_KEY ? `OpenAI (${ai.TTS_MODEL})` : 'browser';
  const reading = OPENAI_KEY ? `OpenAI (${ai.MODEL})` : 'built-in rules';
  console.log(`  listening: ${WISPR_KEY && OPENAI_KEY ? 'Wispr Flow' : 'browser'} · voice: ${voice} · reading: ${reading}`);
});
