# Round 1 texts

All three activities passed the quality check on 26 Nov 2026. Scores appear after Round 1 closes on 27 Nov.

- **Activity 1** below is copied from the submission page, so it is exactly what was submitted.
- **Activity 2** is the last draft we saved (772 words). It may differ slightly from what was pasted into the
  form. It is the spec for this prototype.
- **Activity 3** is the final draft we saved (460 words).

---

## Activity 1: Idea

The problem: Small suppliers in India sell on credit to bigger buyers, then wait weeks or months to be paid. Up to December 2025, ₹22,096 crore was still outstanding on delayed-payment cases that small businesses had filed with the government, and that counts only the cases someone filed. Getting the money back means phone calls the owner keeps putting off, because the buyer is a customer they can't afford to lose.

Who has it, where and how often: Owners of small manufacturing and trading businesses across India: the textile units of Tiruppur and Surat, the hosiery makers of Ludhiana, the engineering workshops of Rajkot and Coimbatore. They sell on credit to shops, factories and distributors, often in other states where people speak other languages. It hurts every week. Each bill that passes its due date means another awkward call. Each unpaid bill means less money for raw material and wages.

The voice-first product: KaasuPesu (Tamil for "talk money") is a voice agent that chases unpaid bills for the owner. The owner talks to it on WhatsApp, and it phones buyers in whatever language they speak.

1. A supplier in Tiruppur sends KaasuPesu a WhatsApp voice note: "Delhi-la Sharma Garments kitta ₹40,000 baakki irukku. October 12 bill. Avanga accountant Ramesh-ku call pannu."
2. KaasuPesu phones Ramesh in Hindi, his language: "Hello Ramesh ji, calling for Lakshmi Fabrics, Tiruppur. The ₹40,000 bill from 12 October is still pending. By what date can you clear it?" Every call opens in the supplier's own business name, and the owner can listen to it afterwards. KaasuPesu notes the date Ramesh promises. If he agrees on the call, it sends him the invoice and a UPI payment link as a WhatsApp bill message.
3. The owner gets a voice update in Tanglish: "Ramesh sir November 30-kulla pay pannidrennu sonnaru."
4. If the date passes, KaasuPesu calls again. Once the bill is past the legal 45-day limit, it politely tells the buyer two things: the law now adds interest at three times the RBI bank rate, and they can't claim this expense as a tax deduction until they pay.
5. If that still fails, KaasuPesu prepares a complaint on the government's MSME ODR portal (its online system for late-payment cases), with the invoices and interest worked out. The owner approves it before it is filed.

Why voice comes first: Chasing money is a conversation, and in India it already happens on the phone. The hard part is the tone, not the facts: polite enough to keep the customer, firm enough to get a date. That takes a voice, and a reminder message is easy to ignore. Voice also crosses the language gap. A Tamil-speaking owner can chase a Hindi-speaking buyer without either of them typing a word in a language they don't use. The owner's side is a 10-second voice note from the shop floor, in their own language, instead of opening an app and filling in a form. Without voice, KaasuPesu would be one more reminder app the owner never opens.

---

## Activity 2: Prototype prompt (the spec for this folder)

Build a mobile-first web prototype of KaasuPesu, a voice agent that chases unpaid bills for small Indian suppliers. Simulate WhatsApp and phone calls inside the app; send nothing real. Use speech-to-text that handles Tamil, Hindi, English and code-mixed speech (for example Sarvam AI), text-to-speech voices in those languages, and an LLM returning strict JSON, also used as the intent classifier. Fix today's date at 20 November 2026.

Your users and their languages:
- The owner: Lakshmi Fabrics, Tiruppur, a Udyam-registered micro manufacturer, speaking Tanglish (Tamil with English words and numbers) in short voice notes from a noisy workshop.
- Buyers' accounts staff on phone calls, in Hindi, Tamil or English, often mixed.
Each contact has a saved language; buyer lines below are in English, spoken in that language. Seed:
- Ramesh (Sharma Garments, Delhi, Hindi): no bill yet.
- Priya (Kovai Stores, Coimbatore, Tamil): ₹25,000, bill 20 October, promised 15 November, missed.
- John (Metro Retail, Bengaluru, English): ₹18,000, bill 15 September.

The voice flow, step by step:
1. Owner chat (WhatsApp-style): the owner holds the mic and says: "Delhi-la Sharma Garments kitta ₹40,000 baakki irukku. October 12 bill. Avanga accountant Ramesh-ku call pannu."
2. Extract contact, amount, bill date and call language, matched to saved contacts.
3. KaasuPesu reads it back, spoken and as a card: "Sharma Garments, ₹40,000, October 12 bill. Ramesh-ku Hindi-la call pannattuma?" "Aamaa", "seri", "ok" or "pannu" confirms; anything else, like "hmm", is asked again. "Illa" or "vendaam" triggers "Edhu maaththanum?"; update only the corrected field and read back again. No call starts without confirmation.
4. Call screen: the tester plays Ramesh with tap-to-talk. KaasuPesu says: "Hello Ramesh ji, this is Lakshmi Fabrics' automated assistant from Tiruppur. The ₹40,000 bill from 12 October is still pending. By what date can you clear it?" The classifier tags each reply with one intent (sample replies):
- promised ("30 tareekh tak kar denge"): repeat it ("So, 30 November") and offer the bill; on yes, show a simulated WhatsApp bill with a UPI "Pay now" button.
- vague ("agle hafte dekhte hain"): ask once for a date; if still vague, log "no date".
- paid ("payment kal hi kar diya"): ask for the date and reference.
- dispute ("maal mein defect tha"): "I'll tell Lakshmi Fabrics." Log the reason. Never argue.
- call_later ("meeting mein hoon, shaam ko call karo"): ask when, and book it.
- wrong_person ("main accounts mein nahi hoon"): apologise and ask who handles payments.
- unclear: anything else.
5. The owner gets the summary card (below) and a Tanglish voice note: "Ramesh sir November 30-kulla pay pannidrennu sonnaru. Bill-um link-um WhatsApp-la anuppitten."
6. Bills screen: each bill with its status (Waiting, Promised, Missed, Past 45 days, Disputed, Paid). "Call again" on Priya's bill opens in Tamil: "You had said 15 November." John's call adds: "Under the MSME law, a small supplier must be paid within 45 days. After that, interest at three times the RBI bank rate applies, and the expense can't be claimed for tax until paid." Say it only for Udyam-registered micro or small suppliers, never traders. Count 45 days from the bill date.

