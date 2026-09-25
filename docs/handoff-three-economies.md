# Lao PDR, Mongolia and the Russian Federation — handoff

*Written 25 September 2026, on branch `russia-mongolia-laopdr`. Freeze is 30 September.*

## Before you do anything: check master

This work lives on `russia-mongolia-laopdr`, not on master, and **master moves**. It gained nine
commits and roughly ten thousand lines between 21 and 25 September while this branch was being
built. Merging them cost five conflicts, and the longer the branch sits the worse that gets.

```bash
git fetch origin
git rev-list --left-right --count origin/master...HEAD   # left = behind, right = ahead
```

If it reports anything behind, merge before starting — resolving a conflict is much easier than
un-resolving a wrong one later. What the 25 September merge turned out to need, as a guide:

- **`titles.ts`** — both sides had added a second parameter to `instrumentTitle` and they are
  complementary, so it now takes both: `alsoNamedBy` (extra English nouns a portal declares) and
  `vocabulary` (what the economy calls its instruments). Anything added there should expect to
  keep both.
- **`crawl.ts`** — master had restructured the walk around a shared page budget and explicit
  seeds. Taken whole from master, then this branch's three changes re-applied on top. Do that
  again rather than resolving hunk by hunk.
- **`fetch/index.ts`** — master split `sendOne` into a TLS chain-chasing wrapper plus `sendOnce`;
  the POST body threads through both.
- Master also added a seventh instrument kind, `publication`, and `bindingness.test.ts` iterates
  every profile, so a new kind means every profile in `data/profiles/` must declare it.

**Worth raising with Sid:** this branch is well ahead of master and he is pushing to master
steadily. Merging it in sooner would make each of these cheaper than one large merge at the end.

Read this first if you are picking the work up cold. Everything it asserts was measured; the
command or the file that measured it is named. The full investigative trace is
`docs/lao-mongolia-russia-recon.md` (664 lines) — this is the summary and the worklist.

---

## Why this work exists

The finals orientation slide, under *"Five major differences from previous submission"*:

> **C1a — Minimum six economies processed autonomously. Depth beats a thin pass. At least three
> Non-English language countries.**

And its country list: *"Select at least 3 from 8 countries above (in addition to 3 mandatory
countries: Australia Malaysia Singapore)."*

Three mandatory economies already run end to end. Lao PDR, Mongolia and the Russian Federation are
all three in that eight and all three non-English, so they satisfy both halves of C1a at once.
**Missing this fails a criterion outright.**

Note the output template's checklist still states the older bar (*"three or more economies"*, *"at
least one non-English source"*). The slide is the later guidance and is explicitly headed as a
change from it.

### Division of labour, as agreed

- **This lane:** get the three countries *in* — Zone 0 profiles, discovery adapters, registers,
  fetching, parsing. Ends at a parsed, searchable corpus.
- **Sid:** pillars, indicators, reading, scoring, cells. His stage needs the corpus to exist first.

---

## Update, 26 September: parsing for all three

Superseding the table below for parsing. Each economy now has a parser proven on real sources
by a gold test whose expectations were read off the source. The report, with each portal's
design and real documents set beside their parse, is at
https://claude.ai/artifact/M9tgogEoCkjQuTYVofNqpa. Regenerate its data with
`npm run -w backend parsing-report -- --out report.json`.

| | Mongolia | Russia | Lao PDR |
|---|---|---|---|
| Source | legalinfo.mn, annexes fetched | IPS (pravo.gov.ru/proxy/ips), windows-1251 | Official Gazette grid, OCR |
| Registered | 11,962 | 421 from IPS (+85 gazette, unreadable) | 1,115 (1,479 rows of 1,479) |
| Read | 24 docs → 398 provisions | 7 docs → 1,355 (whole Administrative Offences Code) | 4 scans → 241, OCR 79–84 |
| Gold tests | 45 on 11 pages | 36 on 5 documents | 21 on 4 scans |

Found and fixed along the way, and silent until measured:
- superscript insertions (2¹, 10²⁻¹) read as wrong articles;
- text outside `<p>` dropped;
- whole articles marked repealed when only a clause was;
- annexes never read;
- no charset handling;
- IPS truncating Codes at 747,740 bytes;
- Lao laws demoted to publications;
- OCR misreading article numbers, now repaired only where the sequence confirms it, and recorded.

## Where it stood on 25 September

| | Mongolia | Russia | Lao PDR |
|---|---|---|---|
| Zone 0 profile | ✅ | ✅ | ✅ |
| Portals verified live | ✅ | ✅ | ✅ |
| Adapter wired | ✅ `legalinfo` | ✅ `crawl` | ✅ `crawl` |
| Register built | ✅ **11,962** | ✅ **85** | ⬜ never run |
| Documents parsed | 3 sampled → **108 sections** | 4 fetched → **0 readable** | ⬜ |
| Embedded / cells | ⬜ | ⬜ | ⬜ |

