# Whole-pipeline review: verification and fix plan

**Written:** 20 September 2026, against `master` at `7f3ffcd`.
**Answers:** [the review](whole-pipeline-review.md) and [its reproducers](pipeline-review-reproducers.md).

Every one of the 23 findings is real. Thirteen were verified by running codex's own probes on this
checkout; the other ten were verified by reading the code at the cited lines. Nothing in the review
turned out to be a misreading, and two findings understate the defect. What follows is what I
checked, then what to do about each, in the order the 30 September freeze allows.

## 1. Verification

### Reproduced by running the probes

Both temporary suites pass on this checkout: 9 backend probes and 4 frontend probes, exit 0.

| Finding | Probe output |
|---|---|
| F01 failed framework reads become absence | `{state:'no-restriction', score:1}` after rescore, zero `framework_reading` rows |
| F02 7.3 accepts an unspecified period | `restricted 1` on "for the prescribed period" |
| F03 unstated authorisation becomes "no court order" | `restricted 1` on `authorisation:'unstated'` |
| F04 distinct findings collapsed | two access powers in, one out, 7.5 scores 0 |
| F05 malformed findings still a clean negative | `failure:null`, `rejected:1`, cell clears at score 0 |
| F06 another engine's confirmation rewrites a run | same run A: 0 → `restricted 1` after model B answers |
| F13 gate-failed rows are submission-eligible | `rowsFor` returns the row with `quote-in-source:false` |
| F14 unread instruments never retried | `materialise` returned `[]`, zero fetch attempts |
| F15 translation suppression pairs different provisions | "Schedule 2 > 1" suppressed "Part I > 1" |
| F17 a timeframe sentence becomes an amendment year | CSV emitted `"2000"` from "Since January 2000" |
| F18 comparison drops findings, certifies a missing pass | one "identical" row for two indicators; the zero-fetch claim with `run:null` |
| F19 a section number becomes a money amount | `moneyIn("…section 3…S$400") → {amount:3, currency:'SGD'}` |

### Verified by reading the code

| Finding | What the code says |
|---|---|
| F07 | `scripts/gate.ts:165` calls `haveModel` unconditionally; for a hosted engine `childEngineEnv` sets `OLLAMA_HOSTS` to `engine.hosts[0]`, which is the chat-completions URL. `embed()` goes to the same pool. |
| F08 | `scripts/fleet.ts:93` defaults `model` to the local `READING_MODEL`; `confirm-pass.ts:154` deliberately stores that argument, not the engine's model. |
| F09 | `loadEnv()` runs at `fleet.ts:45`, after `ollama.js` has already evaluated `const HOST = engineHosts()[0]`. Nothing ever assigns `args.hosts` to the parent's own environment, so `prepareCorpus` and `confirmPass` use whatever the shell had. |
| F10 | `parse/index.ts:154` runs `DELETE FROM section WHERE document_id = ?` on every store, including an unchanged hash; `reading` and `measure_confirmation` cascade (`schema.sql:429`, `:445`), and two non-cascading references (`:540`, `:596`) turn other reparses into foreign-key failures. |
| F11 | `export/index.ts:534` deletes the rows, regenerates them from the model, and reattaches `review_action` by an identity that includes `verbatim_snippet` and `source_url`. The reviewer's edited values are never reapplied. |
| F12 | `verify/index.ts` gates 1–7 are all inside `if (cites)`, i.e. `section_id !== null`. Framework rows get only `official-host` and the score gates. |
| F16 | `fetch/index.ts:653` waits only `if (next.host !== new URL(at).host)`. |
| F20 | `confirm-pass.ts` never touches `run_cost`; `run/index.ts:653` sets `calls = readings.length + frameworkReadings.length`, one per section however many windows it took; `usd` is hardcoded `0`; `fleet.ts` fixes `seconds` before the confirm/export block. |
| F21 | `fleet.ts:485` passes `failed.length > 0 \|\| exportFailed` to `finishRun`, while the printed status and `process.exit` at `:497` use `failed.length > 0` alone. |
| F22 | `ollama.ts:342` computes `cacheKey(body)` from the requested model; `hostedConfig()` is not read until `:361`. |
| F23 | Each live accessor in `frontend/lib/data/store.ts` ends `if (rows.length === 0) return null`, and `lib/data/index.ts:46` reads `liveX() ?? xJson`. Empty and absent are the same thing to the frontend. |

