# LexDroid v2 — architecture

*Written 6 September 2026, after the close reading. Our own document, not ESCAP's. Where this
disagrees with anything in `framework/`, `finals/` or `feedback/`, those win.*

Companion documents: `INDEX.md` (where the ESCAP answers live), `lessons-from-lexdroid-v1.md`
(the method, and the ten root causes this design exists to avoid).

---

## 0. What the system is for

ESCAP researchers answer one question at a time: **for this economy, what does the law do about
this indicator?** They answer it 61 times per economy, and record what they found as rows in a
database with a citation, a timeframe and a link.

The tool automates their Zone 1 and Zone 2. ESCAP's own scoping slide says so:

> Zone 1 & Zone 2 are the hard automation problems. Zone 3 stays with a human researcher — it is
> fast once Zone 2 output is clean.

That single line settles the argument v1 never resolved. **We are not building a scoring engine.
We are building the thing that makes scoring fast and checkable.** The hackathon's own output
template has no score column, and Zone 3 carries only optional extra points.

### Scope

Singapore, Malaysia, Australia. All 12 pillars, 61 regulatory indicators. The 14 non-regulatory
indicators are excluded — ESCAP states no extraction tool is required for them.

Nothing in the design is economy-specific, because the finals need six economies and the live test
draws from nine, but breadth is not what we are building now. ESCAP's own marking guidance:

> C1a in particular: three or more diverse economies processed autonomously, with minimal
> reconfiguration between them. **Depth across three beats a thin pass over ten.**

Malaysia gives us Bahasa Melayu, so the three mandatory economies already exercise a non-English
source language.

---

## 1. The unit of work

**A cell is one economy × one indicator.** 61 × 3 = 183 cells. Every cell ends in one of exactly
three states, and never in silence:

| State | Meaning | What it carries |
|---|---|---|
| **Restricted** | one or more measures found | controlling instrument, supporting instruments, cited provisions, extracted attributes |
| **No restriction** | the governing law was found and it does not restrict | the governing instrument, a cited provision of it, a sentence saying what it does not require |
| **Unresolved** | the search did not settle it | the search record, and why — no source, unreadable document, ambiguous |

The Australia 2.2 row in ESCAP's own database is the shape of "no restriction": Commonwealth
Procurement Rules 2024, June 2024, linked, with *"No requirements to surrender source codes or use
certain encryption standards are found as a condition to win tenders."*

**A zero is a claim about a named instrument.** v1's two opposite failures — abstaining on 61
indicators because it could not prove exhaustion, and elsewhere releasing 39 unsearched indicators
as 0.0 — were both the absence of this idea. Unresolved is a real, visible, first-class state, and
it never silently becomes zero.

### Indicators are not all the same shape

Read out of ESCAP's own guidance, three shapes exist, and the pipeline treats them differently:

- **Provision-level** (most of the 61). Find the provision, cite the article.
- **Framework-level** — 7.1 and 7.2. The output template is explicit: *"7.1 and 7.2 are
  ECONOMY-LEVEL — does the framework exist, answered once per economy. Per-provision citations of
  a data-protection or cybersecurity act tagged 7.1/7.2 are not discoveries and score zero."*
  These are answered once, by identifying the instrument and its coverage, not by citing sections.
- **Practice-level** — 3.4, 5.3, 9.1. Turn on observed practice, and official reports and actual
  cases are admissible. These are the only three where secondary sources are evidence rather than
  a lead.

Mapping this into the rubric model is what stops us from generating hundreds of junk 7.1 rows, the
way v1 did.

### Controlling versus supporting evidence

From the answer key, verbatim:

> Assuming that regulations are lower than Acts in priority: not really, any legal text published by
> government body is recorded. Whether it is controlling evidence or not is determined on a
> case-by-case basis.

So a cell records **everything relevant** and marks **one controlling instrument**. The Singapore
Cybersecurity Act 2018 is controlling for 7.2; the MAS Cyber Hygiene notice is still recorded,
because it says something true about sectoral cybersecurity. This is the correct fix for the
Malaysia 4/13 failure, where v1 confused rank with coverage and threw the Acts away.

