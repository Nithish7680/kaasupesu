// Seed data and every sentence KaasuPesu says.
// KaasuPesu's lines are fixed strings per language: a model never writes what KaasuPesu says.
// The Hindi and Tamil strings need a native speaker's review before anyone hears them for real.

// The Activity 2 prompt pins today's date so the demo behaves the same on every run.
export const TODAY = '2026-11-20';

export const OWNER = Object.freeze({
  business: 'Lakshmi Fabrics',
  city: 'Tiruppur',
  udyamRegistered: true,
  size: 'micro', // micro | small | medium
  kind: 'manufacturer', // manufacturer | service | trader
});

// callName: how KaasuPesu greets them on the call. ownerRef: how it names them to the owner.
export const CONTACTS = Object.freeze([
  Object.freeze({
    id: 'ramesh', name: 'Ramesh', business: 'Sharma Garments', city: 'Delhi', language: 'hi', phone: '',
    callName: 'Ramesh ji', ownerRef: 'Ramesh sir', pronoun: 'he', aliases: ['ramesh', 'sharma garments', 'sharma'],
  }),
  Object.freeze({
    id: 'priya', name: 'Priya', business: 'Kovai Stores', city: 'Coimbatore', language: 'ta', phone: '',
    callName: 'Priya madam', ownerRef: 'Priya madam', pronoun: 'she', aliases: ['priya', 'kovai stores', 'kovai'],
  }),
  Object.freeze({
    id: 'john', name: 'John', business: 'Metro Retail', city: 'Bengaluru', language: 'en', phone: '',
    callName: 'John', ownerRef: 'John sir', pronoun: 'he', aliases: ['john', 'metro retail', 'metro'],
  }),
]);

export const BILLS = Object.freeze([
  Object.freeze({
    id: 'b-priya', contactId: 'priya', amount: 25000, billDate: '2026-10-20', promisedDate: '2026-11-15',
    paid: false, disputed: false, language: null, calls: [],
  }),
  Object.freeze({
    id: 'b-john', contactId: 'john', amount: 18000, billDate: '2026-09-15', promisedDate: null,
    paid: false, disputed: false, language: null, calls: [],
  }),
]);

// The owner's scripted note and the buyer replies the tester can tap. Reply order matches the intents:
// promised, vague, paid, dispute, call_later, wrong_person.
export const OWNER_SCRIPT = 'Delhi-la Sharma Garments kitta ₹40,000 baakki irukku. October 12 bill. Avanga accountant Ramesh-ku call pannu.';
export const SAMPLE_REPLIES = Object.freeze({
  hi: ['30 tareekh tak kar denge', 'agle hafte dekhte hain', 'payment kal hi kar diya', 'maal mein defect tha',
    'meeting mein hoon, shaam ko call karo', 'main accounts mein nahi hoon'],
  ta: ['30-ku kudukkuren', 'adutha vaaram paakalam', 'already pay pannitten', 'sarakku quality sari illa',
    'meeting-la irukken, aprom call pannunga', 'naan accounts paakaradhu illa'],
  en: ["I'll pay by the 30th", 'Next week, maybe', 'We already paid', 'The goods were damaged',
    "I'm in a meeting, call me later", "I don't handle payments"],
});
export const SAMPLE_YES_NO = Object.freeze({ hi: ['haan, bhej do', 'nahi'], ta: ['seri, anuppunga', 'vendaam'], en: ['Yes, send it', 'No'] });

export const INTENT_LABELS = Object.freeze({
  promised: 'Promised', vague: 'No date given', paid: 'Says paid', dispute: 'Dispute',
  call_later: 'Call later', wrong_person: 'Wrong person', unclear: 'Unclear',
});

// --- Formatting -----------------------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parts = (iso) => iso.split('-').map(Number);

export const rupees = (amount) => Number(amount).toLocaleString('en-IN');
export function dayMonth(iso) { const [, m, d] = parts(iso); return `${d} ${MONTHS[m - 1]}`; }
export function monthDay(iso) { const [, m, d] = parts(iso); return `${MONTHS[m - 1]} ${d}`; }
export function shortDate(iso) { const [, m, d] = parts(iso); return `${d} ${MONTHS[m - 1].slice(0, 3)}`; }

