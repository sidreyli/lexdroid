# LexDroid: whole-pipeline code review

**Reviewed:** 19 September 2026  
**Baseline:** `master`, commit `7f3ffcd`; clean working tree before this review.  
**Scope:** Zone 0 through discovery, fetching, parsing, retrieval, reading, confirmation, scoring, persistence, verification, human review, and submission export. Target economies: SGP, MYS, AUS, IND.  
**Disposition:** review only. No implementation fixes, production migrations, crawls, or paid inference were performed.

The recent fixes improve several individual components, but important failures remain at their boundaries. In particular, unknown results can become definite answers, different engines can affect one another's results, and rebuilding data can discard evidence or human corrections. I would resolve the P1 findings below before relying on the four-economy outputs.

This is a review of the current implementation, not a restatement of every item in the [earlier Zone 0–2 plan](zone-0-1-2-fix-plan.md). That document describes the older `11dc925` baseline. Each finding below identifies whether it is newly found, an incomplete fix, or a previously identified issue still present.

## 1. What LexDroid does, end to end

| Stage | Actual execution and output | Contract the next stage relies on |
|---|---|---|
| Start a run | The Next API launches `backend/scripts/fleet.ts`. Fleet selects an engine, probes it, opens a run, and schedules economy/pillar workers running `gate.ts`. | The run's engine, model, source mode, scope, and status describe the work actually performed. |
| Zone 0 | Checked-in economy profiles declare portals, adapters, languages, instrument kinds, bindingness, and some jurisdiction scope. The derived rubric supplies 61 regulatory indicators in 12 pillars. | The profile bounds what can be searched and what kinds of evidence can establish a measure. |
| Register and shortlist | `prepareCorpus` applies the profile, walks adapters, registers instruments, builds title embeddings, and ranks instruments against each indicator's queries. | A selected instrument can be fetched; a missing or partial source is not a finding of legal absence. |
| Fetch and parse | `materialise` resolves source documents through adapters and the fetcher, then dispatches HTML/PDF/structured-document parsing and OCR. Text, sections, offsets, language, and repeal flags enter SQLite; raw bytes enter the cache. | The text belongs to the named instrument and version, and omissions are known. |
| Index and retrieve | FTS and multilingual embeddings retrieve sections. Query results are fused, diversified, and supplemented with governing-instrument candidates. Some non-English sections are suppressed as translations. | The candidates and exclusions preserve relevant provisions and expose coverage limits. |
| Zone 2 reading | Each distinct section in a pillar's candidate union is read once against that pillar. Long sections are read in overlapping windows. Quotes and attributes are validated. Framework indicators use a separate instrument-level reader. | A valid negative, a failed read, an incomplete reading, and a rejected assertion remain distinguishable. |
| Initial decision and recording | `decide` filters evidence and suggests bands. `recordPillarAnswer` stores cells, retrieval, per-cell readings, framework readings, answer bases, events, and costs. | The stored input reproduces the live decision and preserves each distinct finding. |
| Confirmation and rescoring | Fleet asks one question per section/indicator/measure, stores verdicts, and calls `rescoreRun`. | Each run uses the appropriate engine's verdicts on the same question and evidence version. |
| Export and verification | `buildExportRows` projects the chosen answer basis; baseline tagging runs afterward; `verifyRun` checks citations, quotes, metadata, and recomputed scores. | Valid evidence is preserved independently of optional scoring; failed checks remain actionable. |
| Human review and submission | The interface edits export rows and some answer fields, appends review actions, and downloads CSV or a seven-sheet workbook. The workbook also compares engines and reports costs. | Corrections survive rebuilds; submission eligibility, model comparison, and measured cost are truthful. |

The baseline remains quarantined from the main discovery/reading path: the operational scripts consult it for tagging or comparison after results are computed. That separation should be retained.