---

## 2. The four zones

ESCAP's vocabulary, not ours — and the submission checklist requires Zone 1 and Zone 2 to be
separate documented modules.

```
Zone 0  PROFILE     the economy's legal system, portals, languages, regional commitments
Zone 1  DISCOVER    register instruments -> shortlist which to read -> fetch -> parse -> index -> retrieve
Zone 2  READ        the only model stage: a shortlisted section -> facts, quoted, cited
Zone 3  DECIDE      attributes -> score by pure function; a suggestion the human confirms
        VERIFY      deterministic gates against the source
        REVIEW      the interface: audit, accept, correct, export
```

The boundary between **fetch** and everything after it is a hard one, because the live test depends
on it: the second engine pass re-reads what is already on disk and must fetch zero documents.

### Zone 0 — Economy profile

ESCAP's step 1, which v1 skipped entirely: understand the legal system before searching it. Per
economy we hold the legal system family (common law / civil law / mixed), the official languages,
the hierarchy of instrument types and what each is called locally, the official portals for
legislation, gazette and each sectoral regulator, and the regional groups the economy belongs to.

This is small, human-authored, checked-in configuration — a dozen fields per economy. It is what
makes an unseen economy tractable in an hour: someone fills in the portals and the tool runs.

### Zone 1 — Discovery

**Discover.** Per economy, walk the portals to build a register of instruments: title, official
number, type, date in force, last amended, language, URL. Seeded by *portal shape*, never by a
hardcoded list of Acts, because the live-test economy will not have one.

**Shortlist the register, before fetching anything.** The register knows the title, kind, official
number and portal of every instrument in an economy without reading one of them — 6,365 for
Singapore, from fourteen requests. Titles of legislation are unusually informative, so those titles
are embedded locally and ranked against a cell's query set, and only what that ranking names is
fetched.

This is not an optimisation added late; it is the same argument the rest of this document makes
about the read stage, applied one stage earlier. Asking every section "are you about anything?"
returns everything forever — and fetching an entire statute book in order to find the six documents
a question turns on is that mistake spent on bandwidth instead of tokens. Singapore's Acts alone are
1,048 requests and its subsidiary legislation 11,682 more.

Two things forced it from a nicety into the design. **Measured 6 September 2026: Singapore Statutes
Online will not serve a sustained crawl at all** — its firewall begins refusing us well inside the
six-second delay its own `robots.txt` invites, and slowing to fifteen seconds did not help. And the
live hour is against economies nobody has touched, where downloading the statute book first is not
an option that exists.

The recall risk is real and stated rather than hidden: a title can fail to disclose its subject.
Three things hold against it — the match is semantic and not keyword, the depth is generous, and the
shortlist with its ranks is recorded per cell, so an instrument that was never fetched is visible in
the record rather than absent from it. What must never happen is a document dropped quietly, and a
cell then reporting no restriction because of it.

**Fetch.** One request per second per host, one in flight, robots.txt honoured, on by default. A
content-addressed cache on disk. Every fetch is logged with URL, time, size and type, which is
exactly the Run Record sheet ESCAP asks for on the day. A run declares its fetch mode; in
`cache-only` mode the fetcher cannot reach the network at all, so "documents fetched = 0" is
structural rather than a promise. The cache is clearable from the interface before the clock starts.

**Parse.** HTML through a DOM parser, text PDFs through pdf.js, scans through OCR. Output is a
section tree: each section carries its heading path (`Part IV > s. 26 > (1)`), its text, its
character offsets into the stored document, its page number, and its language. Those offsets are
what make verbatim-at-anchor exact.

A document that cannot be read is recorded as **unread with a reason**. It is never treated as an
empty document. 852 Australian documents were silently certified as clean negatives in v1 for
exactly this reason. ESCAP marks the honest version up: *"a tool that flags text it could not read
is better built than one that presents everything with equal confidence."*

