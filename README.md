# KaasuPesu

KaasuPesu ("kaasu pesu" is Tamil for "talk money") chases unpaid bills for small Indian suppliers. The owner
speaks a short note in Tanglish. KaasuPesu reads the bill back, phones the buyer in the buyer's own language, and
reports back with a short summary the owner can read instead of replaying the call.

Built for the Scaler x Wispr Flow hackathon. Calls and WhatsApp messages are simulated in this prototype;
nothing real is sent.

## Try it in two minutes

You need Node 22 or later and desktop Chrome (for the microphone). There is no install step.

```bash
npm start
```

Open http://127.0.0.1:8787 and allow the microphone.

1. **Owner chat.** Hold the **Hold to talk** button and say: *"Delhi-la Sharma Garments kitta forty thousand
   baakki irukku. October 12 bill. Avanga accountant Ramesh-ku call pannu."* (or tap **Say the script**).
   Because forty thousand and fourteen thousand sound alike, KaasuPesu asks which one you said, then reads the
   bill back. Say **"Aamaa"** to confirm.
2. **Call.** KaasuPesu phones Ramesh in Hindi. You play Ramesh: tap the mic and say *"30 tareekh tak kar denge"*
   (or tap the sample reply). It repeats the date and offers the bill; say *"haan, bhej do"* and the simulated
   WhatsApp bill with a UPI button appears.
3. **Summary.** Back in Owner chat there is a Tanglish voice note and a summary card; "Promise at 0:xx" replays
   that moment of the call.
4. **Bills.** "Call again" on Priya's missed promise opens in Tamil. John's 66-day-old bill gets the line about
   the MSME law's 45-day limit.

Today is fixed at 20 November 2026, so the demo is the same on every run. A reload resets everything.

## Two ways it runs

| | Without keys (default) | With keys in `.env` |
|---|---|---|
| Hearing speech | Chrome's speech recognition (en-IN) | Wispr Flow API, told which languages to expect and the names to listen for |
| Reading the note and the replies | Built-in rules (`src/parse.js`) | OpenAI `gpt-6-luna` with strict JSON output, re-checked by the same rules |
| KaasuPesu's voice | The browser's voices | OpenAI text-to-speech (`gpt-4o-mini-tts`) |

To turn on the keyed path, copy `.env.example` to `.env`, add `OPENAI_API_KEY` and `WISPR_API_KEY`, restart, and
run `npm run smoke` to check both keys. Wispr is used only when the OpenAI key is set too. The line at the top of the app shows which path is on. Keys stay on the
local server and never reach the browser. A model never writes what KaasuPesu says: every line is a fixed string
per language in `src/lines.js`.

## Docs

Each doc has one job, and none repeats another. They follow the Karpathy guidelines: assumptions are written
down, nothing is added that isn't needed, and every claim names the check that proves it.

| Doc | What it answers |
|---|---|
| [docs/PRD.md](docs/PRD.md) | What KaasuPesu must do and why; each requirement names the test that checks it |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it is built: components, the two paths, sequence and state diagrams, data, security, failures |
| [docs/ENGINEERING.md](docs/ENGINEERING.md) | How it was built with a coding agent, and how to check every claim |
| [CLAUDE.md](CLAUDE.md) | The coding agent's project memory: rules, done-means, decisions, assumptions, verification log |
| [llms.txt](llms.txt) | The same map, for LLM agents |
| [docs/round1.md](docs/round1.md) | The source spec: the Round 1 texts |

`npm test` runs the tests; every line quoted in the spec is a test fixture.

## Status

- Verified: the keyless path end to end in headless Chromium with zero console errors, and a microphone
  recording reaching the server as 16 kHz WAV.
- Not verified yet: the keyed path with real OpenAI and Wispr keys (`npm run smoke` is the check), and the Hindi
  and Tamil wording, which needs a native speaker.
- OpenAI has deprecated `gpt-4o-mini-tts`; it works until 6 January 2027.
