// Text understanding for KaasuPesu: amounts, dates, contacts, yes/no answers and the buyer's intent.
// Works on Roman-script text (typed input and the browser's en-IN speech). The keyed path's model output
// is re-checked with these same functions, so code always has the last word.
import { amountWords } from './lines.js';

export const INTENTS = Object.freeze(['promised', 'vague', 'paid', 'dispute', 'call_later', 'wrong_person', 'unclear']);

const DAY_MS = 86_400_000;

export function normalise(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/₹/g, ' rs ')
    .replace(/(\d),(?=\d)/g, '$1') // 40,000 -> 40000
    .replace(/[^a-z0-9.\s]/g, ' ') // hyphens, apostrophes and non-Roman letters become spaces
    .replace(/\.(?!\d)/g, ' ') // keep decimal points only
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Amounts --------------------------------------------------------------------------------------

const EN_SMALL = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const EN_TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const HI_NUMBERS = {
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, chhe: 6, saat: 7, aath: 8, nau: 9,
  das: 10, gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16, satrah: 17, atharah: 18,
  unnees: 19, bees: 20, pachchees: 25, pachees: 25, tees: 30, chaalees: 40, chalees: 40, chalis: 40, chaalis: 40,
  pachaas: 50, pachas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90,
};
const TA_THOUSANDS = {
  pathaayiram: 10000, padhaayiram: 10000, padhinaalaayiram: 14000, irupathaayiram: 20000, irubathaayiram: 20000,
  muppathaayiram: 30000, naarpadhaayiram: 40000, naarpathaayiram: 40000, narpathayiram: 40000,
  aimbathaayiram: 50000, ambathaayiram: 50000, arubathaayiram: 60000, ezhubathaayiram: 70000,
  embathaayiram: 80000, enbathaayiram: 80000, thonnooraayiram: 90000,
};
const UNIT = '(k|thousand|hazaa?r|a?ayiram|lakhs?|lac|laksham)';
const SOUND_ALIKE = { 14: 40, 15: 50, 16: 60, 17: 70, 18: 80, 19: 90, 40: 14, 50: 15, 60: 16, 70: 17, 80: 18, 90: 19 };

const alternation = (words) => Object.keys(words).sort((a, b) => b.length - a.length).join('|');
const unitValue = (unit) => (unit.startsWith('l') ? 100_000 : 1000);
const isYear = (n) => n >= 1990 && n <= 2099;

function toAmount(value, kind) {
  const rounded = Math.round(value);
  return rounded > 0 && rounded < 1e9 ? { value: rounded, kind } : null;
}

const TA_NUMBERS = { oru: 1, rendu: 2 };
const WORD_NUMBERS = { ...EN_SMALL, ...EN_TENS, ...HI_NUMBERS, ...TA_NUMBERS };
const hasMonth = (t) => new RegExp(`\\b${MONTH}\\b`).test(t);

// Spoken numbers become digits, so "one lakh fifty thousand" and "ek lakh pachaas hazaar" both read as
// "1 lakh 50 thousand", and every <number> <unit> pair is added up.
function wordsToDigits(t) {
  return t
    .replace(new RegExp(`\\b(${alternation(TA_THOUSANDS)})\\b`, 'g'), (word) => `${TA_THOUSANDS[word] / 1000} thousand`)
    .replace(new RegExp(`\\b(${alternation(EN_TENS)})\\s(${alternation(EN_SMALL)})\\b`, 'g'), (_, tens, unit) => String(EN_TENS[tens] + EN_SMALL[unit]))
    .replace(new RegExp(`\\b(${alternation(WORD_NUMBERS)})\\b`, 'g'), (word) => String(WORD_NUMBERS[word]));
}