What the product says or shows back:
Every reply is spoken and shown as text. To the owner: under 15 words, Tanglish by default. To buyers: polite, never threatening, always saying it is the supplier's automated assistant. After each call, the AI writes a Tanglish summary card (intent, promised date or reason, buyer's tone, next step), so the owner needn't replay the call. Call cards show date and time (20 Nov, 3:42 pm). Transcript lines show their time in the call and play from there when tapped; the summary links to the key moment ("Promise at 0:42").

Noise, accents, mixed languages and misheard input:
- Mixed languages: transcribe code-mixed, never force one language. Normalise amounts ("forty thousand", "naarpadhaayiram", "chaalees hazaar" = 40000). Bill dates resolve to the most recent past date ("October 12", "12-aam thethi" = 12 October 2026); promised dates to the next future one ("30 tareekh" = 30 November 2026).
- Accents: sound-alike amounts (14/40 to 19/90 thousand) are read back as a choice: "Forty thousand-aa, fourteen thousand-aa?"
- Noise or silence: a recording under one second, or an empty transcript, gets "Sariya kekkala, innoru thadava sollunga." After two failures, show a text box.
- Missing details: ask only for what is missing, e.g. "Gupta Traders number illa. Number sollunga," then read the digits back in groups.
- On the call: after two unclear replies or two eight-second silences, say "I'll call back later," log "unclear" and tell the owner. Never record a promise the buyer didn't clearly make.

---

## Activity 3: Impact

Who benefits, and roughly how many: Owners of micro and small businesses that sell to other businesses on credit, and the workers whose wages wait on those payments. By June 2026, 8.7 crore enterprises had registered on Udyam and Udyam Assist. About 57% are manufacturers or service providers, roughly 5 crore; the rest are traders, who are outside the late-payment law but still benefit from the calls. Not every business sells on credit, but the problem is widespread: the Economic Survey 2025-26 puts ₹8.1 lakh crore stuck in delayed payments to MSMEs, and a 2026 Recordent report found invoices take 73 days on average to be paid, although most are issued on terms of 30 days or less. A realistic start: 10,000 suppliers in Tiruppur and Coimbatore, then Surat, Ludhiana and Rajkot.

What changes compared with today: Today the owner makes the awkward call themselves, sends a WhatsApp reminder that gets ignored, or simply waits, and meanwhile borrows or delays wages and raw material. A government complaint is the last resort, and it can end the relationship. With KaasuPesu, chasing a bill takes a 10-second voice note. The buyer gets a polite call in their own language the same day, the promised date is recorded, and follow-ups happen on their own. The owner reads a short summary instead of replaying calls. If a bill crosses 45 days, the buyer hears what the law says, and a complaint is ready if the owner wants it. The owner stops being the debt collector and goes back to running the unit.

How you'd know it worked: A three-month pilot with 50 suppliers in Tiruppur and Coimbatore, compared with their own previous three months of bills.
- Main signal: average days from bill date to payment on bills KaasuPesu chases. Target: under 45 days, against 73 days nationally today.
- Promises kept: at least 6 in 10 promised dates met.
- Owners keep using it: at least 7 in 10 still sending voice notes after eight weeks.
UPI-link payments are recorded automatically and the owner marks others by voice note, so the main number needs no survey.

The main risk: Buyers may resent an automated call about money, and owners may then refuse to use KaasuPesu on their biggest customers, who are often the latest payers. If that happens, it saves little. So every call opens in the supplier's name and says it is an automated assistant; the owner approves the first call to each buyer and can pause calls to anyone. The pilot tracks how many buyers ask not to be called again; if it is more than 1 in 20, we change the script before growing. One more limit: the legal steps help only Udyam-registered micro and small manufacturers and service providers.

---

## Facts behind the texts (checked 26 Nov 2026, mostly secondary sources)

- MSMED Act s15: pay by the agreed date, at most 45 days from acceptance (15 days with no written agreement).
  s16: compound interest with monthly rests at three times the RBI bank rate. The MSMED Amendment Act 2026
  left both unchanged.
- The tax rule moved from Income-tax Act 1961 s43B(h) to Income-tax Act 2025 s37(2)(g) from 1 April 2026.
- The late-payment protection covers only Udyam-registered micro and small enterprises, not traders or medium ones.
- ₹22,096 crore outstanding on filed MSME Samadhaan cases to Dec 2025; ₹8.1 lakh crore in delayed MSME payments
  (Economic Survey 2025-26); invoices paid in 73 days on average (Recordent 2026); 8.7 crore Udyam + Udyam Assist
  registrations by June 2026.
