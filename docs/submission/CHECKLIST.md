# Submission checklist

*Drafted 30 September 2026. Sources: `docs/finals/Finalist Orientation_Slide.md` (the finals
brief), `docs/finals/submission_template_stage3_v2_CLEAN.md`, `docs/finals/README_template_FINAL_ROUND.md`,
`docs/finals/OUTPUT_TEMPLATE_FINAL_ROUND.md` (its "Submission Checklist" sheet, 29 items), and
`docs/finals/Live_Test_Short_Note_TEMPLATE.md`. Status is one of: **drafted** (a file in this
repository covers it), **needs user** (only a person can supply or attest it — a name, a date, a
recording, a signature), **needs run** (requires actually running the pipeline or the live hour).*

## 30 September — Submission and code freeze

| # | Deliverable | File | Status | Deadline |
|---|---|---|---|---|
| 1 | Submission document (Word) — deployment guide, architecture, open-source compliance, AI engine declaration, live-test readiness self-assessment | `docs/submission/submission-stage3.md` → copy into `submission_template_stage3_v2_CLEAN.docx` | **drafted**, with `[TO FILL]` marks for team name/ID/contact, release tag, walkthrough link, and cost figures | 30 Sep 2026 |
| 2 | Evidence workbook (Excel) — Output Data, Indicator Reference, Coverage Matrix sheets filled from a real run | `OUTPUT_TEMPLATE_FINAL_ROUND.xlsx` (not created here — this is a data export, not a doc) | **needs run**: export from **Runs → Export** against the run to be submitted; delete the two example rows | 30 Sep 2026 |
| 3 | Working interface, public repo, deployable at a release tag | the repository itself | **needs user**: cut and push a release tag (`git tag vX.Y.Z && git push --tags`); no tag exists yet | 30 Sep 2026 |
| 4 | README — every section of the final-round template, not only Quick Start | `docs/submission/README-final.md` → copy to repository root `README.md` at the release tag | **drafted**, with `[TO FILL]` marks for team name, cost figures, walkthrough link | 30 Sep 2026 |
| 5 | LICENSE — Apache License 2.0 | `LICENSE` (repository root) | **drafted** — already present and verbatim Apache-2.0 | 30 Sep 2026 |
| 6 | 5-minute interface walkthrough recording (start a run; audit view beside source; follow a row to its cited article; reject a row, export, show the correction; switch the engine) | not yet created | **needs user**: requires actually recording a screen capture | 30 Sep 2026 |
| 7 | Section 5 engine declaration frozen — two engines, at least one open-weights, unchanged after this date | `backend/data/engines.json`, `backend/test/engine-declaration.test.ts` | **drafted** — both engines declared, open-weights, test passing as of last run | 30 Sep 2026 (cannot be corrected after) |

### From the Output Template's own Submission Checklist sheet (29 items, mapped)