Zone 3 has more influence than the stated product boundary suggests: only the scoring decision's selected basis normally reaches the evidence export. Consequently, a scoring filter or persistence error can remove otherwise valid Zone 2 evidence from the deliverable.

## 2. Requirements and verification performed

Primary local materials consulted:

- [Final output template](finals/OUTPUT_TEMPLATE_FINAL_ROUND.md): exact source quotations, article/location, official source, amendment metadata, engine comparison, and the explicit 7.3/7.5 mapping traps.
- [Internal researcher guide](<framework/ESCAP-RDTII-2.1- internal guide.md>): enforced measures, legal hierarchy, official sources, and the practice-indicator exceptions.
- [Final README requirements](finals/README_template_FINAL_ROUND.md): interface engine switching, zero-document-fetch second pass, host politeness, and reproducibility.
- [Architecture](architecture.md) and README: used to understand intended behavior, then checked against executing code.

Checks on this baseline:

- `npm.cmd test`: **1,085 backend tests and 36 frontend tests passed**.
- `npm.cmd run typecheck`: **passed** for both workspaces.
- **20 focused reproductions**: 13 temporary Vitest probes plus seven isolated Node probes. They exercised real pipeline functions with in-memory databases, mocked model responses, and local HTTP servers.
- [Reproducer source](pipeline-review-reproducers.md) preserves the 13 Vitest probes. Their passing assertions confirm the observed defects; they are not correctness tests.
- The working database was opened directly with `better-sqlite3` in read-only mode. The schema-initializing `openDb()` was used only for isolated test databases.
- No new live-source verification or full-corpus legal adjudication was performed.

Current read-only corpus counts:

| Economy | Registered instruments | Documents | Sections |
|---|---:|---:|---:|
| AUS | 28,488 | 1,285 | 76,839 |
| IND | 12,915 | 0 | 0 |
| MYS | 16,863 | 1,627 | 76,941 |
| SGP | 6,857 | 1,138 | 31,447 |

These ratios are not recall measurements: materialisation is selective. India's zero parsed documents nevertheless prevent a meaningful cache-only evidence run. The working database has the new section repeal and confirmation question columns; this alone does not establish that historical rows have been revalidated.

## 3. Confirmed findings

**P1:** fix before trusting affected runs or submissions.  
**P2:** concrete correctness, reproducibility, or operational defect; fix before claiming the affected capability.

### F01 — P1 — Failed framework readings become absence after rescoring

**New integration finding. Reproduced through the real `answerPillar → recordPillarAnswer → rescoreRun` path.**

Locations: `backend/src/run/index.ts:371`, `backend/src/decide/record.ts:240`, `backend/src/cell/index.ts:489`.

The live framework decision counts successfully examined instruments. Recording stores retrieval's surfaced-section count, and replay uses that count as `instrumentsConsidered`. When ordinary section reading succeeds but every framework reading fails, the live framework result is unresolved. The automatic rescore sees a nonzero count with no framework evidence and declares absence.

Observed: 7.1 changed from unresolved to `no-restriction, score=1`, with **zero framework_reading rows**. The label means the framework was absent; the score is the maximum restriction band.

Persist successful framework examination counts and failure/completeness states separately from retrieval counts. Recompute from successful framework attempts or an immutable recorded coverage object.

Scope correction: the caller already aborts if every fresh **provision** reading fails (`cell/index.ts:368`). The reproduced failure is the separate framework path. Recording also stores all attempted provision readings as `sections_read` at `run/index.ts:373`, inflating coverage on mixed-success runs.

### F02 — P1 — Indicator 7.3 accepts an unspecified retention period

**New verified requirements mismatch. Reproduced through reader validation and decision.**

Locations: `backend/src/rubric/measures.ts:176`, `backend/src/decide/index.ts:594`. Requirement: final output template, mapping traps near line 101.

The catalogue explicitly permits a period prescribed elsewhere, and the rule requires only a `minimum-retention` finding. `statedPeriod` changes ordering, not eligibility.