**Index.** One index per economy, over every section of every document, built once. Lexical search
uses a trigram tokenizer so Thai, Chinese, Cyrillic and Malay are searchable at all — v1's
`[a-z0-9]+` tokenizer produced an empty token list for non-Latin text and switched search off
without saying so. Semantic search uses a local multilingual embedding model.

Both are **corpus-wide from the start**. v1's dense index was per-document, which is the single
fact that forced it to ask every document about every indicator, 33,000 times.

**Retrieve.** Per cell, a query set is assembled from the rubric — the indicator's definition, its
score-band language, its stated exceptions, and the disambiguations from ESCAP's internal FAQ.
Lexical and semantic results are fused and the top sections go forward. The query set and the ranks
are **recorded**, because that record is the evidence behind every "no restriction" we report.

Zone 1 is deliberately generous. ESCAP again, from the answer key:

> The list doesn't have to be ranked; all relevant laws identified by this method can move on to the
> next stage. In the early stages of tool development, it is advisable to review a broader set of
> results to reduce the risk of overlooking relevant legal instruments.

Recall belongs here. Discipline belongs later, and it is not achieved by deleting things.

### Zone 2 — Read

**The only stage that talks to a model.** One call per (candidate section, pillar), carrying that
pillar's rubric only, the section text with its ancestor headings, and neighbouring context — ESCAP
notes that *"extract entire relevant section as text before and after the main identified
sentence(s) can provide important context."*

It is asked for facts, never for judgement:

- does this section impose an obligation in this pillar's area, and under which indicator
- the operative words, quoted exactly
- the sub-clause they sit in
- **the attributes the score bands turn on** — horizontal or sector-specific; personal or
  non-personal data; government data or commercial; mandatory or permissive; ban or condition;
  a specified duration where one is required; how many measures
- or "none apply", which is a first-class, easy, expected answer

Pillar-scoped rather than indicator-scoped because the disambiguations only mean anything inside a
pillar. 6.1 versus 6.4 is *ban* versus *ban unless conditions are met*; the output template calls
that one of five traps checked every round, and ESCAP's internal guide gives it a FAQ entry.

The extraction prompt is built from ESCAP's own operative vocabulary — *unless, except that,
provided that, subject to, notwithstanding, only if, to the extent, may, shall, must* — and from
the Bhutan worked example, where three sections full of "network", "access control" and "restrict
interconnections" are **not** a localisation requirement because they govern connectivity, not
where data sits.

### Zone 3 — Decide

The model produced attributes. **The score is a pure function per indicator, written once from
ESCAP's own score-band text.** Indicator 6.2, verbatim from the methodology sheet:

> 1) Local storage requirement for all sectors or personal data, OR more than one measure in
> category (2)  2) Local storage requirement applied to specific sector, specific data or
> non-personal data  3) No requirement → 1 / 0.5 / 0

That is arithmetic over five extracted facts. Same input, same score, every time — which is
criterion C2a, framework alignment at scale, and is unreachable when a model emits the number.

The score is presented as a **suggestion with its working shown**: which attribute put it in which
band, and which instrument was controlling. Zone 3 is the researcher's; we make it a confirmation
rather than a re-derivation.

---

## 3. How output volume is controlled

v1 produced 1,489 findings for Singapore against ESCAP's 80, then built 1,489 lines of regular
expressions to delete the excess — which then began deleting correct answers instead.

The fix is structural and deletes nothing:

**A provision reaches the export only as evidence cited by a cell answer.** Sections that the model
read and rejected never become rows. Sections it accepted but that no cell answer cites never become
rows. The cell answer is the unit; provisions hang beneath it.

This is why the pipeline runs cell-first rather than document-first. Asking "which provisions govern
local storage in Singapore?" returns the handful that do. Asking every section "are you about
anything?" returns everything, forever.

Expected volume, from ESCAP's own data: 70–120 rows per economy across all 61 indicators, roughly
half of them zeros. **A run producing a thousand rows for Singapore is a defect, not recall**, and
the run report says so out loud.