### Two findings are worse than stated

**F01 also inflates `sections_read`.** `cell/index.ts:487` counts only readings that succeeded;
`run/index.ts:373` stores `answer.readings.length`, every attempt. The live decision and the
recorded one disagree about coverage on any run with a mixed-success pillar, not only on the
framework path.

**F01's framework count is not merely "a nonzero count".** `record.ts:240` sets
`instrumentsConsidered: cell.surfaced`, and `surfaced` is *distinct sections retrieved*
(`retrieve/index.ts:399`), not instruments. For framework indicators — the only place the field is
read (`decide/index.ts:2271`, `:2329`, `:2351`) — the replay sees a number that was never about
instruments at all, and prints it in the rationale as "N instrument(s) were examined".

### Two findings contradict decisions that were measured

These are the only two where the fix is not obviously right, because the current behaviour was
chosen deliberately and the comment records why.

**F02 (7.3).** `decide/index.ts:589` says requiring the period in the same provision "was too
strict and was measured to be wrong": the Employment Act says "for the period prescribed" and
leaves the number to regulations, which is still a floor. Codex is nonetheless correct that the
finals output template is explicit — "A 'prescribed period' with no number … is not a retention
rule" — and the template is the submission spec, not ESCAP's answer key. Both are true: the
provision is a real retention duty, and a row citing it does not meet the template.

**F03 (7.5).** `decide/index.ts:1722` collapses `unstated` to `none` because the same provision
came back `none` in one run and `unstated` in the next, and a cell flipped 1 → 0 on nothing else.
That instability was real. But the collapse turns "we do not know what authorises this" into the
positive claim "no judicial authorisation is required", which is the failure mode the acceptance
gate exists to prevent.

Fixes for both are below and neither is a revert. **F02 needs your call** — it changes 7.3 for
every economy.

## 2. What each fix costs

The only question that matters this close to the freeze is whether a fix changes what the engine
reads. Almost nothing here does.

**Free — replay or rebuild recovers it from what is already banked.** `reading.attributes` stores
the whole findings array, and `decide/record.ts` rebuilds evidence from it, so F04's second finding
is already in the database and a replay after the key change recovers it. Same for F01, F02, F03,
F06, F19: all decision-side, all recoverable with `scripts/replay.ts`, no engine and no network.
F11–F13, F17b, F18, F20, F21, F22, F23 rebuild the export, verification or interface only.

**Costs a re-run, so it must land before the run starts.** F05 changes how a reading is
classified, F15 changes which sections are read, F14 and F16 change what is fetched, F07 changes
which engine answers.

**One exception.** F05 cannot be repaired retroactively: `rejected` is never persisted
(`run/index.ts:277`), so no replay can tell a clean negative from a reading whose every item was
thrown away. Fixing it means adding the column *and* re-reading.

## 3. The fixes

### Batch 1 — decision and recording (free, replay measures it)

**F21, exit code.** One `outcome` value feeding `finishRun`, the printed line and `process.exit`.
Three lines.

**F22, cache identity.** Move `const hosted = hostedConfig()` above the cache lookup and build the
key from `{provider, model: hosted?.model ?? model, prompt, system, schema, options}`. Existing
cache entries stop matching, which is correct and harmless — the cache is opt-in and dev-only.

**F19, money.** One regex binding the number to an adjacent currency token (`S$400`, `400 SGD`),
not "first number anywhere plus a currency found elsewhere". Ignore a number preceded by
`section|s\.|article|regulation|paragraph|item`. If two distinct bound amounts match, return null
and let 12.5 hold rather than pick.

**F06, confirmation scope.** Remove the default from `loadConfirmations(db)` so the compiler names
every caller, then pass the run's own `engine_model` at `rescore.ts:38`, `export/index.ts:515` and
`record.ts`. A verdict from another model becomes "not asked", not "ruled out".

**F09, parent hosts.** Delete the module-level `const HOST` in `ollama.ts` in favour of a function
read at call time, and have `fleet.ts` set `OLLAMA_HOSTS` from `args.hosts` in `main()` after
`loadEnv()`, before any stage runs.