Fixture: “Every employer shall retain employee records for the prescribed period.” The reader output had `statedPeriod: null`; it passed validation and produced `restricted, score=1`. No provision establishing the duration was supplied.

The finals template expressly rejects a prescribed period with no number. Resolve and cite the referenced operative duration, or hold the mapping. A sorting preference for numbered durations does not meet that requirement.

### F03 — P1 — Unstated judicial authorisation becomes “no court order”

**New finding. Reproduced through reader validation and decision.**

Location: `backend/src/decide/index.ts:1724`, consumed at line 1640.

`authorisationOf` returns `none` whenever `authorisingWords` is absent, even if the extracted authorisation is `unstated`.

Fixture: an officer may obtain personal data “in accordance with section 9”, with that section not supplied, `authorisation: unstated`, and no authorising quotation. The result was `restricted, score=1` under 7.5.

The source of authorisation remains unknown until the relevant text is examined. Preserve that uncertainty and follow the cross-reference; missing quoted conditions must not strengthen the claim into access without judicial authorisation.

### F04 — P1 — Distinct findings under one measure are discarded before scoring

**New finding. Reproduced through the real pillar reader/decision path.**

Location: `backend/src/cell/index.ts:332`; corresponding deduplication in `backend/src/decide/record.ts` and measure-only matching in `backend/src/export/index.ts:164`.

The evidence key is section + indicator + measure. Different clauses, quotations, actors, and legal conditions do not distinguish findings.

Fixture: one section contains two access powers. The first requires a court order; the second permits emergency access without judicial approval. The reader returned both valid findings. Only the first entered the decision; 7.5 scored **0**, with the court-order finding held.

Preserve distinct claim identities, including operative spans and conditions. Deduplicate overlapping-window copies of the same claim, not all claims sharing a measure token. Confirmation, answer bases, and export matching need the same distinction.

### F05 — P1 — Malformed findings still become successful negative readings

**Incomplete fix. Reproduced.**

Location: `backend/src/read/index.ts:1001–1017`; downstream coverage at `backend/src/cell/index.ts:487`.

Invalid JSON and missing findings arrays now fail correctly. Invalid items inside a findings array instead become `rejected` entries while `failure` stays null. Only accepted findings enter the decision.

Fixture: `{"findings":[{"note":"see the schedule"}]}` produced an empty successful reading with one rejected item. Counting it as a completed read allowed 7.3 to return `no-restriction, score=0`.

Distinguish invalid extraction from a substantive finding of non-applicability. Preserve valid positive claims if a partially valid response contains them, but block absence conclusions over unassessed claims. Apply this to missing required facts as well as wholly malformed items.

### F06 — P1 — Another engine's confirmation changes a run's answer

**Incomplete fix. Reproduced through live scoring, recording, and rescoring.**

Locations: `backend/src/run/rescore.ts:38`, `backend/src/decide/record.ts:78`, `backend/src/export/index.ts:515`.

The live reader requests model-filtered confirmations. Rescore, verification rebuild, and export use unfiltered `loadConfirmations(db)`. With conflicting models, the global loader removes the verdict; downstream that is treated as no confirmation, not as a hold.

Fixture: model A's negative confirmation made 7.3 score 0. After inserting model B's positive confirmation on the same question, rescoring **the same A run** changed it to `restricted, score=1`.

Use the run's recorded engine/model and confirmation-attempt references consistently. Freeze the verdict set used by an answer so later runs do not rewrite its meaning. Question/model-aware table keys help, but unscoped consumers undo that protection.

### F07 — P1 — Hosted Engine B is sent through Ollama preflight and embedding paths

**Previously reported; still present. Protocol routing reproduced locally.**

Locations: `backend/src/run/fleet.ts:84–87`, `backend/scripts/gate.ts:165`, `backend/src/engines/ollama.ts:230–255`.

