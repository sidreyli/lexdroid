# LexDroid: Zone 0, 1 and 2 fix plan

**Status:** proposed implementation handoff; fixes have not been implemented.

**Audit baseline:** `master`, commit `11dc925`, reviewed on 19 September 2026.

**Target economies:** Singapore (`SGP`), Malaysia (`MYS`), Australia (`AUS`) and India (`IND`).

## 1. Objective and instructions for the implementing agent

Make the discovery and extraction pipeline trustworthy before the four economy runs. Work from the actual implementation and primary ESCAP material. Comments, existing tests and previous outputs are evidence to examine, not proof of correctness.

Implement the work in dependency order below. First reproduce each defect with a focused fixture, then fix it, then demonstrate the intended behavior. Keep unrelated refactoring out of each change. Record any finding that does not reproduce at the current commit rather than implementing a speculative fix.

This document is self-contained: the implementation agent does not need the earlier conversation or the temporary audit report. File and line references identify the audited implementation; line numbers will move as fixes land.

### Boundaries

- Preserve existing source bytes, historical readings, confirmations, exports, review decisions and cost records. Do not start by deleting or rebuilding the working corpus.
- Use in-memory databases and isolated temporary snapshots/caches for development. Test schema changes against a consistent database copy before migrating the working database.
- Keep the completed ESCAP databases and legal inventory in the evaluation quarantine. Do not use their answers to seed discovery, choose laws, write economy-specific extraction shortcuts or improve prompts against the holdout set.
- Do not replace missing evidence with model inference, a default value or a clean negative.
- Keep Zone 2 evidence and interpretation separate from optional Zone 3 scoring. This is not a request to redesign the scoring system, except where its interfaces corrupt or conceal Zone 2 results.
- Do not begin full crawls or paid economy runs as part of reproducing code defects. Use the readiness gates in section 9 before proceeding to production execution.
- Read applicable `AGENTS.md` instructions before editing. Frontend changes have additional instructions in `frontend/AGENTS.md`.

### Required outputs

1. Focused implementation changes with regression tests.
2. A migration and rollback procedure, including handling of legacy data.
3. A reproducible acceptance set and separate measurements for discovery, parsing and extraction.
4. A four-economy readiness report that distinguishes ready, partial, failed and unsupported work.
5. A list of remaining legal/source questions that require primary-source verification or human review.

## 2. Primary requirements to read first

These files are present locally but some are intentionally Git-ignored. Do not redistribute ESCAP materials or the completed answers merely to make the tests convenient. Repositories without the originals must document that prerequisite; never silently substitute invented reference data.

| Material | What governs this work |
|---|---|
| [Internal researcher guide](<framework/ESCAP-RDTII-2.1- internal guide.md>) | Enforced measures; official sources; draft/repeal exclusions; practice exceptions for 3.4, 5.3 and 9.1; horizontal and sectoral coverage. See approximately lines 94–136. |
| [RDTII 2.1 guide](framework/ESCAP-RDTII-2.1-guide.md) | Indicator definitions, scope, exceptions and scoring criteria. |
| [Non-regulatory indicators](<framework/ESCAP-RDTII-2.1- Non-regulatory indicators.md>) | Fourteen indicators outside the legal-extraction task. |
| [Final output template](finals/OUTPUT_TEMPLATE_FINAL_ROUND.md) and its `.xlsx` original | Exact quotation, provision/location, official URL, legal metadata, source language, and the mapping traps around line 100. |
| [Final README contract](finals/README_template_FINAL_ROUND.md) | Engine selection, reproducibility, zero-fetch second pass, polite crawling and measured cost. |
| [Finalist orientation](<finals/Finalist Orientation_Slide.md>) | Evaluation and broader finals economy/language coverage. Four economies alone do not satisfy the entire finals minimum of six economies. |
| `docs/legislations/` | Supplied difficult parser cases: scans, multilingual documents, domestic-language sources and consolidated volumes. |

Retain these particular distinctions in the acceptance set:

