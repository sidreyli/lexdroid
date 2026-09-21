# LexDroid — AI Tool for Digital Trade Regulatory Analysis

UN Global Hackathon on AI for Digital Trade Regulatory Analysis
Team: LexDroid | Round: **Final**
Last updated: 2026-09-16

---

## What This Tool Does

LexDroid automates the two tasks ESCAP sets for the Regional Digital Trade Integration Index
(RDTII 2.1).

**Task 1 — Automated Evidence Discovery.** Given an economy and a pillar, it walks the official
government legal portals, builds a register of every instrument they publish, ranks that register
against the question being asked, fetches only what it chose, and extracts structured text —
including from scanned PDFs, through a local OCR engine. No manual steps.

**Task 2 — Intelligent Mapping and Categorisation.** The extracted text is mapped to RDTII
indicator IDs. Every provision is recorded with an article-level citation, a verbatim snippet
located character-for-character in the stored source, and a Discovery Tag saying whether we found
it independently (NEW) or matched it to the 2025 sample kit (KNOWN).

The unit of work is a **cell**: one economy, one indicator. 61 regulatory indicators across 12
pillars. Every cell ends with an answer — a restriction found, no restriction found, or unresolved
— and every answer names the instrument it is a claim about.

We automate ESCAP's Zone 1 (evidence discovery) and Zone 2 (mapping and citation). Scoring is
Zone 3, and ESCAP is explicit that it stays with a human researcher; what we compute is a
suggestion with its working shown, not a verdict.