For hosted children, `childEngineEnv` sets Ollama hosts to the hosted chat API URL. Every gate worker still calls `haveModel`, which requests `/api/tags`. Embeddings also use the Ollama pool.

A local chat-API fixture configured through the actual child environment received **/v1/api/tags** and failed the gate preflight. This is a code/protocol reproduction, not a fresh request to Groq.

Separate generation and embedding endpoints. Probe hosted generation with its own protocol; retain a valid local or declared embedding endpoint. Test the actual Engine B worker launch, not just `generate()` in isolation.

### F08 — P1 — Hosted confirmations are persisted under the wrong model

**New integration finding. Reproduced with a local hosted-API fixture.**

Locations: `backend/scripts/fleet.ts:93`, `backend/src/read/confirm-pass.ts:154`, `backend/src/engines/ollama.ts:369`.

Fleet defaults its model argument to the local `READING_MODEL`, rather than the selected registry engine's model. Generation uses the hosted configuration's model, but confirmation persistence deliberately writes the requested argument rather than `c.model`.

Observed: the HTTP request used `hosted-Qwen`; the stored confirmation model was `gemma4-lex-16k`. A later local run can therefore reuse a hosted verdict under its own model name. This remains relevant once F07 is fixed or when confirmation is invoked directly.

Resolve actual engine identity before opening the run. Record provider, model/checkpoint, and request provenance from that identity everywhere, including confirmation lookup and caching.

### F09 — P1 — Remote fleet hosts are not applied to the parent's confirmation stage

**New caller-path finding; verified by configuration/data-flow inspection.**

Locations: `backend/scripts/fleet.ts:143`, `:330`, `:412`; `backend/src/engines/ollama.ts:22`; `backend/src/engines/pool.ts:engineHosts`.

Selected local hosts are injected into worker environments only. The parent performs preparation and confirmation using its own environment, whose pool can still point at localhost or an inherited different endpoint. The one-off Ollama host is also captured before `loadEnv()` runs in fleet.

A remote-worker run can finish its initial readings and then fail confirmation on an unrelated local endpoint, or confirm with a different engine. The new clearing of hosted variables protects local children, not the parent.

Construct explicit clients/configuration for every stage after environment/registry resolution. Add an integration fixture with distinct parent and worker endpoints and assert where each request goes.

### F10 — P1 — Reparse deletes historical reading evidence

**Previously reported; still present. Reproduced.**

Location: `backend/src/parse/index.ts:151–156`; reading foreign keys in `backend/src/db/schema.sql`.

Storing an existing document deletes its sections and recreates them, including when the source bytes are unchanged. Historical readings cascade with the deleted sections. Other section references can instead prevent reparsing through a foreign-key failure.

Fixture: a completed run had one negative reading. Calling `storeDocument` again with the **identical document and hash** reduced its reading count from **1 to 0**.

Use immutable source/parse versions and stable references from runs. Do not refresh the production corpus to activate parser fixes until this migration path is safe. Relocating by section ordinal is not a substitute for preserving the source on which the old answer was made.

### F11 — P1 — Export rebuild loses human corrections while preserving “edited”

**New finding. Reproduced.**

Locations: `backend/src/export/index.ts:522–535`, `:684–709`; `frontend/lib/data/write.ts:recordVerdict`.

Human corrections update the export row. Rebuild deletes that row, regenerates the model version, and reattaches review actions by a limited identity. It does not reapply corrections.

Fixture: a reviewer changed Notes. Rebuild returned `reviewsCarried=1, reviewsDropped=0`, but Notes reverted to the generated text while the action remained `edit`. Editing quotation/article fields changes the identity and can instead delete the review history through the cascade.

Keep original generated content, immutable review actions, and the effective reviewed version separately. Never silently replace the reviewed content or erase its audit history. Revalidation may require a fresh review, but that is different from deletion.

### F12 — P1 — Framework quotations bypass source verification

**New finding. Reproduced.**

