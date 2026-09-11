-- LexDroid working store.
--
-- One file, no services. Everything a run produces lands here and can be read back with any
-- SQLite client, which is what makes a run auditable by someone who did not build it.
--
-- ESCAP's completed databases are NOT in this file. They live in a separate database
-- (data/baseline.db) that only the tagger and the evaluator open. See src/baseline/README.md.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------------------------
-- Runs
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS run (
  id              TEXT PRIMARY KEY,
  started_at      TEXT NOT NULL,
  finished_at     TEXT,
  economies       TEXT NOT NULL,              -- JSON array
  pillars         TEXT NOT NULL,              -- JSON array of pillar ids, or "all"
  engine          TEXT NOT NULL,              -- declared engine name, e.g. "engine-a"
  engine_model    TEXT NOT NULL,              -- the model that actually answered
  -- 'fetch' may reach the network; 'cache-only' may not, and a run in that mode that attempts a
  -- fetch fails rather than falling back. The second-engine pass runs cache-only, and the live
  -- test checks that it fetched nothing.
  source_mode     TEXT NOT NULL CHECK (source_mode IN ('fetch', 'cache-only')),
  code_revision   TEXT NOT NULL,              -- git describe --always --dirty
  rubric_derived_at TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed', 'cancelled')),
  -- The exchange rates this run scored with, as fetched. Indicator 12.5 compares a customs
  -- threshold with 200 USD, and a score re-derived next month must use the run's own rate.
  fx_rates        TEXT,
  notes           TEXT
);

-- What a run cost, per engine, measured rather than estimated.
CREATE TABLE IF NOT EXISTS run_cost (
  run_id          TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  engine          TEXT NOT NULL,
  model           TEXT NOT NULL,
  calls           INTEGER NOT NULL DEFAULT 0,
  prompt_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cached_calls    INTEGER NOT NULL DEFAULT 0, -- served from the response cache, not billable
  wall_seconds    REAL NOT NULL DEFAULT 0,
  usd             REAL NOT NULL DEFAULT 0,    -- 0 for local engines; recorded so the claim is checkable
  PRIMARY KEY (run_id, engine, model)
);

-- Where a run's wall time actually went, by stage.
--
-- run_cost answers "what did the model do"; this answers "what did the hour go on", which is a
-- different question and the one that decides whether more breadth is affordable. Recorded per
-- stage per pillar rather than as one total, because a stage that is 5% of a small run can be 60%
-- of a large one and a single number hides exactly that.
CREATE TABLE IF NOT EXISTS run_stage (
  id              INTEGER PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  stage           TEXT NOT NULL,              -- retrieve | read | decide | record | contents | export | verify
  economy_code    TEXT,
  pillar_id       INTEGER,
  seconds         REAL NOT NULL,
  -- What the seconds bought: provisions read, queries run, instruments considered. Without it the
  -- number is not comparable between runs and cannot be extrapolated to a wider one.
  items           INTEGER,
  recorded_at     TEXT NOT NULL
);

-- What the run is doing, while it is doing it.
--
-- run_stage says where the hour went, after the hour. This says what is happening now, and it is
-- the difference between finding a stalled provision while it stalls and finding it in a query the
-- next morning. Thirty-one calls wrote until the context window was full, four to nine minutes
-- each, and nothing in the run said a word until the pillar finished.
--
-- Append-only, one row per thing that happened, and never summarised away: the ledger a person
-- watches live is the same ledger a reviewer reads afterwards.
CREATE TABLE IF NOT EXISTS run_event (
  id              INTEGER PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  at              TEXT NOT NULL,
  economy_code    TEXT,
  pillar_id       INTEGER,
  indicator_id    TEXT,
  stage           TEXT NOT NULL,              -- retrieve | read | framework | decide | record | run
  -- started | finished | refused | failed. A refusal is the engine declining to produce a reading
  -- and is not a failure of the run; both are recorded, and neither is silent.
  kind            TEXT NOT NULL CHECK (kind IN ('started', 'finished', 'refused', 'failed')),
  subject         TEXT,                       -- the provision, instrument or query it is about
  detail          TEXT,
  seconds         REAL,
  -- Progress through the stage, so a watcher can say "reading 41 of 150" rather than "reading".
  done            INTEGER,
  total           INTEGER,
  prompt_tokens   INTEGER,
  output_tokens   INTEGER
);
CREATE INDEX IF NOT EXISTS run_event_run ON run_event (run_id, id);

