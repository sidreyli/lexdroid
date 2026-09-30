# LexDroid — AI Tool for Digital Trade Regulatory Analysis

UN Global Hackathon on AI for Digital Trade Regulatory Analysis
Team: LexDroid | Round: **Final**
Last updated: 2026-09-30

---

## What This Tool Does

LexDroid automates the two tasks behind the ESCAP Regional Digital Trade Integration Index
(RDTII 2.1).

**Task 1 — Automated Evidence Discovery.** Given an economy and a pillar, LexDroid walks the
official legal portals, registers every instrument they publish, ranks the register against the
indicator's questions, downloads only the documents it picked, and extracts structured text. Scanned
PDFs are read with local OCR. There are no manual steps.

**Task 2 — Intelligent Mapping and Categorisation.** The extracted text is mapped to RDTII indicator
IDs. Each provision is recorded with an article-level citation, a verbatim snippet that is located
character for character in the stored source, and a Discovery Tag: NEW if we found it ourselves,
KNOWN if it matches an example in the sample kit.

The unit of work is a **cell**: one economy and one indicator, 61 indicators across 12 pillars. Each
cell ends with a score, or is marked unresolved, and names the instruments the score rests on.

**Mandatory pillars:** 6 (Cross-border data policies) and 7 (Domestic data protection and privacy).
**Also in scope:** all twelve RDTII 2.1 pillars.
**Economies covered:** Australia, Malaysia, Singapore, India, Thailand, Lao PDR, Mongolia and the
Russian Federation, each on all 61 indicators.
**Ready for the live test:** of the nine economies in the 2025 database, we have run Thailand,
India, Lao PDR, Mongolia and the Russian Federation. We have not run Viet Nam, Indonesia, China or
Kazakhstan.

---

## Quick Start

⚠ **A competent programmer must reach a working system from this section alone, on a clean machine,
in under 30 minutes, with no help from the team.**

### 1. Clone the repository

```
git clone https://github.com/sidreyli/lexdroid.git
cd lexdroid
```

### 2. Set up the environment

