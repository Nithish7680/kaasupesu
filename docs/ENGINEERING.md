# KaasuPesu: how it was engineered

**Job of this file:** show how a vibe-coded prototype was kept to an engineering standard, and how to check every
claim it makes. What the product must do is in [PRD.md](PRD.md); how it is built is in
[ARCHITECTURE.md](ARCHITECTURE.md).

## The working rules

The project follows the Karpathy guidelines: four rules, derived from Andrej Karpathy's observations on where LLM
coding goes wrong, and kept in [CLAUDE.md](../CLAUDE.md) so the coding agent reads them before every change.

| Rule | What it means here | Where it shows |
|---|---|---|
| Think before coding | Write assumptions down; where the spec is unclear or contradicts itself, record the choice and the reason before building on it | CLAUDE.md "Decisions" (for example, "12-aam thethi" means 12 November, because the spec's date rule beats its own example) and "Assumptions to check". Which API keys to use and whether the repo is public were asked, not guessed |
| Simplicity first | The least code that does the job | No framework, build step, database or npm dependencies. One pure function per conversation. Plain `fetch` instead of SDKs. Three docs plus CLAUDE.md |
| Surgical changes | Every changed line traces to the request | Moving from Sarvam + Claude to OpenAI + Wispr kept the four `/api` routes and the conversations (`src/flows.js`, `src/lines.js`) unchanged. It rewrote `src/ai.js`, changed `server.js`, the mic code in `public/app.js` and one function in `src/parse.js` (yes/no in Tamil script and Devanagari), added `src/audio.js`, and updated their tests and docs |
| Goal-driven execution | Turn each task into a check and loop until it passes | "Done means" in CLAUDE.md. Every PRD requirement names its test. Tests are written to fail first. Anything without a passing check is labelled as not verified |

## The docs, one job each

The docs are plain markdown with one job per file and no repeated content, so a person or an LLM agent can load
exactly what it needs. [llms.txt](../llms.txt) indexes them in the llms.txt format.

| File | Read by | Job | Updated when |
|---|---|---|---|
| [README.md](../README.md) | Anyone arriving | What it is and how to try it in two minutes | The way to run it changes |
| [llms.txt](../llms.txt) | LLM agents | An index of the docs and key files | A doc or key file is added |
| [CLAUDE.md](../CLAUDE.md) | The coding agent first, then people | Working rules, done-means, decisions, assumptions, verification log, history | Any goal, decision or check changes, in the same commit |
| [docs/round1.md](round1.md) | Everyone | The source spec, kept as submitted | Never, except to add checked facts |
| [docs/PRD.md](PRD.md) | Judges, product readers | What and why, each requirement with its check | A requirement or its check changes |
| [docs/ARCHITECTURE.md](ARCHITECTURE.md) | Engineers | Components, flows, states, data, security, failures | The structure changes |
| [docs/ENGINEERING.md](ENGINEERING.md) | Judges, engineers | How it was built and how to verify it | The process or the checks change |

## The build loop

1. **Spec.** The Activity 2 prompt in `docs/round1.md` is the only source of truth: build from its text, not
   from memory. Every line it quotes is a test fixture.
2. **Plan.** Assumptions, decisions and the done-means checks go into CLAUDE.md before code.
3. **Red.** Write the tests first and watch them fail. The OpenAI and Wispr move started with four failing tests.
4. **Green.** Write the least code that passes them, in the pure modules where possible.
5. **Check it like a user.** Headless Chromium plays the demo at phone width: typed, and through a fake
   microphone with the AI routes intercepted. The bar is zero console errors.
6. **Independent review.** A separate reviewer agent reads the diff without the builder's conclusions. Each real
   finding is fixed and checked again: a logic finding with a failing test first, a configuration finding by
   re-running the server or browser checks.
7. **Record.** Results go in the CLAUDE.md verification log, newest first. Anything unproven stays under
   "Not verified".

## The tools

- **Wispr Flow** for speaking instead of typing: the Round 1 texts were dictated, prompts to the coding agent were
  spoken, and the owner's Tanglish and the buyer's Hinglish lines were tried as dictation. In the product, the
  Wispr Flow API is the speech-to-text on the keyed path.
- **Claude Code** as the coding agent, with CLAUDE.md as its memory and rulebook.
- **A separate reviewer agent** for code review.
- **Node's test runner** for the tests, and **Playwright** with headless Chromium and a fake microphone for the
  browser checks.

## Reviews

| Date | Scope | Findings | Outcome |
|---|---|---|---|
| 26 Nov 2026 | The whole prototype | 2 high (a negated "send it" counted as yes; a date counted as a promise even when negated or hedged), 7 medium, 4 low | All fixed, each with a failing test first, except one documented edge case |
| 27 Nov 2026 | The move to OpenAI and Wispr | 0 high, 3 medium, 1 low | All fixed: a Tamil-script or Devanagari yes with "later" in it now counts as no (failing test first); Wispr runs only with GPT reading on; the live check now needs the note's names in the transcript |

## How to check every claim

| Claim | How to check it |
|---|---|
| Each requirement in the PRD holds | `npm test` |
| How much of the code the tests cover | `npm run coverage` |
| The app starts the way the judges start it | `docker compose up` on a copy with no `.env`, then open http://localhost:8787 |
| The demo works in a browser | `docker compose up` or `npm start`, then the two-minute path in the README |
| The keyed path works with real keys | Put `OPENAI_API_KEY` and `WISPR_API_KEY` in `.env`, then `npm run smoke` |
| Browser and server checks were run | The verification log in CLAUDE.md, with dates and results |

## Not verified yet

- Wispr with a real key: Wispr's API needs approval and there is no key yet. With a real OpenAI key,
  `npm run smoke` passes its OpenAI checks (28 Nov), but the whole flow with keys hasn't been run in a browser.
- A headed browser with a real microphone and real voices.
- The Hindi and Tamil wording, which needs a native speaker.