function unitTotal(t) {
  const pairs = [...t.matchAll(new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s?${UNIT}\\b`, 'g'))];
  return pairs.length ? pairs.reduce((sum, m) => sum + Number(m[1]) * unitValue(m[2]), 0) : null;
}

export function parseAmount(text) {
  const t = normalise(text);
  const spoken = wordsToDigits(t);
  const total = unitTotal(spoken);
  if (total) return toAmount(total, spoken === t ? 'digits' : 'words');
  const withCurrency = t.match(/\b(?:rs|rupees?|inr)\s?(\d+(?:\.\d+)?)\b/)
    ?? t.match(/\b(\d+(?:\.\d+)?)\s?(?:rs|rupees?|rupaye|roobaai)\b/);
  if (withCurrency) return toAmount(Number(withCurrency[1]), 'digits');
  // A four-digit 1990-2099 number is a year only when a month is named too ("October 12 2026 bill 40000").
  const skipYears = hasMonth(t);
  const bare = [...t.matchAll(/\b(\d{4,9})\b/g)].map((m) => Number(m[1])).find((n) => !(skipYears && isYear(n)));
  return bare ? toAmount(bare, 'digits') : null;
}

// 40,000 and 14,000 sound alike when heard; so do 15/50 up to 19/90 thousand.
export function soundAlike(amount) {
  if (!Number.isInteger(amount) || amount % 1000 !== 0) return null;
  const other = SOUND_ALIKE[amount / 1000];
  return other ? other * 1000 : null;
}

// Which of the offered amounts did the owner pick? "forty", "40", "forty thousand" or "₹40,000".
export function matchChoice(text, options) {
  const tokens = normalise(text).split(' ');
  const said = parseAmount(text)?.value;
  const hits = options.filter((value) => said === value
    || tokens.includes(amountWords(value).split(' ')[0])
    || tokens.includes(String(value / 1000)));
  return hits.length === 1 ? hits[0] : null;
}

// --- Dates ----------------------------------------------------------------------------------------

const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const ORDINAL = '(?:st|nd|rd|th)?';
const DAY_WORD = '(?:aam\\s|am\\s)?(?:thethi|thedhi|tethi|theti|tareekh|tarikh|tarik|tareek|tarekh|date)';
const RELATIVE = [
  [/\b(?:day after tomorrow|parson)\b/, 2],
  [/\b(?:tomorrow|kal tak|naalaikku|naalai)\b/, 1],
  [/\b(?:today|aaj|indru|inniku)\b/, 0],
  [/\b(?:yesterday|nethu|neththu)\b/, -1],
];
const monthNumber = (word) => MONTH_KEYS.indexOf(word.slice(0, 3)) + 1;

export function parseDateExpr(text) {
  const t = normalise(text);
  const dayFirst = t.match(new RegExp(`\\b(\\d{1,2})${ORDINAL}\\s(?:of\\s)?${MONTH}\\b`));
  if (dayFirst) return { day: Number(dayFirst[1]), month: monthNumber(dayFirst[2]) };
  const monthFirst = t.match(new RegExp(`\\b${MONTH}\\s(\\d{1,2})${ORDINAL}\\b`));
  if (monthFirst) return { day: Number(monthFirst[2]), month: monthNumber(monthFirst[1]) };
  const dayOnly = t.match(new RegExp(`\\b(\\d{1,2})${ORDINAL}\\s${DAY_WORD}\\b`))
    ?? t.match(/\b(\d{1,2})\s(?:kulla|kkulla|ku|kku|tak|ko)\b/)
    ?? t.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/);
  if (dayOnly) return { day: Number(dayOnly[1]), month: null };
  const relative = RELATIVE.find(([pattern]) => pattern.test(t));
  return relative ? { offset: relative[1] } : null;
}

const parseIso = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; };
const toIso = ({ y, m, d }) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const isValid = ({ y, m, d }) => m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
const shiftMonth = ({ y, m }, step) => { const i = y * 12 + (m - 1) + step; return { y: Math.floor(i / 12), m: (i % 12) + 1 }; };
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

function resolveWithMonth(expr, today, direction) {
  const now = parseIso(today);
  const sameYear = { y: now.y, m: expr.month, d: expr.day };
  const iso = toIso(sameYear);
  const shift = (direction === 'past' && iso > today) ? -1 : (direction === 'future' && iso < today) ? 1 : 0;
  const candidate = { ...sameYear, y: now.y + shift };
  return isValid(candidate) ? toIso(candidate) : null;
}

function resolveDayOnly(expr, today, direction) {
  const now = parseIso(today);
  const step = direction === 'past' ? -1 : 1;
  const outside = direction === 'past' ? expr.day > now.d : expr.day < now.d;
  let month = outside ? shiftMonth(now, step) : { y: now.y, m: now.m };
  for (let tries = 0; tries < 3; tries += 1) {
    if (isValid({ ...month, d: expr.day })) return toIso({ ...month, d: expr.day });
    month = shiftMonth(month, step); // e.g. "31" in a 30-day month moves one more month the same way
  }
  return null;
}

// Bill dates resolve to the most recent past date ('past'); promised dates to the next future one ('future').
export function resolveDate(expr, today, direction) {
  if (!expr) return null;
  if (expr.offset !== undefined) {
    const wrongWay = direction === 'past' ? expr.offset > 0 : expr.offset < 0;
    return wrongWay ? null : addDays(today, expr.offset);
  }
  return expr.month ? resolveWithMonth(expr, today, direction) : resolveDayOnly(expr, today, direction);
}

export const findDate = (text, today, direction) => resolveDate(parseDateExpr(text), today, direction);
export const daysBetween = (fromIso, toIsoDate) => Math.round(
  (Date.parse(`${toIsoDate}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS,
);

// --- Contacts, numbers, languages -----------------------------------------------------------------

// The contact named last wins: "Ramesh illa, John-ku" means John.
export function findContact(text, contacts) {
  const t = ` ${normalise(text)} `;
  const named = contacts
    .flatMap((contact) => contact.aliases.map((alias) => ({ contact, at: t.lastIndexOf(` ${alias} `) })))
    .filter((mention) => mention.at >= 0);
  return named.length ? named.reduce((last, mention) => (mention.at > last.at ? mention : last)).contact : null;
}

const BUSINESS = /\b([a-z]+)\s(traders|trading|garments|stores|textiles|fabrics|mills|enterprises|exports|agencies|industries|retail)\b/g;
const titleCase = (text) => text.replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function findUnknownBusiness(text, ownerBusiness = '') {
  const own = normalise(ownerBusiness);
  const match = [...normalise(text).matchAll(BUSINESS)].map((m) => `${m[1]} ${m[2]}`).find((name) => name !== own);
  return match ? titleCase(match) : null;
}

const LANGUAGE_WORDS = { hindi: 'hi', tamil: 'ta', english: 'en' };
export function findLanguage(text) {
  const m = normalise(text).match(/\b(hindi|tamil|english)\b/);
  return m ? LANGUAGE_WORDS[m[1]] : null;
}

export const digitsIn = (text) => String(text ?? '').replace(/\D/g, '');
export const groupDigits = (digits) => digits.match(/.{1,5}/g).join(' ');

export function extractOwnerNote(text, contacts, today, ownerBusiness = '') {
  const contact = findContact(text, contacts);
  return {
    contactId: contact?.id ?? null,
    unknownName: contact ? null : findUnknownBusiness(text, ownerBusiness),
    amount: parseAmount(text)?.value ?? null,
    billDate: findDate(text, today, 'past'),
    language: findLanguage(text),
  };
}

// --- Yes / no -------------------------------------------------------------------------------------

// Any negation wins: a missed yes costs one re-ask, a false yes sends a bill or starts a call.
// "don't", "can't" and "won't" normalise to "don t", "can t" and "won t", so a lone "t" is a negation.
const NO_WORDS = new Set([
  'illa', 'illai', 'vendaam', 'vendam', 'venaam', 'no', 'nope', 'not', 'never', 'nahi', 'nahin', 'mat', 'cancel',
  'wrong', 'thappu', 'galat', 'stop', 'wait', 'later', 'baad', 'ruko', 'aprom', 'appuram', 'neither',
  'dont', 'cant', 'cannot', 'wont', 't',
]);
const YES_WORDS = new Set([
  'aamaa', 'aama', 'aamaam', 'aamam', 'seri', 'sari', 'ok', 'okay', 'pannu', 'pannunga', 'yes', 'haan', 'han', 'ha', 'ji',
  'sure', 'correct', 'theek', 'thik', 'bhej', 'bhejo', 'send', 'anuppu', 'anuppunga', 'confirm', 'done',
]);

export function classifyConfirm(text) {
  const words = normalise(text).split(' ');
  if (words.some((w) => NO_WORDS.has(w))) return 'no';
  if (words.some((w) => YES_WORDS.has(w))) return 'yes';
  return 'unclear';
}

// --- The buyer's intent (keyless path, and the fallback when the model fails) ---------------------

const REPLY = {
  wrongPerson: /\b(accounts? (?:mein|me|la|le|il) (?:nahi|nahin|illa)|naan accounts? (?:\w+ )?illa|accounts paakaradhu illa|wrong (?:person|number)|galat (?:number|aadmi)|not the right person|don t handle|do not handle)\b/,
  paid: /\b(already paid|paid already|already pay|payment (?:kal hi |aaj hi |already |to )?(?:kar diya|kar di|ho gaya|ho gayi|done|bhej diya)|kar diya|pannitt?en|pannittom|anuppitt?en|utr|transfer (?:kar diya|ho gaya|done))\b/,
  dispute: /\b(defect\w*|kharab|damag\w*|galat bill|wrong bill|bill galat|quality|short supply|kam aaya|return|complaint|prachanai)\b/,
  callLater: /\b(meeting|busy|call back|call (?:me )?later|later call|call karo|call karna|call pannunga|baad (?:mein|me) call|abhi nahi|free illa)\b/,
  vague: /\b(agle hafte|next week|jaldi|soon|later|dekhte hain|dekhenge|try karenge|koshish|adutha vaaram|seekiram|paakalam|paakkalam|let me see|will see|pata nahi|maybe)\b/,
  promiseVerb: /\b(denge|de denge|kar denge|kar dunga|karenge|pay|clear|bhej denge|kudukkuren|kudukkaren|pannidren|pannidaren|tharen|transfer)\b/,
  annoyed: /\b(baar baar|pareshan|irritat\w*|disturb\w*|stop calling|mat karo|gussa|tension|bothering)\b/,
};
const NEGATION = /\b(nahi|nahin|not|never|cant|cannot|wont|dont|illa|illai|mudiyaadhu|mudiyadhu|mushkil|mat)\b|\b\w+ t\b/;
const NOT_A_NEGATION = /\b(no problem|not a problem|koi baat nahi|no issues?)\b/g;
const HEDGE = /\b(maybe|perhaps|shayad|koshish|try|dekhte|dekhenge|hopefully|paakalam|paakkalam|let me see|will see)\b/;
const REASON_LIMIT = 120;
const MAX_PROMISE_DAYS = 90;

// A promise is a date the buyer can actually mean: today or within the next 90 days.
export function isPlausiblePromise(date, today) {
  if (!date) return false;
  const ahead = daysBetween(today, date);
  return ahead >= 0 && ahead <= MAX_PROMISE_DAYS;
}

// A date only counts as a promise when it is not negated, not hedged and plausible; otherwise the reply is vague.
export function classifyReply(text, today) {
  const t = normalise(text);
  const plain = t.replace(NOT_A_NEGATION, ' ');
  const date = findDate(text, today, 'future');
  const annoyed = REPLY.annoyed.test(t);
  const answer = (intent, extra = {}) => ({
    intent, date: null, reason: '', tone: annoyed ? 'annoyed' : (intent === 'vague' ? 'unsure' : 'calm'), ...extra,
  });
  if (!t) return answer('unclear');
  if (REPLY.wrongPerson.test(t)) return answer('wrong_person');
  if (REPLY.paid.test(t)) return answer('paid');
  if (REPLY.dispute.test(t)) return answer('dispute', { reason: String(text).trim().slice(0, REASON_LIMIT) });
  if (REPLY.callLater.test(t) && !(date && REPLY.promiseVerb.test(t))) return answer('call_later');
  const committed = !NEGATION.test(plain) && !HEDGE.test(plain);
  if (committed && isPlausiblePromise(date, today)) return answer('promised', { date });
  if (date || !committed || REPLY.vague.test(t)) return answer('vague');
  return answer('unclear');
}