---

## 4. Verification

Deterministic. No model. Each gate answers a correction ESCAP's reviewers made repeatedly across the
fifteen graded submissions in `feedback/`.

| Gate | The comment it answers |
|---|---|
| the snippet appears character-for-character at the cited offset in the stored document | *"section 125 did not mention the minimum 7 years"* |
| the source URL resolves, 200, on an official government host | *"none of the reference links lead to the right document"* |
| the citation names a section, not just an act | *"a real act cited to the wrong section scores zero"* |
| the last-amended date is evidenced in the document itself | *"no evidence that the Act was last amended in 2023, please double check"* |
| the instrument is in force — not draft, not repealed, not superseded | the MAS notice cancelled 01 July 2022 |
| one measure per row | *"if the single entry includes multi measures, suggest to separate"* |
| one official URL per row, secondary links in Notes | *"add one official link for one document"* |
| the rationale quotes before it interprets, within 300 characters | said six separate times |
| the timeframe reads "Since Month Year, last amended in Month Year" | their stated format |
| an amending act is not cited in place of the principal act | *"drafts, repealed provisions, and an amending act cited in place of the principal act all score zero"* |

Six of the ten are checkable facts about the source rather than legal judgement, which is why they
belong in code and not in a prompt.

**A row that fails a gate is held for review with the failure named. It is never dropped silently,
and it is never deleted by pattern.** If we ever want to write a rule that deletes a bad answer,
that is a bug report about the question we asked in Zone 1 or Zone 2.

---

## 5. The baseline, and what NEW means

ESCAP gave us their finished database for ten economies and a 385-row legal inventory for our three.
The output template defines the Discovery Tag as *"NEW if not in sample kit; KNOWN if provided as
example."*

So the sample kit — Round 1 and Round 2 databases, the legal inventory, the portal table — is loaded
into a **baseline store used for exactly two things**:

1. **tagging** NEW versus KNOWN at export time, which is what the column means;
2. **evaluation** — measuring our answers against theirs.

It is **not readable by Zone 0, 1, 2 or 3**. Enforced by module boundary and by a test that fails if
any pipeline module imports it. If discovery were seeded from the legal inventory, every row would
be KNOWN by construction and the discovery criterion would be unearned.

The standing rule holds: we never fit our output to their database. If we find evidence that
overrides one of their findings, it ships as NEW and we say so plainly.

---

## 6. Interface

Fifteen of the ninety submission points are marked on the interface, by someone who did not build
it, and the live hour is driven entirely from it. It is a deliverable, not a viewer.

Six things a policy officer must be able to do, from ESCAP's own README table:

| | |
|---|---|
| start a run and watch progress in plain words | economy, pillars or indicators, engine, fetch mode, then one button |
| open the audit view — a result beside the source text it came from | the section rendered with the quoted span highlighted in place |
| follow a row to its official source at the cited article | a deep link to the portal at the anchor |
| accept, reject or correct a row | with an attestation on a correction, so edits are traceable |
| switch the AI engine | a control in the run form; no file edited, no command typed |
| export to the RDTII schema | fills ESCAP's own workbook, all sheets |

Plus a coverage view: 61 indicators × 3 economies as a grid, each cell showing its state. Unresolved
cells are visible, counted, and explained. That grid is the honest picture of what the system knows,
and it is the screen that would have made v1's failures obvious in a week rather than a month.

**All frontend work goes through the `/frontend-design:frontend-design` skill.** No hand-scaffolding.

---

## 7. Stack, and the criterion each choice serves