Locations: `backend/src/verify/index.ts:240`; framework export at `backend/src/export/index.ts`; `backend/src/read/index.ts:1537`.

Quote, offsets, in-force, and timeframe checks are inside the `section_id !== null` branch. Framework rows deliberately have no section ID. Their `quote_verified=0` does not cause a verification hold.

Fixture: a framework row with an explicitly unverified quotation (“Words absent from every source document”) exported at confidence 0.50. `verifyRun` reported **held=0**; only official-host, score-recorded, and score-recomputes were checked.

Add instrument-level source and quotation checks for framework claims. Economy-level framework output need not become a per-provision discovery, but its quotation and current legal status still require verification.

### F13 — P1 — Failed verification does not prevent submission export

**New downstream finding. Reproduced.**

Location: `frontend/lib/export/workbook.ts:82–88`.

`rowsFor` excludes only explicit human rejections. Rows with failed gates, including quotes absent from the source, enter the normal CSV and Output Data sheet without review. The workbook does not carry the individual gate failures alongside them.

A fixture with `quote-in-source: false` and no review action was exported.

Separate review/audit exports from submission-eligible rows. Define which deterministic failures must be corrected and which may receive an explicit, evidenced override. An “accept” action alone must not make a fabricated quote verbatim.

### F14 — P1 — Shortlisted unread instruments are still never retried by preparation

**Incomplete fix. Reproduced.**

Locations: `backend/src/discover/index.ts:389–397`, `backend/src/run/prepare.ts:176`.

The shortlist now correctly reports an unread document as unread. Preparation still calls default materialisation, whose SQL excludes any instrument with a document row, even if it has no sections and has an `unread_document` entry.

Fixture: materialise was given that instrument's ID explicitly. It returned an empty result and made **zero fetch attempts**.

Make selection and retry eligibility agree. Preserve distinctions between downloaded, unread, partial, parsed, and indexed states. Retry temporary failures under a bounded policy; surface permanent unsupported cases instead of treating them as already processed.

### F15 — P1 — Translation suppression still pairs different provisions

**Incomplete fix. Reproduced.**

Location: `backend/src/retrieve/index.ts:423–449`.

The new key is instrument + section label, with one-to-one counts. It ignores structural location, document edition, and version. A schedule and the principal text can both have section “1”.

Fixture: English “Schedule 2 > 1 Fees” and a distinct Malay “Part I > 1 Duties”, both labelled “1”. The Malay section was suppressed as a duplicate.

Require a defensible provision-and-edition correspondence. Preserve unmatched provisions. Cardinality matching fixes the broad instrument-level deletion but does not establish that two sections are translations.

### F16 — P2 — Same-host redirects bypass the host delay

**Incomplete fix. Reproduced with a loopback server.**

Location: `backend/src/fetch/index.ts:631–660`.

Redirects now check robots and are logged. Waiting is only applied when the hostname changes. A redirect within the same host immediately issues the next request.

Observed under a one-second robots delay: `/start → /end` arrived **2 ms apart**. Cross-host redirects also do not acquire the destination's normal request queue; independent Fetcher instances still hold independent queues.

Apply host scheduling to every actual request/hop, with shared host coordination for concurrent runs. Avoid holding two host queues in an order that can deadlock. The one-request-per-second/one-concurrent-request requirements concern network requests, not outer fetch calls.

### F17 — P2 — Amendment metadata still conflates different dates

**Existing parser issue plus newly verified workbook issue.**

Locations: `backend/src/parse/frl.ts:169–184`, `frontend/lib/export/workbook.ts:61–68`.

The FRL parser still writes compilation/currentness dates into `lastAmendedOn`. Separately, the workbook falls back to any year in the timeframe string.

Fixture: `lastAmendedOn=null`, `lastAmended="Since January 2000"`. CSV emitted **2000** as Last Amended even though no amendment was evidenced.