- 7.1 and 7.2 are economy-level framework questions, not per-provision discoveries.
- 7.3 requires a specified minimum retention duration; a deadline or unspecified prescribed period is insufficient.
- 7.5 concerns government access to personal data and the relevant independent judicial authorisation distinction.
- 6.2 needs a storage location, not merely record-keeping.
- A transfer permitted subject to conditions belongs under 6.4 rather than an unconditional 6.1 ban.
- Drafts, repealed provisions and an amending instrument cited instead of the operative principal text do not establish current measures.
- Legal rank, bindingness, sectoral reach and temporal status are different facts. Do not derive one solely from another.

The derived rubric currently has 61 regulatory indicators, 14 excluded non-regulatory indicators and 12 pillars. Verify those invariants and source provenance without leaking the completed economy answers into the pipeline.

## 3. Baseline evidence and limits

These are observations from the audit, not targets or promises about the live sources.

| Economy | Registered instruments | Stored documents | Stored sections | Unread documents |
|---|---:|---:|---:|---:|
| SGP | 6,857 | 1,138 | 31,447 | 82 |
| MYS | 16,863 | 1,627 | 76,941 | 26 |
| AUS | 28,488 | 1,285 | 76,839 | 37 |
| IND | 12,915 | 0 | 0 | 0 |

Document totals include unread documents. Registered-to-parsed ratios are not recall scores because materialisation is deliberately selective. India nevertheless has no parsed evidence at all.

Existing checks passed for 4,050 document hashes, 185,227 section offsets, FTS counts and the stored bge-m3/1024 section embeddings. The original test baseline passed 1,003 backend tests, 36 frontend tests and typechecking. Those checks did not detect the issues below.

Additional observations:

- 643 sections exceed the reader's 12,000-character limit: AUS 353, MYS 135 and SGP 155.
- The current language exclusion matches 6,803 Malay sections. This is not a claim that every excluded section is unique; the predicate does not check equivalence.
- There are 3,282 globally stored confirmations, including 2,694 negatives and one recorded failure. Their individual legal correctness was not adjudicated.
- `robots_snapshot` has no rows despite historical fetch activity. This limits retrospective evidence; it does not prove that historical requests violated robots rules.
- The existing audit reports several empty India source portals and Malaysian Customs/MyIPO gaps. A register containing many instruments does not establish coverage of every relevant source family.

The review did not freshly verify live portal availability, every current law version, every authoritative-language rule, or legal recall across all indicators. Those are validation tasks, not claims to infer from passing unit tests.

## 4. Implementation order and ownership

| Work package | Depends on | Deliverable |
|---|---|---|
| A. Evidence/state contracts and versioning | Baseline inspection | Migration design, immutable evidence references and explicit completeness states |
| B. Zone 0 scope and source classification | A's contracts | Structured jurisdiction, language and admissibility policies |
| C. Discovery/fetch correctness | A, B | Freshness, pagination, retry and host-policy enforcement |
| D. Parsing/index/retrieval correctness | A, B; fixtures from C | Versioned parses, repeal/completeness propagation, multilingual retrieval |
| E. Zone 2 reader/confirmation correctness | A; coordinate inputs with D | Validated facts, complete-input handling and independent confirmations |
| F. Review output and readiness | A–E | Honest evidence export, independent comparisons and completion gates |
| G. Offline evaluation and run preparation | A–F | Acceptance results and an economy-by-economy go/no-go report |

If parallel agents are used, assign C, D and E only after agreeing A's shared contracts. Give one owner to database migrations and shared types. Do not let separate agents concurrently change confirmation keys, section identities or completeness semantics.

## 5. Work package A: preserve evidence and define truthful states

### A1. Establish a reproducible baseline

- Record the actual commit, working-tree changes, schema version, configured model identities and corpus counts. Do not print secrets.
- Capture relevant tests and existing outputs before modifying behavior.
- Use SQLite's backup facilities or another consistent snapshot method. Do not copy only the main database file while ignoring a live WAL.
- Review scripts before running them: `zone1-audit` currently calls the schema-initializing `openDb()`, so it is not a strictly read-only database inspection command.

### A2. Introduce explicit, persistent completeness and provenance

Use existing tables where suitable; the following are required semantics, not a prescribed new schema for every field:

| Boundary | Required information |
|---|---|
| Portal walk | Run/discovery session, source, start/end, complete/partial/refused/failed, expected/observed counts where available, continuation and failure details |
| Instrument | Stable legal identity, source membership, first/last seen, status evidence, jurisdiction, edition/language relationships |
| Source version | Immutable bytes/hash, request/final URL and redirect chain, retrieval time and source metadata |
| Parse version | Source version, parser/version/options, text, sections, offsets, missing pages/provisions, OCR language/quality, provision status |
| Reader attempt | Run, actual engine/model, prompt/schema version, source/parse version, exact input spans, completed/partial/failed, output and cost |
| Confirmation | The same provenance plus measure/question identity and an explicit positive/negative/failed outcome |

Downloaded, parsed, partially parsed, unread, indexed, examined and successfully extracted must not collapse into one `read` boolean. A successful empty model answer is different from malformed output, an engine failure, incomplete input and an unsupported question.

### A3. Preserve historical runs through refresh/reparse

**Finding:** `backend/src/parse/index.ts:151` deletes old documents/sections; `backend/src/db/schema.sql:442` cascades section deletion into readings. `backend/src/run/reanchor.ts` releases reading links and may fall back to ordinal position when a former heading disappears. Other references can instead make a reparse fail with a foreign-key error.

**Implementation:** make source/parse versions immutable once referenced by a run. A new parse or fresh source creates a new version and current-version selection; it must not rewrite a completed run's evidence. Avoid ordinal-only reattachment. If a legacy repair is necessary, record it separately and keep the original evidence accessible.

**Acceptance:** refresh text, reorder sections and change parsing boundaries on a fixture. The old run retains its original quote, offsets, readings, reviews and cost records; a new run can use the new version. A failed migration leaves the original usable.

### A4. Scope confirmations without destroying legacy rows

**Finding:** `measure_confirmation` in `backend/src/db/schema.sql:645` is unique only by section/indicator/measure. `backend/src/read/confirmations.ts:46` loads every successful confirmation, and decisions/rescoring/exports consume that global set.

**Implementation:** key new results by run and immutable evidence/question identity; include actual engine/model and prompt/schema provenance. Preserve existing rows as explicitly legacy/unscoped. New runs must not silently consume them. Historical replay can expose a clearly labelled legacy mode without pretending it is an independent new engine pass.

**Acceptance:** opposite confirmations from Engine A and Engine B coexist; exporting or rescoring A after B produces the same A results. Interrupted retries within the same run resume correctly. Preserve every legacy record and test migration repeatability.

## 6. Work packages B–D: Zone 0 and Zone 1

### B1. Make jurisdiction and language scope operational

**Finding:** `backend/data/profiles/IND.json` describes Central-law scope but omits `jurisdictionScope`; the India Code adapter filters CENTRAL records. The MYS profile declares Malay authority, whereas retrieval always prefers English. OCR at `backend/src/parse/ocr.ts:48` packages only English and Hindi.

**Implementation:** declare the actual held/omitted India tiers, then carry them into coverage reports and negative conclusions. Verify language-authority rules against primary sources, including document-specific exceptions, before changing legal assertions. Distinguish source language, translation language, authoritative edition and installed OCR capability.

**Acceptance:** a Central-only corpus cannot support an unqualified all-India absence conclusion. Unsupported-language scans yield an explicit limitation; supported multilingual samples preserve exact source-language quotations.

### B2. Separate legal instruments, guidance and practice evidence

**Finding:** classification by title/kind and profile-wide bindingness is insufficient to prove that a particular document imposes an operative duty. Official publication alone is insufficient. The current discovery/parser filters also reject classes of material admissible for practice indicators.

**Implementation:** keep instrument kind, legal status, bindingness, jurisdiction, source class and effective dates distinct. Unknown status remains unknown and reviewable. Record the evidence for bindingness/enabling authority instead of deriving it solely from a word such as Act, guideline or circular. Add the practice path described in E6.

**Acceptance:** an Act, binding subordinate instrument, nonbinding guideline, consultation, amendment, repealed provision and official practice report follow their intended paths. A lower-ranked binding instrument is not discarded merely because an Act exists.

### C1. Separate refresh, reparse and cache-only operations

**Finding:** `backend/src/discover/index.ts:389` changes row selection for `refresh`, but `:432` does not pass refresh into fetch or adapter resolution. `backend/src/fetch/index.ts:724` can therefore return old cached bytes.

