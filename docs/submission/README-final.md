# LexDroid — AI Tool for Digital Trade Regulatory Analysis

UN Global Hackathon on AI for Digital Trade Regulatory Analysis
Team: [TO FILL: official team name] | Round: **Final**
Last updated: 2026-09-30

> **Final round requirement.** Every section below is mandatory. This README is part of the
> 30 September submission and is read during the desk review — it is the front door to criterion
> **C4a, Technical Handover (8 points)**.
>
> *Drafted from the repository's existing `README.md` (last updated 16 September) and updated
> against the current codebase and the latest dated docs (`docs/where-we-differ-from-escap.md`,
> `docs/three-economies-results.md`, both 26–28 September). Anything not verifiable from the
> repository is marked `[TO FILL: …]`. This copy carries no ESCAP scores or per-cell agreement
> figures — see `docs/submission/CHECKLIST.md` for what the user still needs to insert.*

---

## What This Tool Does

This tool automates two tasks required by the ESCAP Regional Digital Trade Integration Index
(RDTII 2.1).

**Task 1 — Automated Evidence Discovery.** Given an economy and a pillar, it walks the official
government legal portals, builds a register of every instrument they publish, ranks that register
against the question being asked, fetches only what it chose, and extracts structured text —
including from scanned PDFs, through local OCR. No manual steps.

**Task 2 — Intelligent Mapping and Categorisation.** The extracted text is mapped to RDTII
indicator IDs. Every provision is recorded with an article-level citation, a verbatim snippet
located character-for-character in the stored source, and a Discovery Tag marking whether it was
found independently (NEW) or matched a known example (KNOWN).

The unit of work is a **cell**: one economy, one indicator — 61 regulatory indicators across 12
pillars. Every cell ends with an answer — a restriction found, no restriction found, or unresolved
— and every answer names the instrument it is a claim about.