Keep commencement, compilation/current-to, and amendment separate. Leave amendment blank when unknown or not amended, as the finals template directs. Calendar-valid dates are not necessarily the correct kind of date.

### F18 — P2 — Engine Comparison drops findings and certifies a missing pass

**Previously reported; still present. Both behaviors reproduced.**

Locations: `frontend/lib/export/sheets.ts:64–68`, `:166`.

Only the first export row per section is compared. A second indicator or finding on the same section disappears. Separately, a missing B run is represented with zero fetched documents and receives the success statement.

Fixture A: Engine A produced 6.2 and 6.4 on one section; B produced only 6.2. The sheet reported one **identical** comparison. Fixture B: `passB.run=null` produced “Engine B fetched 0 documents, as required.”

Compare complete finding tuples, preserving relationships among indicator, quote, and citation. Require an actual identified pass with appropriate completion/scope and source-mode evidence before asserting zero-fetch compliance.

### F19 — P2 — A section reference can become a monetary threshold

**New finding. Reproduced through the amount parser and 12.5 rule.**

Location: `backend/src/decide/currency.ts:83`, used by `backend/src/decide/index.ts:1044`.

`moneyIn` takes the first number anywhere in the defining quotation and pairs it with a currency found elsewhere.

Fixture: “Goods under section 3 with a value not exceeding S$400” became **SGD 3**. At the fixture rate of 0.75 USD/SGD, 12.5 chose the below-USD-200 band; the stated S$400 threshold would be USD 300.

Bind the amount to its currency and operative threshold phrase. Hold ambiguous multiple-number text instead of selecting the first numeric token.

### F20 — P2 — Cost and call totals omit work performed

**Earlier accounting gap, enlarged by the new windowed reader. Confirm-pass omission reproduced; remaining paths traced.**

Locations: `backend/src/read/confirm-pass.ts:99–160`, `backend/src/run/index.ts:654–679`, `backend/scripts/fleet.ts:388–397`.

Confirmation stores token/latency data only in the global confirmation table, without run ownership or contribution to `run_cost`. A completed fixture confirmation left **zero run_cost rows**. The UI/workbook read totals from that table.

The windowed reader aggregates token totals correctly, but `addCost` still counts each section as one call regardless of its number of model requests. Fleet rent timing ends before confirmation/export. Hosted dollar cost is not calculated; zero defaults reach the reported total.

Record billable attempts by run and actual engine, including confirmation, windows, retries, and cache/carry provenance. Finish rental accounting at the end of the billable interval. Unknown hosted cost should be reported as unknown, not measured zero.

### F21 — P2 — Export failure still exits successfully

**Incomplete fix. Verified from the final control-flow branch.**

Location: `backend/scripts/fleet.ts:471–493`.

The database status now correctly includes `exportFailed`. The terminal's final status and process exit code still depend only on failed workers.

If workers succeed and confirmation/tagging/export/verification throws, the run is marked failed in SQLite while the CLI says complete and exits **0**. Automation can accept an unusable submission.

Use one final outcome for persistence, log output, and exit status; distinguish answers saved from submission completed.

### F22 — P2 — Inference cache keys ignore the actual hosted model/provider

**Previously reported; still present. Reproduced.**

Location: `backend/src/engines/ollama.ts:343–369`.

Cache/resume keys are calculated from the Ollama-shaped request and requested model before hosted configuration is resolved. Hosted generation may use a different model.

Fixture: call the same prompt with requested model `gemma4-lex-16k`, first configured for hosted model A, then model B. Only model A received an HTTP request; the second result was **model A, fromCache=true**.

Build the key from the effective provider/model, request semantics, prompt/schema, and relevant options. The development cache is opt-in, which limits exposure, but a mislabeled replay still cannot evaluate a model switch correctly. The resume-key construction has the same identity omission.

### F23 — P2 — An empty live store falls back to historical sample results

**New cold-start finding; verified by the data-access return paths.**