**Zero cells for all three.** 8 profiles exist, 12,047 instruments are registered, and the pipeline
has not produced a single export row for any new economy. That is the honest headline.

Tests after the merge: **1,395 backend, 45 frontend, typecheck clean.**

---

## What was built

Eleven commits before the merge. In dependency order:

1. **`\p{Script=Lao}`** added to the index's spaceless-script patterns. Lao writes without word
   spaces like Thai; without this a Lao query reaches FTS5 as one token and matches nothing,
   silently.
2. **A Cyrillic resolver** in `parse/language.ts`. The whole block mapped to `ru`, so every
   Mongolian provision would have gone out recorded as Russian in Language of Source — a required
   column that drives C1c. Mongolian has Ө/Ү and Kazakh its own set; Russian has no letter of its
   own against either, so the evidence runs one way and the tests assert that asymmetry.
3. **Three profiles** — `LAO.json`, `MNG.json`, `RUS.json` — plus the recon doc.
4. **Title recognition in the economy's own words.** `instrumentTitle` recognised instruments by
   English nouns in English positions, which is why Thai Customs registered zero instruments
   twice. `instrumentWords()` derives vocabulary from `instrumentTypes[].localName`; only
   non-Latin terms are taken, so the four English profiles yield nothing and are provably
   unchanged.
5. **`documents?`** in the crawl's `LEADS_TO_LAW` — the whole of what stopped it reaching Russia.
6. **Lao OCR.** `@tesseract.js-data/lao` (MIT) beside the English and Hindi packs. Measured cold on
   a real gazette scan: 1,761 Lao characters at 77.0 confidence in 10.2s, retaining article numbers
   and the made-under chain.
7. **A Russian case in `engine-check`** — see the Engine B finding below.
8. **Engine B's declaration corrected.** The first live check returned `model_not_found`: Groq had
   retired `qwen/qwen3-32b`. Now `qwen/qwen3.8-27b`, passing all four checks in both languages.
9. **POST in the fetcher**, with the body folded into the cache key. `legalinfo.mn` answers a GET
   with page one of an unfiltered listing whatever it is asked.
10. **The `legalinfo` adapter** — walks per category so the instrument kind comes from the register
    rather than the title.
11. **The `legalinfo` parser** — the biggest single fix; see below.
12. **A guard against `\b` beside non-Latin script** — `test/word-boundary-scripts.test.ts`. It
    fails the build if anyone writes a word boundary next to a Cyrillic, Thai, Lao, Devanagari or
    Han letter, because JavaScript defines `\b` against ASCII `\w` and such a pattern never
    matches anything. There are no live instances; this stops it returning. Note the first draft
    of the guard reported the source clean while failing to detect the bug it was written for, so
    it now asserts against the original broken pattern too.

---

## Verify this document before you trust it

Every claim here was measured, but it was measured on 25 September and the branch has moved since.
Re-run these before building on any of it — they take about two minutes together and each one
either confirms a claim or tells you it has rotted.

```bash
npx vitest run --root backend          # expect 1,398 passing, 146 files
npx tsc -p backend/tsconfig.json --noEmit
npx vitest run --root backend test/word-boundary-scripts.test.ts   # is the \b bug back?
npm run -w backend zone1 -- --economy MNG --status
npm run -w backend search -- --economy MNG "авлигатай тэмцэх"
```

The third one is the specific check asked for: **the `\b` guard should pass, and if it fails it is
naming a file where someone has written a word boundary beside non-Latin script.** That pattern
never matches, so whatever it was meant to find is being silently missed. Fix the pattern —
`(?:^|\s)` or an anchor — rather than the test.

The last one is the whole chain in a line. It should return Mongolian provisions with their
instrument and chapter path. If it returns nothing, the corpus page says which stage lost it.

---

## Parsing has to be right, and here is what "right" means

This is the part that decides whether any of the rest matters, and it is the part most likely to
look finished when it is not. A document that parses badly does not error — it produces one giant
section, retrieval has nothing to rank inside it, the reader has nothing to read, and the cell
reports **no restriction found**. That is indistinguishable, downstream and in the export, from an
economy that genuinely has no such law.

So "accurate" is not a feeling. It is four things, each measurable per document:

| Property | How to check | What failure looks like |
|---|---|---|
| **Sections match the instrument's real structure** | count them against the document's own article count | 1 section = a blob; 199 where there are 70 = splitting on sub-clauses |
| **The offset invariant holds** | `text.slice(charStart, charEnd) === section.text` for every section | a citation that cannot be relocated, which `verify` refuses at 0.50 |
| **No page furniture** | no section contains the site's phone number, nav or login links | the parser took the page, not the document |
| **Heading path carries the real hierarchy** | chapter > article, in the document's own words | a flat path, which is what the `\b` bug produced |