**Implementation:** define and propagate separate policies for fetching a current source, reparsing a saved version and reading a frozen corpus. Apply freshness policy to all adapter components: listings, wrappers, API pages, PDF/EPUB parts and language editions. Record freshness/currentness independently from retrieval date. A cache-only reader must not fall back to the network.

**Acceptance:** a source changing v1 to v2 produces a new hash under refresh, preserves v1, and does not relabel old bytes as freshly fetched. Reparse uses the saved bytes. Cache-only refuses missing resources and makes zero source requests.

### C2. Persist discovery completeness and stale membership

**Findings:** register conflict updates at `backend/src/discover/index.ts:82` ignore some refreshed metadata; omitted entries retain old status. Generic crawl caps at 60 pages. SSO, FRL, India Code, WordPress, Drupal and sitemap paths have caps/shortfalls that are logged incompletely or not persisted. India Code document resolution stops after 20 section pages at `backend/src/discover/indiacode.ts:396`.

**Implementation:** persist walk coverage and continuation per adapter. Refresh metadata only with the relevant evidence and keep its history. Missing membership is a stale/unverified condition, not automatic repeal. Never use a partial listing as proof that an omitted instrument no longer exists. Record expected/seen pages/items where the source provides them; otherwise record the actual bounded search scope.

**Acceptance:** interrupted pagination, cap exhaustion, total-count mismatch and an unexpectedly empty page produce durable gaps. A 2,001-section India fixture cannot be marked complete after 2,000 sections. Complete and partial listing omissions behave differently, and neither invents repeal.

### C3. Correct unread state and retry behavior

**Finding:** `backend/src/shortlist/index.ts:455` treats `EXISTS(document)` as read. Default materialisation at `backend/src/discover/index.ts:397` skips any instrument with a stored document, including unread ones.

**Implementation:** use A2's states to decide eligibility. Retry appropriate transient/parse failures after conditions change, with bounded attempts and explicit permanent unsupported states. Do not retry successful immutable evidence unnecessarily.

**Acceptance:** a zero-section unread document never establishes examination. A first failed parse followed by a corrected parser can succeed through the normal workflow. Persistent failures remain visible in readiness and are not called legal absence.

### C4. Enforce host policy for every source request

**Findings:** `backend/src/fetch/index.ts:385` reads only the wildcard robots group and uses plain-prefix matching; longer crawl delays are capped at 30 seconds. The redirect interceptor at `:72` bypasses per-hop destination checks/logging. Queue state at `:455` belongs to one Fetcher instance.

**Implementation:** correctly select named/grouped user agents and match robots rules; honour longer delays or defer/decline the crawl. Enforce destination robots, rate limits and provenance for each redirect hop. Coordinate aggregate limits across concurrent fetchers/processes or explicitly serialize source acquisition. Associate robots snapshots with the requests that used them; do not manufacture historical evidence.

**Acceptance:** named-agent precedence, grouped agents, wildcards, end anchors, Allow ties, a delay over 30 seconds, cross-host disallowed redirects and two concurrent fetchers are covered by local-server tests. Every outbound source request is accounted for. Cache reads alone do not imply current robots verification.

### D1. Preserve provision status and partial extraction

**Findings:** parsers compute `ParsedSection.repealed`, but `backend/src/parse/index.ts:168` drops it at storage. SSO at `parse/sso.ts:294` returns readable results with missing live provisions. PDF at `parse/pdf.ts:542` can lose OCR pages while passing the document-wide character threshold. Partial metadata is logged without governing later conclusions.

**Implementation:** persist provision status and missing-page/provision information with each parse version. Keep historical/repealed content inspectable but exclude it from operative current-law findings. Propagate completeness to retrieval and decisions. Keep anchored positives from recovered complete portions where valid; do not throw away good evidence just because another page failed. Prevent the partial document from supporting whole-document absence.

**Acceptance:** fixtures for SSO/PDF/FRL/India repeal survive parse-store-retrieve round trips. One missing operative page/section produces a partial outcome and blocks absence, while a valid quote on another recovered page remains reviewable. OCR output must retain original page provenance and quality limitations.

### D2. Correct identity and temporal metadata