Locations: `frontend/lib/data/store.ts:142`, `:182`, `:244`; `frontend/lib/data/index.ts:46–48`.

Live accessors return null when their tables have no rows. The frontend interprets null as “no database” and returns checked-in cells, runs, or export rows. This occurs even with an existing empty working database. Each dataset falls back independently.

Consequences include historical fixture runs appearing in a new workspace and an unscoped export returning fixture evidence when the live store has no exports. A specifically selected new run ID does not match those fixtures, but the general views/export path still do.

Return empty arrays for empty live datasets. Keep demonstration data behind an explicit mode that cannot be mistaken for, or exported as, the active research store.

## 4. Earlier issues that remain outside the recent fixes

The following were rechecked in current code. They are separate from the new reproductions above and should remain in the backlog; they are not claims that every earlier concern has been freshly tested.

| Area | Current code evidence and consequence | Required handling |
|---|---|---|
| Partial documents | `parse/sso.ts:308` and `parse/pdf.ts:629` report partial extraction in metadata. `discover/index.ts:502` logs a discard, while successful stored sections can still support ordinary absence decisions. | Preserve missing pages/provisions as structured, run-visible coverage. Retain trustworthy positive evidence but block unsupported whole-document absence. |
| Walk completeness | India provision pagination stops at `MAX_SECTION_PAGES=20` (`discover/indiacode.ts:21,396`); generic/WordPress/Drupal walkers also have hard caps. A bounded walk is not proof that the portal has no more instruments. | Persist complete/partial/refused/failed walk results, continuation and expected counts, and feed them into readiness. |
| Jurisdiction coverage | The schema supports `jurisdictionScope`, but IND does not populate it. IndiaCode selects CENTRAL. Scope declarations for the other profiles are not part of the decision coverage contract or normal export. | Publish the actual held tier, and constrain absence claims and readiness to that tier. Verify which further sources the intended analysis requires. |
| Framework reach and language | `decide/index.ts:2371` treats the absence of verified sectoral wording as horizontal reach, unless the instrument kind is binding-on-licensees. Framework subject checks remain English-oriented. | Missing or unrecognised scope is unknown, not comprehensive reach. Use multilingual evidence checks and resolve scope against operative text. |
| Practice indicators | 5.3 is explicitly unsupported in `decide/index.ts:1105`; 9.1 counts a power/duty to block at line 1085, while the rubric's absence band concerns cases. The discovery filters do not provide a general official practice-evidence path. | Keep statutory powers distinct from observed use. Support appropriate official cases/reports or explicitly report unsupported practice coverage. Do not count a declared unsupported cell as an implemented capability. |
| Zone 2 visibility | `export/index.ts:540` projects the scored basis; held/otherwise unused reader findings generally remain only in stored reading attributes. | Provide a reviewer-facing Zone 2 evidence view with hold/exclusion reasons, separate from optional scores and submission eligibility. |
| Carry provenance | `read/carry.ts:48` selects prior findings by run, model and indicator, without checking prompt/schema/rubric identity. | Permit reuse only under a declared compatible extraction contract. Report historical findings as historical when compatibility is not established. |
| Vector validation | Section-vector loading now validates blobs, but title/heading similarity in `shortlist/index.ts:235,351` still multiplies only the shorter width. | Apply model/dimension/finite-value validation to every embedding store and query vector. The audit did not find corruption in the production vectors. |
| Readiness | `zone1-audit.ts:50–75` reports empty registered economies without making emptiness fatal; fleet resume checks at `scripts/fleet.ts:171` compare existing cells to existing answers, not the expected indicator set. | Gate requested scope explicitly: 244 expected cells for four economies and all 61 regulatory indicators, with computation completeness separated from evidence/review readiness. |
| OCR capability | `parse/ocr.ts:48–69` packages and loads English/Hindi. It is not a general implementation of all profile languages. | Declare supported source languages and test local-language scans; surface unsupported or degraded extraction honestly. Do not infer OCR capability from multilingual embeddings. |
| Register freshness | `discover/index.ts:82–99` does not refresh title, official number or kind on conflict. The normal preparation path also skips already stored documents. | Track source membership, version/currentness and observed changes. Distinguish a cache-based pass from a current-law validation. |