CREATE INDEX IF NOT EXISTS idx_run_stage_run ON run_stage(run_id);

-- ---------------------------------------------------------------------------------------------
-- Zone 0 -- the economy profile
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS economy (
  code            TEXT PRIMARY KEY,           -- ISO 3166-1 alpha-3
  name            TEXT NOT NULL,
  legal_system    TEXT,                       -- common law / civil law / mixed, and what that implies
  official_languages TEXT NOT NULL,           -- JSON array of BCP-47 tags
  gazette_url     TEXT,
  notes           TEXT,
  profiled_at     TEXT
);

-- Where instruments are published. Discovery walks these, never a hardcoded list of Acts.
CREATE TABLE IF NOT EXISTS portal (
  id              INTEGER PRIMARY KEY,
  economy_code    TEXT NOT NULL REFERENCES economy(code) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  url             TEXT NOT NULL,
  kind            TEXT NOT NULL,              -- legislation-database | gazette | regulator | court | registry
  authority       TEXT,                       -- the body that publishes it
  pillars         TEXT,                       -- JSON array of pillar ids this portal plausibly serves
  robots_allows   INTEGER,                    -- 1 / 0 / NULL when robots.txt not yet fetched
  crawl_delay_ms  INTEGER,
  UNIQUE (economy_code, url)
);

-- Treaty and regional commitments. ESCAP's step 1: WTO Trade Policy Reviews, ASEAN/APEC/EAEU.
CREATE TABLE IF NOT EXISTS commitment (
  id              INTEGER PRIMARY KEY,
  economy_code    TEXT NOT NULL REFERENCES economy(code) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  status          TEXT,                       -- signatory / ratified / observer / not a party
  source_url      TEXT,
  UNIQUE (economy_code, name)
);

-- ---------------------------------------------------------------------------------------------
-- Zone 1 -- discover, fetch, parse, index
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS instrument (
  id              INTEGER PRIMARY KEY,
  economy_code    TEXT NOT NULL REFERENCES economy(code) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  official_number TEXT,                       -- "Act 709", "No. 31/2015"
  kind            TEXT,                       -- act | regulation | notice | guideline | order | rule
  -- 'in-force' is the only status a row may cite. A draft, a repealed provision, or an amending
  -- act cited in place of its principal act each score zero in ESCAP's marking.
  status          TEXT NOT NULL DEFAULT 'unknown'
                  CHECK (status IN ('in-force', 'repealed', 'draft', 'amending', 'unknown')),
  status_basis    TEXT,                       -- the sentence in the document that establishes it
  amends_instrument_id INTEGER REFERENCES instrument(id),
  commenced_on    TEXT,                       -- ISO date, read from the document itself
  last_amended_on TEXT,
  timeframe_basis TEXT,                       -- quoted evidence for the two dates above
  language        TEXT,                       -- BCP-47
  source_url      TEXT NOT NULL,
  discovered_via  TEXT NOT NULL,              -- portal id, search, or citation from another instrument
  discovered_at   TEXT NOT NULL,
  -- The title is only a filename, and the document's own name should replace it once read. A
  -- portal that files uploads under slugs cannot otherwise be cited by the name anyone uses.
  title_provisional INTEGER NOT NULL DEFAULT 0,
  -- Other files the same page publishes: language editions and revisions of one instrument.
  -- JSON array of URLs, each read as a document of this instrument rather than as its own.
  also_at         TEXT,
  UNIQUE (economy_code, source_url)
);