const THOUSAND_WORDS = {
  14: 'fourteen', 15: 'fifteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen', 19: 'nineteen',
  40: 'forty', 50: 'fifty', 60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety',
};
export function amountWords(amount) {
  const word = THOUSAND_WORDS[amount / 1000];
  return word ? `${word} thousand` : `₹${rupees(amount)}`;
}
const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// --- Lines to the owner (Tanglish on screen, Tamil script for a Tamil voice) -------------------------

const LANGUAGE_NAMES = { hi: ['Hindi', 'ஹிந்தி'], ta: ['Tamil', 'தமிழ்'], en: ['English', 'இங்கிலீஷ்'] };
const SAID = { he: ['sonnaru', 'சொன்னாரு'], she: ['sonnaanga', 'சொன்னாங்க'], they: ['sonnaanga', 'சொன்னாங்க'] };

function ownerLine(key, text, tamil) {
  return { key, text, gloss: null, speak: { lang: 'ta-IN', text: tamil }, fallback: text };
}
const spokenDigits = (groups) => groups.split(' ').map((group) => group.split('').join(' ')).join(', ');

const VOICE_NOTES = {
  promised: (v, said) => ownerLine(
    'voiceNote',
    `${v.ref} ${v.date}-kulla pay pannidrennu ${said[0]}.${v.billSent ? ' Bill-um link-um WhatsApp-la anuppitten.' : ''}`,
    `${v.ref} ${v.date}-க்குள்ள பே பண்ணிடறேன்னு ${said[1]}.${v.billSent ? ' பில்லும் லிங்க்கும் WhatsApp-ல அனுப்பிட்டேன்.' : ''}`,
  ),
  vague: (v) => ownerLine('voiceNote', `${v.ref} date sollala. Aprom thirumba call pannren.`,
    `${v.ref} தேதி சொல்லல. அப்புறம் திரும்ப கால் பண்றேன்.`),
  paid: (v, said) => ownerLine('voiceNote', `${v.ref} already pay pannittadha ${said[0]}. Bank-la check pannunga.`,
    `${v.ref} ஏற்கனவே பே பண்ணிட்டதா ${said[1]}. பேங்க்-ல செக் பண்ணுங்க.`),
  dispute: (v, said) => ownerLine('voiceNote', `${v.ref} oru prachanai ${said[0]}. Neenga pesunga.`,
    `${v.ref} ஒரு பிரச்சனை ${said[1]}. நீங்க பேசுங்க.`),
  call_later: (v, said) => ownerLine('voiceNote', `${v.ref} ${v.when || 'aprom'} call panna ${said[0]}. Appo call pannren.`,
    `${v.ref} ${v.when || 'அப்புறம்'} கால் பண்ண ${said[1]}. அப்போ கால் பண்றேன்.`),
  wrong_person: (v, said) => ownerLine('voiceNote', `${v.ref} accounts paakaradhu illa-nu ${said[0]}. Sariyaana aal yaarunu kettirukken.`,
    `${v.ref} அக்கவுண்ட்ஸ் பாக்கறது இல்லன்னு ${said[1]}. சரியான ஆள் யாருன்னு கேட்டிருக்கேன்.`),
  unclear: (v) => ownerLine('voiceNote', `${v.ref} kitta sariya pesa mudiyala. Aprom thirumba call pannren.`,
    `${v.ref} கிட்ட சரியா பேச முடியல. அப்புறம் திரும்ப கால் பண்றேன்.`),
};