| Choice | Why |
|---|---|
| TypeScript throughout, npm workspaces, one `npm install && npm run dev` at the root | C4a — a stranger deploys it on a clean machine in under 30 minutes |
| `backend/` — a Node service holding the pipeline and an HTTP + SSE API | keeps Zone 1 and Zone 2 separable and separately documented, as the checklist requires |
| `frontend/` — Next.js 15, App Router | C3a and C3b are marked here |
| SQLite, one file | no Docker, no services, no database to provision |
| SQLite FTS5 with a trigram tokenizer | non-Latin scripts are searchable at all — C1c |
| a local multilingual embedding model, served by Ollama | corpus-wide semantic search with no proprietary API |
| Ollama for generation and embeddings | Section 3 declaration: the core pipeline runs with no proprietary API |
| open-source OCR | the no-proprietary-API rule covers OCR and translation, not just the language model |
| Server-Sent Events for run progress | live telemetry with no queue infrastructure |
| ESCAP's own workbook as the export target | their formulas and reference sheets survive intact |
| a small, targeted test suite | v1 carried 21,490 lines of tests against 31,835 lines of source |

### Layout

```
UN revamp/
  package.json          workspaces; the one command that starts everything
  docs/                 ESCAP's documentation, our lessons, this file
  backend/
    src/
      rubric/           the 61 indicators, their shapes, one score function each
      profile/          Zone 0
      discover/ fetch/ parse/ index/ shortlist/     Zone 1
      read/                                          Zone 2
      decide/                                        Zone 3
      verify/ export/
      engines/          the declared engines and the switch
      api/              HTTP + SSE
      db/               schema and migrations
    scripts/
      derive-rubric     ESCAP source documents -> the indicator model
      import-baseline   the sample kit -> the baseline store
    data/               generated, checked in, with provenance per field
  frontend/             Next.js; built through the frontend-design skill
```

**The rubric is derived, not typed.** A script reads the methodology sheet (61 indicators, criteria,
score bands), the guide's definitions and worked examples, the internal guide's FAQ, the
non-regulatory list, and the output template's Indicator Reference — which is where the pillar
weights and the five recurring traps live. Every field carries provenance back to the document it
came from. Hand-typing 61 indicators is how a rubric silently drifts from the framework it claims to
implement.

### Engines

Two declared engines, both open-weight, both local, switched from the interface. The rule is *at
least one must be open weights*; two satisfies it and makes the no-proprietary-API declaration
unconditional. Nothing leaves the machine — including OCR and translation.

Cost is recorded per run and per engine: wall clock, tokens split into billable and cache-served,
the model that answered each call, and the machine it ran on. With local engines the dollar figure
is honest and small, and the wall-clock number is the one that matters.

---

## 8. Speed is a design property, not a tuning exercise

v1 measured one economy against **one** indicator at 36 minutes 10 seconds. At that rate the 183
cells of this scope are roughly 110 hours, and the two-engine comparison is 220. A system that
cannot finish does not produce worse answers than a fast one; it produces none. Speed is therefore
a correctness property here, and it is budgeted, measured and regression-checked like any other.

It is also a submission requirement in disguise. The live test is a sealed hour against economies
we have not seen, and a demonstration nobody can sit through is a demonstration that did not
happen.

### Where the time actually goes

Four stages, four entirely different constraints, and only one of them is ours to spend:

| Stage | Bound by | Ours to spend? |
|---|---|---|
| Zone 1 — fetch | other people's servers, at the pace they ask for | no |
| Zone 1 — parse, index, embed | local CPU and GPU; once per document, forever | partly |
| Zone 2 — read | the model. **This dominates everything else combined** | yes |
| Zone 3 — decide | a pure function over extracted attributes; microseconds | free |

Optimising anything but Zone 2 is optimising the wrong thing — with one exception, below, where
Zone 1 was not slow but simply broken.

### Five levers

**1. Ask for less.** Every request declares `Accept-Encoding` and unwraps what comes back. Measured
on sso.agc.gov.sg, 2026-09-06: one Act arrived in 404,381 bytes without the header and 31,406 with
it. Thirteen times the bandwidth, taken from a government server, for byte-identical text.

**2. Concurrency belongs across hosts, never within one.** The rate limiter is per host: one request
in flight, the site's own crawl-delay between requests. That is a constraint on each host, not on
the run. Three economies and nine portals crawl in parallel at full speed with every server seeing
exactly the pace it asked for. Politeness costs wall-clock only when it is implemented as a global
queue, which is a mistake we do not make.

