# STAGE 3 — FINAL EVALUATION: SUBMISSION PACKAGE

*Drafted 30 September 2026 from the repository (`sidreyli/lexdroid`) as it stands on `master`.
Fills every section of `docs/finals/submission_template_stage3_v2_CLEAN.md`. Copy into the
`.docx` template before submission. Anything the repository cannot establish is marked
`[TO FILL: …]` — do not invent team names, contacts, costs or dates.*

---

## TEAM INFORMATION

| | |
|---|---|
| **Team Name** | [TO FILL: official team name as registered with ESCAP — repository and docs use "LexDroid"] |
| **Team ID** | [TO FILL: as assigned by ESCAP] |
| **Team Lead — Name & E-mail** | [TO FILL: name and e-mail for the point of contact] |
| **GitHub Final Release URL** | [TO FILL: `https://github.com/sidreyli/lexdroid/releases/tag/<tag>` — no release tag has been cut yet] |
| **Release Tag** | [TO FILL — e.g. `v1.0.0`] |
| **Submission Date** | [TO FILL] |

---

## SECTION 1 · Deployment Guide

Assumes Docker is not required — the pipeline runs on Node alone. Python is not required either;
the earlier template's Python 3.10+ assumption does not apply to this codebase.

1. **Clone.**
   ```
   git clone https://github.com/sidreyli/lexdroid.git
   cd lexdroid
   ```
2. **Environment.** Node 20.11 or newer, no Python. `npm install` at the repository root installs
   both workspaces (`backend`, `frontend`). `better-sqlite3` and `@napi-rs/canvas` ship prebuilt
   binaries for Windows, macOS and Linux on current Node; a fallback to building from source (needs
   a C++ toolchain) is the one step that can push past 30 minutes.