export const ownerLines = {
  greeting: () => ownerLine('greeting', 'Vanakkam! Yaar kitta baakki irukku? Mic-a pidichu pesunga, illa type pannunga.',
    'வணக்கம்! யார் கிட்ட பாக்கி இருக்கு? மைக்கை பிடிச்சு பேசுங்க, இல்ல டைப் பண்ணுங்க.'),
  readBack: (v) => ownerLine(
    'readBack',
    `${v.business}, ₹${rupees(v.amount)}, ${monthDay(v.billDate)} bill. ${v.contactName}-ku ${LANGUAGE_NAMES[v.language][0]}-la call pannattuma?`,
    `${v.business}, ${rupees(v.amount)} ரூபாய், ${monthDay(v.billDate)} பில். ${v.contactName}-க்கு ${LANGUAGE_NAMES[v.language][1]}-ல கால் பண்ணட்டுமா?`,
  ),
  amountChoice: (heard, other) => {
    const text = `${capitalise(amountWords(heard))}-aa, ${amountWords(other)}-aa?`;
    return { key: 'amountChoice', text, gloss: null, speak: { lang: 'en-IN', text }, fallback: text };
  },
  whatToChange: () => ownerLine('whatToChange', 'Edhu maaththanum?', 'எது மாத்தணும்?'),
  notHeard: () => ownerLine('notHeard', 'Sariya kekkala, innoru thadava sollunga.', 'சரியா கேக்கல, இன்னொரு தடவ சொல்லுங்க.'),
  typeInstead: () => ownerLine('typeInstead', 'Kekka mudiyala. Keezha type pannunga.', 'கேக்க முடியல. கீழ டைப் பண்ணுங்க.'),
  askContact: () => ownerLine('askContact', 'Yaarukku call pannanum?', 'யாருக்கு கால் பண்ணணும்?'),
  askAmount: () => ownerLine('askAmount', 'Evvalavu baakki?', 'எவ்வளவு பாக்கி?'),
  askBillDate: () => ownerLine('askBillDate', 'Bill endha thethi?', 'பில் எந்த தேதி?'),
  askNumber: (name) => ownerLine('askNumber', `${name} number illa. Number sollunga.`, `${name} நம்பர் இல்ல. நம்பர் சொல்லுங்க.`),
  readDigits: (groups) => ({
    key: 'readDigits', text: `${groups}, sariyaa?`, gloss: null,
    speak: { lang: 'ta-IN', text: `${spokenDigits(groups)}, சரியா?` }, fallback: `${spokenDigits(groups)}, sariyaa?`,
  }),
  calling: (name) => ownerLine('calling', `Seri, ${name}-ku call pannren.`, `சரி, ${name}-க்கு கால் பண்றேன்.`),
  voiceNote: (outcome, v) => VOICE_NOTES[outcome](v, SAID[v.pronoun] ?? SAID.they),
};

const NEXT_STEPS = {
  promised: (v) => `${v.date}-ku apram payment varalainna, thirumba call.`,
  vague: () => 'Rendu naal kazhichu thirumba call.',
  paid: () => 'Bank-la payment check pannunga.',
  dispute: (v) => `Neenga ${v.ref} kitta pesunga.`,
  call_later: (v) => `${v.when ? capitalise(v.when) : 'Aprom'} thirumba call.`,
  wrong_person: () => 'Sariyaana aal kidaichadhum thirumba call.',
  unclear: () => 'Aprom thirumba call.',
};
export const ownerNextStep = (outcome, v) => NEXT_STEPS[outcome](v);

// --- Lines to the buyer (written in English, spoken in the contact's language) ----------------------

const possessive = (name) => (name.endsWith('s') ? `${name}'` : `${name}'s`);