Run this against any economy to see all four at once:

```sql
-- sections per document, and the extremes that betray a bad parse
SELECT i.title, d.section_count,
       MIN(LENGTH(s.text)) AS shortest, MAX(LENGTH(s.text)) AS longest
FROM document d JOIN instrument i ON i.id = d.instrument_id
JOIN section s ON s.document_id = d.id
WHERE i.economy_code = 'MNG' GROUP BY d.id ORDER BY d.section_count DESC;

-- the invariant, which should return zero rows
SELECT COUNT(*) FROM section WHERE (char_end - char_start) != LENGTH(text);
```

### Where each economy stands against that

**Mongolia — verified on three documents, not on eleven thousand.** 70, 37 and 1 sections, which
are the article counts those instruments have; invariant holds on all 108; no furniture. That is
real, but it is a sample of three across two instrument kinds. **The honest next step is to parse
a wider sample — one of each of the five registered kinds at least — and check the same four
properties.** A Government resolution with an annexed журам, which is 5,755 of the 11,962
instruments, has not been parsed even once.

**Russia — not started.** Its documents are PDFs behind a robots question; the route is IPS (see
below), and nothing there has been parsed at all.

**Lao — not started, and it cannot reach 100%.** Every Lao document is a scan, so the text arrives
through OCR at 77–88% confidence with real recognition errors in it — the ligature problem below
is one. The target for Lao is *honest*, not perfect: sections found where the structure allows,
the 0.65 confidence rung applied, and what could not be read flagged rather than guessed. Saying
so plainly is what the README template asks for and what the rubric rewards.

---

## The three findings worth carrying forward

### 1. Parsing was the real problem, and it fails silently

The registers are catalogues. What matters is whether a document parses into provisions, and
measured on three real Mongolian documents before the parser existed:

| Document | Before | After |
|---|---:|---:|
| Anti-Corruption Law | **1 section of 112,095 chars** | **37** — its 37 articles |
| Constitution | 199 pieces, one 85 KB, some in English | **70** — its 70 articles |
| a transitional law | 1 section starting `+(976)-11-323317` | **1** — genuinely one article |

A section is the unit retrieval ranks and the reader reads. A blob is a document the cell searched
and could not see into, and the cell then reports **no restriction found**. Nothing throws and no
count is short. **This is almost certainly the "some variable is empty" failure.**

Three things the real documents taught that desk work would have got wrong:

- An ordinary Law numbers its articles (`1 дүгээр зүйл`); the **Constitution spells the ordinal
  out** (`Нэгдүгээр зүйл`).
- **Compound ordinals are two words** — `Арван нэгдүгээр зүйл` is article 11. A single-token
  pattern found 16 of the Constitution's 70.
- **JavaScript's `\b` is ASCII-only and never matches beside Cyrillic.** `/\bБҮЛЭГ/` is false on
  `НЭГДҮГЭЭР БҮЛЭГ`. Chapter detection silently found none at all on the real Law and the heading
  paths simply looked like a document without chapters. **Worth auditing anywhere else this
  codebase matches non-Latin script.**

### 2. Russia's documents are PDFs, and there is a better source

`publication.pravo.gov.ru` document pages are viewer shells: 21 KB of HTML yielding 300 characters,
all of it metadata plus `Страница № 1 из 11`. The text is a PDF at `/file/pdf?eoNumber=<id>`, and
`robots.txt` says `Disallow: /File`.

RFC 9309 compares paths octet-by-octet so `/file/` does not match, and this repo's own
`robotsPermits` returns allowed — but the disallow list reads like ASP.NET controller names and
that routing is case-insensitive, so the publisher probably meant it. **Nothing has been fetched
from `/file/`.**

**It does not have to be resolved.** `pravo.gov.ru` is `User-Agent: * / Disallow:` — nothing
disallowed at all — and proxies the Информационно-правовая система:

| Endpoint | Returns |
|---|---|
| `?docbody=&nd=<id>` | the document card: title and every amendment edition |
| `?doc_itself=&nd=<id>&page=all` | **the full text** |

Measured on `nd=102041458`: 10,647 characters, 8,264 Cyrillic, 113 lines, 19 numbered points, with
the amendment history in the document's own words.

### 3. The pipeline assumes UTF-8

IPS declares `charset=windows-1251` and nothing in `parse/` or `fetch/` ever consults a charset —
`res.body.toString('utf8')` at three call sites in `parse/index.ts` and one in `crawl.ts`.

