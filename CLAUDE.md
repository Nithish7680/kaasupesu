# KaasuPesu prototype

Project memory for anyone, human or Claude, working in this folder. Read it before changing anything.
Update it in the same change whenever the goal, a decision, or what has been verified changes.

## What this is

KaasuPesu ("kaasu pesu", Tamil for "talk money") is a voice agent that chases unpaid bills for small Indian
suppliers. The owner speaks a short note in Tanglish; KaasuPesu reads the bill back, phones the buyer in the
buyer's own language, and reports back with a short summary the owner can read instead of replaying the call.

It is our entry to the Scaler x Wispr Flow hackathon. All three Round 1 activities passed on 26 Nov 2026;
Round 2 starts 27 Nov 2026. The texts are in `docs/round1.md`. **The spec is the Activity 2 prompt there:
build from that text, not from memory.**

## Goal

A working prototype of the Activity 2 prompt that a judge can try in a browser in under two minutes, with no
setup beyond `npm start`.

### Done means (every row is a check someone can run)

| # | Check | How to verify |
|---|---|---|
| 1 | Every line quoted in the Activity 2 prompt is a test fixture, and all tests pass | `npm test` |
| 2 | The scripted demo runs end to end through typed text with zero console errors: owner note → read-back → "Aamaa" → call → "30 tareekh tak kar denge" → "So, 30 November" + bill offer → yes → simulated WhatsApp bill → Tanglish summary with "Promise at 0:xx" → Bills shows Promised | headless browser run, see Verification log |
| 3 | The legal line: John hears it (66 days old), Ramesh does not (39 days), a trader owner never does | `npm test` |
| 4 | Priya's call opens in Tamil with "You had said 15 November." | `npm test` |
| 5 | Things going wrong: two failed recordings → text box; "hmm" → asked again; a heard sound-alike amount → choice; an unknown contact → number read back in groups; two unclear replies or two silences on a call → "I'll call back later" | `npm test` |
| 6 | With keys set: real Tanglish and Hinglish speech is transcribed (Sarvam) and read and labelled (Claude) | manual, with keys. **Not verified yet** |

## Working rules (Karpathy guidelines, applied to this folder)

1. **Think before coding.** Write assumptions and decisions in this file before building on them. If the
   prompt is ambiguous or contradicts itself, record the choice and the reason under Decisions.
2. **Simplicity first.** No build step, no framework, no database. Add a dependency only when the prompt needs it.
3. **Surgical changes.** Touch only what the change needs and match the existing style. Mention unrelated
   problems; don't fix them in passing.
4. **Goal-driven.** Turn every change into a row in "Done means" or a test, run it, and record the result in
   the Verification log. A claim with no check behind it goes under "Assumptions to check".

## How it is built

| Part | File | Note |
|---|---|---|
| Seed data and every line KaasuPesu says | `src/lines.js` | Fixed strings per language. A model never writes what KaasuPesu says. |
| Reading text: amounts, dates, contacts, yes/no, intents | `src/parse.js` | Roman script only (typed text and the browser's en-IN speech). |
| The two conversations | `src/flows.js` | One pure decision function per flow: `ownerStep` and `callStep`. |
| Claude and Sarvam request builders and readers | `src/ai.js` | Pure, tested without network. |
| Local server | `server.js` | Node built-ins only. Binds 127.0.0.1. Keys never reach the browser. |
| Screen | `public/index.html`, `public/app.js` | Vanilla JS; imports the same `src/` modules the tests use. |

Two paths:

- **Demo, no keys.** Typed text always works; the mic uses the browser's speech recognition (en-IN) and the
  browser's voices where it has them. The rules in `parse.js` read the text. They understand the scripted lines
  and close variants, not free speech.
- **AI, keys in `.env`.** Sarvam `saaras:v4` (mode `translit`) transcribes, Sarvam `bulbul:v3` speaks, and Claude
  (`claude-opus-5-5`, effort `low`, JSON-schema output, server-side fallbacks beta) reads the owner's note and
  labels the buyer's reply. Code re-checks every label against the seven intents and re-resolves every date;
  any error, refusal or unreadable answer falls back to the rules.

## Decisions (with reasons)

- **Today is pinned at 20 Nov 2026** (`TODAY` in `src/lines.js`). The prompt asks for it; it keeps the demo identical every run.
- **"12-aam thethi" on its own resolves to 12 November, not 12 October.** The prompt's rule (bill dates resolve to
  the most recent past date) contradicts its own example, and the rule wins. Saying the month gives October.
- **The sound-alike choice is asked only for amounts that were heard**, not typed. Otherwise the prompt's scripted
  read-back of ₹40,000 in step 3 could never happen, because 40,000 is itself a sound-alike of 14,000.
- **The legal line follows the bill's age and the owner's type, not the status chip.** A bill can be "Missed"
  and still be past 45 days.
- **A promise needs a date the code can resolve.** A model saying "promised" without one is treated as vague,
  so KaasuPesu never records a promise the buyer didn't clearly make.
