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
  -- 1 where the engine charges and its price was not recorded: a hosted engine's bill is the
  -- provider's, and `usd` then says nothing. Shown as unknown, never as a measured zero.
  usd_unknown     INTEGER NOT NULL DEFAULT 0,
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
  stage           TEXT NOT NULL,              -- run | discover | fetch | index | retrieve | read
                                              -- | framework | decide | record | confirm | export | verify
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
  -- The Act this instrument is made under, as the register itself states it. Inferring it
  -- from the title misses every instrument its drafters did not name after its parent.
  made_under_instrument_id INTEGER REFERENCES instrument(id),
  -- The parent's name as the register writes it, kept whether or not it resolves to a row. A
  -- register can name an Act it does not itself publish, and the name is evidence either way.
  made_under_name TEXT,
  made_under_basis TEXT,
  commenced_on    TEXT,                       -- ISO date, read from the document or stated by the register
  last_amended_on TEXT,                       -- ISO date of an amendment, never of a republication
  -- The date the published consolidation is current to. A separate column because it is a weaker
  -- claim than last_amended_on and was being reported as one: Malaysia serves the Personal Data
  -- Protection Act "as at 2023" while the duty ESCAP scores arrived in a 2024 amendment, so a
  -- row built from the catalogue's date said the Act was last amended in 2023. It was not.
  current_to      TEXT,
  timeframe_basis TEXT,                       -- quoted evidence for the dates above
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
  recorded_at     TEXT NOT NULL,
  -- Times this address has come back unreadable. A transient failure is asked for again until
  -- this reaches the limit; a permanent one is not asked for again at all.
  attempts        INTEGER NOT NULL DEFAULT 1
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
  -- The parser read this provision as repealed or deleted. Kept, because a reader needs to see that
  -- a section is gone, and never the basis of a current measure.
  repealed        INTEGER NOT NULL DEFAULT 0,
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
  outcome         TEXT NOT NULL,              -- ok | cached | robots-disallowed | error | skipped-cache-only
  -- Almost always GET. A portal whose register is only reachable by POST -- legalinfo.mn answers
  -- a GET with page one of an unfiltered listing whatever it is asked -- produces several rows
  -- at one url that are different requests, and a log that cannot tell them apart understates
  -- what left this machine. C5a is scored on these rows.
  method          TEXT NOT NULL DEFAULT 'GET'
);

CREATE INDEX IF NOT EXISTS idx_fetch_log_run ON fetch_log(run_id);

-- What each host's robots.txt said, kept so the claim can be replayed rather than repeated.
--
-- "We honour robots.txt" is the loudest claim this tool makes, and until now the store held two
-- booleans about it: whether a host had any disallow rule, and its crawl delay. The rules
-- themselves survived only in the content-addressed blob cache, reachable by recomputing the hash
-- of the robots URL -- so checking after the fact that no fetched path was disallowed meant
-- reconstructing 41 hosts' rules off disk, and for the largest Malaysian portal, 10,643 requests
-- against a crawl delay that proves a real file was read, the blob was simply gone. Compliance
-- that cannot be replayed is a claim and not a fact, so the rules we acted on are written here.
CREATE TABLE IF NOT EXISTS robots_snapshot (
  host            TEXT PRIMARY KEY,
  fetched         INTEGER NOT NULL,           -- the host served rules and we parsed them
  absent          INTEGER NOT NULL,           -- 404 or 410: the host says it has no rules
  disallow        TEXT NOT NULL,              -- JSON array, exactly what the crawl obeyed
  allow           TEXT NOT NULL,              -- JSON array
  crawl_delay_ms  INTEGER,
  body            TEXT,                       -- the file as served, where the host served one
  recorded_at     TEXT NOT NULL
);

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
  -- The instruments this cell's own search surfaced, best rank first. A zero is cited against
  -- these, and a count alone cannot say which Act was read -- so the run could not reproduce it.
  surfaced_instruments TEXT,                  -- JSON [{instrumentId, instrumentTitle, rank, currentTo}]
  -- Framework candidates the engine failed to read. The ones it did read are the cell's
  -- framework_reading rows; these leave none, and without the count a replay could not tell a
  -- framework nobody could read from one that was read and found missing. NULL: not recorded.
  framework_failed INTEGER,
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
  -- Items of the answer that did not become findings: refused against the provision, and of those
  -- the ones too malformed to be findings at all. A reading with unreadable items was not read in
  -- full. NULL: recorded before either was counted, and unknown rather than zero.
  rejected        INTEGER,
  unreadable      INTEGER,
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
  framework_words TEXT,                       -- the rule said to establish the framework
  framework_shown INTEGER,                    -- and whether that rule is really in the instrument
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
  -- Whether that instrument was read to govern the subject or merely surfaced by the search.
  -- Fourteen indicators score their maximum for an absence, and only the first sustains one.
  absence_basis   TEXT CHECK (absence_basis IN ('governing', 'surfaced')),
  -- The sentence a reviewer reads, assembled from the band's own words and the evidence.
  -- Stored because it is what the export quotes; never written by a model.
  rationale       TEXT,
  -- The confirmation state this score was computed under. A score is a function of the readings
  -- and the second reading's verdicts, and the same run scored 105 cells one way and 118 the other
  -- with nothing written down to say which. These say which: how many of the cell's findings
  -- carried a verdict, and how many that pass ruled out. A re-derivation that sees different
  -- numbers reports a mismatch rather than a different answer.
  confirmations_asked   INTEGER,
  confirmations_applied INTEGER,
  computed_at     TEXT NOT NULL
);

