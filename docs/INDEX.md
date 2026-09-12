# UN ESCAP hackathon documentation

Everything ESCAP has published to finalists, ported from the previous workspace on 6 September 2026.

LexDroid's implementation notes:

- `india-integration.md` — implemented Central-law foundation, supplied-document acceptance
  evidence, rollout sequence and declared India-specific limits.

Each document appears twice: the **original** (`.pdf`, `.xlsx`, `.docx`, `.csv`) and a **readable
text extraction** (`.md`) with the same basename. Read the `.md`; open the original when the layout
matters, which for the spreadsheets it does.

Two things were changed on the way across, and nothing else:

- **Workshop video is not here.** Four recordings totalling 1.9 GB, plus a 1.9 GB archive, were left
  behind. The slide decks that accompany them are here in full.
- **Paths were shortened.** The source tree reached 226 characters, past what git handles on
  Windows. Longest path here is 126. `_manifest.tsv` maps every file back to where it came from.

---

## Where the answers are

**What we must deliver, and how it is marked**
- `finals/Finalist Orientation_Slide.md` — the finals brief: four deliverables, the full rubric,
  the eight-country list, the Grand Finale schedule, the five differences from Round 1.
- `finals/README_template_FINAL_ROUND.md` — the repository README contract. The 30-minute
  clean-machine deployment rule, the two-engine declaration, polite-crawling limits, the
  no-proprietary-API rule covering OCR and translation, measured cost, known limitations.
- `finals/OUTPUT_TEMPLATE_FINAL_ROUND.xlsx` — the actual output file we fill. Fourteen columns plus
  an auto-derived pillar. **No score column.** Seven sheets.
- `finals/submission_template_stage3_v2_CLEAN.md` — the Word submission: the nine sealed live-test
  economies, the engine declaration, the five walkthrough demonstrations.
- `finals/Live_Test_Short_Note_TEMPLATE.md` — what we hand in during the live hour, including
  "provisions you believe absent from the 2025 baseline" and the zero-fetch check on engine B.

**The framework itself**
- `framework/ESCAP-RDTII-2.1-guide.md` — the full guide. Per-indicator definitions, worked examples
  from real economies, scoring metrics, score bands. The primary source for what each indicator means.
- `framework/ESCAP-RDTII-2.1- internal guide.md` — **how ESCAP's own researchers work.** The manual
  process the tool is meant to automate, the policy-measure coverage rules, and an FAQ that settles
  the disambiguations that matter (6.1 vs 6.4, 5.5 vs 9.4, 11.2 vs 11.3, what makes 7.1
  "comprehensive", what makes 7.3 a "minimum").
- `framework/ESCAP-RDTII-2.1- Non-regulatory indicators.md` — the fourteen indicators drawn from
  third-party databases, where ESCAP states no extraction tool is required.

**Ground truth**
- `database/ESCAP-RDTII-2.1_ Round 1 Database.xlsx` — Australia, Malaysia, Singapore. Complete,
  all 61 regulatory indicators, with the `RDTII 2.1 Methodology` sheet carrying the verbatim
  criteria and score bands.
- `database/ESCAP-RDTII-2.1_ Round 2 Database.xlsx` — China, India, Indonesia, Lao PDR, Mongolia,
  Russian Federation, Thailand. Seven of the nine sealed live-test economies.
- `database/Singapore, Malaysia, Australia, Legal Inventory.csv` — 385 instrument-to-indicator rows
  across all twelve pillars for the three mandatory economies.
- `database/sample-government-portals-pillar-6-7.csv` — 94 rows of source families for pillars 6/7.

**How ESCAP marks the work**
- `feedback/` — fifteen other teams' filled databases carrying ESCAP's own reviewer comments in the
  margins. This is the marking scheme in the reviewers' own words.
- `assignments/Answer Key and Feedback.md` — the worked answer key: the outdated MAS notice, the
  dead URL, and the ruling that regulations are not ranked below Acts.

**Method**
- `workshops/12jun-ai-assisted-legal-document-Qian-Xiao.md` — "Do not collapse evidence into scores
  too early. Keep source fragments, interpretations, and scoring decisions separate."
- `workshops/04jun-statute-structure-Henry-Gao.md` — statute anatomy and operative verbs.
- `workshops/12jun-rag-and-llms-Rathachai-Ch.md` — retrieval architecture.

**Test material**
- `legislations/` — ESCAP's own awkward cases: a scanned PDF, a domestic-language-only law, a
  multilingual file, a consolidated volume. These are the parser's acceptance tests.

**Our own notes** (not from ESCAP)
- `lessons-from-lexdroid-v1.md` — what the method actually is, and the ten root causes of
  where the first build went wrong against it. Read this before planning anything.
- `architecture.md` — the design of the rebuild: four zones, the cell as the unit of work, how
  volume is controlled without deleting anything, and what has to be true before we believe it.
- `synthesis/` — three summaries of the finals contract. Useful, but the primary sources above win
  wherever they disagree.

---

## Folders

| Folder | Holds |
|---|---|
| `finals/` | The final-round contract: orientation, README template, output template, Word submission, live-test note |
| `framework/` | RDTII 2.1 guide, ESCAP's internal researcher guide, the non-regulatory indicator list |
| `database/` | ESCAP's completed databases for ten economies, the legal inventory, the portal table |
| `feedback/` | Fifteen graded team submissions with ESCAP's reviewer comments |
| `assignments/` | The two take-home assignments, the answer key, format requirements |
| `workshops/` | Presentation decks from the June workshop series |
| `legislations/` | ESCAP's sample legal documents, including scans and non-English sources |
| `round1-templates/` | The superseded Round 1 templates, kept for comparison |
| `synthesis/` | Our own earlier summaries |