**F08, engine identity.** Resolve one `effectiveModel` before `openRun` — `engine.model` when the
engine is hosted, `args.model` otherwise — and use it for the run record, the child `--model` and
`confirmPass`. The stored confirmation model then names the engine that actually answered.

**F01, coverage.** Persist what was computed instead of re-deriving it. Add
`cell.framework_examined` and `cell.framework_failed`; store `sections_read` as the count of
readings that succeeded, matching `cell/index.ts:487`; have `record.ts` read those columns rather
than `cell.surfaced`. Old rows are NULL, and NULL must resolve to unresolved, never to absence.
Then `decide` refuses absence when `examined === 0 && failed > 0`, with a reason that says the
framework could not be examined.

**F03, unknown authorisation.** Decide from the text, not from the label, which fixes the
instability and the fabrication together. `authorisationOf` keeps the reader's label where
`authorisingWords` point at real words; otherwise a deterministic predicate over the section text —
the same shape as the existing `amendsAnotherAct`, `citesADefinition` and `inheritsAPower` helpers —
asks whether the power is conditioned on something the provision does not state ("in accordance
with section 9", "subject to", "with the approval of"). If it is, the finding is held as `unstated`.
If the text conditions the power on nothing at all, `none` is a finding, not a shrug. Same text,
same answer, whatever the model called it.

**F02, retention period.** Recommended: score a `minimum-retention` finding only where a duration
is stated, and hold the rest with the reason that the period is prescribed elsewhere and was not
resolved. That is one sentence, names no country and no instrument, and makes the loss visible
instead of silent. It will move 7.3 downward in several economies — replay tells us by how many
cells before anything is committed. The better answer, if there is time after the freeze, is to
follow the cross-reference and cite the operative duration. **Your call, because it reverses a
measured decision.**

**F04, distinct claims.** Change the evidence key in `cell/index.ts:332` and the identical key in
`record.ts:168` from (section, indicator, measure) to (section, indicator, measure,
normalised quote) — the same key `read/index.ts` already uses to collapse window duplicates, so
overlapping copies still collapse and genuinely different clauses no longer do. Then
`answer_basis` needs to say *which* finding it rests on (a quote hash beside the measure), and
`export/index.ts:164` must select the basis's finding rather than the first one sharing its
measure. ESCAP's one-measure-per-row rule is an export concern and stays where it is, enforced by
the `one-measure` gate; it is not a reason to destroy evidence before scoring.

Then: replay MYS `980381c4` and AUS `e6c7a53d` and record what moved, cell by cell. That
measurement is the point of doing this batch first.

### Batch 2 — before the re-run starts

**F05, unreadable items.** If every item in a findings array was rejected, the reading failed —
there is no negative in it. If some were accepted and some rejected, keep the accepted ones and
mark the reading incomplete, so its positives count and an absence cannot rest on it. Persist
`reading.rejected` and `reading.incomplete` so a replay can tell the difference afterwards.

**F15, translation suppression.** Cardinality is not correspondence. The cheap, strictly-safer
version: suppress a section only where the counterpart matches on the full normalised heading
path, not the bare label, and keep every unmatched provision. Suppressing less costs reading time,
not correctness; suppressing wrongly costs a provision nobody ever sees. Measure the extra read
volume on MYS before the run.

**F16, host pace on every hop.** Move the wait into `sendOne`, so every actual request waits on its
own host's schedule. That subsumes both branches of the current condition and matches what the
finals README requires — one request per second per host, counted in network requests, not in
outer `fetch()` calls.

**F14, unread instruments.** Default materialisation eligibility becomes "no document, or a
document with no sections whose `unread_document` reason is retryable". Bound it: add an attempt
count, retry empty/timeout/5xx twice, and surface unsupported media or a missing OCR language as a
permanent state rather than treating it as already processed.

**F10 phase 1, stop destroying readings.** `storeDocument` returns the existing document untouched
when the URL and content hash both match and it already has sections. That is the reproducer's
exact case, it is a few lines, and it carries no migration risk. Phase 2 — document versions,
`superseded_at`, retrieval filtered to current versions, sections never deleted while a reading
points at them — is the riskiest change on this list and I would not start it before the freeze
unless you want it. Until it exists the standing rule holds: **do not reparse the production
corpus.**

**F07, hosted routing.** Skip `haveModel` when `hostedConfig()` is set and probe with
`probeHosted` instead; split embeddings onto their own `LEXDROID_EMBED_HOSTS` pool so a hosted
generation engine does not take the embedding traffic with it. Test it by launching an actual
child worker against two local fixtures speaking different protocols, not by calling `generate()`.

### Batch 3 — the re-run

Only after batch 2 lands and its tests pass. MYS first, ~10 h; AUS and SGP as the GPU allows.

### Batch 4 — the deliverable (free, and can be built while the GPU is busy)

**F11, human corrections.** This one is urgent independent of the freeze, because it destroys work
the moment review starts. Reviews must be carried on an identity that excludes the fields a
reviewer may edit — (cell, section, finding) rather than (quote, URL) — and the edited values must
be reapplied to the regenerated row from `review_action.changed_fields`. Generated content,
review actions and the effective reviewed version are three things and need three homes.

**F12, framework verification.** A framework branch in `gatesFor`: `framework_reading.quote_verified`
surfaced as a gate directly, plus in-force, official-host and a quote check against the
instrument's document text. An instrument-level claim is not a per-provision discovery, but its
quotation still has to exist.

**F13, submission eligibility.** `rowsFor` drops rows failing a blocking gate — quote-in-source,
offsets-resolve, in-force, official-host — unless a reviewer decision recorded *after* that gate
result clears it, and an `accept` alone can never clear quote-in-source: only an edit that makes
the quote verbatim, re-checked. Advisory gates (pinpoint, quote-leads, one-measure,
timeframe-evidenced) stay non-blocking. Add a Held sheet so the excluded rows are visible rather
than missing. Proposed blocking set is a judgement call — say if you want it wider or narrower.

**F17b, amendment year.** `amendedYear` returns the year of `lastAmendedOn` or null. It stops
mining four-digit numbers out of a timeframe sentence. The parser half (F17a — FRL writing
compilation dates into `lastAmendedOn`) is parse-side and waits for a reparse; until then the
column stays blank where nothing evidences it, which is what the template asks for.

**F18, engine comparison.** Key on the full tuple (economy, section, indicator, normalised quote)
and report what each side has that the other does not. Gate the zero-fetch sentence on an actual
identified pass — `run` present, `source_mode = 'cache-only'`, status complete — and otherwise say
plainly that no second pass was run.

**F20, cost.** `confirmPass` records into `run_cost` against the run and the engine that answered;
`addCost` counts real engine calls by having `readSection` report its window and retry count; rent
is computed after the finish block, not before it; and an unknown hosted price is written NULL and
displayed as unknown, never as a measured zero.

**F23, empty is not absent.** Live accessors return `[]` for an empty table and `null` only when
there is no database, and the checked-in snapshot sits behind an explicit demonstration mode. Six
accessors, one change each.

## 4. What I am not proposing to do before the freeze

F10 phase 2 (document versioning), F17a (separating compilation from amendment in the FRL parser),
F02's cross-reference resolution, and everything in section 4 of the review — walk completeness,
jurisdiction scope, practice indicators, OCR language coverage, register freshness, carry
provenance. They are real and they are backlog. Each needs a measurement, and the measurements
cost more than the days remaining.

## 5. Tests

Codex's two temporary files assert the defects. As each fix lands, its probe moves into the proper
suite with its expectation inverted, under the name of the behaviour it now guarantees — and the
temporary files go away. That converts 13 reproductions into 13 regressions without writing them
twice.

Four acceptance checks are worth adding beyond the per-fix tests, because they are the properties
that failed here and no unit test was watching:

1. A live decision and a replay of the same run agree on every cell, including failures.
2. Running engine B cannot change engine A's answers, verification or reviewer decisions.
3. No unknown — duration, authorisation, coverage, language — becomes a definite answer by default.
4. A reparse and an export rebuild preserve every reading and every human correction.

## 6. Order and dates

| When | What |
|---|---|
| 20–22 Sep | Batch 1, then replay MYS and AUS and record what moved |
| 22–24 Sep | Batch 2, with the fetch and reader tests |
| 24–27 Sep | Re-run MYS, then AUS and SGP as the GPU allows |
| 24–29 Sep | Batch 4, in parallel with the run |
| 30 Sep | Freeze |

Two things need you before I start: F02 (hold unnumbered retention findings, or keep scoring them)
and F13 (the blocking gate set). Everything else I would do as written.

## 7. What was done (20 September)

All on branch `pipeline-fixes`, uncommitted. Backend 1,115 tests and frontend 45 pass; both
typecheck. Codex's two temporary probe files are gone: every probe now lives, inverted, in
`backend/test/pipeline-regressions.test.ts` or `frontend/lib/export/pipeline-regressions.test.ts`.

### The two calls, decided from ESCAP's material and the finals template

**F02 — score an unnumbered retention period 0.00.** The RDTII 2.1 internal guide, on 7.3: "If the
duration (e.g., day, month, year) is clearly specified, the measure is the minimum period of data
retention. However, if the retention period is not specified, you can mark a measure in the database
and score it as 0.00." The finals template lists "a 'prescribed period' with no number" as a mapping
trap. So the finding is ruled out (recorded, visible, scores 0), not held (which would have made the
cell unresolved). Duration is read from the words quoted, not from the reader's `statedPeriod`.

**F03 — kept as it was.** The RDTII 2.1 guide scores government access "without the *explicit*
authorization of an independent judicial body", and gives Cambodia's undefined "legitimate
authority" as a case that scores. An access power whose provision names no authorisation has not
made judicial authorisation explicit, so scoring it is ESCAP's rule, not a fabrication. The probe is
now a regression that locks this in.

**F13 — the blocking set is the template's required columns.** quote-in-source and offsets-resolve
("Verbatim Snippet … verified against the source"), official-host ("Source URL … official government
portal"), in-force ("repealed provisions … score zero"). Pinpoint anchors, quote-leads, one-measure,
timeframe and score gates stay advisory. An acceptance can clear in-force or official-host; only an
edit whose words are found in the provision clears a quotation. Held rows go to a "Held" sheet.

### Departures from the plan

- **F05** distinguishes malformed items (no indicator, no quote, missing required facts) from
  well-formed claims that fail verification. Only the first make a reading incomplete or failed; a
  claim the provision does not bear out is a checked negative and the reading stands.
- **F10 phase 1** returns the stored document untouched only when the parse is identical, not merely
  the hash: reparsing unchanged bytes is how a parser improvement is applied, and that must still
  replace the sections.
- **F15** pairs a translation by the figures it cites (section numbers, years, act numbers), length,
  and the numbers of the parts it is filed under — not by the heading path, which the Malay parse
  often lacks. MYS suppression falls from 6,086 sections to 4,750; the 1,336 kept are ones that could
  not be paired with confidence, and cost reading time only.
- **F16** paces every redirect hop; the first request was already paced by its callers, so moving the
  wait into `sendOne` would have waited twice.
- **F07** is tested at the unit level (the child's pool gets an embedding host, not the chat URL),
  not by launching a worker against two fixture protocols.
- **F20**: `run_cost.usd` is `NOT NULL`, so an unknown price is a `usd_unknown` flag, shown as
  "unknown" in the interface and workbook.
- **F23**: the snapshot still backs a fresh clone with no database; a database with an empty table now
  shows empty.

Also fixed on the way: `src/read/carry.ts` held a raw NUL byte as a key separator (committed that
way), which made git treat it as binary. It is now the escape, same string at runtime.

### What replay measured

MYS cannot be replayed: every MYS run in the store has 0 readings left (the F10 cascade). On the
runs that still hold readings — AUS `51056fe9` (pillar 7), SGP `82673dbf` (full), SGP `db31f14e` —
no cell's score moved between the old code and the new. More findings are now visible as ruled out
(AUS pillar 7: 195 → 213; SGP full: 1,031 → 1,163), which is F02 and F04 recording what was
previously collapsed or scored.

### The re-run

MYS, all twelve pillars, local engine, started 20 Sep 00:49 (run `d486a7c6`). Its recorded code
revision is `7f3ffcd-dirty`; the exact diff it runs on is saved beside its log.