**Mandatory pillars:** 6 (Cross-border data policies) and 7 (Domestic data protection and privacy).
**Also in scope:** all twelve RDTII 2.1 pillars — the sealed live test may fall in any of them.
**Economies run end to end:** Australia, Malaysia, Singapore — all 61 indicators, all 12 pillars.
**Economies profiled:** those three plus India, Thailand, Mongolia, the Russian Federation and Lao
PDR — eight, five of them non-English. Zone 0 only for the last five; see below for what that means
and what it does not.
**Ready for the live test:** see [Supported Economies and Portals](#supported-economies-and-portals)
for an honest statement of what has and has not been run.

---

## Quick Start

A competent programmer should reach a working system from this section alone, on a clean machine,
in under 30 minutes.

### 1. Clone the repository

```
git clone https://github.com/lexdroid/lexdroid.git
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

Creates the SQLite store, derives the 61 indicators from ESCAP's methodology sheet, and imports the
2025 sample kit into a **separate, quarantined** baseline store. It reports what is missing rather
than failing at the first gap.

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

Engine A needs nothing in it. Engine B is a hosted API and needs one key — see
[Your Two Declared Engines](#your-two-declared-engines). The core pipeline runs end to end with
`.env` untouched, which is the Section 3 claim.

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

If the run stops immediately saying the engine is unreachable, Ollama is not running: `ollama serve`.

---

## Your Interface

| What a reviewer needs to do | Where it is |
| :---- | :---- |
| Start a run and watch progress in plain words | **Home** → *Start a run* → the run's page opens itself and streams stages |
| Open the audit view: a result beside the source text it came from | **Workbench** → pick a run → any row; the provision is on the right with the quote highlighted in it |
| Follow a row to its official source at the cited article | **Workbench** → row → *Source* → the citation link, which carries the anchor for the section |
| Accept, reject or correct a row | **Workbench** → row → *Accept* / *Reject*, or edit any field in the finding panel |
| Switch the AI engine | **Home** → *Start a run* → the **Engine** control |
| Export to the RDTII schema | **Runs** → a run → *Export N rows* |

**Walkthrough recording:** _to be recorded before 30 September._

---

## Your Two Declared Engines

Declared in `backend/data/engines.json` and frozen at submission.

| | Engine A | Engine B |
| :---- | :---- | :---- |
| Provider and model | Ollama, `gemma4-lex-16k` | Groq, `qwen/qwen3-32b` |
| Version / checkpoint | `gemma4:12b-it-q4_K_M` | `qwen/qwen3-32b` |
| Local or hosted API | Local (or a GPU rented by the hour) | Hosted API |
| Kind | Open weights | Open weights, commercially hosted |
| Config value | nothing — it is the default | `LEXDROID_HOSTED_API_KEY` in the environment |

They differ in kind on every axis ESCAP names: different model family (Gemma against Qwen),
different size (12B against 32B), different quantisation, and someone else's hardware. Engine B is
commercially hosted *and* open weights at once, which satisfies both the way the orientation slide
puts it ("at least one must be open weights") and the way checklist item 20 puts it ("one
commercial hosted, one open weights").

**The API key is never written to a file.** It is read from `LEXDROID_HOSTED_API_KEY` in the
environment, because a key on disk is a key in a backup. `backend/test/engine-declaration.test.ts`
asserts the registry file contains no key.

Verify an engine actually works as declared, through the pipeline's own call path:

```
npm run -w backend engine-check -- --engine engine-b
```

Four checks: reachable, returns structured output, quotes before it interprets, and reads a legal
provision correctly.

### Switching between them

In the interface: **Home** → *Start a run* → **Engine**. No file is edited and no command is typed.
The choice is remembered, so a run started from the command line afterwards uses the same engine.

The abstraction is `backend/src/engines/ollama.ts`, whose `generate()` branches on whether a hosted
engine is configured and otherwise behaves identically. Adding a provider means adding a row to
`engines.json`: anything that speaks the OpenAI chat-completions shape — Groq, Together,
Fireworks, DeepInfra, Ollama's own `/v1` — already works.

### Re-running without fetching

In the interface: **Home** → *Start a run* → **Sources** → *Read only what is already on disk*.

In that mode a missing document is an error rather than a fetch, the portal walk does not happen at
all, and the run's document list is empty. Downloaded documents live in `backend/data/cache/url/`
and the parsed text in the store at `backend/data/lexdroid.db`.

Demonstrated: run `545aed1e` completed cache-only with zero successful fetches recorded against it.

---

## Crawling Politely

On by default. A ministry running this tool should not have to configure it to avoid being blocked,
and on 15 October five tools will be reading the same government sites in the same hour.

| Setting | Value | Where it is set |
| :---- | :---- | :---- |
| Max requests per second per host | 1, or slower if the site asks | `backend/src/fetch/index.ts:95` |
| Parallel requests per host | 1, serialised through a per-host chain | `backend/src/fetch/index.ts:472` |
| robots.txt respected | yes, including `Crawl-delay` | `backend/src/fetch/index.ts:673` |
| Every request logged | `fetch_log` | `backend/src/fetch/index.ts:438` |

The site's own `robots.txt` wins wherever it asks for longer than our one-second floor. Singapore
Statutes Online asks for six seconds and disallows `/search`; both are respected, and discovery
uses the site's browse listings instead. The delay is jittered, because a request exactly every six
seconds for three hours is itself a pattern a rate rule notices.

The user agent identifies us. It is also browser-shaped, because the CDN in front of Singapore
Statutes Online answers 403 to anything that is not — including a plainly labelled research
crawler. We append our name rather than hide behind theirs.

Two further settings exist for measured reasons rather than taste, and both are commented where
they are set:

- Requests ask for compressed responses and unwrap them. One Singapore Act measured 404,381 bytes
  uncompressed and 31,406 compressed; not asking meant taking thirteen times the bandwidth off a
  government server for identical text.
- The HTTPS client offers cipher suites in a browser's order. Node's default order is read as a
  client fingerprint by that same CDN, which answers a challenge page instead of the document —
  measured on the same machine in the same minute as `curl` receiving it normally. No challenge is
  solved and no credential is presented; the crawl stays within `robots.txt` either way.

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
stage with its own cache and its own log, so a second pass can be run with that stage disabled and
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
| Tesseract (default) | none | `tesseract.js` with local language packs in `backend/data/ocr/tessdata`. Runs offline. |

**No proprietary service is called for OCR, and none for translation** — we do not translate at
all; provisions are quoted in their original language and `language_of_source` records it. Section
3's claim that the core pipeline runs with no proprietary API holds for OCR and translation as well
as for the language model.

---

## Supported Economies and Portals

| Economy | Official portal | Language | Run end to end? | Notes |
| :---- | :---- | :---- | :---- | :---- |
| Australia | `legislation.gov.au` (+ 9 regulators) | en | **Yes** — 61/61 indicators | 28,408 instruments registered |
| Malaysia | `lom.agc.gov.my` (+ 10) | en, ms | **Yes** — 61/61 indicators | 16,822 registered. See the limitation on Malay below. |
| Singapore | `sso.agc.gov.sg` (+ 8) | en | **Yes** — 61/61 indicators | 6,857 registered |
| India | `indiacode.gov.in` (+ 10) | en, hi | **No** — profile and adapter only | Portal adapter written and tested; no cells produced |
| Thailand | `searchlaw.ocs.go.th` (+ 7) | th | **No** — profile only | Six of eight portals confirmed blocked or client-rendered; `docs/thailand-integration-plan.md` |
| Mongolia | `legalinfo.mn` (+ 4) | mn | **No** — profile only | Register endpoint and full-text documents both verified reachable; adapter needs POST support in the fetcher |
| Russian Federation | `publication.pravo.gov.ru` (+ 4) | ru | **No** — profile, adapter ready | Permissive and enumerable; walked by `crawl`, no register run yet |
| Lao PDR | `laoofficialgazette.gov.la` (+ 4) | lo | **No** — profile, adapter ready | Walked by `crawl`; gazette is scan-only and read by the Lao OCR pack at 77% confidence |

**Stated honestly:** eight economies are profiled; **three have been run end to end**, and they are
the three mandatory ones. Of the nine sealed live-test economies, LexDroid has produced cells for
**none**. India has a written and tested portal adapter; Thailand, Mongolia, Russia and Lao PDR have
Zone 0 profiles built from portals read live, with every unread portal recorded with the reason it
is unread rather than quietly dropped. ESCAP's own guidance is that depth beats a thin pass, and
that is the trade we made — but the finals brief also sets a floor of six economies processed
autonomously, at least three of them non-English, and that floor is not yet met.

What stands between the three new non-English economies and their first cells is named and small:
a listing adapter for Mongolia, title recognition that is not written in English for Russia, and a
Lao OCR language pack for Lao PDR. The full live trace behind each is
`docs/lao-mongolia-russia-recon.md`.

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

**Confidence is ordinal, not a calibrated probability.** The number states what the evidence is,
never what the model feels: 0.90 means the quoted words were located character-for-character in the
stored source *and* a second, independent reading confirmed the measure; 0.75 means located but
never second-read; 0.65 means located in OCR-recovered text; 0.50 means the stored source does not
contain those words; 0.20 means unresolved. The sentence that earned the number is the first thing
in Notes. Measure what each rung is actually worth:

```
npm run -w backend calibration
```

On run `82673dbf` that reports 0.755 agreement behind the 0.90 rung and 0.694 behind 0.75 — the
ordering is real, the separation is 0.061, and a reviewer should read the Notes rather than
threshold on the number. **Anything at or below 0.75 is worth a human's time.**

---

## Measured Cost

Measured from `run_cost`, which the pipeline writes per run and per engine without manual
arithmetic.

**Benchmark run:** `82673dbf` — Australia, Malaysia and Singapore, all 12 pillars, 183 cells,
775 exported rows. **Measured on:** 2026-09-16.

| Component | Engine used | Measured cost |
| :---- | :---- | :---- |
| OCR | Tesseract, local | $0.00 |
| Embedding | bge-m3, local | $0.00 |
| Mapping — Engine A | `gemma4-lex-16k` on 8 rented GPUs | **$19.32** |
| Mapping — Engine B | `qwen/qwen3-32b` on Groq | not yet measured |
| Crawling | — | $0.00 |
| **Total, Engine A** | | **$19.32 for 183 cells — $0.106 per cell** |

12,250 engine calls (5,275 of them fresh; the rest carried from an earlier run, which the run record
says on its own face), 21,919,343 prompt tokens, 1,356,587 output tokens, 28.8 hours of wall clock
across 8 workers.

Rented hardware bills for the hour it is held rather than the seconds it decodes, so the charge is
hosts times wall time. `--usd-per-hour` records it into the run record.

The corpus behind those cells — 4,045 documents, 162,901 sections — was built by 8,546 successful
fetches over several days, at $0.00: bandwidth off government portals is the only resource spent,
which is exactly why the crawler is careful with it.

**Engine B has not been billed yet.** Groq prices `qwen/qwen3-32b` per token; the cost of a
comparison pass will be filled in once the engine has been run. It is not estimated here.

---

## Known Limitations

- **Malaysia is not currently evidencing non-English coverage.** Across a random sample of 1,500
  sections spanning all 1,562 Malaysian instruments, the language detector found 1,473 English, 20
  Malay and 7 unclassifiable. `lom.agc.gov.my` publishes English versions and our discovery reaches
  those first. C1c is scored on the language of the source, so this is a real gap, not a
  presentational one.
- **Every Lao row is OCR-recovered, and capped at 0.65 confidence because of it.**
  `laoofficialgazette.gov.la` publishes image-only scans — one sampled at 1.09 MB carried zero
  `/Font` and zero `/ToUnicode`. The Lao language pack reads them: 1,761 Lao characters off one
  page at 77.0 confidence in 10.2 seconds, retaining article numbers and the made-under citation
  chain. But "located in text recovered by OCR" is what the 0.65 rung means, and it is a real
  ceiling on Lao rather than a number to explain away.
- **Lao ligature orthography can still cost recall.** Lao writes some clusters either as one
  ligature codepoint or as `ຫ` plus the base consonant (`ໝ` against `ຫ`+`ມ`), Unicode defines no
  canonical decomposition, and `normalize('NFC')` is a no-op on them — the same situation
  `backend/src/util/thai.ts` handles for Thai. Two spellings of one word are two trigram sets, so
  a query and a document that disagree do not match. Sized and written up in
  `docs/lao-mongolia-russia-recon.md`; not fixed, because the one sample also shows OCR confusing
  `ມ` with `ນ` and normalising alone would not have recovered it.
- **Cyrillic tells Mongolian from Russian in one direction only.** Mongolian Cyrillic carries Ө and
  Ү, which Russian does not, so a Mongolian provision is recognised on its own evidence. Russian
  has no letter of its own against Mongolian, so Russian text inside an economy declared Mongolian
  falls through to what the profile says and is recorded as Mongolian. It is the same trade this
  codebase already makes for Malay against Indonesian, and `backend/test/language.test.ts` asserts
  the asymmetry rather than leaving it to be discovered.
- **Confidence does not discriminate strongly.** See above: the rungs order rows correctly but the
  spread is 0.061. Do not treat the number as a probability.
- **The reading engine can misread a number if it is not made to quote first.** Asked for a
  retention period as a bare number, Engine A answered "10" for text reading "not less than 5
  years" — reproducibly, at temperature zero. Asked to copy the words first and then read the
  number out of them, it answered 5. The pipeline always quotes first, and
  `backend/scripts/engine-check.ts` tests for exactly this. It is a property of the model, not a
  bug we fixed.
- **9 of 775 exported rows name no instrument at all** — 7 unresolved cells and 2 where no
  controlling instrument was identified. ESCAP's own database names an instrument on 1,535 of its
  1,536 rows, so this shape has no precedent there. They are flagged as unresolved rather than
  hidden.
- **Confirmation is not a free win.** The second reading pass rules out 80.6% of findings. On run
  `b78c76f0` it corrected 27 cells and broke 13, a net gain of 15. It is on by default because the
  net is positive and because a ruled-out finding is a cheaper error than a fabricated one.
- **The engine cache must be off for any number that will be quoted.** `LEXDROID_ENGINE_CACHE=1`
  replays stored answers, which turns a forty-minute pillar into seconds while a scoring rule is
  worked on — and turns a measurement into a replay. Every replayed call is counted into
  `run_cost.cached_calls` and a run that used one carries a note saying it is not quotable.
- **No document has been fetched under a run since fetch attribution was wired.** Fetches are
  attributed to `fetch_log.run_id`, which is what the Run Record reports and what C5a is scored on.
  The corpus was built by command-line passes that correctly belong to no run, and the only run
  since was cache-only. A fetching run through the interface is the remaining rehearsal.
- **Engine B has not been verified against the live API.** It is fully declared and wired;
  `engine-check` cannot reach it without a key.

---

## Running the Test Suite

```
npm test
```

846 backend and 36 frontend tests. Runs from the repository root or from either workspace.

| Test file | What it tests |
| :---- | :---- |
| `backend/test/baseline-isolation.test.ts` | That no pipeline module can reach ESCAP's answers |
| `backend/test/engine-declaration.test.ts` | Section 5 against all three ways ESCAP words it |
| `backend/test/verify.test.ts` | Export rows against the template's field rules |
| `backend/test/fetch.test.ts`, `robots-absent.test.ts` | robots, rate limiting, the missing-robots case |
| `backend/test/confirmations.test.ts` | That one run has one confirmation state |
| `backend/test/language.test.ts` | Language detection, including when it should abstain |
| `backend/test/scorecard.test.ts` | Agreement against the baseline, and the verdict taxonomy |
| `frontend/lib/export/sheets.test.ts` | The engine comparison, including rows only one engine found |

**The baseline quarantine is enforced, not just intended.** ESCAP's completed databases answer the
questions we are marked on. If discovery could see them, every instrument would be tagged KNOWN by
construction and the tool would look accurate on the three economies ESCAP has already done — then
collapse on the sealed economy, which is the one that counts. `baseline-isolation.test.ts` walks
`backend/src/`, strips comments, and fails if any module outside `src/baseline` and `src/eval`
reaches for it.

---

## Reproducing Your Submitted Evidence

Every number in this README and in the submitted workbook comes from the run record and can be
recomputed from it.

```
npm run -w backend benchmark                  # stored, re-derived, exported and baseline views of a run
npm run -w backend calibration                # what each confidence rung is worth
npm run -w backend replay -- <run id>         # re-derive every score from the stored readings
```

`benchmark` re-derives all 183 scores from the stored readings and compares them against what was
recorded, reports the exported row count and the agreement with ESCAP's published answers, and
names anything that would block submission. `replay --no-confirmed` re-derives them without the
confirmation pass, which is how the confirmation gain is measured rather than asserted.

To regenerate the workbook itself: **Runs** → the run → *Export*.

---

## Team

| Role | Name | Responsibility |
| :---- | :---- | :---- |
| Technical Lead | Sidharth Rajesh | AI architecture, OCR, pipeline |
| Substantive Lead | _to be filled in_ | Legal and policy analysis, output QA |

---

## Operating It

Everything below is for running the tool outside the interface. A reviewer does not need it.

### Building a corpus

```
npm run -w backend zone1 -- --economy SGP --register     # walk the portals
npm run -w backend zone1 -- --economy SGP --about "restrictions on transferring personal data abroad" --kind act
npm run -w backend zone1 -- --economy SGP --embed        # build the semantic index
npm run -w backend zone1 -- --economy SGP --status
```

`--register` builds the register — title, kind, official number and URL for every instrument the
portals publish — without fetching any of them. Singapore's is 6,365 instruments from fourteen
requests.

`--about` is the ordinary way to read. It ranks that register against a question — semantically and
lexically, over titles — prints what it chose and why, and fetches only that. `--top N` sets how
many. This is not only cheaper: reading a statute book front to back is not something these portals
will let you do, and it is not something the live test leaves time for.

Each stage is resumable: an instrument already read is skipped, and an embedding already computed is
not recomputed. `--cache-only` runs without touching the network at all.

Ask the corpus a question:

```
npm run -w backend search -- --economy SGP "requirement to store personal data locally"
```

### Speed

`docs/architecture.md` §8 sets the budget and says which stage each second belongs to. The short
version: politeness is a per-host constraint, so hosts are crawled in parallel and never hurried;
the corpus is built once and queried by all 61 indicators; the model stage is bounded by the number
of calls it makes, not by shortening its prompts. Nothing is ever made faster by looking at less
evidence — a cheap filter may reorder candidates, never remove them.

### Running one run on several engines

Reading is the slow stage and it is decode-bound, so the way to make it finish sooner is more
engines, not a busier one. `fleet` splits the work by economy and pillar, hands each unit to a
worker that joins the same run, and shows one progress stream for all of them:

```
npm run -w backend fleet -- --economies SGP,MYS --pillars 6,7 --hosts http://127.0.0.1:11434,http://192.168.1.20:11434
```

One worker per engine endpoint, and the fleet refuses a host listed twice. This is not fussiness:
two workers sharing one Ollama server have their reads batched together by that server, and
`scripts/concurrency.ts` measures what that costs — 18 of 40 provisions read differently, findings
appearing and vanishing, while a second pass at one-at-a-time agreed with the first on all 40.
Parallelism across engines is safe; parallelism inside one is not.

Every host is checked before the run opens, and what blocks a run is that the hosts disagree about
what they are serving. Spreading a run over rented machines makes one tag mean two different builds
— a different quantisation, a different parameter count — and then half the answers come from one
model and half from the other, with nothing in the output saying so. So the family, size and
quantisation are read from each host and compared, which is exact.

```
npm run -w backend engines -- --hosts http://127.0.0.1:11434,http://127.0.0.1:11502
```

runs those checks on their own, which is the thing to do the moment a rented GPU boots.

### Renting the engines

`infra/runpod/bootstrap.sh` prepares a rented GPU: it installs Ollama, builds the reading engine
from the same Modelfile this repo uses, and pins the server to one request at a time.

```
BASE=gemma4:12b TAG=gemma4-lex-16k bash bootstrap.sh
```

It binds to localhost and nothing else, because Ollama has no authentication of its own and a pod
port open to the internet is a GPU anyone can spend. `infra/runpod/tunnel.sh` carries each pod to a
local port over SSH and prints the `--hosts` line to paste:

```
./infra/runpod/tunnel.sh 'root@1.2.3.4 -p 40022' 'root@5.6.7.8 -p 40022'
```

To reach a host over a public URL instead, put a token-checking proxy in front of it and set
`LEXDROID_ENGINE_TOKEN` in the shell that launches the run. It is sent as a bearer token and is
never written to a file.

### The engine cache, and when not to use it

`LEXDROID_ENGINE_CACHE=1` replays stored engine answers instead of asking for them. It is off
unless set, and **must never be on for a run whose numbers will be quoted** — see Known
Limitations. Delete `backend/data/engine-cache.db` to clear it; nothing else is affected.

### HTTP API

| | |
|---|---|
| `GET /health` | store and rubric status |
| `GET /api/rubric`, `/api/rubric/:id` | the 61 indicators, their bands and provenance |
| `GET /api/economies`, `/api/economies/:code` | Zone 0 profile and the state of the corpus |
| `GET /api/search?economy=SGP&q=...` | both search channels and their fusion |

---

## Licence

Released under the **Apache License 2.0**, as required. See [LICENSE](LICENSE).

---

## Acknowledgements

Built for the UN Global Hackathon on AI for Digital Trade Regulatory Analysis, organised by ESCAP
and KMITL.
