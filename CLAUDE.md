# KaasuPesu prototype

Project memory for anyone, human or Claude, working in this folder. Read it before changing anything.
Update it in the same change whenever the goal, a decision, or what has been verified changes.

## What this is

KaasuPesu ("kaasu pesu", Tamil for "talk money") is a voice agent that chases unpaid bills for small Indian
suppliers. The owner speaks a short note in Tanglish; KaasuPesu reads the bill back, phones the buyer in the
buyer's own language, and reports back with a short summary the owner can read instead of replaying the call.

It is our entry to the Scaler x Wispr Flow hackathon. All three Round 1 activities passed on 26 Nov 2026.
Round 2 (a working build, due 30 Nov 2026 at 11:59 pm) started 27 Nov. It needs a public GitHub repo that
starts with `docker compose up` and no keys, a YouTube demo of 3 minutes or less, and a pitch deck PDF; a live link
is optional. The plan is below; the form fields, the deck material and the recording plan are in
`docs/submission.md` (kept on the owner's Mac, out of the repo). The repo is public at
https://github.com/Nithish7680/kaasupesu. The Round 1 texts are
in `docs/round1.md`. **The spec is the Activity 2 prompt there: build from that text, not from memory.**

## Goal

A working prototype of the Activity 2 prompt that a judge can start with one command, `docker compose up`, and
try in a browser in under two minutes, with no keys. `npm start` (Node 22) works too.

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
| 8 | On a fresh clone with no `.env`, `docker compose up` serves the Owner chat at http://localhost:8787, and the page also loads when opened by IP | fresh clone, then `docker compose up`; see Verification log. **Not verified yet** |
| 9 | `.env.example` and the README list every environment variable the app reads, with placeholder values | compare with `grep -rho "process.env.[A-Z_]*" server.js scripts` |

## Plan to submission (due Mon 30 Nov, 11:59 pm)

In order of risk: if step 2 fails, the judges never see the rest. Each step has a check, a step is ticked only
when its check passes, and each step is one commit.

Confirmed by the organisers' email (28 Nov): the deadline is 30 Nov, 11:59 pm, when the submit button turns off;
if `docker compose up` doesn't start the app, the submission isn't scored; and the deck is checked against the code.

Already true (checked 28 Nov): the repo is public; a fresh clone starts with `npm start` and no keys; no key is in
any file or in the history; there are 2,752 lines of code, and every commit is from 27 Nov or later.

1. ✅ **The server can run in a container** (28 Nov). Route: `HOST` comes from the environment (default
   127.0.0.1); the `Host` check applies only when a key is set; the startup line prints an address a person can
   open (`http://localhost:8787` when listening on 0.0.0.0). Nothing else in `server.js` changes. Check:
   `npm test` passes; with no keys, a request with another `Host` header gets the page; with a key, 403.
2. ⬜ **Docker Compose starts the app** (28 Nov). Route: a `Dockerfile` with Node 22 and the app's files, no
   install step, and `HOST=0.0.0.0`; a file named exactly `docker-compose.yml`, with one service on port 8787 and
   no keys; a `.dockerignore` that keeps `.env` and `docs/submission.md` out of the image. Check: Done-means row 8,
   on a copy with no `.env`.
3. ⬜ **The page and the terminal explain what is off, as a judge sees them** (28 Nov). A judge runs with no keys
   and may open the port by IP, where Chrome blocks the microphone. Route: when `window.isSecureContext` is false,
   pressing the mic shows "The microphone works only on localhost or HTTPS: open http://localhost:8787, or type.";
   without an OpenAI key, the line at the top of the page ends "OpenAI key not set", and so does the server's
   startup log (the rules suggest a "key not set" message). Check: headless Chromium opened by another name shows
   the mic line when the mic is pressed, and not on `localhost`; with no keys the top line ends "OpenAI key not set".
4. ⬜ **The docs match** (28 Nov). Route: `.env.example` and a table in the README list every variable the row-9
   grep finds (adding `HOST` and `SMOKE_PORT`; the organisers' email asks for them in the README); the README puts
   "Try it" first, since a judge must start the app before anything else, starting with `docker compose up` and
   saying to open `http://localhost:8787`; update ARCHITECTURE's
   security section, ENGINEERING's checks, `llms.txt` and this file. Check: Done-means row 9, for both lists;
   every relative link resolves; no doc says the server listens only on 127.0.0.1.
5. ⬜ **Push, the judges' test, then a draft** (28 Nov, once the owner says push). Check: GitHub's latest commit
   equals `git rev-parse HEAD`; on a fresh clone from GitHub, `docker compose up` and the scripted note typed in a
   browser reaches the read-back. Then the owner saves a draft in the form with the GitHub link: a draft is
   submitted automatically at the deadline, so the code is in even if a later step slips.
6. ⬜ **Choose KaasuPesu's voice** (28 Nov). Route: keep OpenAI's unless the owner finds the samples unnatural;
   then switch only the voice route to ElevenLabs, tests first. Check: the owner approves three samples (the
   Tamil note to the owner, the Hindi call opening, the Tamil call opening).
7. ⬜ **Pitch deck PDF, investment-style** (29 Nov). Route: first look up current prices, with sources, for
   everything the product depends on (OpenAI, Wispr, ElevenLabs, phone calls, WhatsApp messages, UPI payment
   links); then text-first HTML pages printed to PDF by headless Chromium, with facts only from `docs/round1.md`
   and those sources, and the launch plan from the owner (or else the Round 1 pilot). It names the theme,
   Livelihoods and small business, and covers the problem and the solution, the addressable market, what it
   depends on with what each costs and what happens if it gets costly or stops, and the go-to-market plan, plus
   a short business model and team page, as investment decks have. The organisers check the deck against the
   code, so one page says what the prototype does today (calls and WhatsApp simulated; without keys, Chrome's
   speech recognition, the browser's voices and the built-in rules; with an OpenAI key, GPT reading and OpenAI's
   voice), kept apart from what comes next, and the build page names only the Wispr Flow uses that happened.
   Check: 30 pages or fewer, 10 MB or less; a text extraction finds every section; each "today" claim matches the
   README and the code.
8. ⬜ **Demo video** (owner, 29 Nov). Route: the recording plan in `docs/submission.md`, by voice, with
   `npm start` and the OpenAI key on; aim for 2:50; upload to YouTube as Public (the email says public, the rules
   allow unlisted too; public meets both), with "made for kids" set to no, and paste the youtu.be share link.
   Check: YouTube shows 3:00 or less, and the link plays in a private window.
9. ⬜ **Live link, optional** (29 Nov, only if 1 to 8 are done). It goes in the form, so it must be ready before
   Submit; leaving it out never counts against us. Route: the app's static files on Vercel, the form's own
   example host: without keys the app needs no server, and HTTPS lets judges use the microphone. Check: it opens
   in a private window, the typed and the spoken demo both work, and it stays up until 2 Dec.
10. ⬜ **Submit the form** (owner, by the evening of 29 Nov, so a failed check can be fixed before the deadline).
    Check: no email saying the submission went back to draft. Then tag the submitted commit `round2-submitted`,
    and push nothing that could break `docker compose up` before the results on 2 Dec: the judges test later,
    when a fix is no longer accepted.

After submitting, the repo, the video and any live link stay public and working until 2 Dec (the repo until
Round 3 ends if shortlisted).

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
| Local server | `server.js` | Node built-ins only. Listens on `HOST` (127.0.0.1 by default). Keys never reach the browser. |
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
- **With a key set, the server answers only `Host: 127.0.0.1:PORT` or `localhost:PORT`**, so a DNS-rebinding page
  can't spend it. Without keys any address is answered: there is nothing to spend, and a judge may open the Docker
  port by IP.
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
- **Docker Compose, because the build rules require it (28 Nov).** The judges run `docker compose up` on the repo
  with no keys and open the port in `docker-compose.yml`. (A note earlier that day said no Docker; it was written
  before the rules were read.) The image is Node plus the app's files, with no install step. Inside the container
  the server must listen on 0.0.0.0, and a judge may open the port by IP, so the `Host` check applies only when a
  key is set: without keys there is nothing to spend. Docker never gets keys: compose passes none and
  `.dockerignore` keeps `.env` out of the image, because a client can fake the `Host` header and a container
  listening on 0.0.0.0 can be reached from the network. The AI path runs with `npm start`, on 127.0.0.1 only.
- **No layer folders and no Python rewrite (28 Nov).** Clean architecture's dependency rule already holds: `src/`
  imports only `src/` (no network, files or DOM), and `server.js` and `public/app.js` depend on it, never the
  reverse. The browser must run JavaScript and shares the tested `src/` modules with Node; Python would split the
  logic across two languages. Before the deadline neither earns a point, and each puts the working demo at risk.

## Out of scope for the prototype

Real phone calls and WhatsApp sends, the interest calculation, the ODR complaint, saving data (a reload resets
everything), sign-in, and more than one owner.

## Assumptions to check

- "Built on the Docker Compose template" (the organisers' email): the FAQ says there is no specific template and
  points to Docker's getting-started guide, so a plain `docker-compose.yml` is assumed to be enough.
- The judges run `docker compose up` on a clean copy of the repo, with no `.env` and no keys, then open the port in
  `docker-compose.yml` in a browser, possibly by IP rather than `localhost` (from the build rules read on 28 Nov).
  The rules' example is `3000:3000`; we keep `8787:8787`, because they open whichever port the file names.
- "Your own code during the hackathon": the prototype was first built on 26 Nov, during Round 1 (the hackathon
  opened on 5 Nov), and every commit is from 27 Nov or later. We read that as during the hackathon.
- The scoring from the first version of the form (voice-first 30%, India relevance 25%, working product 25%,
  originality 20%) still applies; the current pages don't repeat it.
- The deck is read as text, so every point must be selectable text, not an image.
- The Hindi and Tamil lines in `src/lines.js` need a native speaker's review before anyone hears them for real.
- The Wispr path works with a real key: untested. On 27 Nov the user couldn't create an organisation or an API key
  on platform.wisprflow.ai (the API needs Wispr's approval), so `WISPR_API_KEY` stays empty and speech uses the
  browser's recognition. Anything in `WISPR_API_KEY` sends every recording to Wispr, with no fallback.
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

- 2026-11-28, plan step 1: `test/server.test.js` (starts `server.js` as a child process with explicit keys) was
  written first and failed: with no keys, a request with `Host: 192.168.1.20:8791` got 403. After `HOST` from the
  environment and the `Host` check only with a key set: with no keys that request gets 200; with a key it gets 403
  while `localhost` and `127.0.0.1` get 200. `npm test` **73/73**.

- 2026-11-28, GPT against the rules on six lines not in the script (scratchpad script: each line through
  `/api/extract` or `/api/classify` with the real OpenAI key, then through `ownerStep` or `callStep`, typed, so no
  sound-alike question). With the rules only, "Naarpadhu aayiram innum varala" asks the amount again and "Main
  accounts nahi dekhta, Suresh ji se baat kariye" asks for a date. With GPT, the first reads back ₹40,000 and the
  second asks who handles payments. Both get the other four right ("agle mahine 5 tareekh tak" → 5 December, a
  defect complaint, "kal hi NEFT kar diya tha", an English note). Shown in the README's "Where the AI is".

- 2026-11-28, `npm run smoke` with a real OpenAI key and no Wispr key: **4 of 5 pass**. GPT reads the owner note
  (Ramesh, Sharma Garments, 40000, "October 12"); GPT labels "30 tareekh tak kar denge" and "30 तारीख तक कर देंगे"
  as promised with "30th"; OpenAI speaks a Hindi line (MP3). The Wispr check fails because there is no key.

- 2026-11-27, docs: every relative link in README, CLAUDE.md, `llms.txt` and the three docs resolves (40 links),
  and every test the PRD cites exists (33 citations, checked against the 70 test names); `npm test` 70/70. Then a
  new test, "every date example in the prompts resolves", failed on the extract prompt's "12" and passes with
  "12th" (`npm test` **71/71**). The three Mermaid diagrams in `docs/ARCHITECTURE.md` render on github.com
  (headless Chromium: three diagram frames, each drawn as SVG, no parse errors).

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
- **Not verified:** any call with a real Wispr key (none available), the whole flow with the OpenAI key in a browser, the real microphone and voices
  in a headed browser, and the Hindi and Tamil wording (needs a native speaker).

## History

- 2026-11-28: Round 2's build rules read: a public repo that starts with `docker compose up` and no keys, a YouTube
  demo of 3 minutes or less and a pitch deck PDF, due 30 Nov at 11:59 pm. The plan above added; OpenAI key in use;
  "Where the AI is" added to the README.

- 2026-11-27: Round 2. Repo published; AI path moved to OpenAI + Wispr Flow; form text and recording plan in
  `docs/submission.md` (local only). Engineering docs (PRD, architecture, engineering) and `llms.txt` added, one job
  per file, following the Karpathy guidelines.
- 2026-11-26: Folder created; Round 1 texts saved to `docs/round1.md`; prototype built from the Activity 2 prompt.