**Findings:** `backend/src/parse/frl.ts:167` writes compilation/in-force-as-at dates as `lastAmendedOn`; storage has a separate `current_to`. `backend/src/parse/identity.ts:34` removes numeric tokens, allowing conflicting enactment years to match. SSO/FRL helpers accept impossible calendar dates.

**Implementation:** distinguish enactment, commencement, amendment, consolidation/current-to and retrieval dates. Only populate each from matching evidence. Compare official numbers and explicit enactment years when both sides provide them, while allowing omitted years and later compilations of the same Act. Hold conflicts for review instead of silently relabelling a document.

**Acceptance:** compilation-only evidence never becomes last-amended. Different enactment years/numbers are detected; a later reprint of the same Act remains compatible. `31 February` is rejected as metadata. Staged commencement must not imply that every provision commenced on the first stage.

### D3. Replace instrument-wide language exclusion

**Finding:** `backend/src/retrieve/index.ts:408` fixes preference to English. `otherLanguageCopies()` at `:420` excludes every non-English section when any English section exists for the instrument, without checking equivalent provisions or versions.

**Implementation:** deduplicate only proven corresponding provision/version pairs. Keep unmatched source-language evidence available. Apply an explicit language/authority policy after equivalence is established, and record translation status. Do not merely swap the hard-coded language from English to Malay; that reproduces the coverage defect in the opposite direction.

**Acceptance:** one English section plus ten Malay-only sections retains all unmatched provisions. Equivalent complete editions do not double-count measures. Differing editions or uncertain alignments remain visible. The exported quotation matches the cited language/version.

### D4. Validate indexes and retrieval coverage

**Finding:** `backend/src/index/index.ts:216` allocates matrices from the first vector's dimension without checking all blobs. Title/heading ranking at `backend/src/shortlist/index.ts:213` and `:325` uses minimum-length dot products.

**Implementation:** validate embedding model/version, output count, dimensions, byte length and finite values at storage/load/query boundaries. Keep index metadata tied to the immutable parse and embedding configuration. Report incompatible vectors explicitly. Measure ranking/shortlist recall separately from parsing and reader accuracy; top-N is a search budget, not completeness proof.

**Acceptance:** mixed dimensions, truncated blobs, NaNs, missing vectors and incorrect response counts fail clearly. A parser/model change cannot silently reuse incompatible vectors. Measure retrieval of known relevant provisions at the configured depth on the held-out evaluation set.

### D5. Resolve smaller provenance defects

- `backend/src/parse/indiacode.ts:171` labels structured API extraction as HTML. Distinguish it in provenance, or document a deliberate compatibility encoding that remains unambiguous to reviewers.
- `backend/src/discover/index.ts:467` updates instrument language only when date/number metadata is present. Update independently when justified; section/document language is more precise than one language for a bilingual instrument.
- Confirm PDF page references, HTML fragments and composed API/EPUB provenance resolve to the version actually read. A URL containing `#` is not proof of a correct pinpoint citation.

## 7. Work package E: Zone 2 extraction and confirmation

### E1. Validate responses at runtime

**Findings:** `backend/src/read/index.ts:896` converts malformed output into successful empty findings. `backend/src/read/confirm.ts:141` converts malformed/missing words into a negative confirmation. `coerce()` defaults missing duty force to requires, mandatory to true and actor kind to organisation. A requested generation schema does not guarantee a conforming response.

**Implementation:** use a versioned runtime schema for provision, framework and confirmation outputs. Distinguish explicit empty findings and explicit null confirmation from malformed JSON, missing fields, wrong types and invalid individual findings. Preserve raw responses and validation failures in the attempt record. Do not silently discard malformed objects or invent substantive legal facts. Decide and document whether a partly valid response preserves valid items with partial status or fails as a whole.

**Acceptance:** invalid JSON, `{}`, null roots, wrong array/word types, missing force/mandatory/actor fields and mixed valid/invalid findings never establish successful absence or an invented duty. Explicit valid empty responses remain valid. Historical responses are interpreted under their recorded schema, not silently coerced as new-schema results.

### E2. Make confirmation retries and independence correct

**Finding:** `backend/src/read/confirm-pass.ts:89` considers any stored row answered, including failed attempts.