| # | Item | File / evidence | Status |
|---|---|---|---|
| 1 | Repository public and accessible | GitHub `sidreyli/lexdroid` | **needs user**: confirm repo visibility is public |
| 2 | Final release tag recorded | — | **needs user**: no tag cut yet |
| 3 | LICENSE contains Apache 2.0 text | `LICENSE` | **drafted** |
| 4 | README complete, every section | `docs/submission/README-final.md` | **drafted**, `[TO FILL]` remain (team, costs, recording link) |
| 5 | README Quick Start reaches a working system in under 30 minutes | `docs/submission/README-final.md` §Quick Start | **drafted** — matches actual `package.json` scripts; **needs user**: time it on an actually clean machine |
| 6 | Deployment guide in Stage 3 template, Section 1 | `docs/submission/submission-stage3.md` §1 | **drafted** |
| 7 | Someone who did not build it deployed it, clean machine, under 30 minutes | — | **needs user**: an independent deploy timing has not been recorded |
| 8 | Docker/Python env documented, no hardcoded paths | README §Quick Start (Node-only, no Docker/Python needed) | **drafted** — this pipeline needs neither Docker nor Python; stated plainly rather than left implicit |
| 9 | AI model backend swappable from inside the interface, no code/config change | `backend/src/engines/ollama.ts`, **Home → Start a run → Engine** | **drafted** |
| 10 | Zone 1 and Zone 2 separate, documented modules | `backend/src/discover/`, `backend/src/fetch/`, `backend/src/read/`; `docs/architecture.md` | **drafted** |
| 11 | Human-review audit interface works, usable by a non-technical policy officer | `frontend/` **Workbench** | **drafted** in code; **needs user**: no independent non-technical usability check on record |
| 12 | Core pipeline runs end to end on the open-weights engine alone, no proprietary API | Engine A, local Ollama; `.env.example` | **drafted** |
| 13 | All dependencies listed with licences, Stage 3 Section 3 | `docs/submission/submission-stage3.md` §3 | **drafted** |
| 14 | Output Data sheet complete — indicator IDs as text, verbatim snippets, live source URLs | export from a run | **needs run** |
| 15 | Coverage Matrix shows 3+ economies | export from a run | **needs run** (repository has run 8 economies; the exported workbook must reflect this) |
| 16 | Both mandatory pillars covered (6 and 7) | all 8 economies read pillars 6/7 per `docs/where-we-differ-from-escap.md`, `docs/three-economies-results.md` | **drafted** in the pipeline; **needs run** for the final exported workbook |
| 17 | At least one non-English source recorded | India (hi), Thailand (th), Lao PDR (lo), Mongolia (mn), Russian Federation (ru) all read | **drafted** |
| 18 | Working interface deploys from the repo at the declared tag | — | **needs user**: verify after cutting the tag |
| 19 | Interface walkthrough recording made | — | **needs user** (same as item 6 above) |
| 20 | Two AI engines declared — one open weights (both are, here) | `backend/data/engines.json` | **drafted** |
| 21 | Engine switch inside the interface, steward can watch | **Home → Start a run → Engine** | **drafted** |
| 22 | Second pass re-reads downloaded documents, fetches nothing new | *Sources → Read only what is already on disk*; run `545aed1e` demonstrates it | **drafted** |
| 23 | Tool can produce the Engine Comparison sheet, or build it from two exports | `frontend/lib/export/sheets.test.ts` | **drafted** |
| 24 | Run starts from a button; progress in plain words; review/export in the interface | **Home**, **Workbench**, **Runs** | **drafted** |
| 25 | Politeness limits on by default | `backend/src/fetch/index.ts` | **drafted** |
| 26 | Cache and downloaded-document folders clearable on screen before the clock starts | [TO FILL: confirm a UI control exists for this, distinct from the CLI cache-clear path] | **needs user** to confirm, or a small feature if missing |
| 27 | Cost recorded per run and per engine, in US dollars | `run_cost` table; `npm run -w backend benchmark` | **drafted** in the pipeline; **needs run** for the numbers actually submitted |
| 28 | Ready for any of the nine 2025 RDTII economies and their languages, in any pillar | Ready: Thailand, India, Lao PDR, Mongolia, Russian Federation (5 of 9). Not run: Viet Nam, Indonesia, China, Kazakhstan (4 of 9) | **drafted honestly, not complete** — state this plainly in the submission, do not claim readiness for the four unrun economies |
| 29 | Interface left available for the marking period after submission | — | **needs user**: keep the deployment (or hosting) running through 14 October |

## 15 October — Grand Finale (live test, sealed)

| # | Deliverable | File | Status | Deadline |
|---|---|---|---|---|
| 1 | Evidence file (export from Engine A's pass) | produced during the hour | **needs run** — cannot be prepared in advance | 15 Oct 2026, AM |
| 2 | Comparison file (Engine Comparison sheet, provision-by-provision) | produced during the hour, from two exports | **needs run** | 15 Oct 2026, AM |
| 3 | Run record (every document fetched, per-engine timing and cost) | produced during the hour, from `fetch_log` and `run_cost` | **needs run** | 15 Oct 2026, AM |
| 4 | Short note | `docs/submission/live-test-note-draft.md` | **drafted as a skeleton only** — every substantive field is `[TO FILL]` on the day | 15 Oct 2026, AM, with the other three |

## Also required, not part of the four documents (from the orientation slide's "Required Information")

| Item | Status | Deadline |
|---|---|---|
| Passport bio-page copy, departure airport, mobile number, emergency contact, dietary needs, personal e-mail, bank transfer details, invitation-letter details | **needs user** — none of this is in the repository | Sent to `escap-digitaltrade-hackathon@un.org`, cc `thapanee.su@kmitl.ac.th`; [TO FILL: exact date this is due — orientation slide does not give one separate from 20 Sep portal-link date] |
| Submission Portal link | **needs user** — external, not in this repository | Sent to finalist teams no later than 20 Sep 2026 (per orientation slide) — [TO FILL: confirm it was received] |

## What this checklist deliberately leaves out

Per the task constraints for this drafting pass: no ESCAP scores, ESCAP answers, or per-cell
agreement numbers appear anywhere above, and `bench-pack/` was not read. Wherever a benchmark
total or a measured cost figure is needed, it is marked `[TO FILL]` for the user to insert from the
current run.
