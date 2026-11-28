# KaasuPesu: product requirements

**Job of this file:** say what KaasuPesu must do and why, and name the check that proves each requirement. How it
is built is in [ARCHITECTURE.md](ARCHITECTURE.md); how it was built and verified is in
[ENGINEERING.md](ENGINEERING.md). The source spec is the Activity 2 prompt in [round1.md](round1.md).

## Problem

Small manufacturers in India sell on credit and wait months to be paid: ₹8.1 lakh crore is stuck in delayed
payments to MSMEs (Economic Survey 2025-26), and invoices take 73 days on average to be paid (Recordent 2026).
Chasing is a phone call the owner keeps putting off, because the buyer is a customer they can't afford to lose
and often speaks another language.

## Users

| User | Language | What they need |
|---|---|---|
| The owner (Lakshmi Fabrics, Tiruppur; a Udyam-registered micro manufacturer) | Tanglish, short voice notes from a noisy workshop | Chase a bill with a 10-second voice note; read a short summary instead of replaying calls |
| The buyer's accounts staff (Ramesh in Delhi, Priya in Coimbatore, John in Bengaluru) | Hindi, Tamil or English, often mixed | A polite call in their own language that says plainly it is the supplier's automated assistant |

## Requirements and how each is checked

Every row names the test in `test/` (run with `npm test`) or the command that checks it. A requirement with no
passing check is marked as not yet run.

**The owner's note**

| ID | Requirement | Checked by |
|---|---|---|
| O1 | Read contact, amount, bill date and calling language from a Tanglish note, matched to saved contacts | `reads the scripted owner note` |
| O2 | Read the bill back, spoken and as text; "Aamaa", "seri", "ok" or "pannu" confirms | `a typed owner note is read back, then confirmed into a bill` |
| O3 | Anything unclear ("hmm") is asked again; no call starts without a clear yes | `anything else, like "hmm", is asked again and no call starts` |
| O4 | "Illa" asks what to change; only the corrected field changes | `"Illa" asks what to change, and only the corrected field changes` |
| O5 | Replies to the owner are under 15 words, in Tanglish | `replies to the owner are short Tanglish lines` |

**The call**

| ID | Requirement | Checked by |
|---|---|---|
| C1 | Open in the buyer's language, in the supplier's name, as an automated assistant | `Ramesh: opening, promise repeated, bill offered and sent on a yes` |
| C2 | Label each reply with one of seven intents: promised, vague, paid, dispute, call_later, wrong_person, unclear | `labels each sample buyer reply from the prompt, in Hindi, Tamil and English` |
| C3 | A promise is repeated ("So, 30 November") and the bill is offered; it is sent only on a clear yes | `no bill is sent without a clear yes`, `a negated "send it" never sends the bill` |
| C4 | Vague: ask once for a date, then log "no date" | `a vague reply is asked for a date once, then logged as no date` |
| C5 | Paid: ask for the date and the reference | `paid asks for the date and the reference` |
| C6 | Dispute: "I'll tell Lakshmi Fabrics", log the reason, never argue | `a dispute is acknowledged, logged and never argued` |
| C7 | Call later: ask when, and book it | `call later asks when, and books it` |
| C8 | Wrong person: apologise and ask who handles payments | `the wrong person gets an apology and a question` |
| C9 | A missed promise is raised on the next call ("You had said 15 November.") | `Priya's call opens in Tamil with her missed promise` |
| C10 | The MSME 45-day line only for Udyam-registered micro or small manufacturers and service providers, counted from the bill date | `the legal line follows the bill age and the owner type` |

**After the call**

| ID | Requirement | Checked by |
|---|---|---|
| A1 | A Tanglish summary card (intent, date or reason, tone, next step) and voice note; "Promise at 0:42" replays that moment | `Ramesh: opening, ...` (voice note text, key moment) |
| A2 | Bills show Waiting, Promised, Missed, Past 45 days, Disputed or Paid | `status chips follow the bill` |

**When speech goes wrong**

| ID | Requirement | Checked by |
|---|---|---|
| R1 | Amounts said three ways ("forty thousand", "naarpadhaayiram", "chaalees hazaar") all read as 40,000 | `reads amounts written as digits, shorthand and spoken words` |
| R2 | Bill dates resolve to the most recent past date; promised dates to the next future one | `bill dates resolve to ...`, `promised dates resolve to ...` |
| R3 | A heard sound-alike amount (14/40 to 19/90 thousand) is asked as a choice | `a heard sound-alike amount is asked as a choice before the read-back` |
| R4 | Two failed recordings show a text box | `two failed recordings show the text box` |
| R5 | Only the missing detail is asked for; an unknown contact's number is read back in groups | `only the missing detail is asked for`, `an unknown contact is asked for a number, ...` |
| R6 | Two unclear replies or two silences end the call with "I'll call back later" | `two unclear replies end the call ...`, `two silences end the call the same way` |
| R7 | Never record a promise the buyer didn't clearly make (negated, hedged or implausible dates are vague) | `a date that is negated, hedged or implausible is not a promise` |
| R8 | Yes and no in Tamil script and Devanagari, as Wispr may write them | `yes and no in Tamil and Devanagari script, ...`, `a native-script yes with "later", ...` |

**The keyed AI path**

| ID | Requirement | Checked by |
|---|---|---|
| K1 | A model's answer is validated and re-checked by code; any failure falls back to the rules | `a refusal, a cut-off answer and bad JSON all fall back to the rules`, `a model promise is re-dated by code` |
| K2 | A microphone recording reaches the server as 16 kHz mono PCM16 WAV, the format Wispr takes | `encodes 16 kHz mono PCM16 WAV, ...`, plus the headless browser run in [CLAUDE.md](../CLAUDE.md) |
| K3 | With real keys, all four AI routes work | `npm run smoke`, 28 Nov: the two OpenAI routes and the ElevenLabs voice (Hindi and Tamil) pass with real keys; **Wispr not run** (no key: Wispr's API needs approval) |

## Out of scope for the prototype

Real phone calls and WhatsApp sends, the interest calculation, the government ODR complaint, saving data (a reload
resets everything), sign-in, and more than one owner.

## Assumptions and open questions

Assumptions are written down before they are built on. The live list, with what would settle each one, is under
"Assumptions to check" in [CLAUDE.md](../CLAUDE.md). Where the spec contradicts itself, the choice and the reason
are under "Decisions" there; for example, "12-aam thethi" resolves to 12 November, because the spec's own date rule
wins over its example.

## Success measures for a pilot

A three-month pilot with 50 suppliers in Tiruppur and Coimbatore, compared with their own previous three months:

- Chased bills paid in under 45 days on average, against 73 days nationally.
- At least 6 in 10 promised dates kept.
- At least 7 in 10 owners still sending voice notes after eight weeks.
- Fewer than 1 in 20 buyers asking not to be called again; above that, the call script changes before growing.