**Implementation:** use A4's run-scoped identity; skip only completed applicable verdicts. Retain failed attempts and retry eligible failures. Include confirmation calls in token/cost records and actual engine routing. Separate resuming an interrupted attempt from reusing a different run's answer.

**Acceptance:** failed then successful confirmation works without deleting history. Explicit negative is not retried as though it were a transport failure. A different model, prompt, source version or independent engine pass cannot inherit the old verdict accidentally.

### E3. Handle complete provision text and relevant context

**Finding:** primary and confirmation prompts at `backend/src/read/index.ts:395` and `backend/src/read/confirm.ts:73` truncate after 12,000 characters without downstream completeness state. Framework prompts also have bounded openings/provision text.

**Implementation:** use clause-aware windows with the necessary parent text, definitions and linked exceptions. Record the exact spans presented, overlaps and unresolved dependencies. Aggregate findings without duplication. If full relevant coverage is unavailable, mark the result incomplete and prevent negative conclusions over unseen text. Head-and-tail alone does not solve missing middle text.

**Acceptance:** duties and exceptions before, across and after window boundaries are correctly related. A duty beyond character 12,000 is found or explicitly left unresolved. An incomplete confirmation cannot veto a supported finding as though it had read the whole provision.

### E4. Require evidence for framework conclusions

**Findings:** `backend/src/read/index.ts:1324` treats incomplete but valid JSON as a successful framework examination; `cell/index.ts:424` counts it toward coverage. `decide/index.ts:2361` can treat unknown bindingness as horizontal. Subject verification at `read/index.ts:1129` uses English phrases only.

**Implementation:** validate framework responses separately; count only successful relevant examinations. Require evidence for subject, dedication and scope, with language-aware verification. Do not infer horizontal coverage solely from failure to find a sector restriction. Preserve economy-level treatment for 7.1/7.2 and qualify absence to the source/jurisdiction coverage actually examined.

**Acceptance:** `{}` and partial inputs cannot establish no framework. An unknown-kind instrument cannot establish comprehensive horizontal coverage by default. Supported equivalent English/Malay/Hindi examples retain their original quotes and are judged consistently. Sectoral and comprehensive frameworks remain distinguishable.

### E5. Validate the legal relationship between quoted facts

**Finding:** `backend/src/read/index.ts:780` checks whether phrases occur somewhere in a provision, not whether the actor, act, subject, exception and scope belong to the same legal proposition.

**Implementation:** retain spans for each field and evidence of their relationship. Allow legitimate linked definitions and cross-referenced exceptions; do not impose a simplistic same-sentence restriction. Hold combinations that cannot be supported. Exact phrase occurrence verifies quotation, not legal entailment.

**Acceptance:** a fixture with unrelated duties and actors cannot be recombined into a false obligation. A genuine duty with a separately defined term or incorporated exception can pass with the relationship visible. Re-run ESCAP's five mapping traps, including adverse examples with similar vocabulary but different legal effects.

### E6. Add or explicitly limit practice evidence

**Finding:** the non-framework reader path processes legal sections for 3.4/5.3/9.1. `backend/src/discover/titles.ts` and `parse/index.ts` exclude reports/releases that may be admissible here. 5.3 is intentionally unresolved in `backend/src/decide/index.ts:1103`; statutory powers alone do not establish the observed practices required elsewhere.

**Implementation:** add a separate admissibility path for official reports, ownership disclosures and documented cases, with source class, reporting period/date, provenance and factual extraction appropriate to the indicator. Do not loosen law discovery indiscriminately to accept all news. Until a practice indicator is supported, report the limitation explicitly rather than substitute a law-only result.

**Acceptance:** a screening/blocking power is distinct from documented exercise; ownership data can support 5.3 without guessing from an establishing Act. Irrelevant press releases remain excluded. Old reports do not silently become current observations.

## 8. Work package F: review output, engine routing and readiness

### F1. Preserve extracted evidence independently of scores

**Finding:** `backend/src/export/index.ts:540` emits positive rows from `answer_basis`; supported/held Zone 2 findings can remain hidden in `reading.attributes` when scoring is unresolved.