**Mandatory pillars:** 6 (Cross-border data policies) and 7 (Domestic data protection and
privacy). **Also in scope:** all twelve RDTII 2.1 pillars — the sealed live test on 15 October may
fall in any of them.
**Economies run end to end:** Australia, Malaysia, Singapore, India, Thailand, Lao PDR, Mongolia,
the Russian Federation — eight economies, five of them non-English source jurisdictions. All eight
have produced cells against their pillars as of this update; see [Supported Economies and
Portals](#supported-economies-and-portals) for the honest, per-economy state of each.
**Ready for the live test:** of the nine 2025-database economies (Thailand, Viet Nam, Indonesia,
China, India, Kazakhstan, Lao PDR, Mongolia, the Russian Federation), this team has run four —
Thailand, India, Lao PDR, Mongolia and the Russian Federation (five) — and has not run Viet Nam,
Indonesia, China or Kazakhstan.

---

## Quick Start

⚠ **A competent programmer must reach a working system from this section alone, on a clean
machine, in under 30 minutes — with no help from the team.** That threshold is criterion C4a and
it will be tested literally.

### 1. Clone the repository

```
git clone https://github.com/sidreyli/lexdroid.git
cd lexdroid
```

### 2. Install

```
npm install
```

Node 20.11 or newer. No Python. `better-sqlite3` and `@napi-rs/canvas` ship prebuilt binaries for
Windows, macOS and Linux on current Node; if npm falls back to building from source you need a C++
toolchain, which is the one step that can push past 30 minutes.

### 3. Set up the working store

```
npm run setup
```

Creates the SQLite store, derives the 61 indicators from ESCAP's methodology sheet, and imports
the 2025 sample kit into a **separate, quarantined** baseline store. It reports what is missing
rather than failing at the first gap.

### 4. Install the reading engine

Engine A runs locally through [Ollama](https://ollama.com):

```
ollama pull bge-m3          # multilingual embeddings for the semantic index
ollama pull gemma4:12b      # the base the reading engine is built from
ollama create gemma4-lex-16k -f ollama/gemma4-lex-16k.Modelfile
```

The reading engine is stock `gemma4:12b` at a wider context and nothing else; the Modelfile in
`ollama/` is the whole of it.

### 5. Configure

```
cp .env.example .env
```

Engine A needs nothing in it. Engine B runs on a GPU rented from RunPod and needs a RunPod API
key, as `api=...` in the root `.env` or `RUNPOD_API_KEY` in the environment — see [Your Two
Declared Engines](#your-two-declared-engines). The core pipeline runs end to end with `.env`
untouched, which is the Section 3 claim.

### 6. Start the interface

```
npm run dev
```

Then open <http://localhost:3000>. **Everything else happens in the interface** — starting a run,
watching it, reviewing, correcting, switching engines, exporting.

### 7. Verify

From **Home**, pick Singapore, pillar 6, Engine A, and leave Sources on *Read only what is already
on disk* for a first pass that touches no government server. Expect a handful of cells in a few
minutes and rows you can open in **Workbench**.

If the run stops immediately saying the engine is unreachable, Ollama is not running:
`ollama serve`.

---

## Your Interface

Criteria **C3a (10)** and **C3b (5)** are marked on the interface during the desk review, by
someone who did not build it.

| What a reviewer needs to do | Where it is |
| :---- | :---- |
| Start a run and watch progress in plain words | **Home** → *Start a run* → the run's page opens itself and streams stages |
| Open the audit view: a result beside the source text it came from | **Workbench** → pick a run → any row; the provision is on the right with the quote highlighted in it |
| Follow a row to its official source at the cited article | **Workbench** → row → *Source* → the citation link, which carries the anchor for the section |
| Accept, reject or correct a row | **Workbench** → row → *Accept* / *Reject*, or edit any field in the finding panel |
| Switch the AI engine | **Home** → *Start a run* → the **Engine** control |
| Export to the RDTII schema | **Runs** → a run → *Export N rows* |

**Walkthrough recording:** [TO FILL: link or filename — not yet recorded]. Three to four minutes,
submitted with the Word document.

---

## Your Two Declared Engines

Required by criterion **C4b (No Vendor Lock-in, 7 points)** and tested again live as **C5b
(4 points)**. Both engines are declared in Section 5 of the Word submission on 30 September and
**cannot change afterwards**. Declared in `backend/data/engines.json`.

| | Engine A | Engine B |
| :---- | :---- | :---- |
| Provider and model | Ollama, `gemma4-lex-16k` | Ollama on a rented RunPod GPU, `qwen3.8-lex-16k` |
| Version / checkpoint | `gemma4:12b-it-q4_K_M` | `qwen3.8:27b-q4_K_M` |
| Local or hosted API | Local, or a GPU the interface rents | Hosted — a GPU the interface rents from RunPod |
| Config value | nothing — it is the default | a RunPod API key (`api=` in `.env`, or `RUNPOD_API_KEY`) |

Both are open weights. They differ in kind on every axis ESCAP names: different model family
(Gemma against Qwen), different size (12B against 27B), and someone else's hardware for Engine B.

### Switching between them

The switch is made **inside the interface**: **Home → Start a run → Engine**. No file is edited
and no command is typed. The choice is remembered, so a run started from the command line
afterwards uses the same engine.

The underlying abstraction lives in `backend/src/engines/ollama.ts`; `generate()` branches on
whether a hosted engine is configured and otherwise behaves identically. Adding a provider means
adding a row to `engines.json` — anything that speaks the OpenAI chat-completions shape (Groq,
Together, Fireworks, DeepInfra, Ollama's own `/v1`) already works, with its key read from
`LEXDROID_HOSTED_API_KEY` and never written to a file.

### Re-running without fetching

**Home → Start a run → Sources → Read only what is already on disk.** In that mode a missing
document is an error rather than a fetch, the portal walk does not happen at all, and the run's
document list is empty.

Downloaded documents live in `backend/data/cache/url/` and the parsed text in the store at
`backend/data/lexdroid.db`.

Demonstrated: run `545aed1e` completed cache-only with zero successful fetches recorded against
it.

---

## Crawling Politely

Built in and **on by default** — a ministry running this tool should not have to configure it to
avoid being blocked, and on 15 October five tools will be reading the same government sites in the
same hour.

| Setting | Value | Where it is set |
| :---- | :---- | :---- |
| Max requests per second per host | 1, or slower if the site asks | `backend/src/fetch/index.ts:95` |
| Parallel requests per host | 1, serialised through a per-host chain | `backend/src/fetch/index.ts:472` |
| robots.txt respected | yes, including `Crawl-delay` | `backend/src/fetch/index.ts:673` |
| Every request logged | `fetch_log` | `backend/src/fetch/index.ts:438` |

The site's own `robots.txt` wins wherever it asks for longer than the one-second floor. Requests
ask for compressed responses and the HTTPS client offers cipher suites in a browser's order, both
measured reasons rather than taste — see `docs/architecture.md` §8 for the measurements.

---

## Architecture Overview

```
Zone 0   profile          portals, languages, instrument kinds for an economy
   |
Zone 1   discover ──► fetch ──► parse ──► index
         register      cache     OCR      lexical (FTS) + dense (bge-m3)
   |                     ^
   |                     └── cache-only mode stops here: nothing leaves the machine
Zone 2   retrieve ──► read ──► confirm
         shortlist     quote    second, independent reading: "does this provision
                       + map    state this measure?"
   |
Zone 3   decide ──► record ──► export ──► verify
         bands        cell     RDTII      quotes relocated in the stored source
```

The boundary that matters is between **fetch** and everything after it. Fetching is a distinct
stage with its own cache and its own log, so a second pass can run with that stage disabled and
the emptiness of its document list is a fact about the run record rather than a claim.

### Key modules

| Module | File | Description |
| :---- | :---- | :---- |
| Portal Crawler | `backend/src/discover/` | Walks portals, builds the instrument register |
| Fetcher | `backend/src/fetch/index.ts` | robots, rate limiting, cache, `fetch_log` |
| Document Processor | `backend/src/parse/` | PDF, HTML, EPUB, OCR, sectioning, language detection |
| Retrieval | `backend/src/retrieve/`, `backend/src/shortlist/` | FTS + dense embeddings, fusion, shortlisting |
| Mapper | `backend/src/read/` | Reads a provision, quotes it, maps it to an indicator |
| Decision | `backend/src/decide/` | Bands, gates, the confirmation state a score stands on |
| Interface | `frontend/` | Run control, audit view, review, export |
| Output Writer | `backend/src/export/`, `frontend/lib/export/` | The RDTII schema and the seven sheets |

`docs/architecture.md` is the full design.

---

## Swapping the OCR Engine

| Engine | Config value | Notes |
| :---- | :---- | :---- |
| Tesseract (default, only) | none | `tesseract.js` with local language packs in `backend/data/ocr/tessdata`. Runs offline. |

**No proprietary service is called for OCR, and none for translation** — the pipeline does not
translate at all; provisions are quoted in their original language and `language_of_source`
records it. Section 3's claim that the core pipeline runs with no proprietary API holds for OCR
and translation as well as for the language model.

---

## Supported Economies and Portals

| Economy | Official portal | Language | Run end to end? | Notes |
| :---- | :---- | :---- | :---- | :---- |
| Australia | `legislation.gov.au` (+ 9 regulators) | en | **Yes** — all 61 indicators, benchmarked against ESCAP's Round 1 database | 28,408 instruments registered |
| Malaysia | `lom.agc.gov.my` (+ 10) | en, ms | **Yes** — all 61 indicators, benchmarked against ESCAP's Round 1 database | 16,822 registered. See the limitation on Malay coverage below. |
| Singapore | `sso.agc.gov.sg` (+ 8) | en | **Yes** — all 61 indicators, benchmarked against ESCAP's Round 1 database | 6,857 registered |
| India | `indiacode.gov.in` (+ 10) | en, hi | **Yes, cells produced across all 12 pillars**, read against ESCAP's Round 2 database as of 26 September | Central-instrument scope only (state/UT law out of scope); live-test rehearsal recorded in `docs/rehearsal-india.md` |
| Thailand | `searchlaw.ocs.go.th` (+ 7) | th | **Yes, cells produced across all 12 pillars**, read against ESCAP's Round 2 database as of 26 September | Portal reconnaissance in `docs/thailand-integration-plan.md`; one query-translation re-read was still running as of that date |
| Mongolia | `legalinfo.mn` (+ 4) | mn | **Yes, cells produced across all 12 pillars**, corpus built for every pillar as of 28 September | 11,962+ registered; parser and annex fetching proven on real pages |
| Russian Federation | `pravo.gov.ru/proxy/ips` (+ 4) | ru | **Yes, cells produced across all 12 pillars**, corpus widened and read for every pillar as of 28 September | Federal instruments from the State legal information system (windows-1251); whole Codes read |
| Lao PDR | `laoofficialgazette.gov.la` (+ 4) | lo | **Yes, cells produced across all 12 pillars**, corpus built for every pillar as of 28 September | Registered from the gazette grid; scans read by local OCR, sectioned by article |

**Stated honestly:** eight economies are run end to end — the three mandatory ones plus India,
Thailand, Lao PDR, Mongolia and the Russian Federation. Five of the eight are non-English source
jurisdictions. Rule fixes to the decision layer (scoring, not the reader) have continued past
28 September; **[TO FILL: latest benchmark totals across all eight economies]** — this README
deliberately omits ESCAP scores and per-cell agreement figures.

Not run by this team: Viet Nam, Indonesia, China, Kazakhstan (four of the nine 2025-database
economies).

---

## Output Format

Columns in this exact order, matching the template. The exporter writes them from the run record;
nothing is typed by hand.

| # | Column | Required | Where it comes from |
| :---- | :---- | :---- | :---- |
| 1 | economy | Required | The cell's economy |
| 2 | law_name | Required | Instrument title as the portal publishes it |
| 3 | law_number_ref | Optional | Official act or law number |
| 4 | last_amended | Optional | From the instrument record |
| 5 | indicator_id | Required | RDTII 2.1 code **as text** — `6.1`, `12.4.1`, `4.01` |
| 6 | article | Required | The section label, from the document's own structure |
| 7 | discovery_tag | Required | NEW / KNOWN, resolved against the quarantined sample kit |
| 8 | location_reference | Optional | Heading path or HTML anchor |
| 9 | verbatim_snippet | Required | The model's quote, **relocated in the stored source** |
| 10 | mapping_rationale | Optional | Quote first, then our reading. Capped at 300 characters. |
| 11 | source_url | Required | Official portal URL, with the section anchor where there is one |
| 12 | confidence | Optional | 0.00–1.00 — see below |
| 13 | notes | Optional | What the row stands on, the measure, OCR warnings |
| 14 | language_of_source | Required | Detected from the provision's own text, not assumed |

Indicator IDs are written as text. `12.10` entered as a number collapses to `12.1` and `4.01` to
`4.1`, and those are different indicators.

**Confidence is ordinal, not a calibrated probability.** 0.90 means the quoted words were located
character-for-character in the stored source *and* a second, independent reading confirmed the
measure; 0.75 means located but never second-read; 0.65 means located in OCR-recovered text; 0.50
means the stored source does not contain those words; 0.20 means unresolved. The sentence that
earned the number is the first thing in Notes.

```
npm run -w backend calibration
```

reports what each rung is actually worth on a given run. **Anything at or below 0.75 is worth a
human's time.**

---

## Measured Cost

Measured from `run_cost`, which the pipeline writes per run and per engine without manual
arithmetic.

| Component | Engine used | Measured cost |
| :---- | :---- | :---- |
| OCR | Tesseract, local | $0.00 |
| Embedding | bge-m3, local | $0.00 |
| Mapping — Engine A | `gemma4-lex-16k`, local or rented GPU | [TO FILL: current measured figure — a prior run measured $19.32 for 183 cells across three economies ($0.106/cell); re-measure on the current, eight-economy corpus before submitting] |
| Mapping — Engine B | `qwen3.8-lex-16k` on a rented GPU | [TO FILL: not yet billed for a full pass; a prior partial measurement was $0.18 for one 148-read pillar] |
| Crawling | — | $0.00 |
| **Total, Engine A** | | [TO FILL] |
| **Total, Engine B** | | [TO FILL] |

**Measured on:** [TO FILL: date of the figure actually submitted] **Benchmark document/run:**
[TO FILL: run id]
**Wall-clock:** [TO FILL] seconds per document

Rented hardware bills for the hour it is held rather than the seconds it decodes, so the charge is
hosts times wall time. `--usd-per-hour` records it into the run record.

`npm run -w backend benchmark` re-derives cost and cell counts from the stored run record; run it
against the run being submitted before filling the numbers above.

---

## Known Limitations

Be honest. A tool that flags text it could not read is better built than one that presents
everything with equal confidence, and saying plainly what does not work is marked up, not down.

- **Malaysia is not currently evidencing non-English coverage.** Discovery reaches
  `lom.agc.gov.my`'s English versions first; a random sample of Malaysian sections skewed heavily
  English rather than Malay. C1c is scored on the language of the source, so this is a real gap.
- **Every Lao row is OCR-recovered**, capped at a lower confidence rung because of it.
  `laoofficialgazette.gov.la` publishes image-only scans; the Lao Tesseract pack reads them, but
  "located in text recovered by OCR" is a real ceiling, not a number to explain away.
- **Lao ligature orthography can still cost recall.** Some Lao consonant clusters have two valid
  spellings with no canonical Unicode decomposition between them, so a query and a document that
  disagree on spelling do not match. Sized and written up in `docs/lao-mongolia-russia-recon.md`.
- **Cyrillic tells Mongolian from Russian in one direction only.** Mongolian Cyrillic carries Ө and
  Ү, which Russian does not; Russian text inside an economy declared Mongolian falls through to
  the profile's declared language. `backend/test/language.test.ts` asserts the asymmetry.
- **Confidence does not discriminate strongly** between its rungs — treat it as an ordering, not a
  probability.
- **The reading engine can misread a number if it is not made to quote first.** The pipeline always
  quotes before extracting a number; `backend/scripts/engine-check.ts` tests for exactly this.
- **Retrieval in Mongolian, Russian and Lao needs a translated query table**, since the rubric's
  queries are authored in English (`npm run -w backend translate-queries`).
- **Engine B reads more slowly than Engine A** — roughly 20 tokens/second on a rented GPU, several
  times slower than Engine A. A full pass on Engine B has not been billed or timed end to end.
- **[TO FILL: current row-count/instrument-naming gap and confirmation-pass net, re-measured on
  the latest run]** — see `docs/architecture.md` §4 and §3 for how these are defined and measured;
  the specific figures in the prior README (16 September) are stale and are not repeated here per
  the no-agreement-numbers rule for this package.

---

## Running the Test Suite

```
npm test
```

Runs from the repository root or from either workspace. Run vitest from `backend/` directly
(not through a `.bin` shim) — some cache-dependent tests report false negatives otherwise.

| Test file | What it tests |
| :---- | :---- |
| `backend/test/baseline-isolation.test.ts` | That no pipeline module can reach ESCAP's answers |
| `backend/test/engine-declaration.test.ts` | Section 5 against all three ways ESCAP words it |
| `backend/test/verify.test.ts` | Export rows against the template's field rules |
| `backend/test/fetch.test.ts`, `robots-absent.test.ts` | robots, rate limiting, the missing-robots case |
| `backend/test/confirmations.test.ts` | That one run has one confirmation state |
| `backend/test/language.test.ts` | Language detection, including when it should abstain |
| `backend/test/scorecard.test.ts` | Agreement against the baseline, and the verdict taxonomy |
| `backend/test/gpu-rental.test.ts` | The RunPod key is never sent to the pod |
| `frontend/lib/export/sheets.test.ts` | The engine comparison, including rows only one engine found |

**The baseline quarantine is enforced, not just intended.** `baseline-isolation.test.ts` walks
`backend/src/`, strips comments, and fails if any module outside `src/baseline` and `src/eval`
reaches for ESCAP's completed databases.

---

## Reproducing Your Submitted Evidence

```
npm run -w backend benchmark                  # stored, re-derived, exported and baseline views of a run
npm run -w backend calibration                # what each confidence rung is worth
npm run -w backend replay -- <run id>         # re-derive every score from the stored readings
```

`benchmark` re-derives every score from the stored readings and compares them against what was
recorded, reports the exported row count, and names anything that would block submission. `replay
--no-confirmed` re-derives scores without the confirmation pass, which is how the confirmation
gain is measured rather than asserted.

To regenerate the workbook itself: **Runs** → the run → *Export*.

---

## Team

| Role | Name | Responsibility |
| :---- | :---- | :---- |
| Technical Lead | Sidharth Rajesh | AI architecture, OCR, pipeline |
| Substantive Lead | [TO FILL] | Legal and policy analysis, output QA |

---

## Deploy to Vercel (optional, read-only snapshot)

```
npm run deploy
```

The Vercel site is a **read-only snapshot** — recorded analysis, workbench, run history, and
CSV/XLSX exports — not a live pipeline; the worker and its SQLite store are long-lived and are not
what Vercel deploys. Starting runs and recording reviews remain available through `npm run dev` on
a machine holding the working store. `npm run check:deploy` runs the full web verification before
deploying. For Git-based Vercel deployments, set `frontend` as the project's Root Directory.

---

## Licence

Released under the **Apache License 2.0**, as required. See [LICENSE](../../LICENSE) for the full
text.

---

The release tag recorded in `docs/submission/submission-stage3.md` is the version that runs on
15 October. Settings may change on the day; code may not.

---

## Acknowledgements

Built for the UN Global Hackathon on AI for Digital Trade Regulatory Analysis, organised by ESCAP
and KMITL.
