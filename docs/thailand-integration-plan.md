# Thailand integration — plan

Started 14 September 2026 against `master` at commit `a139147`, on branch `feat/thailand`, as
planning only with nothing implemented. That is no longer true as of the dated sections further
down: `backend/data/profiles/THA.json`, `backend/src/util/thai.ts`, and shared-code fixes in
`backend/src/index/index.ts`, `backend/src/parse/index.ts` and `backend/src/db/index.ts` (the last
three narrowly scoped and documented in their own dated sections below) now exist on this branch.

**Conventions this document follows**: this is a living document, not a static plan. New findings
are appended as dated sections rather than silently rewriting earlier ones — including sections
that correct an earlier section's own claims (see "Step 3 done, and two things this plan got
wrong," "A fourth real bug," etc.). If you are reading this to understand current status, read
top-to-bottom for context but trust the latest dated section on any given topic over an earlier
one; nothing here is retroactively edited to look right in hindsight, so an earlier wrong guess
stays visible next to the correction rather than disappearing. `docs/thailand-ocs-adapter-spec.md`
is a companion document in the same spirit -- a confidence-rated technical reconstruction, kept
separate because of its length and narrow (OCS-only) scope.

This follows the shape of `docs/india-integration.md`, the one economy this repo has already
added since the three-economy gate (`docs/architecture.md` §9 step 3). India is the precedent to
copy; the China attempt (open PR #1, branch `china-economy`, unmerged, 86 commits behind master)
is the precedent to learn from — it is blocked on exactly the access question this plan has to
answer for Thailand before writing any adapter code.

## Why Thailand, and what's already true about it

Thailand is one of the seven Round 2 economies ESCAP supplied a completed answer sheet for
(`docs/INDEX.md`: `database/ESCAP-RDTII-2.1_ Round 2 Database.xlsx` — China, India, Indonesia, Lao
PDR, Mongolia, Russian Federation, Thailand) and one of the nine sealed live-test economies. Two
things follow from that, both load-bearing:

- **There is a baseline to evaluate against**, the same way Singapore/Malaysia/Australia have one.
  It goes into the *isolated* baseline store exactly like the others — `docs/architecture.md` §5 is
  explicit that this store is not readable by Zone 0–3, enforced by a test that fails if any
  pipeline module imports it. It is used for two things only: tagging NEW vs KNOWN at export, and
  measuring our answers against ESCAP's. **It never seeds the profile, the register, a query or an
  answer.** This is the same discipline `india-integration.md` states for India's sheet, and it is
  the single easiest rule to violate by accident (e.g. reading the Round 2 spreadsheet "just to see
  what portals ESCAP used" while writing the profile) so it is called out first.
- **v1 already has a measured shape for what a correct Thailand run looks like**: 118 rows, 69 of
  them scoring zero (`docs/lessons-from-lexdroid-v1.md` Part 1, rule 2's table). That number is
  from ESCAP's own data, not from anything v1 got right — it is a volume sanity check for this
  rebuild, the same way "70–120 rows, roughly half zero" is stated as the general expectation in
  `docs/architecture.md` §3.

Thailand's script is also already a first-class case in the design, not new ground. Thai is named
explicitly in the trigram-tokenizer rationale in `docs/architecture.md` §2 and §7 ("Thai, Chinese,
Cyrillic and Malay are searchable at all"). That claim is half true today — see the "one shared-code
fix this plan needs" section below, which is the one place this work cannot stay Thailand-only.

## Scope boundary (mirrors India's)

Thai law is a civil-law, unitary system — simpler than India's federal boundary problem, but it has
its own three: (1) an Act (`พระราชบัญญัติ`) is routinely a skeleton that delegates its operative
detail to a Royal Decree, a Ministerial Regulation, or a Notification (`ประกาศ`) issued by the
regulator the Act creates — the same delegation pattern the China profile documents for the
Cybersecurity Law, and the reason a citation of the Act alone is frequently the wrong instrument;
(2) Thai constitutional monarchy legislation only comes into force on publication in the Royal
Gazette (`ราชกิจจานุเบกษา`), and the Gazette date is the commencement evidence, not the Act's own
date — this is exactly the "amendment date must be evidenced in the document" gate in
`docs/architecture.md` §4, and the Gazette is the primary source for it; (3) Thai script is written
without spaces between words, like Chinese and Japanese, which is a fact about search rather than
about law and is handled below rather than folded into the profile.

Declared out of scope for a first slice, matching how India deferred State/UT law: no attempt to
resolve conflicts between a national law and a not-yet-published subordinate regulation; no
translation of Thai text into English anywhere in the pipeline (`docs/architecture.md` explicitly
rules out "full-document translation as opposed to reading in the source language"); OCR only if a
source turns out to be scan-only, not built speculatively (see below).

## What's genuinely additive, and what already exists to reuse

The profile system is designed for exactly this: `backend/src/profile/index.ts` loads
`backend/data/profiles/<CODE>.json` by filename, and `availableProfiles()` just lists whatever is
in that directory. **Adding Thailand is, by construction, adding one file** —
`backend/data/profiles/THA.json` — plus whatever portal adapters that file's `portal.adapter`
fields name. No code in `profile/`, `discover/index.ts`'s registration loop, `parse/`, `index/`
(search), `decide/` (scoring), or `verify/` needs to change for Thailand to exist as an economy.
That isolation is already proven: `india-integration.md` added `IND.json` plus one new adapter
(`indiacode.ts`) and touched nothing else in the pipeline; the unmerged China work added `CHN.json`
plus one new adapter (`flk.ts`) and a `.docx` parser (needed because China's portal serves Word, not
PDF/HTML — not needed for Thailand unless a Thai portal turns out to do the same).

Existing adapters that may need zero new code, depending on what a portal turns out to look like:

- `backend/src/discover/sitemap.ts` — walks a site's own sitemap.xml. Bank of Thailand's
  `robots.txt` (read below, verified) explicitly advertises `en.sitemap.xml` and `th.sitemap.xml`,
  which is precisely this adapter's shape.
- `backend/src/discover/crawl.ts` — the generic polite-crawl adapter, for a portal with browsable
  listings and no API and no sitemap.
- `backend/src/discover/drupal.ts` / `wp.ts` — if a regulator's site turns out to run Drupal or
  WordPress (common for Thai government sites; worth checking each portal's generator meta tag
  before assuming a bespoke adapter is needed).

## Candidate sources — verified live, 15 September 2026

Rollout step 1 (below) is now done. Every candidate portal was fetched for real, from a shell that
can actually reach them (`curl`, a browser-shaped User-Agent, redirects followed, DNS and TLS
inspected where the initial request didn't explain itself). Superseded the 14 Sep table below,
which was written from a session that could not reach these hosts at all.

| Portal | Status, 15 Sep 2026 |
|---|---|
| `www.bot.or.th` (Bank of Thailand) | **PERMITTED.** `robots.txt` 200 OK. Disallows only three SharePoint admin paths (`/_layouts/`, `/_vti_bin/`, `/_catalogs/`); declares `Sitemap: en.sitemap.xml` and `th.sitemap.xml`. Confirms the 14 Sep finding. `sitemap.ts` adapter applies directly. |
| `law.go.th` ("ระบบกลางทางกฎหมาย" — Thailand's Central Legal System portal; a distinct, government-wide portal, **not** the same site as krisdika/OCS below — the two needed disambiguating and now are) | **PERMITTED**, `robots.txt` 200 OK, fully permissive (`User-agent: *`, no `Disallow` lines). **New finding**: the homepage is a 1.3 KB client-rendered SPA shell (no server-rendered document content) — actual content loads via JS/API calls. Neither `crawl.ts` nor `sitemap.ts` will see real content here as-is; the API those JS calls hit needs to be found before an adapter can be written. Not assumed to need a bespoke adapter yet — needs a browser-rendered inspection pass, not more `curl`. |
| `krisdika.go.th` (Office of the Council of State — the primary legislation database) | Bare domain does not resolve at all (no DNS record). |
| `www.krisdika.go.th` | Resolves via a CNAME chain to **`www.ocs.go.th`** — OCS's actual current domain — fronted by Huawei Cloud WAF. This is the real disambiguation the 14 Sep table was missing: "krisdika.go.th" is a legacy alias, not a live host in its own right. |
| `www.ocs.go.th` (the main OCS site — a marketing/info site, not the law database itself) | **NO STATED RESTRICTION.** Homepage loads fully (200 OK, real content, title "สำนักงานคณะกรรมการกฤษฎีกา กฎหมาย", PHP/CodeIgniter backend, session cookies). `/robots.txt` is a clean 404 — confirmed twice, once returning the Huawei WAF's generic (Chinese-language) 404 page and once CodeIgniter's own 404 page, both consistent with "the file genuinely does not exist," not a block. `/sitemap.xml` exists (200 OK) but is a dead end for document discovery: only 11 URLs, all top-level shell pages -- `searchlaw/law-index/item/<id>` is one generic placeholder route, not per-document entries. |
| `searchlaw.ocs.go.th` (the actual public law-search application, linked from the OCS homepage) | **NO STATED RESTRICTION** (`robots.txt` is a clean custom-404, no file), but **not crawlable as static HTML**: this is a real Angular application (webpack-hashed `runtime`/`polyfills`/`main` bundles), confirmed by fetching `main.js` directly and finding a literal `"/ocs-api"` string -- a genuine JSON API backs the search UI. The exact endpoint contract was deliberately not reverse-engineered further by grepping the minified bundle: that crosses from "read published structure" into guessing at an undocumented API's shape, which is step 4's job (if pursued at all) with its own deliberate scoping, not something to back into while doing step 1 reconnaissance. |
| `law.go.th` ("ระบบกลางทางกฎหมาย" — Thailand's Central Legal System portal; a distinct, government-wide portal, separate from OCS/krisdika above) | **NO STATED RESTRICTION**, `robots.txt` 200 OK, fully permissive. Same situation as `searchlaw.ocs.go.th`: a 1.3 KB client-rendered SPA shell, not crawlable as static HTML. Two independent Thai government legal portals, both API-backed SPAs -- not a fluke of one site's tech choice. |
| `ratchakitcha.soc.go.th` (Royal Gazette) | **CLOSED, confirmed with the repo's own fetcher, not just curl.** Ran `backend/src/fetch`'s `Fetcher` class directly (the same browser-shaped-TLS configuration `architecture.md` §8 credits with solving this for Singapore Statutes Online) against this host: identical 403 Cloudflare Managed Challenge page, byte-for-byte the same shape as plain `curl`. This resolves the plan's open question with a negative result -- the Singapore-era fix does not generalize here. Cloudflare Managed Challenge requires executing JavaScript and solving a Turnstile-style challenge; no HTTP client, however browser-shaped its TLS handshake, can satisfy that without an actual JS engine. A real access problem, not a fingerprint problem. |
| `pdpc.or.th` (Personal Data Protection Committee) | **CLOSED, same confirmed result.** Fetcher gets the identical Cloudflare Managed Challenge. |
| `nbtc.go.th` / `www.nbtc.go.th` (telecom regulator) | **`robots.txt` is permissive (200 OK, only disallows `/wps/contenthandler/`) but this is misleading: the site itself is CLOSED.** The root page (`/`) returns 403 with `cf-mitigated: challenge` -- the same Cloudflare Managed Challenge as the other three hosts. Confirmed on both the bare and `www.` host, and with the repo's own Fetcher (not just curl). **Correction to this table's own first draft today**, which read the permissive `robots.txt` and called this host PERMITTED without checking whether the site's actual pages were also open -- they are not. `robots.txt` being open while the site is challenged makes sense once stated: robots.txt is routinely excluded from a WAF's bot-challenge rules (crawlers are expected to read it unchallenged), so its being open says nothing about whether the pages it describes are. |
| `broadcast.nbtc.go.th` (NBTC's broadcast-specific subdomain) | **CLOSED, same confirmed Cloudflare Managed Challenge**, both via curl and via the repo's Fetcher. |
| `www.customs.go.th` (Thai Customs Department — pillar 12, trade) | **PERMITTED, and genuinely crawlable.** Real site loads (title "กรมศุลกากร - Thai Customs"), `/robots.txt` is a clean 404 (no file, not a block), and -- checked beyond just the homepage -- the site exposes real, server-rendered, browsable PHP listing pages with document numbers and dates (e.g. `list_strc_download_with_docno_date.php?ini_content=announce_...&order_by=date`). This is exactly the shape the generic `crawl.ts` adapter is built for. The most promising portal found today for needing zero new adapter code. |
| `www.dbd.go.th` (Department of Business Development — pillar 12, trade) | **NO STATED RESTRICTION** (`/robots.txt` 404, the SPA's own not-found page, not a WAF block) but **not crawlable as static HTML**: confirmed the `/law` page's `<div id="__next"></div>` is empty in the raw response -- this is client-side-rendered Next.js (CSR, not SSR/SSG), so real content only exists after the browser runs the JS and hydrates from Redux state (a `lawReducer` is visible in the initial state blob). Same category as the two legislation SPAs: not built speculatively pending a real inspection pass. |

Net read, now resolved rather than provisional: **four hosts are genuinely, confirmedly closed** to
any HTTP-client-based fetcher, however browser-shaped -- `ratchakitcha.soc.go.th`, `pdpc.or.th`,
`broadcast.nbtc.go.th`, and (contrary to this table's own first-draft reading of its `robots.txt`)
`nbtc.go.th` itself. This was tested with the repo's real `Fetcher` class, not assumed from `curl`.
**Three portals are reachable but are API-backed JS applications, not crawlable HTML**:
`searchlaw.ocs.go.th` (the actual OCS/krisdika law database), `law.go.th`, and `www.dbd.go.th`'s law
section -- all three need either a bespoke API adapter (reverse-engineered deliberately, not
backed into) or a headless-browser-based fetch path neither of which this codebase has today.
**Two portals are straightforwardly open and crawlable as server-rendered HTML**: `bot.or.th`
(sitemap-shaped, `sitemap.ts` applies directly) and, the best find of the day, `www.customs.go.th`
(real browsable PHP listing pages, `crawl.ts` applies directly). `www.ocs.go.th`'s own homepage is
open too but is a marketing/info site, not the document source -- `searchlaw.ocs.go.th` is.

This table is deliberately in the same style as the China profile's per-portal notes
("PERMITTED", "CLOSED", "NO STATED RESTRICTION" with a read date) — every claim names the date it was
checked and what was actually observed. **This was rollout step 1**, done exactly the way
`india-integration.md` and the China profile did it: read every candidate portal's `robots.txt` and
top-level structure from an environment that can actually reach them, on a stated date, and write
down what it says — not what search results about it say, and not what an earlier session's blocked
fetch tool guessed.

## The one shared-code fix this plan needs (and why it isn't optional)

Everything above is additive. This one isn't, and it should be called out rather than discovered
mid-implementation.

`backend/src/index/index.ts`'s `ftsQuery()` — the function that turns a query phrase into the FTS5
query the trigram index actually matches — currently only handles scripts that use spaces between
words. It splits on non-letter/non-number boundaries and drops short terms; a Thai sentence, which
has no word spaces, survives that split as one long token and gets submitted to FTS5 as a single
quoted phrase, which SQLite's trigram tokenizer can only satisfy by an exact contiguous match. In
practice this means Thai-language lexical search would silently return nothing, indistinguishable
from "no results" — the same class of silent failure `docs/architecture.md` names for v1's Latin-only
tokenizer, one stage later in the pipeline.

This is already fixed, for Chinese, in the open China PR (`git log`/PR #1, commit `fix(index):
expand FTS queries for scripts written without word spaces`), and I read that commit directly: its
`SPACELESS` regex is `/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u` —
**Thai is already named in it**, alongside Han/Hiragana/Katakana. Whoever wrote the China fix
anticipated this exact need. The fix expands a spaceless run into overlapping trigrams (the same
unit the index is built from) rather than word-segmenting it, so it needs no Thai-specific
dictionary or model.

The recommendation is **not** to merge the China branch (it's 86 commits behind master and carries
unrelated China-specific work — the `.docx` parser, the `flk` adapter, the still-blocked-by-
`robots.txt` China profile). It's to port just this one function — `expand()` plus the modified
`ftsQuery()` in `backend/src/index/index.ts` — onto current master's version of that file, which I
compared directly against the China branch's copy and found otherwise identical: the rest of the
file (dense index, `searchLexical`, `fuse`, everything) is untouched by that commit, so this should
be a small, self-contained, low-risk change, not a merge. It is shared code by necessity — the
trigram-index promise in the architecture doc is not actually true for Thai until this lands — but
it is narrowly scoped, already written and reasoned through by someone else, and additive in effect
(Latin-script economies take the same `if (!SPACELESS.test(token)) return [token];` early return
they do today).

## What's genuinely uncertain and shouldn't be built speculatively

- **OCR.** `backend/src/parse/ocr.ts` is currently hardcoded to English + Hindi
  (`Tesseract.createWorker(['eng', 'hin'], ...)`, with language-detection heuristics tuned to
  English prose markers vs. Devanagari character ranges) — built for India's bilingual scanned
  Gazette PDFs. If krisdika/law.go.th serve text-layer PDFs (which a real legislation database
  usually does — worth checking directly rather than assuming), no OCR work is needed at all for a
  first slice. If the Royal Gazette turns out to be scan-only for some material, Thai OCR support
  (`tha` Tesseract traineddata, a Thai-script confidence heuristic alongside the existing English
  one) would need adding to that file — a real but currently unverified shared-code touch. This
  should be confirmed empirically in step 2 of the rollout below, not built ahead of the finding.
- **Which adapter, if any, is bespoke.** India needed one custom adapter because India Code exposes
  a DSpace HAL/JSON API unlike anything already handled. Whether krisdika/law.go.th need the same
  treatment, or are ordinary server-rendered HTML the `crawl` or `sitemap` adapter already covers,
  is unknown until the portal is actually inspected — I could not reach it from here to check.

## Rollout plan

Numbered the way `india-integration.md`'s is, because that's the sequence that actually worked for
the one economy this repo has already added past the three-economy gate.

1. **Read every candidate portal's `robots.txt` and page structure directly, from an environment
   that can actually reach them, on a stated date.** krisdika.go.th / law.go.th (legislation),
   ratchakitcha.soc.go.th (Royal Gazette), pdpc.or.th (data protection), bot.or.th (already done —
   see table above), nbtc.go.th (telecom), and Customs Department / DBD (trade, pillar 12) at
   minimum. Note each portal's generator (Drupal/WordPress/bespoke) and whether it serves a sitemap,
   an API, or only browsable HTML — that finding decides which existing adapter applies before any
   new adapter is written.
2. **Write `backend/data/profiles/THA.json`**, following `IND.json`'s and `CHN.json`'s shape
   exactly: `legalSystem` (civil-law, the Royal-Decree/Ministerial-Regulation delegation pattern
   named explicitly, the way China's profile names its own delegation pattern), `officialLanguages:
   ["th"]`, `instrumentTypes` ranked (Act → Royal Decree → Ministerial Regulation → Notification →
   guideline, with bindingness per the China/India model of "binding" vs "binding-on-licensees" vs
   "advisory"), and one `portals` entry per source from step 1 — `adapter: null` and an honest note
   for anything with no adapter yet, exactly as the India and China profiles do for their unread
   portals, so a declared-but-unread source is visible in the record rather than silently dropped.
3. **Port the `expand()`/`ftsQuery()` fix** from the China branch onto master's
   `backend/src/index/index.ts`, as its own small commit, before any Thai document is indexed —
   otherwise every subsequent step's lexical-search numbers are measuring a broken search path.
4. **Build whichever adapter step 1 shows is actually needed** — plausibly zero new adapters if
   krisdika/law.go.th turn out to be ordinary crawlable HTML or already-covered CMS shapes; the
   `indiacode`/`flk` precedent is the pattern to follow only if a bespoke API turns up.
5. **`npm run -w backend zone1 -- --economy THA --register`**, then record category counts and any
   rejected rows, the same acceptance-evidence shape `india-integration.md` reports (12,900/12,900
   accepted, zero robot refusals, zero request failures) — a register run is the first real signal
   of whether the profile and adapters are right.
6. **`npm run -w backend discovery -- --economy THA --pillars <high-yield first wave>`**, then
   `zone1 --top 25 --embed`, following the same high-yield-first ordering
   `india-integration.md` used (pillars 1, 2, 10, 11, 4) and the wave ordering
   `docs/expansion-plan.md` sets for pillars generally (1, 2, 10, 11, 4, then 8, then 3, 5, 9, then
   12 last).
7. **Harden citations and freshness before anything is called done**: confirm official source
   links resolve on official hosts, retain the exact Gazette volume/page/announcement date per
   provision (Thai law's actual commencement evidence, per the scope-boundary note above), and run
   the standard zero-fetch cache replay that proves the second engine pass touches the network not
   at all.
8. **Only then** open the isolated Round 2 baseline for THA and measure — never before, and never
   to seed anything upstream of it.

## What stays untouched

Per the isolation this system is built on: nothing in `rubric/`, `decide/` (the 61 score functions),
`verify/`, the frontend's data layer, or any other economy's profile or data changes. Two small,
known, honest exceptions to "Thailand-only files," both named above rather than found by surprise:
the `index/index.ts` trigram-query fix (shared code, narrowly scoped, additive for every other
economy), and — only if step 1 shows scan-only Thai sources exist — `parse/ocr.ts` gaining a third
language alongside English/Hindi. Everything else is one new profile JSON and, at most, one new
adapter file plus its registration line in `discover/index.ts`'s `ADAPTERS` map — the same one-line
addition India's `indiacode` and China's `flk` each needed.

One more thing worth flagging honestly: the frontend has two small hardcoded economy-name maps
(`frontend/components/rubric/band-ladder.tsx` line 5 and `frontend/components/rubric/rubric-book.tsx`
lines 10–14, both `{ AUS: "Australia", MYS: "Malaysia", SGP: "Singapore" }`) that don't even include
India yet, ten days after India's backend slice shipped. That's an existing gap, not something this
plan needs to fix to add Thailand at the backend level — but it means Thailand won't render a proper
name in those two components until whoever picks up frontend work adds it, the same way India
hasn't yet. Worth a one-line mention if you open a PR, not a blocker for this plan.

## Self-review addendum (14 September 2026, after a second pass)

Checked against actual code rather than re-asserted: `schema.sql`'s `section_fts` really does use
`tokenize = 'trigram'` (confirmed, index side is genuinely script-agnostic already), and
`MIN_TRIGRAM_TERM = 3` in `backend/src/db/index.ts` is identical on `master` and the `china-economy`
branch, so the `expand()`/`ftsQuery()` port carries no constant-mismatch risk. `backend/test/
baseline-isolation.test.ts` genuinely exists and genuinely fails the build if any pipeline module
imports `src/baseline` — the isolation guarantee this plan leans on is real, not just documented.

One gap this plan missed the first time: **no Unicode normalization anywhere in the codebase** (a
repo-wide search for `.normalize(` returns zero results). Thai script uses combining tone marks and
vowel signs stacked on a base consonant. If two sources — or a portal and a query typed by a
reviewer — represent the same word in different Unicode normalization forms (NFC vs NFD, which
differing CMSes, PDF extractors and OCR engines routinely produce), the trigram index sees different
bytes for visually identical text and silently fails to match. This is latent in the existing
English/Hindi/Chinese-path code too, just never yet triggered.

**Fix**: add `.normalize('NFC')` at the two points text enters the system asymmetrically —
where a section's text is stored (`parse/index.ts`) and where a query string is turned into an FTS5
query (`ftsQuery`/`ftsPhrase` in `index/index.ts`) — so both sides of every match are canonicalized
identically. Same commit as the `expand()` port; add one NFC/NFD-equivalent fixture to the existing
lexical-search tests to lock it in. Small, low-risk, and not Thailand-specific in effect.

No other errors survived a second look — the TLS/403 portal table was already stated as unconfirmed
tool-side behavior rather than a claim about the sites, and it's restated here rather than corrected:
treat it as "needs a real check," not "these are closed." Nothing in this plan has been implemented,
so there is no risk of any change landing outside `feat/thailand` — that branch is where
implementation would start, per the rollout plan above.

## Second bulletproofing pass (14 September 2026)

Ran an actual `diff -u` between master's and the china-economy branch's `backend/src/index/index.ts`
(saved both to disk, diffed them, did not eyeball it) — confirmed the entire delta is exactly the
`expand()` function and the modified `ftsQuery()` body. Nothing else in the file differs. The "small,
self-contained port" claim above is now a verified fact, not an impression.

Also pulled the China PR's complete file list (12 files): `CHN.json`, one new adapter (`flk.ts`) plus
its one-line registration in `discover/index.ts`, the `index/index.ts` FTS fix, a generic `.docx`
reader, a China-specific parsing helper (`parse/cn.ts`) for that economy's own citation conventions,
and tests. This is the same shape this plan proposes for Thailand — profile JSON, at most one adapter
plus a registry line, the same narrow shared-code FTS fix, and (per China's and India's precedent) a
small economy-specific parsing helper should Thai citation conventions (มาตรา section numbering,
Buddhist-calendar dates) need one. Nothing new to fix here — this pass confirmed the plan's shape
against real precedent rather than finding an error in it.

## Step 3 done, and two things this plan got wrong (15 September 2026)

The `expand()`/`ftsQuery()` port and the NFC normalization were both implemented on `feat/thailand`,
in `backend/src/index/index.ts` and `backend/src/parse/index.ts` — and both were tested empirically
against real Thai text before being trusted, not just typechecked. That testing found two things this
plan stated as settled that were not.

**The self-review addendum's NFC claim was wrong.** It stated that `.normalize('NFC')` would collapse
Thai's SARA AM ambiguity (ำ, U+0E33, vs. the decomposed NIKHAHIT + SARA AA sequence, U+0E4D U+0E32).
Verified directly in Node: `'ำ'.normalize('NFC') === 'ํา'.normalize('NFC')` is `false`.
Unicode defines no canonical decomposition mapping for Thai combining marks at all, so NFC/NFD are
no-ops for this specific, real ambiguity — unlike the Latin-diacritic or Hangul equivalences they do
cover. NFC is still applied (it is correct, harmless hygiene for any other script's combining
sequences that might appear in a mixed-language citation), but it does not do the job this plan
assigned it. A second, Thai-specific fix was added alongside it: `canonicalizeThai()` in
`index/index.ts`, a one-line regex collapsing the decomposed sequence to its precomposed form,
applied at both points NFC is applied (query side in `ftsQuery`/`ftsPhrase`, storage side in
`parse/index.ts`). Verified: composed and decomposed inputs now produce the identical, non-null FTS
query.

**The ported `expand()`/`ftsQuery()` fix, exactly as it exists in the China branch, does not actually
make Thai search work — a bug in code both branches share, not in the port.** `ftsQuery`'s first step
splits the phrase on `[^\p{L}\p{N}]+` before `expand()` ever runs. A Thai tone mark or vowel sign is
Unicode category Mark (`\p{M}`), not Letter — so that split treats every diacritic as a token
boundary. Verified directly: `'ข้อมูลส่วนบุคคล'.split(/[^\p{L}\p{N}]+/u)` (personal data, one word,
three internal marks) produces `['ข','อม','ลส','วนบ','คคล']` — five fragments, three of them one or
two characters, dropped by the length-3 filter before `expand()` sees them. Only 5 of the word's 15
code points survived to become the query. This is not a Thailand-only defect: Devanagari vowel signs
(matras) are also category Mark, so India's already-shipped lexical search over Hindi content is
exposed to the same failure mode, discovered here as a side effect of actually testing Thai rather
than assumed from the China branch's own (Chinese-only, mark-free-script) testing. **Fix**: the split
regex in both `ftsQuery` and `ftsPhrase` now keeps `\p{M}` alongside `\p{L}`/`\p{N}`, so a combining
mark stays attached to the letter before it. Verified: the same word now survives the split as one
15-code-point run and expands into 13 overlapping trigrams, all real 3-character substrings of the
actual word. English and other existing-language behavior confirmed unchanged by the same test pass
(`'personal data OR trade secrets'` and the short-term-dropping case both produce identical output to
before).

Three new tests lock these two findings in, in `backend/test/zone0.test.ts`: the trigram-expansion
count and exact content for a real Thai word, the combining-mark-survives-the-split case (with the
"only 2 of 5 fragments survive" failure mode named in the test's own comment so a future edit that
reintroduces it fails loudly), and the composed/decomposed SARA AM equivalence. Full suite after all
of this: 673 tests passed (was 670 before this work; the 3 new ones are these), typecheck clean.

Whether the same Mark-category gap should be fixed for India's Hindi-language search is a real,
separable question this pass surfaced but did not answer — it is not Thailand-scoped, and fixing it
here was already broader than "add a profile," so it is named rather than silently fixed. Worth its
own follow-up, not a blocker for continuing Thailand's rollout.

## Step 2 done, and step 5 pulled forward to find a third thing this plan got wrong (15 September 2026)

`backend/data/profiles/THA.json` was written, matching `IND.json`'s shape, with the `instrumentTypes`
named in this plan's own scope-boundary section (Act, Royal Decree, Ministerial Regulation,
Notification, guideline) and one `portals` entry per source found in the corrected candidate-sources
table above. It loads and validates against the Zod schema in `profile/types.ts`, and is discoverable
via `availableProfiles()` alongside AUS/IND/MYS/SGP. Full suite after adding it: still 673 passed,
typecheck clean.

Step 5 (`npm run -w backend zone1 -- --economy THA --register`) was then pulled forward, ahead of step
4, because there was nothing left to build for the two portals this profile marks as adapter-ready --
running it was the actual test of whether that readiness claim was true, not an assumption. It was
not: Bank of Thailand's `sitemap` adapter worked cleanly (29 instruments registered, 0 refused, 0
failed), but Thai Customs' `crawl` adapter walked 2 pages and found 0 instruments, directly
contradicting this profile's own first-draft note that it needed "no new code."

**The real cause, found by reading the adapter's own logic rather than guessing: `backend/src/
discover/crawl.ts`'s `LEADS_TO_LAW` link filter and `backend/src/discover/titles.ts`'s
`instrumentTitle()` are both English-instrument-naming-convention-only, and the English convention
they encode is structurally backwards for Thai.** `instrumentTitle()`'s `ENDS_WITH_NOUN` check
expects a title to end with its instrument noun -- "Customs Act 2017" -- because that is where
English drafting puts it. Thai drafting puts it first: "พระราชบัญญัติศุลกากร พ.ศ. 2560" is literally
"[Act] [Customs] [B.E.] [2560]." Extending the existing regex with Thai vocabulary would not fix
this; the acceptance grammar itself assumes a trailing noun.

This was not fixed. Two things stopped it, both real, not schedule pressure: (1) an actual
per-document listing page was fetched directly (`list_strc_download_with_docno_date.php?ini_content=
announce_160426_01&...`, despite its URL looking exactly like a document-with-dates listing) and it
returned the site's shared sidebar navigation menu, not a document table -- the real listing mechanism
was not located in raw HTML, and was not guessed at. (2) That same page surfaced a genuine near-miss:
a guidance document titled "...ตามพระราชบัญญัติศุลกากร พ.ศ. 2560" ("...under the Customs Act B.E.
2560") references the Act by name mid-title without being the Act itself -- exactly the class of
false positive `instrumentTitle()`'s docstring says its English grammar was tuned to reject, via
measurement against ESCAP's own citations ("78% accepted"). That calibration method is not available
here: the ESCAP baseline is exactly the data this profile is required to keep quarantined
(`docs/architecture.md` §5, restated at the top of this plan). Writing an untested Thai title grammar
risks the failure mode the English one was explicitly built to avoid -- filling the register with
non-instruments -- which corrupts scoring evidence downstream. That is a worse outcome than leaving
Thai Customs unread, so `THA.json`'s Customs entry was corrected from `"adapter": "crawl"` to
`"adapter": null`, with the full finding recorded in its `notes` field the same way India's and
China's profiles record an honestly-unread source.

One clarification worth stating so a future reader does not draw the wrong general lesson from this:
Bank of Thailand's 29 instruments did not succeed because BOT is somehow "less Thai." Its URL slugs
are English regardless of page language -- `/th/laws-and-rules.html` is under the Thai-language
section of the site, but the path segment itself is the English words "laws-and-rules," which is what
`instrumentTitle()` actually matched. Thai Customs' URLs use opaque parameter IDs
(`ini_content=announce_160426_01`) with no English (or Thai) instrument vocabulary in the slug at
all. The real variable is "does this site's URL architecture happen to put an English instrument
noun in the path," which is an accident of each site's own web team, not a property of the Thai
language or a reliable signal to expect from a random future Thai portal.

This is now three real things found by testing rather than assumed true: the NFC/SARA AM claim, the
combining-mark split bug, and now this. All three share a shape worth naming: each is a place where
existing pipeline code silently encodes an assumption true of Latin/English text and false of Thai,
and each was only caught by actually running the code against real Thai text or a real Thai site
rather than reading the code and reasoning about it. That is the argument for treating "verified
directly" as a hard requirement for the rest of this rollout, not a nice-to-have.

## Three more portals checked, each stopped on its own real signal (17 September 2026)

Per an explicit go-ahead to build out nbtc.go.th, www.customs.go.th and www.dbd.go.th the same way
as Bank of Thailand, with the same hard rule as the OCS work: no live guess-and-check, no evasion,
stop immediately and document on any 403/challenge/rate-limit rather than adjusting anything to get
past it. Three of the four checked stopped immediately, each for a different, specific reason worth
recording precisely rather than lumping together as "blocked."

**`nbtc.go.th`** -- not re-tested. Already confirmed Cloudflare-Managed-Challenged earlier in this
same rollout (both plain curl and the repo's own `Fetcher` class, on both the bare and `www.` host --
see the candidate-sources table above). Its `robots.txt` alone is permissive, which is exactly the
misleading signal already documented; re-requesting a known-blocked host would just be a redundant
request for no new information.

**`www.dbd.go.th`**: the `/law` page's dispatched Redux action was identified precisely --
`COLLAPSE_GET_LIST_R`, payload `{module_id: LAW}`, into `collapseReducer` -- by reading the page's
own route-specific chunk (`pages/law-d64e2d4646442e60.js`, declared directly in the static HTML, not
guessed). The four shared chunks that page's own webpack manifest says load on *every* page view
(`2808`, `6133`, `2236`, `3736` -- all four also independently declared in the original page's own
`<script>` tags) were fetched and searched in full: zero matches for "collapse" in any of them,
case-insensitive. The saga/middleware that turns this action into an actual HTTP request is in one
of three other chunk IDs referenced by the webpack runtime (`9774`, `2888`, `179`) whose hashed
filenames are not declared anywhere in the static HTML available -- finding them would mean guessing
a hash suffix, which is exactly the live-guess-and-check this work was told not to do. Stopped there.

**`law.go.th`**: went a step further than dbd.go.th before stopping, and hit a harder wall. Its
single React/CRA bundle, `static/js/main.7a41c7a0.js`, is declared directly in the page's own static
HTML -- fetching it is not a guess, it is what the page itself loads on every visit. That request
returned a genuine `403`, not from Cloudflare's Managed Challenge (the "Just a moment..." JS-challenge
page seen at ratchakitcha/pdpc/broadcast.nbtc) but a distinct CloudFront-level WAF block: "Request
blocked... too much traffic or a configuration error," `server: cloudflare`, `x-cache: Error from
cloudfront`. This blocks something more basic than an API call attempt -- the site's own passive
static JS asset -- and is a real, different-shaped access wall than anything else found so far. Also
worth recording: the page loads Google's reCAPTCHA script unconditionally, which independently
suggests the site's owner expects active human verification on interaction, a stronger signal against
automated access than a bare API key. No adjustment to headers, timing or anything else was made to
test past the 403, per the standing rule. Stopped and documented.

None of these three needed the wrapper-class-shape or trial-and-error problem the OCS spec ran into
-- each stopped on a distinct, earlier signal (a known prior block, an unreachable chunk, and a
genuine WAF 403) before that question could even arise. `THA.json`'s entries for all three are
unchanged (`adapter: null`), now with these specific findings in their `notes` fields rather than the
earlier, less precise "not crawlable as static HTML" characterisation.

**`www.customs.go.th` was also formally re-checked**, since it's a different kind of case again --
its network access was never in question, only whether the crawl adapter could actually find real
documents. `THA.json`'s `adapter` was temporarily flipped from `null` to `"crawl"`, the register step
was re-run, and reverted afterward. Result reproduced exactly: `2 page(s) walked, 0 instrument(s)
named`, this time entirely from cache (0 requests over the network), confirming this is not a
network/rate-limit/access issue at all -- it is purely the English-only title-recognition grammar
gap already root-caused earlier in this rollout (`instrumentTitle()`'s trailing-noun assumption is
structurally backwards for Thai's leading-noun drafting convention). No new adapter code was written
for this: doing so properly means designing a Thai-aware title grammar, and the earlier finding that
its natural calibration method (measuring against ESCAP's own citations, the way the English grammar
was tuned) is exactly the data this profile must keep quarantined still stands. That remains a
distinct, deliberately-scoped decision, not something to fold into re-confirming this portal's status.

## A fourth real bug, found by finally reading real documents (17 September 2026)

Step 6 (`npm run -w backend zone1 -- --economy THA --read 5`) was run against Bank of Thailand's 29
registered instruments -- the first time any Thai document was actually fetched and parsed, not just
registered. Real Thai titles were correctly extracted from the documents themselves (e.g. "FX Global
Code แนวปฏิบัติในการทำธุรกรรมเงินตราต่างประเทศขนาดใหญ่", replacing the crude English-slug-derived
placeholder from registration), which is a genuine positive signal for the pipeline generally. But
one of the five failed with `offsets do not round-trip for 1 section(s)` -- a real bug, not a fluke,
and it traced straight back to the NFC/`canonicalizeThai` fix from earlier in this rollout.

**The bug**: `verifyOffsets` (`parse/index.ts`) checks that `document_text.text.slice(char_start,
char_end)` reproduces `section.text` exactly -- "the check behind every citation," per its own
docstring. The earlier fix normalized `section.text`/`heading_path` at storage time (so the FTS
index would be built from canonicalised text) but left `document_text.text` -- the whole raw
document -- unnormalised. Whenever normalization actually changed a substring (collapsing a
decomposed SARA AM sequence, in the failing document), the two copies stopped matching at that
section's offsets, and the read failed with a thrown error rather than silently storing wrong data
-- the check did exactly its job. Simply normalizing `document_text.text` too would not have fixed
this correctly: normalization can change a string's length, which would shift every *later*
section's offsets without touching `char_start`/`char_end`, breaking more sections than it fixed.

**The fix**: normalization was moved out of `parse/index.ts` entirely and into `db/index.ts`'s
`indexSections()`, applied only to the copy written into `section_fts` -- which has no offset
invariant to preserve, since search doesn't care about exact byte positions the way a citation does.
`section`/`document_text` are stored exactly as the parser produced them, unnormalised, so
`verifyOffsets`'s invariant holds by construction. `canonicalizeThai` moved to a new
zero-dependency module, `util/thai.ts` (mirroring `util/locate.ts`'s existing shape), because
`db/index.ts` and `index/index.ts` already import from each other and neither could host it without
a circular import.

**Verified, not just typechecked**: rebuilt the database from scratch, re-ran the same `--read 5`
that failed -- the previously-failing instrument now parses cleanly (4 parsed, 0 failed, was 3
parsed, 1 failed), `verifyOffsets` reports 0 failures across all 19 sections read, and a real
Thai-language lexical search (`หลักเกณฑ์การแลกเปลี่ยนเงิน`, an actual phrase from the corpus, not a
synthetic test string) returns real hits against the live database. Full suite after: still 673
passed, typecheck clean.

This is the fourth real bug this rollout has found by testing against real Thai text or a real Thai
site rather than reasoning about the code -- and notably, this one was a defect *introduced by an
earlier fix in this same rollout*, not inherited from before it. That is itself evidence for the
"verified directly" discipline this plan keeps returning to: a fix is not done when it typechecks and
passes the existing suite, only when it has been run against the real thing it was meant to fix.

## OCS API static-analysis spec, and why it stops short of a working adapter (17 September 2026)

Following up on `searchlaw.ocs.go.th`'s discovery in the candidate-sources table above (an
Angular SPA with a real `/ocs-api` backing it), the two compiled JS bundles were downloaded and
read in full to reconstruct as much of the API's shape as static analysis alone can determine.
**No live requests were made against the OCS server in producing this** -- every finding below
comes from string/regex search of the already-downloaded bundle files, which is the same category
of reconnaissance as reading a `robots.txt` or a `sitemap.xml`, not an interaction with the live
API.

The full spec is in **`docs/thailand-ocs-adapter-spec.md`**, with per-item confidence ratings
(HIGH / MEDIUM / NONE) so it cannot be mistaken for more certain than it is. In short: the endpoint
paths, the `Authorization` header mechanism, and the `getLaws` response envelope are all
HIGH-confidence, independently-verified literal strings. But the two things actually needed to
place a working call -- the request-wrapper class's JSON serialization shape, and `getLaws`'s own
search/filter parameter names -- were **not found and are marked NONE, not guessed at**. Both very
likely live in a route-lazy-loaded chunk that only downloads when a real browser navigates to the
search page, which the two top-level bundles fetched here do not include.

Completing this adapter from here would require either finding that chunk (via a real browser's
network tab, not by guessing its hashed filename) and repeating the same zero-network-cost static
analysis on it, or making live trial-and-error requests against the production OCS server to feel
out the missing shapes empirically. The latter was considered and deliberately not done in this
session: Thailand's Computer-Related Crime Act creates real ambiguity around unauthorized/undocumented
API access even when the access itself is technically unauthenticated and the client identifies
itself honestly, and that is a decision for whoever owns this integration to make explicitly --
ideally after a few minutes of actual Thai-counsel input on this specific endpoint -- not something
to fold into ordinary development momentum. `THA.json`'s `searchlaw.ocs.go.th` portal entry stays
`"adapter": null`, now with a pointer to the full spec rather than just the discovery narrative.

## Sources

- `docs/architecture.md`, `docs/india-integration.md`, `docs/expansion-plan.md`,
  `docs/lessons-from-lexdroid-v1.md`, `docs/INDEX.md` — read in full, 14 Sep 2026.
- `backend/src/profile/{index,types}.ts`, `backend/data/profiles/IND.json` — read in full.
- `backend/src/discover/index.ts` (adapter registry) — read in full.
- China branch (`china-economy`, PR #1, unmerged, 86 commits behind master as of 14 Sep 2026):
  `backend/data/profiles/CHN.json` and `backend/src/index/index.ts` read in full and compared
  directly against master's copy of the same file.
- `backend/src/parse/ocr.ts` (master) — read in full.
- Live checks, 14 Sep 2026: `bot.or.th/robots.txt` (succeeded); `krisdika.go.th`, `law.go.th`,
  `ratchakitcha.soc.go.th`, `pdpc.or.th` (each failed — TLS error or 403 — from this session's
  fetch tool; not confirmed closed, see the note above on why that's not conclusive).
- NOT read: ESCAP's Round 2 Database (Thailand's answer sheet) or legal inventory — per the scope
  boundary above, those are quarantined to the isolated baseline store and were not opened to write
  this plan.