**Implementation:** expose reviewable findings with source quote, locator, mapping proposal and hold/rejection reason independently of optional scores. Keep review candidates distinguishable from accepted submission rows; do not pollute the required workbook format with undocumented columns. Trace each candidate to its reading and each final row to its accepted evidence.

**Acceptance:** a supported quotation with uncertain mapping/score remains inspectable. Rebuilding outputs preserves applicable human decisions and explicitly reports decisions whose underlying evidence changed. Verification checks structured identities and actual citations, not only non-null metadata or text markers.

### F2. Make completion mean the requested work was accounted for

**Findings:** `backend/scripts/zone1-audit.ts:50` only warns about an empty corpus. `scripts/fleet.ts:164` compares existing cells with existing answers instead of checking expected indicators. At `:459`, worker exit codes can allow completion after finalisation failures.

**Implementation:** derive expected cells from the requested economies/pillars and validated rubric. For all 12 pillars across these four economies, there are 244 expected indicator cells, although not every cell can legitimately produce a positive finding. Validate missing stages, incomplete inputs and failed outputs. Distinguish computation complete, partial, review required, failed and ready for submission. Readiness must not depend on already-discovered rows defining their own denominator.

**Acceptance:** empty India, one missing requested cell, unattempted source work, failed confirmation and failed export are all represented correctly. An unresolved but honestly recorded cell is distinct from a missing cell. A resume checks the requested run scope, engine/model and evidence version rather than silently mixing configurations.

### F3. Separate generation from embedding routing and cache identity

**Findings:** `backend/src/run/fleet.ts:87` passes hosted reader endpoints as Ollama hosts; embeddings still use Ollama. `scripts/gate.ts:163` retains local-model preflight. `engines/ollama.ts:22` captures a host at import; `:332` forms cache identity before applying hosted configuration. Local children can inherit hosted settings.

**Implementation:** configure generation and embeddings explicitly. Validate actual selected endpoints/models after environment loading. Clear incompatible inherited settings. Cache/resume keys must identify actual engine/provider/model, prompt/schema, input and relevant configuration. Log actual provenance without credentials.

**Acceptance:** local embeddings plus hosted generation route correctly against mocked endpoints. Switching back to local cannot call the hosted service. Distinct engines cannot replay one another's answers; an independent second pass actually re-reads.

### F4. Compare every finding and account for actual costs

**Finding:** `frontend/lib/export/sheets.ts`, `compareProvisions()`, retains only one row per section, losing later mappings. Missing Engine B can receive misleading zero-fetch wording. Fleet rent is measured before all final processing; confirmation/hosted cost accounting needs reconciliation.

**Implementation:** compare all finding identities with their associated indicators, quotations and URLs; do not compare independent sets that lose which quote supports which mapping. Require a real second pass for comparison/compliance statements. Record actual calls, retries, cache/resume reuse and the full measurement interval. Use unknown/not measured rather than inventing a zero hosted cost.

**Acceptance:** changing only a section's second mapping is detected; reordering identical findings is ignored; swapping quotes between indicators is detected. No Engine B is reported as not performed. Cost totals reconcile with unique calls and the measured interval.

### F5. Track run-launch hardening separately

The run API/fleet use shell-based worker launching with insufficiently constrained inputs. Validate economy/pillar/engine values and launch an executable with an argument array and no shell. Test malformed input and child-start failures. This is ancillary to the legal pipeline but should be resolved before exposing production run controls.

## 9. Work package G: acceptance and four-economy run gates

### G1. Build an independent acceptance set

For each economy, include appropriate samples of principal law, subordinate binding instruments, amendments, repealed provisions, nonbinding material, official practice evidence, scans, bilingual editions, long provisions and incomplete sources. Cover relevant source families rather than selecting only the easiest legislation portal. Verify expected outcomes from primary text and ESCAP definitions.

Use completed ESCAP examples for evaluation only. Keep a separate development set and held-out set so fixes cannot merely memorize the examples. Record disagreements and review decisions. Reuse supplied difficult documents where permitted; use synthetic fixtures for technical failure modes such as interrupted pagination and malformed JSON.

Measure separately:

| Stage | Measurements |
|---|---|
| Discovery | Relevant source/instrument recall; portal coverage; missing and stale memberships |
| Classification | Instrument/source class, legal status, bindingness, jurisdiction and temporal metadata accuracy |
| Parsing | Missing pages/provisions, section boundaries, repeal preservation, OCR quality and citation/offset accuracy |
| Retrieval | Recall at the actual shortlist depth, language/edition coverage and duplicate treatment |
| Zone 2 | Quotation accuracy, mapping precision/recall, actor/action/scope/exception correctness, malformed/partial failure handling |
| Framework/practice | Correct evidence unit, scope and admissibility; supported versus unresolved conclusions |
| Reproducibility | Stable historical replay, engine independence, identical snapshot usage, zero source fetches on Engine B and reconciled cost |

Select and document accuracy thresholds before using the holdout results to decide readiness. Do not invent a pass percentage after observing the scores. Structural invariants, such as no cross-run leakage or malformed-output negatives, must have zero known violations in the acceptance suite.

### G2. Required gates before production runs

- [ ] Every retained source version and parse can be traced to its bytes; old runs remain reproducible after migration/reparse.
- [ ] Requested scope, jurisdictions and supported languages are declared and reflected in conclusions.
- [ ] Portal/document/reader incompleteness cannot support an unqualified absence result.
- [ ] Repealed/non-operative provisions cannot become current measures.
- [ ] Unmatched non-English evidence remains retrievable; supported OCR and translations have honest provenance.
- [ ] Malformed responses and missing substantive fields cannot become negatives or invented obligations.
- [ ] Confirmations and response caches preserve run/engine independence.
- [ ] Long provisions and framework inputs have complete relevant coverage or an explicit unresolved state.
- [ ] Practice limitations and reviewer-held findings remain visible.
- [ ] All requested cells/stages are accounted for; finalisation failure cannot be reported as submittable success.
- [ ] Baseline tests, new focused regression tests, typechecking and independent acceptance measurements pass their declared criteria.
- [ ] A migration rehearsal succeeds on a snapshot, with counts/invariants checked and a tested rollback path.

### G3. Economy-specific preparation

| Economy | Mandatory checks before the pilot |
|---|---|
| SGP | SSO contents versus served provisions; current/subsidiary relationships; repealed sections; long provisions; unresolved regulator/scan sources |
| MYS | Malay/English coverage and edition alignment; language/authority labels; unread sources; operative amendments versus stale consolidations; federal/state scope |
| AUS | Complete FRL multi-part documents; compilation versus amendment dates; provision status; Commonwealth/state scope; long sections and regulator evidence |
| IND | First establish a parsed/indexed corpus; verify CENTRAL scope and omitted tiers; India Code section pagination; Gazette/regulator coverage; English/Hindi text and OCR paths |

After the gates pass, run a small end-to-end pilot spanning different adapters/parsers/languages. Inspect the resulting citations and failure states before expanding to all requested indicators. Fix pilot failures through the same regression process.

For the full evaluation, pin the source/parse snapshot and all model/prompt/index settings. Engine B must use that exact snapshot and an independent reading context, with zero new source fetches. Compare every finding either engine produced. Changing the corpus during the comparison invalidates the comparison and requires a separately labelled experiment.

## 10. Verification commands and reporting

From the repository root, the existing offline baseline commands are:

```powershell
npm.cmd run typecheck
npm.cmd test
```

Use `npm` instead of `npm.cmd` on non-Windows systems. Run focused tests during each package, then the complete required checks at integration. Do not continually rerun broad suites without a new change or unresolved failure.

Inspect `backend/scripts/parse-check.ts` and `backend/scripts/zone1-audit.ts` before invoking them. Route database/cache operations to isolated fixtures or a snapshot using the configuration the scripts actually support. If they cannot safely target an isolated database, add that support before treating them as validation tools. Do not invent command-line flags or execute a working-corpus rebuild as a test.

For each completed work package, report:

1. Which finding was reproduced, including the original trigger.
2. What behavior changed and the affected source/evidence states.
3. Which tests and independent examples demonstrate correctness.
4. Whether schema/data migration is needed and what happens to historical results.
5. Any remaining coverage or legal uncertainty, with a concrete next check.

The final handoff must include the remaining blockers and an explicit readiness decision for SGP, MYS, AUS and IND. Passing tests alone is not the readiness decision; combine them with source coverage, acceptance-set results and evidence preservation.