**3. The corpus is built once and read sixty-one times.** Fetch, parse, section and embed happen
once per document; the indicators then query an index. v1 built its semantic index *per document*,
which meant every corpus-level question had to visit every document — the reason a single indicator
cost 36 minutes. Building it corpus-wide divides the entire cost of Zone 1 by the number of
indicators that use it.

**4. The read stage's cost is the number of calls.** Bound it by construction, not by asking the
model to hurry:

- one call per **(section, pillar)**, not per (section, indicator) — twelve, not sixty-one;
- a section that several cells in the same pillar retrieve is read **once**;
- responses are cached under `(document content hash, section ordinal, pillar, prompt revision,
  engine, model)`. A re-run after a prompt change re-reads only what that change touched, and a
  re-run after a *code* change outside the read stage re-reads nothing;
- sections are submitted to the engine several at a time. A local GPU given one short prompt at a
  time is latency-bound and mostly idle; v1 measured real headroom there and never used it.

**5. Every cache is content-addressed, and every cache key carries what could invalidate it.**
Fetched bytes live under their sha256; parses key on that hash plus the parser revision; reads key
on the section plus the prompt revision and the engine. This is what makes re-running cheap without
making it stale, and it is why the second-engine pass fetches nothing at all.

### What speed may never buy

The governing rule of this rebuild is that LexDroid should produce good answers rather than produce
bad ones and delete them. The same rule applies to going faster:

- **No cheap filter may exclude evidence — only order it.** A section dropped before the model sees
  it is indistinguishable, in the output, from a section the model read and rejected. v1 measured
  this directly: a budgeted screening prompt ran 27% faster and recovered 54.8% of the findings the
  full prompt found. That is not a faster system, it is a system that stopped looking. Prefilters
  rank candidates; the retrieval depth decides what is read.
- **Retrieval depth is a declared number in the run record.** Lowering it is a legitimate choice and
  an auditable one. Lowering it silently is not.
- **The verification gates always run.** They are deterministic and cost nothing next to the model.
- **A cache is never allowed to answer for an input it did not see.** Any key that omits a thing
  that changed the answer is a correctness bug reported as such, not a performance feature.

### The budget

Targets, on the reference machine, with the actual figure recorded in every run so a regression is
visible rather than felt:

| | Target |
|---|---|
| one document fetched | the host's crawl-delay + under a second |
| Singapore Acts corpus, cold (524 Acts) | ≈ 2 h — bounded by robots.txt, paid once |
| any re-run over a warm cache | zero network requests |
| one cell answered, warm corpus | under 60 s |
| all 61 indicators, one economy, warm | under 1 h |
| the second-engine pass | zero fetches, zero re-parses |
| first result visible in the interface | under 2 s after a run starts |

Every run writes its own per-stage wall clock alongside the token and call counts already recorded.
**A run materially slower than the last run at the same revision is a defect**, and it is reported
the same way a failed verification gate is: named, with its numbers, not absorbed.

### The failure this section was written after

The Singapore Acts crawl stalled at 19 of 524 documents. Its symptom was HTTP 202 with a 2.4 KB
challenge page, so it was read as rate limiting and answered as rate limiting: back off thirty
seconds, then ninety, then four minutes, and slow every later request to that host down permanently.
The crawl ended up making two requests a minute — a fifth of the pace the site's own robots.txt
invites — and still being refused.

It was never rate limiting. Node offers TLS cipher suites in a different order from a browser, and
the CDN reads that ordering as a client fingerprint. Same machine, same address, same headers, same
minute: `curl` got the Act, every Node client got the challenge, and Node with a browser's cipher
order got the Act. One line of TLS configuration.

Two lessons are load-bearing enough to state as rules:

1. **A performance problem that responds to no amount of backing off is not a performance problem.**
   Measure the discriminator before designing around the symptom.
2. **Adaptive slowdowns must be able to recover.** The penalty here only ever grew, so one bad
   minute priced the entire remaining run. Clean responses now pay it back.