- **Any negation at a yes/no question means no** ("don't send it", "not sure", "ok but not now"). A missed yes costs
  one re-ask; a false yes sends a bill or starts a call.
- **A promise must be committed and plausible:** a date that is negated ("30 tak nahi ho payega"), hedged
  ("maybe", "koshish"), or more than 90 days ahead is vague, never a promise. "No problem" is not a negation.
- **At the amount choice, any amount said is the owner's answer**; "illa" asks for the amount again.
- **The contact named last wins** ("Ramesh illa, John-ku" means John); naming a saved contact when asked for a
  number switches to it.
- **Chasing the same bill again keeps its calls and promise**; only the amount and the call language update.
- **The server answers only `Host: 127.0.0.1:PORT` or `localhost:PORT`**, so a DNS-rebinding page can't spend the keys.
- **New contacts default to English** for calling; the read-back says the language and the owner can correct it.
- **A buyer saying "paid" marks the bill Paid** and the summary tells the owner to check the bank. Nothing checks a bank.
- **Claude model:** `claude-opus-5-5` (the skill's default; the user named no model), effort `low` because this is
  classification, with server-side fallbacks enabled as the Claude API skill recommends.

## Out of scope for the prototype

Real phone calls and WhatsApp sends, the interest calculation, the ODR complaint, saving data (a reload resets
everything), sign-in, and more than one owner.

## Assumptions to check

- The Hindi and Tamil lines in `src/lines.js` need a native speaker's review before anyone hears them for real.
- Sarvam `mode: translit` is assumed to return Roman script. Not tested; there is no Sarvam key yet.
- Structured output combined with the server-side fallback beta is assumed to work. Any failure falls back to rules.
- Browser voices: desktop Chrome usually has Hindi but not Tamil; without a Tamil voice the app speaks the
  Roman line with an en-IN voice.

## Run

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # Node 24 on this Mac is not on PATH
npm install                                  # only the AI path needs it (@anthropic-ai/sdk)
npm test
npm start                                    # http://127.0.0.1:8787
```

Copy `.env.example` to `.env` and add `SARVAM_API_KEY` and `ANTHROPIC_API_KEY` to turn on the AI path.

## Verification log

Record what was run, when, and the result. Newest first.

- 2026-11-26, final: `npm test` → **65/65 pass**. Browser with **sound on** (the default a judge sees; this headless
  browser has 0 voices, so nothing is actually spoken): **10/10 pass, zero console errors**. The call screen opens
  35 ms after "Aamaa"; the yes path shows the simulated WhatsApp bill and the "Bill-um link-um" voice note; chasing
  the same bill again and answering "please don't send it" sends nothing; the bill keeps both calls.
- 2026-11-26, after the code review (sound off): `npm test` 64/64 (every review finding got a failing test first);
  browser **17/17 pass, zero console errors**. That run answered the bill offer with "please don't send it" (the yes
  path was rechecked in the final run above), checked "I can't pay by the 30th" asks for a date, the text-box hint
  clears, and re-chasing keeps the promise. Server: a foreign `Host` header answers 403.
- 2026-11-26, code review (ecc:code-reviewer): 2 HIGH (a negated "send it" counted as yes; any date counted as a
  promise even when negated or hedged), 7 MEDIUM, 4 LOW. All fixed except "a promise date equal to the bill date"
  (covered by the 90-day rule only when the bill date resolves far ahead). No XSS, no path traversal, no key leaks.
- 2026-11-26, done-means rows 1, 3, 4, 5: `npm test` → 46/46 pass; line coverage 97.9% overall (`npm run coverage`).
- 2026-11-26, row 2: headless Chromium at 375 px against `PORT=8799 npm start`, typed path, sound off: 16/16 checks
  pass (read-back, Hindi opening, promise + offer, simulated WhatsApp bill, "Promise at 0:00", call time
  "20 Nov, h:mm pm", Tanglish voice note, chips Promised / Missed / Past 45 days, Priya's Tamil opening with the
  missed promise and no legal line, two silences and two unclear replies end the call, John's legal line, two failed
  recordings show the text box, no horizontal scroll), **zero console errors**. Driven with the cached
  playwright-core + `chromium_headless_shell-1194` (the Playwright MCP tools fail on this Mac).
- 2026-11-26, server: only the five allowlisted files are served; `/.env`, `/server.js`, `/src/ai.js`,
  `/package.json` and `/..%2Fpackage.json` answer 404; the AI routes answer 503 with no keys.
  `@anthropic-ai/sdk` 1.14.0 installed and `client.beta.messages.create` exists.
- **Not verified:** any Sarvam or Claude call (no keys on this Mac), the real microphone and voices in a headed
  browser, and the Hindi and Tamil wording (needs a native speaker).

## History

- 2026-11-26: Folder created; Round 1 texts saved to `docs/round1.md`; prototype built from the Activity 2 prompt.
