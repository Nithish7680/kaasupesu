# KaasuPesu

KaasuPesu ("kaasu pesu" is Tamil for "talk money") chases unpaid bills for small Indian suppliers. The owner
speaks a short note in Tanglish. KaasuPesu reads the bill back, phones the buyer in the buyer's own language, and
reports back with a short summary the owner can read instead of replaying the call.

Built for the Scaler x Wispr Flow hackathon. Calls and WhatsApp messages are simulated in this prototype;
nothing real is sent.

## Try it in two minutes

One command, with Docker and no keys:

```bash
docker compose up
```

Or, with Node 22 or later and no install step: `npm start`.

Open **http://localhost:8787** in desktop Chrome and allow the microphone. Chrome allows the microphone only on
`localhost` or HTTPS, so use that address rather than the machine's IP.

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

## Where the AI is

The AI hears and understands people. The code decides what happens next. KaasuPesu speaks only approved lines.

- **Understanding.** GPT (`gpt-6-luna`) reads the owner's Tanglish note: who to call, how much, the bill date and
  the calling language. It also labels each reply from the buyer: promised, vague, paid, dispute, call later, wrong
  person or unclear, with the date and the tone. The requests are built in [src/ai.js](src/ai.js).
- **Checking.** The code accepts only those seven labels and works out every date again itself. A "promise"
  without a date it can resolve counts as vague. If the AI fails or no key is set, the built-in rules in
  [src/parse.js](src/parse.js) take over.
- **Speaking.** Every line KaasuPesu says is a fixed string per language in [src/lines.js](src/lines.js), spoken
  by OpenAI's voice. A model never writes these lines, for three reasons:
  - The Round 1 spec quotes KaasuPesu's lines word for word, and each quoted line is a test.
  - On a call to a customer about money, a model could invent an amount, a date or a legal threat, and one bad
    line could cost the owner that customer.
  - The line about the MSME law has to be exactly right every time.

What GPT adds, checked on 28 Nov by typing lines that aren't in the script into the app's own conversation code,
with a real OpenAI key (see the verification log in [CLAUDE.md](CLAUDE.md)):

| Line not in the script | Built-in rules only | With GPT |
|---|---|---|
| Owner: "Ramesh-ku oru call podu, Sharma Garments Delhi. Naarpadhu aayiram innum varala, October 12 bill." | Asks for the amount again: "Evvalavu baakki?" | Reads the bill back: "Sharma Garments, ₹40,000, October 12 bill." |
| Buyer: "Main accounts nahi dekhta, Suresh ji se baat kariye" | Hears no date and asks "Could you give me a date?" | Understands it's the wrong person: "Sorry to bother you. Who handles payments?" |
| Four more: "agle mahine 5 tareekh tak pakka kar denge", a complaint about defects, "kal hi NEFT kar diya tha" and an English note | Right | Right |

The rules already cover the scripted demo and close variants. GPT catches what they miss, such as numbers said
in Tamil or a buyer who isn't the right person.

## Two ways it runs

| | Without keys (default) | With keys in `.env` |
|---|---|---|
| Hearing speech | Chrome's speech recognition (en-IN) | Wispr Flow API, told which languages to expect and the names to listen for |
| Reading the note and the replies | Built-in rules (`src/parse.js`) | OpenAI `gpt-6-luna` with strict JSON output, re-checked by the same rules |
| KaasuPesu's voice | The browser's voices | OpenAI text-to-speech (`gpt-4o-mini-tts`) |

To turn on the keyed path, copy `.env.example` to `.env`, add `OPENAI_API_KEY` and `WISPR_API_KEY`, restart, and
run `npm run smoke` to check both keys. Wispr is used only when the OpenAI key is set too. The line at the top of the app shows which path is on. Keys stay on the
local server and never reach the browser.

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

- Verified: the keyless path end to end in headless Chromium with zero console errors; a microphone recording
  reaching the server as 16 kHz WAV; and, with a real OpenAI key, GPT's reading and OpenAI's voice
  (`npm run smoke`, 28 Nov).
- Not verified yet: Wispr with a real key (Wispr's API needs approval, and we don't have a key yet), the whole
  flow with keys in a browser, and the Hindi and Tamil wording, which needs a native speaker.
- OpenAI has deprecated `gpt-4o-mini-tts`; it works until 6 January 2027.