const BUYER = {
  greeting: {
    en: (v) => `Hello ${v.callName}, this is ${possessive(v.owner)} automated assistant from ${v.city}. The ₹${v.amount} bill from ${v.day} is still pending.`,
    hi: (v) => `नमस्ते ${v.callName}, यह ${v.city} से ${v.owner} का ऑटोमेटेड असिस्टेंट है। ${v.day} का ${v.amount} रुपये का बिल अभी बाकी है।`,
    ta: (v) => `வணக்கம் ${v.callName}, இது ${v.city} ${v.owner}-ஓட ஆட்டோமேட்டட் அசிஸ்டன்ட். ${v.day} பில் ${v.amount} ரூபாய் இன்னும் பாக்கி இருக்கு.`,
  },
  askDate: {
    en: () => 'By what date can you clear it?',
    hi: () => 'आप इसे किस तारीख तक क्लियर कर सकते हैं?',
    ta: () => 'எந்த தேதிக்குள்ள கிளியர் பண்ண முடியும்?',
  },
  missedPromise: {
    en: (v) => `You had said ${v.date}.`,
    hi: (v) => `आपने ${v.date} कहा था।`,
    ta: (v) => `நீங்க ${v.date}-னு சொல்லியிருந்தீங்க.`,
  },
  legal: {
    en: () => 'Under the MSME law, a small supplier must be paid within 45 days. After that, interest at three times the RBI bank rate applies, and the expense can\'t be claimed for tax until paid.',
    hi: () => 'MSME कानून के तहत छोटे सप्लायर को 45 दिनों के अंदर पेमेंट मिलना चाहिए। उसके बाद RBI बैंक रेट के तीन गुना पर ब्याज लगता है, और पेमेंट होने तक यह खर्च टैक्स में क्लेम नहीं किया जा सकता।',
    ta: () => 'MSME சட்டப்படி சிறு சப்ளையருக்கு 45 நாட்களுக்குள் பணம் கொடுக்கணும். அதுக்கு அப்புறம் RBI பேங்க் ரேட்டின் மூணு மடங்கு வட்டி வரும், பணம் கொடுக்கும் வரை இந்த செலவை டாக்ஸ்-ல கிளைம் பண்ண முடியாது.',
  },
  confirmPromise: {
    en: (v) => `So, ${v.date}.`,
    hi: (v) => `तो, ${v.date}।`,
    ta: (v) => `அப்போ, ${v.date}.`,
  },
  offerBill: {
    en: () => 'Shall I send the bill and payment link on WhatsApp?',
    hi: () => 'क्या मैं बिल और पेमेंट लिंक WhatsApp पर भेज दूँ?',
    ta: () => 'பில்லும் பேமெண்ட் லிங்க்கும் WhatsApp-ல அனுப்பட்டுமா?',
  },
  billSent: {
    en: () => 'Sent on WhatsApp.',
    hi: () => 'WhatsApp पर भेज दिया है।',
    ta: () => 'WhatsApp-ல அனுப்பிட்டேன்.',
  },
  askDateAgain: {
    en: () => 'Could you give me a date?',
    hi: () => 'क्या आप कोई तारीख बता सकते हैं?',
    ta: () => 'ஒரு தேதி சொல்ல முடியுமா?',
  },
  noDate: {
    en: () => 'Okay, noted.',
    hi: () => 'ठीक है, नोट कर लिया।',
    ta: () => 'சரி, நோட் பண்ணிக்கிட்டேன்.',
  },
  askPaidRef: {
    en: () => 'Thank you. On what date did you pay, and what is the payment reference?',
    hi: () => 'धन्यवाद। आपने किस तारीख को पेमेंट किया, और उसका रेफरेंस क्या है?',
    ta: () => 'நன்றி. எந்த தேதி பே பண்ணீங்க, அதோட ரெஃபரன்ஸ் என்ன?',
  },
  willTellOwner: {
    en: (v) => `I'll tell ${v.owner}.`,
    hi: (v) => `${v.owner} को बता दिया जाएगा।`,
    ta: (v) => `${v.owner}-கிட்ட சொல்லிடறேன்.`,
  },
  askWhenLater: {
    en: () => 'Sure. When should I call back?',
    hi: () => 'ज़रूर। कब वापस कॉल करें?',
    ta: () => 'சரி. எப்போ திரும்ப கால் பண்ணட்டும்?',
  },
  callbackBooked: {
    en: (v) => `Okay, I'll call ${v.when}.`,
    hi: (v) => `ठीक है, ${v.when} कॉल करेंगे।`,
    ta: (v) => `சரி, ${v.when} கால் பண்றேன்.`,
  },
  wrongPerson: {
    en: () => 'Sorry to bother you. Who handles payments?',
    hi: () => 'माफ़ कीजिए। पेमेंट कौन देखते हैं?',
    ta: () => 'மன்னிக்கவும். பேமெண்ட் யார் பாக்கறாங்க?',
  },
  notCaught: {
    en: () => "Sorry, I didn't catch that. Could you say it again?",
    hi: () => 'माफ़ कीजिए, ठीक से सुनाई नहीं दिया। क्या आप फिर से बता सकते हैं?',
    ta: () => 'மன்னிக்கவும், சரியா கேக்கல. இன்னொரு தடவ சொல்ல முடியுமா?',
  },
  callBackLater: {
    en: () => "I'll call back later.",
    hi: () => 'हम बाद में कॉल करेंगे।',
    ta: () => 'அப்புறம் கால் பண்றேன்.',
  },
  thanks: {
    en: (v) => `Thank you, ${v.callName}.`,
    hi: (v) => `धन्यवाद, ${v.callName}।`,
    ta: (v) => `நன்றி, ${v.callName}.`,
  },
};

export function buyerLine(key, language, vars) {
  const entry = BUYER[key];
  const gloss = entry.en(vars);
  const text = (entry[language] ?? entry.en)(vars);
  return { key, text, gloss, speak: { lang: `${language}-IN`, text }, fallback: gloss };
}