3. **Configuration.**
   - `npm run setup` creates the SQLite store, derives the 61 regulatory indicators from ESCAP's
     methodology sheet, and imports the 2025 sample kit into a separate, quarantined baseline
     store used only for NEW/KNOWN tagging and evaluation.
   - `cp .env.example .env`. Engine A (declared in `backend/data/engines.json`, run through
     [Ollama](https://ollama.com)) needs nothing set — the core pipeline runs end to end with
     `.env` untouched, which is the Section 3 open-source claim. Engine B needs a RunPod API key
     (`api=` in `.env`, or `RUNPOD_API_KEY` in the environment) only if the reviewer wants to
     exercise the rented-GPU engine; without it the interface still offers Engine A.
   - Both engines are selected from inside the running interface (**Home → Start a run → Engine**),
     never by editing a file or typing a command — this is the criterion C4b control.
4. **Run the system.**
   ```
   ollama pull bge-m3
   ollama pull gemma4:12b
   ollama create gemma4-lex-16k -f ollama/gemma4-lex-16k.Modelfile
   npm run dev
   ```
   Open `http://localhost:3000`. Everything else — starting a run, reviewing, correcting,
   switching engines, exporting — happens in the interface.
5. **Expected output and verification.** From **Home**, pick Singapore, pillar 6, Engine A, and
   leave Sources on *Read only what is already on disk* for a first pass that touches no
   government server. Expect a handful of cells within a few minutes, visible and reviewable in
   **Workbench**. If the run stops immediately saying the engine is unreachable, start Ollama:
   `ollama serve`.

Full command reference: `README.md` §Quick Start (`docs/submission/README-final.md` in this
package is the filled final-round README).

---

## SECTION 2 · Final System Architecture

Four zones, unchanged in shape since Stage 2, with Lao PDR, Mongolia and the Russian Federation
added as economies and the fetch/read boundary hardened for the live-test zero-fetch requirement.

```
Zone 0   profile          portals, languages, instrument kinds for an economy
   |
Zone 1   discover ──► fetch ──► parse ──► index
         register      cache     OCR      lexical (FTS5 trigram) + dense (bge-m3)
   |                     ^
   |                     └── cache-only mode stops here: nothing leaves the machine
Zone 2   retrieve ──► read ──► confirm
         shortlist     quote    second, independent reading: "does this provision
                       + map    state this measure?"
   |
Zone 3   decide ──► record ──► export ──► verify
         bands        cell     RDTII      quotes relocated in the stored source
```

**Modular component boundaries.** `backend/src/discover/` (Zone 1 register), `backend/src/fetch/`
(politeness, cache, `fetch_log`), `backend/src/parse/` (PDF/HTML/EPUB/OCR/sectioning),
`backend/src/read/` (Zone 2, the only stage that calls a model), `backend/src/decide/` (Zone 3
scoring, pure functions per indicator), `backend/src/export/` and `frontend/lib/export/` (RDTII
schema output), `backend/src/engines/` (the engine abstraction and the switch), `frontend/` (the
interface). Zone 1 and Zone 2 are separate, documented modules, per the submission checklist.

**Engine swap (C4b), from within the interface.** **Home → Start a run → Engine** selects between
the two declared engines with no file edit and no typed command. The abstraction is
`backend/src/engines/ollama.ts`; `generate()` branches on whether a hosted engine is configured
and otherwise behaves identically. Adding a provider means adding a row to `engines.json` — any
provider speaking the OpenAI chat-completions shape (Groq, Together, Fireworks, DeepInfra,
Ollama's own `/v1`) already works. This will be exercised live again on 15 October.

**Data flow, Zone 1 crawling through Zone 2 extraction to the HITL review interface.** Discovery
builds an instrument register from portal shape (never a hardcoded list of Acts); the register is
shortlisted against a cell's query set before anything is fetched; fetched documents are parsed
into a section tree with character offsets and indexed once per economy (lexical + dense); Zone 2
retrieves candidate sections per cell, reads them under a pillar-scoped prompt, and records quoted
facts; Zone 3 scores those facts by a pure function and presents the result as a suggestion with
its working shown; the interface's **Workbench** is where a human accepts, rejects or corrects a
row, with the source quote highlighted in place beside the model's reading.

**Second pass over already-downloaded documents.** **Home → Start a run → Sources → Read only what
is already on disk.** In that mode a missing document is an error rather than a fetch, the portal
walk does not run at all, and the run's document list is structurally empty — demonstrated: run
`545aed1e` completed cache-only with zero successful fetches recorded against it. Downloaded
documents live in `backend/data/cache/url/`; parsed text lives in the store,
`backend/data/lexdroid.db`.

**Cost-efficiency measures.** One model call per (section, pillar), not per (section, indicator) —
twelve calls, not sixty-one; a section retrieved by several cells in the same pillar is read once;
responses are cached under `(document hash, section ordinal, pillar, prompt revision, engine,
model)`; the corpus is built once per economy and queried by all 61 indicators rather than
re-crawled per indicator; politeness (one request/second/host, one in flight, `robots.txt`
honoured) is a per-host constraint so multiple economies crawl in parallel at full speed. Detail
and measured figures: `docs/architecture.md` §8.

*Architecture diagram:* the ASCII diagram above is the one this repository maintains
(`docs/architecture.md` §2, §7). [TO FILL: insert a rendered image if the team wants one for the
Word document; none is required beyond the text diagram.]

---

## SECTION 3 · Open-Source Compliance

| # | Component / Dependency | License | Notes |
|---|---|---|---|
| 1 | better-sqlite3 | MIT | The store: SQLite with FTS5 trigram search. Backend and frontend. |
| 2 | cheerio | MIT | HTML parsing for every portal. |
| 3 | pdfjs-dist | Apache-2.0 | PDF text extraction and page rendering for OCR. |
| 4 | tesseract.js | Apache-2.0 | Local OCR; no hosted service. |
| 5 | @tesseract.js-data/eng, hin, lao, tha, mon, rus | MIT | OCR language packs, copied into `backend/data/ocr` at first use. |
| 6 | @napi-rs/canvas | MIT | Renders PDF pages for OCR. Optional dependency of pdfjs-dist, loaded through it; `--omit=optional` disables OCR. |
| 7 | undici | MIT | HTTP client for the fetcher and the hosted engine. |
| 8 | exceljs | MIT | Reads the ESCAP baseline and writes `OUTPUT_TEMPLATE_FINAL_ROUND.xlsx`. |
| 9 | jszip | MIT | Archive handling (EPUB/XLSX internals). |
| 10 | zod | MIT | Validates economy profiles and the rubric. |
| 11 | next, react, react-dom | MIT | The review interface. |
| 12 | radix-ui, cmdk, sonner, next-themes, react-resizable-panels, shadcn, cn, server-only, tw-animate-css | MIT | Interface components. |
| 13 | class-variance-authority | Apache-2.0 | Interface styling. |
| 14 | lucide-react | ISC | Icons. |
| 15 | typescript | Apache-2.0 | Build (development only). |
| 16 | tsx, vitest, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/* | MIT | Development and build only. |

Every listed license is Apache-2.0 or a permissive license compatible with it. The repository's
`LICENSE` file is the Apache License 2.0, verbatim.

- ☑ The entire codebase is released under Apache License 2.0 (`LICENSE` in the repository root).
- ☑ The core pipeline can be run end to end with no proprietary API or hosted service, on Engine A
  (Gemma-based, open weights, local via Ollama).
- ☐ Exception(s): none in the pipeline itself. Engine B (`qwen3.8-lex-16k`, open weights) runs on a
  rented RunPod GPU by default — rented hardware, not a proprietary API — and is optional; nothing
  in the pipeline requires it.

Data files generated offline and committed with the code declare their own provenance:
`backend/data/query-translations/<CODE>.json` (the rubric's queries translated into Mongolian,
Russian and Lao) records in its own header which engine and model produced it.

---

## SECTION 4 · Live Test Readiness

*Instructions in the template list the nine sealed live-test economies. This team runs eight
economies in total — the three mandatory ones plus five of the eight non-mandatory economies —
and the table below covers all eight, as requested for this submission package. Viet Nam,
Indonesia, China and Kazakhstan are not run by this team; see `docs/expansion-plan.md` for the
economy-assignment record.*

| Economy | Pillars | Languages handled | Run end to end? |
|---|---|---|---|
| Australia | All 12, all 61 indicators | English | **Yes.** Benchmark run against ESCAP's Round 1 database, all 61 indicators. |
| Malaysia | All 12, all 61 indicators | English (Bahasa Melayu in scope; see Known Limitations in the README — discovery currently surfaces mostly English-language sources) | **Yes.** Benchmark run against ESCAP's Round 1 database, all 61 indicators. |
| Singapore | All 12, all 61 indicators | English | **Yes.** Benchmark run against ESCAP's Round 1 database, all 61 indicators. |
| India | All 12 pillars registered and read; Central-instrument scope only (State/Union-Territory law is a declared boundary) | English, Hindi | **Yes, produced cells.** Read against ESCAP's Round 2 database as of 26 September; a live-test rehearsal from an empty store is recorded in `docs/rehearsal-india.md`. |
| Thailand | All 12 pillars registered and read | Thai | **Yes, produced cells.** Read against ESCAP's Round 2 database as of 26 September (one query-translation re-read was still running at that point); portal reconnaissance in `docs/thailand-integration-plan.md`. |
| Lao PDR | All 12 pillars registered and read | Lao, via local OCR on image-only Gazette scans (mean OCR confidence in the high 70s) | **Yes, produced cells across all 12 pillars**, as of 28 September, after registering and downloading the corpus needed for every pillar. |
| Mongolia | All 12 pillars registered and read | Mongolian (Cyrillic) | **Yes, produced cells across all 12 pillars**, as of 28 September, under the same corpus build. |
| Russian Federation | All 12 pillars registered and read | Russian (windows-1251 pages decoded) | **Yes, produced cells across all 12 pillars**, as of 28 September, under the same corpus build. |

Rule fixes to the decision layer (scoring rules, not the reader) have continued after 28 September
and are reflected in `git log` on `master`; the latest consolidated benchmark totals across all
eight economies are **[TO FILL: latest benchmark totals — the user will insert current numbers;
this package deliberately omits ESCAP scores and per-cell agreement figures]**.

Known, stated limits carried into this submission:
- Lao rows are OCR-recovered and capped at a lower confidence rung because of it.
- Malaysia's discovery currently surfaces predominantly English-language sources even though
  Bahasa Melayu is in scope — a real gap in language coverage, not a presentational one.
- Retrieval in Mongolian, Russian and Lao depends on a translated query table
  (`npm run -w backend translate-queries`), since the rubric's queries are authored in English.
- Dense (embedding) retrieval needs an Ollama host reachable from wherever the run executes.

---

## SECTION 5 · AI Engine Declaration

| Field | Engine A | Engine B |
|---|---|---|
| Provider and model name | Ollama, `gemma4-lex-16k` | Ollama on a rented RunPod GPU, `qwen3.8-lex-16k` |
| Exact version or checkpoint identifier | `gemma4:12b-it-q4_K_M` | `qwen3.8:27b-q4_K_M` |
| Run locally, or via a hosted API? | Local (this machine), or a GPU rented from RunPod by the interface | Hosted: a GPU rented from RunPod by the interface, running open-weights Ollama |
| Where in your interface the switch is made | **Home → Start a run → Engine** | **Home → Start a run → Engine** |
| Approximate cost of one run of two indicators, in US dollars | [TO FILL: measured cost for exactly two indicators — README records $19.32 for a 183-cell, 3-economy run ($0.106/cell) and $0.18 for one 148-read pillar; a two-indicator figure has not been isolated] | [TO FILL: not yet measured for a two-indicator run — see README "Measured Cost", Engine B has not been billed for a full pass] |
| Known weaknesses of this engine on legal text | Quantised to 4 bits; reads a provision in one pass at 16k context, a longer section is split and a definition outside the split is not seen | Quantised to 4 bits at the same 16k context, same split behaviour; served from a rented GPU, so a run depends on RunPod placing a pod and that pod's first-pull download speed; decodes roughly 20 tokens/second, several times slower than Engine A |

Both engines are open weights, satisfying "at least one open-weights model you could run
yourself" with room to spare. They differ in kind on every axis named: model family (Gemma against
Qwen), size (12B against 27B), and hosting (this machine or a rented pod, against always a rented
pod).

- ☑ The switch is made inside the interface. No file edit, no typed command.
- ☑ A second pass can run over documents already downloaded, fetching nothing new — demonstrated
  by run `545aed1e` (zero fetches, cache-only mode).
- ☑ These two engines are final and will not change after 30 September 2026, per
  `backend/data/engines.json` and `backend/test/engine-declaration.test.ts`.

**Engine comparison.** The tool produces the provision-by-provision comparison natively: both
engines' answers are recorded per run, and `frontend/lib/export/sheets.test.ts` covers building
the comparison sheet, including rows only one engine found. On the day, the comparison is built
from two exports inside the interface (**Runs → run → Export**, once per engine), matching the
Engine Comparison sheet in `OUTPUT_TEMPLATE_FINAL_ROUND.xlsx`.

---

## SECTION 6 · Your Interface, and the 5-min Walkthrough Recording

**The walkthrough recording is required, and due with this document on 30 September.**

☐ Start a run from the interface — the button, and progress shown in plain words.
[TO FILL: not yet recorded]

☐ The audit view: pick one row and show your tool's conclusion beside the source text it came
from. [TO FILL]

☐ Follow that row to its official source and show the quoted words at the cited article.
[TO FILL]

☐ Reject a row, then export, and show that the correction took effect. [TO FILL]

☐ Switch the AI engine in the interface. [TO FILL]

**Link or filename of your recording:** [TO FILL — the recording has not yet been made or filed]

**Declarations:**

☐ I certify that the statements and all information provided herein are true and complete.
[TO FILL: requires a person's sign-off, not something the repository can attest to]

---

*Submission checklist reminder (per the orientation slides and `OUTPUT_TEMPLATE_FINAL_ROUND.xlsx`
"Submission Checklist" sheet): this document, the completed
`OUTPUT_TEMPLATE_FINAL_ROUND.xlsx`, the interface walkthrough recording, and the public repository
at the release tag recorded above — see `docs/submission/CHECKLIST.md` for the full tracked list.*