-- Which findings the answer actually stood on, in the decision's own order.
-- Zone 3 sets most findings aside with a reason -- a sentence that declares rather than obliges,
-- a power to make a rule rather than the rule. Those stay in `reading`, which is the record of
-- what was read; they are not measures, so they are not rows.
CREATE TABLE IF NOT EXISTS answer_basis (
  id              INTEGER PRIMARY KEY,
  cell_id         INTEGER NOT NULL REFERENCES cell(id) ON DELETE CASCADE,
  ordinal         INTEGER NOT NULL,           -- what the band was counted from comes first
  instrument_id   INTEGER NOT NULL REFERENCES instrument(id),
  -- Null for a framework indicator: ESCAP decides those over instruments, not provisions.
  section_id      INTEGER REFERENCES section(id),
  measure         TEXT,
  -- Which of the provision's findings under that measure the answer counted. A provision can
  -- carry two, and the row has to quote the one the band was decided on. NULL: not recorded.
  quote           TEXT,
  UNIQUE (cell_id, section_id, measure, instrument_id)
);
CREATE INDEX IF NOT EXISTS idx_answer_basis_cell ON answer_basis(cell_id);

-- A citation parked for the length of a re-parse.
--
-- `answer_basis` and `export_row` point at the provision an answer stood on, and neither of those
-- references cascades, on purpose: a past run's record of what it cited is not something a parser
-- change may quietly delete. But a re-parse does delete and rebuild the sections of every document
-- it touches, and SQLite refuses that while the pointers are live -- which is how re-parsing
-- Malaysia stopped at the sixth Act with "FOREIGN KEY constraint failed".
--
-- So the pointer is written down here, nulled for the duration, and then put back against the
-- provision that now carries the same Part, heading and label. A citation whose provision the new
-- parse no longer produces is not restored; it goes to the discard ledger, named.
CREATE TABLE IF NOT EXISTS detached_citation (
  id              INTEGER PRIMARY KEY,
  table_name      TEXT NOT NULL CHECK (table_name IN ('answer_basis', 'export_row')),
  row_id          INTEGER NOT NULL,
  document_id     INTEGER NOT NULL,
  ordinal         INTEGER NOT NULL,
  heading_path    TEXT NOT NULL,
  label           TEXT,
  detached_at     TEXT NOT NULL,
  UNIQUE (table_name, row_id)
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

-- Whether one provision states one measure, asked on its own.
--
-- Keyed by the question and not by the cell or the run: "does section 24 of the Payment Services
-- Act state a licence to sell online" has one answer, and a second cell asking it should read the
-- answer rather than pay for it again. That is also what makes the pass affordable to measure --
-- it re-asks about provisions already read, with no fetching, parsing, indexing or searching.
--
-- The question is the provision and the measure *as the catalogue described it when asked*, and the
-- answer is one model's. `question` is the hash of everything the reader was shown apart from the
-- provision (src/read/question.ts); a verdict is consulted only while its question is the one the
-- catalogue asks today, and only for the model asking. NULL is a verdict banked before questions
-- were recorded, kept for the record and never consulted.
CREATE TABLE IF NOT EXISTS measure_confirmation (
  id              INTEGER PRIMARY KEY,
  section_id      INTEGER NOT NULL REFERENCES section(id) ON DELETE CASCADE,
  indicator_id    TEXT NOT NULL,
  measure         TEXT NOT NULL,
  question        TEXT,
  -- The provision's own words stating the measure, or NULL where it states none. NULL is the
  -- ruling: read, and does not carry the measure.
  words           TEXT,
  -- Why it was not asked, when it was not. A provision nobody read is not one found wanting.
  failure         TEXT,
  model           TEXT NOT NULL,
  prompt_tokens   INTEGER,
  output_tokens   INTEGER,
  latency_ms      INTEGER,
  asked_at        TEXT NOT NULL,
  UNIQUE (section_id, indicator_id, measure, model, question)
);
CREATE INDEX IF NOT EXISTS idx_confirmation_measure ON measure_confirmation(indicator_id, measure);

-- ---------------------------------------------------------------------------------------------
-- Every table that points at a provision, indexed on the pointer.
--
-- Not for reading speed: SQLite enforces ON DELETE CASCADE by looking for the children, and with
-- no index on the child's key that is a full scan of the child table for each parent row deleted.
-- A re-parse deletes a document's sections one at a time, so re-parsing Malaysia scanned a
-- 336,000-row `reading` table about thirty-five times per document -- fourteen seconds each, six
-- hours for the corpus, and the corpus is re-parsed whenever the parser learns something.
--
-- Declared at the end because an index cannot be created before its table exists, and these point
-- back at `section` from all over Zones 2 and 3.
-- ---------------------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_reading_section ON reading(section_id);
CREATE INDEX IF NOT EXISTS idx_shortlist_entry_section ON shortlist_entry(section_id);
CREATE INDEX IF NOT EXISTS idx_answer_basis_section ON answer_basis(section_id);
CREATE INDEX IF NOT EXISTS idx_export_row_section ON export_row(section_id);
CREATE INDEX IF NOT EXISTS idx_measure_confirmation_section ON measure_confirmation(section_id);
CREATE INDEX IF NOT EXISTS idx_export_row_reading ON export_row(reading_id);
