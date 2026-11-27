# KaasuPesu prototype

Project memory for anyone, human or Claude, working in this folder. Read it before changing anything.
Update it in the same change whenever the goal, a decision, or what has been verified changes.

## What this is

KaasuPesu ("kaasu pesu", Tamil for "talk money") is a voice agent that chases unpaid bills for small Indian
suppliers. The owner speaks a short note in Tanglish; KaasuPesu reads the bill back, phones the buyer in the
buyer's own language, and reports back with a short summary the owner can read instead of replaying the call.

It is our entry to the Scaler x Wispr Flow hackathon. All three Round 1 activities passed on 26 Nov 2026.
Round 2 (a working build, due 29 Nov 2026) started 27 Nov; the form text and the recording plan are in
`docs/submission.md` (kept on the owner's Mac, out of the repo), and the repo is public at
https://github.com/Nithish7680/kaasupesu. The Round 1 texts are
in `docs/round1.md`. **The spec is the Activity 2 prompt there: build from that text, not from memory.**

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
| 6 | With keys set: `npm run smoke` passes (GPT reads the scripted note and labels a promise in Roman and Devanagari Hindi, OpenAI speaks Hindi, Wispr transcribes the spoken note); then real Tanglish and Hinglish speech is transcribed (Wispr) and read and labelled (GPT) | `npm run smoke`, then manual. **Not verified yet** |
| 7 | A recording through the mic reaches `/api/stt` as 16 kHz mono PCM16 WAV, with the speaker's languages (`owner`, or the call language) and the question just asked | headless browser with a fake mic, see Verification log |

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
| Reading text: amounts, dates, contacts, yes/no, intents | `src/parse.js` | Roman script, plus Tamil-script and Devanagari yes/no words for Wispr's output. |
| The two conversations | `src/flows.js` | One pure decision function per flow: `ownerStep` and `callStep`. |
| OpenAI and Wispr request builders and readers | `src/ai.js` | Pure, tested without network. |
| 16 kHz WAV for Wispr | `src/audio.js` | Pure encoder; the browser resamples its recording and this writes the file. |
| Live check of the keyed path | `scripts/smoke.js` | `npm run smoke`; needs both keys in `.env`. |
| Local server | `server.js` | Node built-ins only. Binds 127.0.0.1. Keys never reach the browser. |
| Screen | `public/index.html`, `public/app.js` | Vanilla JS; imports the same `src/` modules the tests use. |

Two paths:

- **Demo, no keys.** Typed text always works; the mic uses the browser's speech recognition (en-IN) and the
  browser's voices where it has them. The rules in `parse.js` read the text. They understand the scripted lines
  and close variants, not free speech.
- **AI, keys in `.env`.** Wispr Flow's REST API transcribes (16 kHz WAV; it listens for Tamil and English from
  the owner, or the buyer's language and English, with the contact names and the last question as context).
  OpenAI `gpt-4o-mini-tts` speaks. OpenAI `gpt-6-luna` (Chat Completions, reasoning effort `none`, strict JSON
  schema) reads the owner's note and labels the buyer's reply. Each key turns on its own part. Code re-checks every
  label against the seven intents and re-resolves every date; any error, refusal or unreadable answer falls back
  to the rules, and a failed voice falls back to the browser's.

Docs, one job each: `docs/PRD.md` (what and why; each requirement names its test), `docs/ARCHITECTURE.md` (how it
is built), `docs/ENGINEERING.md` (how it was built and how to verify it); `llms.txt` indexes them for agents. When a
change affects a doc, update that doc in the same commit, and keep each fact in one place: the docs link here for
decisions and the verification log instead of copying them.

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
- **OpenAI and Wispr Flow replace Claude and Sarvam (27 Nov).** The user has OpenAI and Wispr keys, not Anthropic
  or Sarvam, and Wispr is the hackathon's partner. Plain `fetch`, no SDK, so the app has no dependencies.
- **Reading model: `gpt-6-luna`** (OpenAI's most efficient model on its models page, 27 Nov 2026) with reasoning
  effort `none`: this is labelling on a live call, so speed matters more than depth.
- **Voice: `gpt-4o-mini-tts`, voice `marin`**, told the language and accent for each line. OpenAI has deprecated
  it (shutdown 6 Jan 2027, after the finale on 13 Dec); the replacement needs the Realtime API, a bigger change.
- **Wispr may write Tamil in Tamil script and Hindi in Devanagari** (Wispr says Hindi plus English does not give
  Roman Hindi). The model is asked for names and dates in English letters, because the rules re-read them, and
  yes/no also matches Tamil-script and Devanagari words, with the same negations as the Roman list (later, wait,
  wrong, cancel, stop). "ना" is not a no: it softens a yes.
- **Wispr listening is offered only when GPT reading is on** (`/api/config`): Wispr may write Tamil or Devanagari,
  which the Roman-script rules can't read. With a Wispr key alone, the browser's recognition is used.
- **The repo is public** (the user chose it; judges need access). Commits use the account's GitHub noreply address.

## Out of scope for the prototype

Real phone calls and WhatsApp sends, the interest calculation, the ODR complaint, saving data (a reload resets
everything), sign-in, and more than one owner.

## Assumptions to check

- The Hindi and Tamil lines in `src/lines.js` need a native speaker's review before anyone hears them for real.
- The Wispr key is assumed to be a developer API key from platform.wisprflow.ai (the Flow API needs approval).
  The user wasn't sure. Without one, speech falls back to the browser's recognition.
- Which script Wispr returns for Tanglish and Hinglish is unknown until a real run. If Tamil script breaks the
  owner's read-back or amount choice, set `LISTEN_LANGUAGES.owner` in `src/ai.js` to `['en']`.
- OpenAI's voices are tuned for English; its Hindi and Tamil may sound foreign. Listen before recording.
- Browser voices: desktop Chrome usually has Hindi but not Tamil; without a Tamil voice the app speaks the
  Roman line with an en-IN voice.

## Run

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # Node 24 on this Mac is not on PATH
npm test                                     # no install step: there are no dependencies
npm start                                    # http://127.0.0.1:8787
npm run smoke                                # with keys: one live call to each AI route
```

Copy `.env.example` to `.env` and add `OPENAI_API_KEY` and `WISPR_API_KEY` to turn on the AI path.

## Verification log

Record what was run, when, and the result. Newest first.

- 2026-11-27, docs: every relative link in README, CLAUDE.md, `llms.txt` and the three docs resolves (40 links),
  and every test the PRD cites exists (33 citations, checked against the 70 test names); `npm test` 70/70. The
  Mermaid diagrams have not been looked at on GitHub yet.

- 2026-11-27, code review of the port (ecc:code-reviewer): 0 CRITICAL, 0 HIGH, 3 MEDIUM, 1 LOW. Fixed: a
  native-script yes with "later", "wait" or "wrong" in it counted as yes (failing test first, now no); Wispr could
  be on without GPT reading (now `/api/config` needs both keys); the smoke check passed on any transcript (now it
  needs the note's names or amount, reads the transcript through GPT, and resamples by interpolation). The LOW
  (stale CLAUDE.md) was already fixed. After the fixes: `npm test` **70/70**; browser **19/19, zero console
  errors** with both keys set and the AI routes intercepted; a Wispr key alone leaves `stt` off.

- 2026-11-27, port to OpenAI + Wispr: tests written first (4 failed), then `npm test` → **69/69 pass**. Server:
  with no keys the AI routes answer 503; `lang=constructor`, a missing `lang`, a non-WAV body and a non-WAV type
  are rejected; with invalid keys Wispr answers 401 ("Invalid API key format.") and OpenAI chat and speech answer
  401 `invalid_api_key`, so all three URLs are right, and the app answers 502. Headless Chromium (playwright-core
  1.59 + `headless_shell-1194`), **19/19 pass, zero console errors**: the typed demo end to end at 375 px; with a
  fake mic and `/api/stt` intercepted, a 1.4 s owner recording arrives as 16 kHz mono PCM16 WAV (46,080 data
  bytes) with `lang=owner` and the greeting as context, the buyer's with `lang=hi` and the Hindi question, and a
  Devanagari "हाँ, भेज दो" sends the bill. `npm run smoke` without keys exits 1 with a message.

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
- **Not verified:** any call with real OpenAI or Wispr keys (none on this Mac yet), the real microphone and voices
  in a headed browser, and the Hindi and Tamil wording (needs a native speaker).

## History

- 2026-11-27: Round 2. Repo published; AI path moved to OpenAI + Wispr Flow; form text and recording plan in
  `docs/submission.md` (local only). Engineering docs (PRD, architecture, engineering) and `llms.txt` added, one job
  per file, following the Karpathy guidelines.
- 2026-11-26: Folder created; Round 1 texts saved to `docs/round1.md`; prototype built from the Activity 2 prompt.