CREATE TABLE IF NOT EXISTS document (
  id              INTEGER PRIMARY KEY,
  instrument_id   INTEGER NOT NULL REFERENCES instrument(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  content_hash    TEXT NOT NULL,              -- sha256; the cache is addressed by this
  media_type      TEXT NOT NULL,
  bytes           INTEGER NOT NULL,
  http_status     INTEGER NOT NULL,
  fetched_at      TEXT NOT NULL,
  from_cache      INTEGER NOT NULL DEFAULT 0,
  -- How the text was recovered. 'ocr' is flagged in the export, because ESCAP marks a tool that
  -- says what it could not read above one that presents everything with equal confidence.
  extraction      TEXT CHECK (extraction IN ('html', 'pdf-text', 'ocr', 'plain', 'none')),
  section_count   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (url, content_hash)
);

-- The text a section's offsets index into, kept out of the document row so listing documents stays
-- cheap. This is what makes a citation re-checkable months later: the verifier reads the snippet
-- back at the stored offset rather than trusting that the parser would produce the same string
-- again.
CREATE TABLE IF NOT EXISTS document_text (
  document_id     INTEGER PRIMARY KEY REFERENCES document(id) ON DELETE CASCADE,
  text            TEXT NOT NULL,
  parser          TEXT NOT NULL,              -- which parser produced it, so a bad parse is traceable
  parsed_at       TEXT NOT NULL
);

-- A document nothing could be read out of. Recorded, never treated as an empty document --
-- v1 certified 852 Australian documents as clean negatives this way.
CREATE TABLE IF NOT EXISTS unread_document (
  document_id     INTEGER PRIMARY KEY REFERENCES document(id) ON DELETE CASCADE,
  reason          TEXT NOT NULL,              -- scanned-no-ocr | ocr-below-threshold | landing-page | empty | parse-error
  detail          TEXT,
  recorded_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS section (
  id              INTEGER PRIMARY KEY,
  document_id     INTEGER NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  ordinal         INTEGER NOT NULL,           -- document order
  -- "Part IV > s. 26 > (1)". The citation a reviewer checks is built from this, not guessed.
  heading_path    TEXT NOT NULL,
  label           TEXT,                       -- "26", "26(1)", "Reg 5"
  text            TEXT NOT NULL,
  char_start      INTEGER NOT NULL,           -- offset into the document's extracted text
  char_end        INTEGER NOT NULL,
  page            INTEGER,
  language        TEXT,
  -- The fragment id on the source site, so a citation deep-links to the provision itself rather
  -- than to the top of a 200-section Act. The SSO parser reads these ("pr26-") and they were being
  -- computed and then dropped for want of this column, which is exactly the pinpoint-citation
  -- problem v1 spent a week recovering from.
  anchor          TEXT,
  UNIQUE (document_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_section_document ON section(document_id);
CREATE INDEX IF NOT EXISTS idx_instrument_economy ON instrument(economy_code);

-- Corpus-wide lexical index. One index over every section of every document in the economy --
-- not one index per document, which is what forced v1 to visit all 536 Singapore documents to
-- answer any corpus-level question.
--
-- trigram, so Thai, Chinese, Malay and Cyrillic are searchable at all. A word tokenizer produces
-- an empty token list for them and switches search off without saying so. The cost of trigram is
-- that a query term must be at least three characters; the shortlist stage enforces that.
--
-- contentless (content='') so the text is not stored twice, with contentless_delete so a document
-- can be re-indexed. External-content FTS5 cannot: re-indexing needs the previously indexed
-- values, and once a section row is replaced they are gone, which corrupts the index.
CREATE VIRTUAL TABLE IF NOT EXISTS section_fts USING fts5(
  text,
  heading_path,
  content = '',
  contentless_delete = 1,
  tokenize = 'trigram'
);

-- Corpus-wide dense index, from a local multilingual embedding model.
-- When a host told us to stop, and until when.
--
-- The in-process circuit breaker only protects one run. Six runs launched in a shell loop each got
-- a fresh breaker and each walked into the same wall, which is how a crawler that is careful by
-- design ends up being the least welcome thing on a government server all afternoon. Recording the
-- cooldown here makes it survive the process, so the next invocation declines to ask at all.
CREATE TABLE IF NOT EXISTS host_cooldown (
  host            TEXT PRIMARY KEY,
  until           TEXT NOT NULL,              -- ISO 8601; before this, we do not send anything
  refusals        INTEGER NOT NULL,
  recorded_at     TEXT NOT NULL
);

-- An instrument's title, embedded.
--
-- The register knows the title, kind, official number and portal of every instrument in an economy
-- before a single document is fetched -- 6,365 of them for Singapore. Titles of legislation are
-- unusually informative: "Personal Data Protection Act 2012" says what it governs. Embedding them
-- lets a cell shortlist the instruments worth reading before deciding what to fetch, instead of
-- fetching a whole statute book in order to find the six documents a question turns on.
--
-- This is not a substitute for reading the text. It decides fetch order and fetch scope, and both
-- are recorded per cell so a shortlist that missed something is auditable rather than invisible.
CREATE TABLE IF NOT EXISTS instrument_embedding (
  instrument_id   INTEGER PRIMARY KEY REFERENCES instrument(id) ON DELETE CASCADE,
  model           TEXT NOT NULL,
  dims            INTEGER NOT NULL,
  vector          BLOB NOT NULL               -- float32
);

-- An instrument's table of contents: the headings it gives its own provisions.
--
-- The register knows 6,365 Singapore instruments by title, and a title is where discovery was
-- failing. Measured 7 September 2026 against ESCAP's own citations for pillars 6 and 7: of 23
-- cited instruments, 14 are in the register and title ranking surfaced 7 of them in the top 100.
-- The Companies Act, the Income Tax Act, the Employment Act and the Criminal Procedure Code -- all
-- registered, all cited, all below rank 200. Restricting the search to Acts did not recover them,
-- because the failure is not ranking. "Companies Act 1967" contains no word about keeping records,
-- so no weighting of those words can find it: the information is not in the title.
--
-- It is in the contents. "199 Accounting records", "39 Access to computer", "95 Employment
-- records" are the subject stated at provision level, and a table of contents is one request --
-- the same request that reading the document starts with, so the fetch is not spent twice.
--
-- Acts, principally. The generality that makes an Act's title uninformative is what makes its
-- contents necessary; subsidiary legislation is named after the narrow thing it does, so its title
-- already says it.
CREATE TABLE IF NOT EXISTS instrument_contents (
  instrument_id   INTEGER PRIMARY KEY REFERENCES instrument(id) ON DELETE CASCADE,
  headings        TEXT NOT NULL,              -- JSON array, in document order
  heading_count   INTEGER NOT NULL,
  source_url      TEXT NOT NULL,
  extractor       TEXT NOT NULL,              -- which reader produced them, so a bad read is traceable
  fetched_at      TEXT NOT NULL
);

-- One heading, embedded, attributed to its instrument.
--
-- Individually rather than as one blob per instrument: an Act's contents averaged into a single
-- vector is the same mistake as concatenating a cell's queries into one paragraph -- it embeds to
-- the mean of everything the Act mentions, which is close to nothing. A heading is short and
-- specific, and specific is the whole point.
CREATE TABLE IF NOT EXISTS heading_embedding (
  id              INTEGER PRIMARY KEY,
  instrument_id   INTEGER NOT NULL REFERENCES instrument(id) ON DELETE CASCADE,
  ordinal         INTEGER NOT NULL,
  heading         TEXT NOT NULL,
  model           TEXT NOT NULL,
  dims            INTEGER NOT NULL,
  vector          BLOB NOT NULL,
  UNIQUE (instrument_id, ordinal, model)
);

CREATE INDEX IF NOT EXISTS idx_heading_embedding_instrument ON heading_embedding(instrument_id);

CREATE TABLE IF NOT EXISTS section_embedding (
  section_id      INTEGER PRIMARY KEY REFERENCES section(id) ON DELETE CASCADE,
  model           TEXT NOT NULL,
  dims            INTEGER NOT NULL,
  vector          BLOB NOT NULL               -- float32
);

-- Every request that left the machine, so the polite-crawling claim is evidenced and the
-- zero-fetch second pass is checkable rather than asserted.
CREATE TABLE IF NOT EXISTS fetch_log (
  id              INTEGER PRIMARY KEY,
  run_id          TEXT REFERENCES run(id) ON DELETE SET NULL,
  host            TEXT NOT NULL,
  url             TEXT NOT NULL,
  requested_at    TEXT NOT NULL,
  http_status     INTEGER,
  bytes           INTEGER,
  wait_ms         INTEGER NOT NULL DEFAULT 0, -- time spent held by the rate limiter
  outcome         TEXT NOT NULL               -- ok | cached | robots-disallowed | error | skipped-cache-only
);

CREATE INDEX IF NOT EXISTS idx_fetch_log_run ON fetch_log(run_id);

-- ---------------------------------------------------------------------------------------------
-- The cell -- the unit of work
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cell (
  id              INTEGER PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  economy_code    TEXT NOT NULL REFERENCES economy(code) ON DELETE CASCADE,
  indicator_id    TEXT NOT NULL,              -- TEXT. "4.01" and "4.1" are different indicators.
  -- Three states, and never silence.
  --   restricted     a measure was found; the row cites the provision
  --   no-restriction the governing instrument was found and read, and does not impose one
  --   unresolved     we could not answer, and the row says why
  state           TEXT CHECK (state IN ('restricted', 'no-restriction', 'unresolved')),
  unresolved_reason TEXT,
  answered_at     TEXT,
  -- The search this cell asked for, kept with the cell rather than reconstructed later. Every
  -- query verbatim, how deep the fused list was cut, how many distinct provisions the queries
  -- surfaced before that cut, and how many the economy holds at all. Those last two are the
  -- numerator and denominator behind "we looked".
  queries         TEXT,                       -- JSON array, in the order asked
  depth           INTEGER,
  surfaced        INTEGER,
  sections_indexed INTEGER,
  -- Provisions actually put in front of the engine for this cell. Larger than the shortlist:
  -- reading is pillar-scoped, so a cell is answered over its whole pillar's union.
  sections_read   INTEGER,
  -- The instruments the register named as governing this question, best first. The decision is
  -- ordered by it, so it is recorded with the cell rather than re-derived from a later register.
  governing       TEXT,                       -- JSON array of instrument ids
  UNIQUE (run_id, economy_code, indicator_id)
);

-- What the search actually did for this cell. This record is the evidence behind a zero:
-- ESCAP never proves exhaustion, but they do say which instrument they read.
CREATE TABLE IF NOT EXISTS shortlist_entry (
  id              INTEGER PRIMARY KEY,
  cell_id         INTEGER NOT NULL REFERENCES cell(id) ON DELETE CASCADE,
  section_id      INTEGER NOT NULL REFERENCES section(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('lexical', 'dense', 'citation', 'portal')),
  query           TEXT NOT NULL,
  rank            INTEGER NOT NULL,
  score           REAL NOT NULL,
  read_at         TEXT,                       -- NULL = shortlisted but not sent to the model
  UNIQUE (cell_id, section_id, channel, query)
);

-- ---------------------------------------------------------------------------------------------
-- Zone 2 -- the one model stage. Facts, never a score.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reading (
  id              INTEGER PRIMARY KEY,
  cell_id         INTEGER NOT NULL REFERENCES cell(id) ON DELETE CASCADE,
  section_id      INTEGER NOT NULL REFERENCES section(id) ON DELETE CASCADE,
  engine          TEXT NOT NULL,
  model           TEXT NOT NULL,
  -- "none apply" is a first-class answer and the commonest correct one.
  applies         INTEGER NOT NULL CHECK (applies IN (0, 1)),
  -- Verbatim operative words, and the sub-clause they sit in. Verified against the source before
  -- anything downstream may use them.
  quote           TEXT,
  quote_char_start INTEGER,
  quote_char_end  INTEGER,
  subclause       TEXT,
  -- The attributes the score bands turn on: horizontal or sectoral, personal or non-personal,
  -- mandatory or permissive, how many measures. Shape differs per pillar; the reader validates
  -- against the pillar's own schema.
  attributes      TEXT NOT NULL DEFAULT '{}', -- JSON
  reasoning       TEXT,
  prompt_tokens   INTEGER,
  output_tokens   INTEGER,
  latency_ms      INTEGER,
  -- One call reads one provision against a whole pillar, and its answer is then sorted to the
  -- pillar's cells -- so the same call appears as several rows here. Tokens and latency are
  -- repeated on each of them, and summing them without DISTINCT engine_call counts the call
  -- once per indicator. The run's actual cost is in run_cost, measured at the call.
  engine_call     TEXT,
  read_at         TEXT NOT NULL,
  UNIQUE (cell_id, section_id, engine, model)
);

-- A framework indicator asks about an instrument, not a provision, so its reading has no section
-- to hang on. 7.1 and 7.2 are the only two, and ESCAP is explicit that a per-provision citation
-- for them is not a discovery.
CREATE TABLE IF NOT EXISTS framework_reading (
  id              INTEGER PRIMARY KEY,
  cell_id         INTEGER NOT NULL REFERENCES cell(id) ON DELETE CASCADE,
  instrument_id   INTEGER NOT NULL REFERENCES instrument(id) ON DELETE CASCADE,
  engine          TEXT NOT NULL,
  model           TEXT NOT NULL,
  establishes_framework INTEGER NOT NULL CHECK (establishes_framework IN (0, 1)),
  horizontal      INTEGER,
  dedicated       INTEGER,
  dedicated_words TEXT,                       -- what the instrument says it is for, in its own words
  dedicated_shown INTEGER,                    -- and whether those words are really in its opening
  sector_words    TEXT,                       -- the words that confine it to one named sector
  sectoral_shown  INTEGER,                    -- and whether those words are really in its opening
  sector          TEXT,
  quote           TEXT,
  quote_verified  INTEGER,
  reasoning       TEXT,
  prompt_tokens   INTEGER,
  output_tokens   INTEGER,
  latency_ms      INTEGER,
  read_at         TEXT NOT NULL,
  UNIQUE (cell_id, instrument_id, engine, model)
);

-- ---------------------------------------------------------------------------------------------
-- Zone 3 -- the score is computed from the attributes by a pure function, per indicator.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cell_answer (
  cell_id         INTEGER PRIMARY KEY REFERENCES cell(id) ON DELETE CASCADE,
  score           REAL,
  band_ordinal    INTEGER,                    -- which of ESCAP's bands, so the working is visible
  band_criterion  TEXT,                       -- that band's text, verbatim
  -- Why this band and not the one above: the attribute that decided it.
  deciding_fact   TEXT,
  controlling_instrument_id INTEGER REFERENCES instrument(id),
  -- The sentence a reviewer reads, assembled from the band's own words and the evidence.
  -- Stored because it is what the export quotes; never written by a model.
  rationale       TEXT,
  computed_at     TEXT NOT NULL
);

-- ---------------------------------------------------------------------------------------------
-- The export row. ESCAP's fourteen columns, plus what we need to defend each one.
-- A provision reaches this table only as evidence cited by a cell answer.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS export_row (
  id              INTEGER PRIMARY KEY,
  cell_id         INTEGER NOT NULL REFERENCES cell(id) ON DELETE CASCADE,
  economy         TEXT NOT NULL,
  law_name        TEXT NOT NULL,
  law_number_ref  TEXT,
  last_amended    TEXT,
  indicator_id    TEXT NOT NULL,
  article         TEXT,
  discovery_tag   TEXT CHECK (discovery_tag IN ('NEW', 'KNOWN')),
  location_reference TEXT,
  verbatim_snippet TEXT,
  -- Where that snippet sits in the document text. On the row, not on the reading: one reading of
  -- one provision can yield several findings, each quoting a different span of it.
  quote_char_start INTEGER,
  quote_char_end  INTEGER,
  mapping_rationale TEXT,                     -- max 300 chars; quote before interpretation
  source_url      TEXT,
  confidence      TEXT,
  notes           TEXT,
  language_of_source TEXT,
  -- Provenance behind the row, not exported but needed to re-verify it.
  section_id      INTEGER REFERENCES section(id),
  reading_id      INTEGER REFERENCES reading(id),
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_export_row_cell ON export_row(cell_id);

-- Deterministic gates, run against the source. A row that fails one is held for review with the
-- failure named. Nothing is ever dropped silently, and nothing is deleted by pattern.
CREATE TABLE IF NOT EXISTS gate_result (
  id              INTEGER PRIMARY KEY,
  export_row_id   INTEGER NOT NULL REFERENCES export_row(id) ON DELETE CASCADE,
  gate            TEXT NOT NULL,
  passed          INTEGER NOT NULL CHECK (passed IN (0, 1)),
  detail          TEXT,
  checked_at      TEXT NOT NULL,
  UNIQUE (export_row_id, gate)
);

-- Everything the pipeline set aside, at any stage, with the reason. Absence is never silent.
CREATE TABLE IF NOT EXISTS discard (
  id              INTEGER PRIMARY KEY,
  run_id          TEXT REFERENCES run(id) ON DELETE CASCADE,
  stage           TEXT NOT NULL,
  subject         TEXT NOT NULL,              -- what was dropped: a url, a section id, a candidate
  reason          TEXT NOT NULL,
  detail          TEXT,
  recorded_at     TEXT NOT NULL
);

-- ---------------------------------------------------------------------------------------------
-- Review
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS review_action (
  id              INTEGER PRIMARY KEY,
  export_row_id   INTEGER NOT NULL REFERENCES export_row(id) ON DELETE CASCADE,
  action          TEXT NOT NULL CHECK (action IN ('accept', 'edit', 'reject')),
  -- An edit carries an attestation: the reviewer says they checked the source. An accept carries
  -- no edits. They are different actions and are recorded as different actions.
  attestation     TEXT,
  changed_fields  TEXT,                       -- JSON
  reviewer        TEXT,
  acted_at        TEXT NOT NULL
);