These items require targeted acceptance fixtures and, where legal/source facts are involved, primary-source validation. For example, a profile's blanket bindingness or authoritative-language setting cannot by itself establish the legal character of every individual instrument.

## 5. What the recent fixes do cover

Inspection and the passing focused regression suite support crediting the following changes:

- Shell-free run launching and clearing inherited hosted routing in local child workers.
- JSON-envelope failures and malformed confirmation responses no longer automatically becoming clean negatives.
- Explicitly failed confirmation attempts are eligible to be asked again.
- Confirmation question/model keys, although downstream consumers still need F06/F08.
- Long-section windowing and aggregate token counts, although preserving legal context and distinct claims remains necessary.
- Parser repeal flags reaching stored sections and the current-law decision filter.
- Calendar validation for impossible source dates.
- Validation of stored section-vector sizes and finite values.
- Robots group/rule parsing, redirect destination checks, and a fetcher-wide refresh mode.

Passing tests for these components does not establish that historical corpus rows have been migrated correctly, that all four economies have sufficient evidence, or that downstream consumers preserve their guarantees.

## 6. Recommended implementation order

1. **Protect evidence and human work:** F10–F11, then define immutable source/parse, reading, claim, confirmation and review identities. Test migrations and rollback against a consistent isolated SQLite snapshot.
2. **Stop false legal conclusions:** F01–F05, including failed/partial/held coverage semantics. Apply the finals mapping rules to 7.3 and 7.5 before interpreting broader score agreement.
3. **Make engine identity consistent:** F06–F09 and F22. Exercise actual worker preflight, embeddings, generation, parent confirmation, rescore, verification and export with two distinct local protocol fixtures.
4. **Restore source/retrieval integrity:** F14–F17 and the completeness/scope items above. Revalidate existing data under the new contracts rather than blindly reparsing the working store.
5. **Make the deliverable trustworthy:** F12–F13, F18–F21 and F23. Separate evidence for review, submission-ready rows, measured cost, and completion status.
6. **Run a small offline acceptance set**, with independent expected results and complete call traces. Only then run controlled live pilots for the four economies and assess source coverage before full runs.

Minimum acceptance gates:

- Live and recorded/rescored decisions agree on identical immutable inputs, including failure cases.
- Running engine B cannot change engine A's answers, confidence, historical verification, or reviewer decisions.
- Unknown duration, authorisation, scope, language, or source completeness cannot become a definite positive or negative solely through a default.
- Every distinct relevant claim survives retrieval, reading, confirmation, decision and review; exact duplicates alone are collapsed.
- Reparse and export rebuild preserve historical evidence and human corrections.
- A failed quotation/current-law gate is visible and prevents ordinary submission of an uncorrected claim.
- Engine B completes the actual cache-only pipeline using its declared generation engine and a valid embedding service.
- Every HTTP hop obeys the host policy; counted model calls and cost cover the work actually performed.
- All requested economy/indicator cells are accounted for; missing evidence remains visibly unresolved. India must first acquire parsed evidence.
- Current-source/legal validation and held-out extraction quality are measured separately from unit-test success.

## 7. Limits and handoff

The reproduced defects are deterministic implementation failures or direct mismatches against the supplied requirements. Their fixtures do not measure the frequency of each issue in historical runs.

This review did not freshly determine which laws are currently in force on every live portal, inspect every provision in the corpus, measure held-out legal recall, test real hosted-provider billing, or validate production OCR across every declared language. Those remain acceptance tasks.

The production code, checked-in configuration, working database, and production caches were left unchanged. Temporary test source was removed after recording the reproductions in Markdown.