---

## 9. Build order

Not a schedule. An order, each step ending in something checkable.

1. **Skeleton.** Workspaces, schema, the derived rubric, the isolated baseline, the engine client.
   Done when 61 indicators load with their criteria, bands, shapes and provenance, and the isolation
   test passes.
2. **Zone 0 and Zone 1, Singapore.** Profile, discover, fetch, parse, index. Done when a Singapore
   Act is fetched politely, parsed into a section tree with offsets, and findable by a corpus-wide
   query in both search channels.
3. **Zones 2 and 3, Singapore pillars 6 and 7 — nine cells.** ESCAP's Singapore sheet answers all
   nine. **This is the gate.** If we do not substantially agree with them — same governing
   instruments, citations that verify against the source, scores within one band — the diagnosis is
   wrong and we re-plan rather than build on top of it.
4. **All 61 indicators, Singapore.** Every cell in one of the three states. Volume in ESCAP's order.
5. **Australia and Malaysia.** Malaysia brings Bahasa Melayu, so the non-Latin path and the
   in-language reading path get exercised here rather than being left to the finals.
6. **The interface**, through the frontend-design skill: run, monitor, audit, review, coverage,
   export, engine switch.
7. **Verification, export and comparison.** ESCAP's workbook filled from real runs; the two-engine
   comparison produced from two exports.
8. **Handover.** README against their template, Apache 2.0, a clean-machine deploy timed by someone
   who did not build it.

---

## 10. How we will know it works

1. **The Singapore 6/7 gate**, against ESCAP's own sheet.
2. **Cell completeness.** 183 cells in, 183 answered out, each in a named state. No cell silently
   absent, no unresolved cell quietly rendered as zero.
3. **Citation fidelity.** Every exported snippet re-verified against the stored document at the
   cited offset. Any mismatch fails the export, not just the row.
4. **Links.** Every source URL fetched and confirmed on an official host.
5. **Volume.** Rows per economy in the same order as ESCAP's 70–120.
6. **Determinism.** The same attributes produce the same score, asserted per indicator.
7. **Baseline isolation.** A test fails if any pipeline module can reach the sample kit.
8. **Zero-fetch second pass.** Documents fetched = 0, from the run record, structurally guaranteed.
9. **Parser acceptance.** The awkward documents in `legislations/` — a scan, a domestic-language-only
   law, a multilingual file, a consolidated volume — parse or are honestly reported as unread.
10. **Clean-machine deploy** under 30 minutes, from the README alone.
11. **The budget in §8 is met, and measured.** Per-stage wall clock is written to the run record on
    every run. A run materially slower than the last at the same revision is reported as a defect,
    and a speed-up that came from reading fewer sections is reported as a loss of recall, because
    that is what it is.

---

## 11. Risks

1. **OCR quality.** Open-source OCR on scans, especially non-English ones, is the weakest link. The
   mitigation is the honest one ESCAP rewards: flag what could not be read rather than guess, and
   keep the OCR engine swappable and documented.
2. **The Singapore gate may fail.** That is the point of putting it third. Failing it early is cheap;
   failing it in October is not.
3. **Discovery on an unseen economy** is the live-test risk and cannot be solved by curation. Zone 0
   plus portal-shaped discovery is the attempt; it gets rehearsed on an economy outside ESCAP's
   baseline, which is the only honest test of it.
4. **Two local engines** rather than one hosted and one open-weight. The criterion requires at least
   one open-weight engine, which two satisfies, and it strengthens the no-proprietary-API
   declaration — but it is a reading of the rule, and it is written down here so it is a decision
   rather than an accident.
5. **A space in the workspace folder name** (`UN revamp`) is a papercut for npm scripts on Windows
   and for anything path-sensitive. Cheap to fix now, annoying later.

## Out of scope

The 14 non-regulatory indicators · the three extra economies, until these three work · full-document
translation as opposed to reading in the source language · authentication · anything ported from the
old repository, which stays where it is, untouched and runnable.