You need Node.js 22 and [Ollama](https://ollama.com). Python and Docker are not needed.

```
npm install
npm run setup
```

`npm install` installs both workspaces, `backend` and `frontend`. The native modules
(`better-sqlite3`, `@napi-rs/canvas`) ship prebuilt binaries for Windows, macOS and Linux.
`npm run setup` creates the SQLite store, builds the 61 indicators from ESCAP's methodology sheet,
and imports the 2025 sample kit into a separate baseline store that the pipeline uses only for
NEW/KNOWN tagging.

### 3. Configure

```
cp .env.example .env
ollama pull bge-m3
ollama pull gemma4:12b
ollama create gemma4-lex-16k -f ollama/gemma4-lex-16k.Modelfile
```

`bge-m3` is the embedding model. `gemma4-lex-16k` is Engine A: stock `gemma4:12b` with a 16k
context, as set in `ollama/gemma4-lex-16k.Modelfile`. Engine A needs nothing in `.env`. Engine B
runs on a GPU that the interface rents from RunPod and needs a RunPod API key, set as `api=...` in
`.env` or as `RUNPOD_API_KEY` in the environment.

### 4. Start the interface

```
npm run dev
```

Then open <http://localhost:3000>. Everything else happens in the interface: starting a run,
reviewing, correcting, switching engines and exporting.

### 5. Verify

On **Home**, choose Singapore, pillar 6 and Engine A, and leave **Sources** on *Read only what is
already on disk*. The run page reports each stage as it goes. Within a few minutes the cells appear,
and each row opens in **Workbench**. If the run stops at once saying the engine is unreachable,
Ollama is not running: start it with `ollama serve`.

---

## Your Interface

| What a reviewer needs to do | Where it is |
| :---- | :---- |
| Start a run and watch progress in plain words | **Home** → *Start a run*. The run's page opens and reports each stage. |
| Open the audit view: a result beside the source text it came from | **Workbench** → pick a run → any row. The provision is shown on the right with the quote highlighted. |
| Follow a row to its official source at the cited article | **Workbench** → row → *Source* → the citation link, which carries the section anchor |
| Accept, reject or correct a row | **Workbench** → row → *Approve*, *Reject* or *Correct*, in the bar under the finding |
| Switch the AI engine | **Home** → *Start a run* → **Engine** |
| Export to the RDTII schema | **Runs** → a run → *Export* |

**Walkthrough recording:** to follow with the Word submission.

---

## Your Two Declared Engines

Declared in `backend/data/engines.json`.

| | Engine A | Engine B |
| :---- | :---- | :---- |
| Provider and model | Ollama, `gemma4-lex-16k` (Gemma 4 12B) | Ollama on a rented RunPod GPU, `qwen3.8-lex-16k` (Qwen 3.8 27B) |
| Version / checkpoint | `gemma4:12b-it-q4_K_M` | `qwen3.8:27b-q4_K_M` |
| Local or hosted API | Local. The interface can also rent a GPU for it. | A GPU the interface rents from RunPod. No hosted model API. |
| Config value | None; it is the default | A RunPod API key (`api=` in `.env`, or `RUNPOD_API_KEY`) |

Both are open weights. They differ in model family (Gemma and Qwen), in size (12B and 27B), and in
where they run.

### Switching between them

In the interface: **Home** → *Start a run* → **Engine** → select the engine. No file is edited and
no command is typed.

The abstraction lives in `backend/src/engines/`. The rest of the pipeline makes one `generate()`
call and does not know which engine answers it. Adding a provider means adding an entry to
`engines.json`: any server that speaks the OpenAI chat-completions format works, with its key read
from `LEXDROID_HOSTED_API_KEY` and never written to a file.

### Re-running without fetching

In the interface: **Home** → *Start a run* → **Sources** → *Read only what is already on disk*. In
this mode the portal walk does not run, and a document missing from the cache is an error rather
than a download, so the run's document list is empty. Run `545aed1e` was made this way and recorded
no fetches.

Downloaded documents are cached in `backend/data/cache/url/`. Parsed text is in
`backend/data/lexdroid.db`.

---

## Crawling Politely

On by default, with nothing to configure.

| Setting | Value | Where it is set |
| :---- | :---- | :---- |
| Max requests per second per host | 1, or slower if the site asks | `backend/src/fetch/index.ts:256` |
| Parallel requests per host | 1; requests to a host run one after another | `backend/src/fetch/index.ts:817` |
| robots.txt respected | Yes, including `Crawl-delay` | `backend/src/fetch/index.ts:649`, `:687` |
| Every request logged | `fetch_log` table | `backend/src/fetch/index.ts:780` |

Where a site's `robots.txt` asks for a longer delay than one second, the longer delay applies.

---

## Architecture Overview

```
Zone 0   profile          portals, languages and instrument kinds for an economy
   |
Zone 1   discover ──► fetch ──► parse ──► index
         register      cache     OCR      lexical (FTS5) + dense (bge-m3)
   |                     ^
   |                     └── cache-only mode stops here: nothing leaves the machine
Zone 2   retrieve ──► read ──► confirm
         shortlist     quote    a second, independent reading: "does this provision
                       + map    state this measure?"
   |
Zone 3   decide ──► record ──► export ──► verify
         bands        cell     RDTII      quotes located again in the stored source
```

Fetching is its own stage, with its own cache and log. Everything after it reads from the store, so
a second pass can run with fetching switched off, and its empty document list is a fact in the run
record.

### Key modules

| Module | File | Description |
| :---- | :---- | :---- |
| Portal Crawler | `backend/src/discover/` | Walks portals and builds the instrument register |
| Document Processor | `backend/src/fetch/`, `backend/src/parse/` | Download, robots and rate limits; PDF, HTML, EPUB, OCR and sectioning |
| Retrieval | `backend/src/index/`, `backend/src/retrieve/`, `backend/src/shortlist/` | Lexical and dense indexes, fused search, shortlisting |
| Mapper | `backend/src/read/`, `backend/src/decide/` | Reads and quotes a provision, maps it to an indicator, scores the cell |
| Interface | `frontend/` | Run control, audit view, review, export |
| Output Writer | `backend/src/export/`, `frontend/lib/export/` | The RDTII schema and the template's sheets |

The full design is in `docs/architecture.md`. Running the pipeline from the command line, and
hosting a read-only copy, are covered in `docs/operating.md`.

---

## Swapping the OCR Engine

| Engine | Config value | Notes |
| :---- | :---- | :---- |
| Tesseract (`tesseract.js`) | None; it is the only engine | Local, offline. Language data for English, Hindi, Lao, Mongolian, Russian and Thai is installed with the package. |

No proprietary service is used for OCR or for translation. Provisions are quoted in their original
language and the row records that language.

---

## Supported Economies and Portals

| Economy | Official portal | Language | Run end to end? | Notes |
| :---- | :---- | :---- | :---- | :---- |
| Australia | `legislation.gov.au` and 9 regulator sites | English | Yes, 61 indicators | |
| Malaysia | `lom.agc.gov.my` and 10 others | English, Malay | Yes, 61 indicators | Portals mostly surface the English versions |
| Singapore | `sso.agc.gov.sg` and 8 others | English | Yes, 61 indicators | |
| India | `indiacode.gov.in` and 10 others | English, Hindi | Yes, 61 indicators | Central legislation only |
| Thailand | `searchlaw.ocs.go.th` and 7 others | Thai | Yes, 61 indicators | |
| Lao PDR | `laoofficialgazette.gov.la` and 4 others | Lao | Yes, 61 indicators | Image-only scans, read by OCR |
| Mongolia | `legalinfo.mn` and 4 others | Mongolian | Yes, 61 indicators | |
| Russian Federation | `pravo.gov.ru` and 4 others | Russian | Yes, 61 indicators | |

---

## Output Format

Columns in the template's order. The exporter fills them from the run record.

| # | Column | Required | Where it comes from |
| :---- | :---- | :---- | :---- |
| 1 | economy | Required | Official UN name of the cell's economy |
| 2 | law_name | Required | The instrument's title as the portal publishes it |
| 3 | law_number_ref | Optional | The official act or law number |
| 4 | last_amended | Optional | Year of the latest amendment, from the instrument record |
| 5 | indicator_id | Required | RDTII 2.1 code, written as text (`6.1`, `12.4.1`, `4.01`) |
| 6 | article | Required | The section label, from the document's own structure |
| 7 | discovery_tag | Required | NEW or KNOWN, checked against the sample kit |
| 8 | location_reference | Optional | Page number, heading path or HTML anchor |
| 9 | verbatim_snippet | Required | The quoted words, located in the stored source |
| 10 | mapping_rationale | Optional | The quote first, then our reading, within 300 characters |
| 11 | source_url | Required | The official portal URL, with the section anchor where there is one |
| 12 | confidence | Optional | 0.00–1.00; see below |
| 13 | notes | Optional | What the row rests on, and any OCR warning |
| 14 | language_of_source | Required | Detected from the provision's text |

Indicator IDs are stored as text, because `12.10` typed as a number becomes `12.1` and `4.01`
becomes `4.1`.

**Confidence is an ordering, not a calibrated probability.** 0.90: the quote was found in the
stored source and a second reading confirmed the measure. 0.75: found, but not second-read. 0.65:
found in OCR text. 0.50: not found in the stored source. 0.20: unresolved. A reviewer should check
anything at 0.75 or below first.

---

## Measured Cost

Every figure below is read from `run_cost`, which the pipeline writes for each run and engine:
calls, tokens, wall-clock time and dollars. Nothing is estimated after the fact.

On the machine it was built on, both engines run locally through Ollama and a run costs nothing
beyond electricity. The only thing that is ever billed is a GPU rented from RunPod, charged by the
hour it is held, and capped per engine (US$0.34 an hour for Engine A, US$0.55 for Engine B). The
benchmark below was run on rented GPUs, so that it shows a real price.

| Component | Engine used | Measured cost |
| :---- | :---- | :---- |
| OCR | Tesseract, local | $0.00 |
| Embedding | bge-m3, local | $0.00 |
| Mapping — Engine A | `gemma4-lex-16k` on a rented GPU | $0.48 for the run |
| Mapping — Engine B | `qwen3.8-lex-16k` on a rented GPU | $2.12 for the run |
| Crawling | None | $0.00 |
| **Total, Engine A** | | **$0.0011 per document** ($0.00 on a local GPU) |
| **Total, Engine B** | | **$0.0058 per document** ($0.00 on a local GPU) |

**Measured on:** 27 September 2026.
**Benchmark:** Thailand, the same ten indicators on both engines (3.4, 3.5, 4.01, 5.2, 6.1, 8.2,
8.3, 11.2, 12.4.3, 12.5). Engine A read 455 documents in 1,666 calls; Engine B read 367 in 1,369.
**Wall-clock:** 7.0 seconds per document on Engine A (53 minutes in all); 30.1 seconds per document
on Engine B (184 minutes).

The cost of a rented run is the hourly rate times the time the GPU was held. The Run Record sheet of
every export carries the cost the pipeline recorded for that run.

---

## Known Limitations

- **Lao sources are scans.** `laoofficialgazette.gov.la` publishes image-only PDFs. Every Lao row
  comes from OCR text and is capped at a lower confidence.
- **Lao spelling variants.** Some Lao consonant clusters have two valid spellings that Unicode does
  not treat as equivalent, so a query and a document that spell a word differently do not match.
- **Malay coverage is thin.** The Malaysian portals serve English versions first, so few Malay
  sources are read.
- **Mongolian and Russian are told apart in one direction only.** Mongolian Cyrillic uses Ө and Ү,
  which Russian does not. Russian text in a Mongolian source is labelled Mongolian.
- **Questions are written in English.** For Lao, Mongolian and Russian, retrieval uses a translated
  question table (`backend/data/query-translations/`), generated by
  `npm run -w backend translate-queries`.
- **India covers central legislation only.** State and Union Territory law is out of scope.
- **Engine B is slower.** It decodes about 20 tokens a second on a rented GPU and depends on RunPod
  having a suitable GPU free.
- **Confidence calibration:** the confidence levels are relative, not probabilities. Check rows at
  0.75 or below first.

---

## Running the Test Suite

```
npm test
```

| Test file | What it tests |
| :---- | :---- |
| `backend/test/baseline-isolation.test.ts` | No pipeline module can read ESCAP's answers |
| `backend/test/engine-declaration.test.ts` | The engine declaration matches Section 5 |
| `backend/test/verify.test.ts` | Export rows against the template's field rules |
| `backend/test/fetch.test.ts`, `robots-absent.test.ts` | robots.txt, rate limits, and sites with no robots.txt |
| `backend/test/confirmations.test.ts` | Each run has one consistent set of confirmations |
| `backend/test/language.test.ts` | Language detection, including when it should not guess |
| `backend/test/gpu-rental.test.ts` | The RunPod key is never sent to the pod |
| `frontend/lib/export/sheets.test.ts` | The engine comparison, including rows only one engine found |

---

## Reproducing Your Submitted Evidence

The submitted workbook was built from the runs listed in its Run Record sheet: each run was
rescored under the current rules, its export rows rebuilt and verified, and the rows written into
ESCAP's template. The run databases are large and are not in the repository; we can provide them
on request. A run in your own store is exported from the interface (**Runs** → run → *Export*), and
`npm run -w backend rescore -- --run <run id>` recomputes every score in it from the stored readings.

---

## Team

| Role | Name | Responsibility |
| :---- | :---- | :---- |
| Team Lead and Technical Lead | Sidharth Rajesh | AI architecture, OCR, pipeline |
| Substantive Lead | Gwyneth Voon | Legal and policy analysis, output QA |

---

## Licence

Released under the Apache License 2.0. See [LICENSE](LICENSE).

The release tag in our Stage 3 submission is the version that runs on 15 October.

---

## Acknowledgements

Built for the UN Global Hackathon on AI for Digital Trade Regulatory Analysis, organised by ESCAP
and KMITL.