Read as UTF-8 that page yields **zero** Cyrillic characters. Not degraded — lost, and recorded as
`empty`, which looks exactly like a portal serving a stub. Any economy on a pre-UTF-8 portal hits
this, and legacy encodings are common on Russian and older Asian government sites.

---

## The worklist, in the order I would do it

**The brief is that parsing has to be right, not merely present.** So 1 and 2 below are about
proving Mongolia's parser on more than three documents before trusting it, and everything after is
getting the other two economies to the point where the same four properties can be asked of them.

0. **Widen Mongolia's parse sample.** `zone1 --economy MNG --read 3 --kind regulation`, then
   `--kind order`, `--kind notice`, `--kind guideline`. Check the four properties above on each.
   Government resolutions are 5,755 of the 11,962 instruments and not one has been parsed; they
   commonly carry an annexed журам, which is a structure the parser has never seen.
1. **Lao's register.** Never run. `npm run -w backend zone1 -- --economy LAO --register`.
   ~15 minutes. It is the one economy with no register at all.
2. **Charset-aware decoding** — read `Content-Type`, fall back to `<meta charset>`, decode
   accordingly. Shared code, and it unblocks Russia.
3. **An IPS discovery adapter** for `pravo.gov.ru/proxy/ips/`. Its document ids (`nd=102041458`)
   are not the gazette's (`0001202609210002`), so the existing register does not address them and
   discovery must run against IPS itself.
4. **Measure the generic parser against decoded IPS text** before writing a Russian parser. The
   body is plain HTML with numbered points and may not need one. It does carry Word-export
   artefacts ("Complex", "Print", "MicrosoftInternetExplorer4") that need dropping.
5. **Parse a Lao gazette issue** and check sectioning on OCR output.
6. **Query translation** (never done). `queriesFor()` builds English queries; the lexical channel
   returns **zero** against Cyrillic and Lao, and RRF degrades silently so dense-only retrieval
   looks like working retrieval. Translate once offline, commit the table beside `rubric.json`,
   generate with the local engine or Groq so Section 3 holds.
7. **`docs/self-assessment.md`** — never started, and a required Stage 3 deliverable: the Word
   submission asks for a self-assessment against C1a–C4b plus a Live Test Readiness table for all
   nine sealed economies. Citable weights: 90 points for C1a–C4b, C3a+C3b = 15, C5a = 6, C5b = 4,
   judges 50, advisory 10.

---

## Risks, stated plainly

- **Zero cells.** Until one exists, the C1a claim rests on three economies, not six. Everything
  above is upstream of the thing being scored.
- **Russia's register is 85 recent federal instruments and will stay that way** without a
  portal-shaped adapter. Measured: 60 pages gives 85, 400 gives 96, and 300 seeded from the
  portal's own 960 declared sitemap listings gives 48. Both widenings were written and removed —
  the budget is not the constraint.
- **Lao rows will sit on the 0.65 confidence rung** — "located in text recovered by OCR" — because
  every Lao document is a scan. A real ceiling, already in Known Limitations.
- **Lao ligature orthography.** `ໝ` is written either as one codepoint or as `ຫ`+`ມ`, Unicode
  defines no canonical decomposition, and `normalize('NFC')` is a no-op — the situation
  `util/thai.ts` exists for. Two spellings of one word are two trigram sets. Sized, not fixed,
  because the sample also shows OCR confusing `ມ` with `ນ`.
- **Three portals remain unverified**, not blocked: `rkn.gov.ru` (the data-protection regulator,
  so it matters most for the mandatory pillars), `customs.gov.ru`, `customs.gov.mn`. They failed
  from an environment that proxies all traffic and refused TLS to hosts that answered over HTTP.
  Someone on an ordinary connection should re-check.
- **Engine B can be withdrawn under a frozen declaration.** It already was once. Re-check with
  `engine-check` around the 29th.
- **The Groq key used on 21 September was pasted into a chat transcript** and should be rotated.

---

## How to check any of this yourself

```bash
npm run dev                                              # → localhost:3000/corpus
npm run -w backend zone1 -- --economy MNG --status
npm run -w backend search -- --economy MNG "авлигатай тэмцэх"
```

The corpus page shows, per economy: instruments registered and in force, documents fetched,
**sections**, sections embedded, extraction method, and **every unread reason with its count** — a
document that fetched but produced nothing appears as a number rather than a silence.

The search command is the whole chain in one line. It currently returns article-level Mongolian
provisions with their instrument and chapter path, which means registration, fetching, parsing,
sectioning and the lexical index all work together. The dense channel needs `--embed`, which needs
a GPU endpoint (`OLLAMA_HOST` pointed at a rented pod — the Zenbook cannot host Ollama).
