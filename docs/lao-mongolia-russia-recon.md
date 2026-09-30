# Lao PDR, Mongolia and the Russian Federation — portal reconnaissance

*Read live on 21 September 2026. Every finding below was produced by an actual request; nothing is
inferred from reputation or from a search result. Follows the method
`docs/thailand-integration-plan.md` used, and records what stopped a portal rather than dropping it.*

**Purpose.** These three economies take LexDroid from three economies to six, and from zero
non-English economies run end to end to three — which is what the finals orientation slide's C1a
asks for ("Minimum six economies processed autonomously... At least three Non-English language
countries"). This note is the input to `LAO.json`, `MNG.json` and `RUS.json`.

**ESCAP's Round 2 answers for these three economies were not opened to produce this.** Portals were
found the way a researcher finds them, per `backend/src/profile/types.ts` and the quarantine
`backend/test/baseline-isolation.test.ts` enforces.

---

## Environment caveat — read this before trusting an "unreachable"

The machine this was run from resolves **every** hostname to `10.0.118.41`, a private address: all
traffic passes through a local proxy. `example.com`, `legalinfo.mn` and `pravo.gov.ru` all resolve
to it alike.

That proxy refuses some HTTPS connections that are perfectly healthy over HTTP. `pravo.gov.ru`
timed out on `:443` after 21 seconds and answered `:80` in 1.5 seconds with its real homepage.

**So a connection failure here is not evidence about the portal.** Two hosts below failed on both
schemes and are recorded as *unverified*, not as *blocked* — the distinction Thailand's plan was
careful about, and the reason it insisted on an environment that could actually reach the sites.
Someone on an ordinary connection should re-check the three marked ⚠ before the profiles are final.

---

## Summary

| Economy | Primary source | Verdict | Adapter |
|---|---|---|---|
| **Mongolia** | `legalinfo.mn` | ✅ **Best of the three.** Register API + server-rendered full text + a published taxonomy with counts | bespoke (small) |
| **Russia** | `publication.pravo.gov.ru` | ✅ Permissive, server-rendered, enumerable document IDs, sitemap declared | `crawl` seeded by `sitemap`, **once fix #3 lands** |
| **Lao PDR** | `laoofficialgazette.gov.la` | ⚠️ Reachable and paginated, **but documents are scans** — needs Lao OCR | `crawl` + a new OCR language |

**The single biggest finding:** Lao's gazette publishes image-only PDFs, so Lao cannot produce a
single cell until `backend/src/parse/ocr.ts` learns Lao. That was listed as out of scope on the
assumption it might not be needed. It is needed.

---

## Mongolia

### `legalinfo.mn` — Unified Legal Information System (Эрх зүйн мэдээллийн нэгдсэн систем)

Run by the Legal Institute (`info@legalinstitute.mn`). This is the India Code equivalent and it is
the cleanest portal of the nine this repo has ever profiled.

| | |
|---|---|
| robots.txt | **None.** `/robots.txt` returns a 404 HTML page, so the conservative unknown-robots delay applies (`backend/test/robots-absent.test.ts` covers this case) |
| Server | nginx, PHP session cookie, jQuery front end — no SPA framework |
| Homepage | `/` → 302 → `/mn`, 122 KB, 2,197 body text tokens — server-rendered |
| English edition | `/en` exists |

**Structure, as measured:**

- `/mn/law/<small-id>` — a *category* of law (IDs 26–38 observed), not a document.
- `POST /mn/ajaxListBody/` — **the register API.** Returns `{"Html": …, "word": …}`; `Html` is a
  rendered fragment, 20 rows per page. Confirmed working with
  `--data "isactive=1&sort=title&sortType=asc"` → 200, 48 KB.
  Filter parameters read out of `assets/custom/legal/js/pages/law.js`: `title`, `actnumber`,
  `stateregnumber`, `registerdate`, `enacteddate`, `enforcementdate`, `isvalid`, `filteractive`,
  `isactive`, `filtertopicid`, `filterdepartmentid`, `filterstartdate`, `filterenddate`, `sort`,
  `sortType`. Sibling endpoints: `/mn/ajaxList/`, `/mn/ajaxCategory/`, `/mn/ajaxchild/`,
  `/mn/ajaxsubData/`, `/mn/ajaxyam/`.
- Each row carries **title, gazette reference, enacted date and effective date** — e.g.
  *"Төрийн мэдээлэл эмхэтгэл: 1996 он, №03"* (State Information gazette, year, issue).
- `/mn/detail?lawId=<ID>` — **the document, server-rendered in full.** 125 KB, 16,848 visible
  characters on the one sampled. Also offers **Pdf** and **Word** exports.

**The sampled document proves the hard parts work.** `lawId=16532151599871` is an Order of the
Minister of Labour and Social Protection, No. А/123 of 2022-06-10, and its text opens by citing its
own enabling powers — *"Монгол Улсын Засгийн газрын тухай хуулийн 24 дүгээр зүйлийн 2 дахь хэсэг,
Хөдөлмөрийн тухай хууль ... 142 дугаар зүйлийн 142.4 дэх хэсгийг үндэслэн"* (on the basis of art.
24.2 of the Law on Government and art. 142.4 of the Labour Law). That is exactly the
made-under / enabling-power relationship `src/parse/identity.ts` and the `made-under` logic want,
stated in the document's own words.

**The portal publishes its own taxonomy with counts** — which gives `instrumentTypes` for the
profile *and* an exact shortfall check for the register, the way Australia's FRL OData count does:

| Mongolian | English | Count |
|---|---|---:|
| Монгол Улсын Үндсэн Хууль | Constitution | 1 |
| Монгол Улсын хууль | Law of Mongolia | 956 |
| Монгол Улсын олон улсын гэрээ | International treaty | 699 |
| Ерөнхийлөгчийн зарлиг | Presidential decree | 218 |
| Улсын Их Хурлын тогтоол | State Great Khural (Parliament) resolution | 2,589 |
| Засгийн газрын тогтоол | Government resolution | 5,778 |
| Үндсэн хуулийн цэцийн шийдвэр | Constitutional Court decision | 332 |
| Улсын дээд шүүхийн тогтоол | Supreme Court resolution | 259 |
| УИХ-аас томилогддог байгууллагын... шийдвэр | Decisions of heads of parliament-appointed bodies | 132 |
| Сайдын тушаал | Ministerial order | 988 |
| Засгийн газрын агентлагийн даргын тушаал | Government agency head's order | 217 |
| Зөвлөл, хороо, бусад байгууллага | Councils, committees, other bodies | 605 |
| **Аймаг, нийслэлийн ИТХ-ын шийдвэр** | **Provincial / capital citizens' assembly decisions** | **1,212** |
| **Аймаг, нийслэлийн Засаг даргын захирамж** | **Provincial / capital governor's orders** | **86** |
| Хууль, хяналтын байгууллага | Law and supervisory bodies | 6 |
| Төрийн зарим чиг үүргийг... хэрэгжүүлж буй байгууллага | Bodies exercising delegated state functions | 3 |
| Шүүхийн ерөнхий зөвлөл | General Council of Courts | 9 |

≈ **14,090 instruments.**

Status vocabulary, used as a filter on the listing: **Хүчинтэй** (in force) · **Хүчингүй**
(repealed) · **Хүчинтэй, үйлчлэл нь зогссон** (in force but suspended). That maps onto the store's
`status` / `status_basis` directly.

> **Profile note that contradicts the plan.** Mongolia is a unitary state, so I had assumed
> `jurisdictionScope` could be left null like Thailand's. It should not be: the portal **holds**
> 1,298 provincial and capital-city instruments alongside national law. The risk is the opposite of
> Australia's — not a tier missing, but a local rule being generalised to the economy, which is the
> exact error `docs/india-integration.md` deferred State/UT law to avoid. Declare
> `held: "national and local"` with `notHeld: []` and say so in the note.

### Other Mongolian portals

| Portal | robots.txt | Finding |
|---|---|---|
| `www.mongolbank.mn` (Bank of Mongolia) | 200, `Allow: /` | Sitemap line is **commented out** (`#Sitemap:`), so the `sitemap` adapter falls back to the conventional `/sitemap.xml` — untested |
| `crc.gov.mn` (Communications Regulatory Commission) | 200, `Disallow:` (empty = permissive) | Pillars 5/7/10/11. Shape not yet inspected |
| `www.parliament.mn` | 404, empty body | No robots.txt. Shape not yet inspected |
| `customs.gov.mn` | ⚠ timed out on `:443` | **Unverified** — see the environment caveat |

---

## Russian Federation

### `publication.pravo.gov.ru` — Official Internet Portal of Legal Information

The official publication venue, and therefore the commencement evidence. Consultant+ and Garant are
commercial and are **not** the official source.

| | |
|---|---|
| robots.txt | 200, permissive. Disallows only `/Error`, `/Rss`, `/app`, `/js`, `/images`, `/lib`, `/css`, `/Svg`, `/webfonts`, `/HtmlConstructor`, **`/Search`**, **`/File`** |
| Sitemap | **Declared**: `http://publication.pravo.gov.ru/sitemap.xml` — 960 `<loc>` entries, a flat `<urlset>` |
| Server | nginx/1.26.1, PHP. Server-rendered |

`Disallow: /Search` means discovery must use the browse listings rather than the search box —
exactly the Singapore SSO situation the README already describes. `Disallow: /File` needs checking
before any document fetch; it may be where the binaries are served.

**Structure, as measured:** the sitemap's 960 URLs are **browse listings, not documents** —
`/documents/block/<body>`, `/documents/<body>/daily|weekly|monthly`, `/calendar/<body>`, for
`president`, `government` and the rest. `GET /documents/block/government` returned 98 KB,
server-rendered, **60 document links per page**.

Documents are `/document/<20-digit-id>`, and the id is structured:
`0001202609170019` = `0001` + `20260917` (date) + `0019` (sequence). Enumerable by date.

So Russia needs no bespoke adapter: `sitemap` supplies the listing seeds and `crawl` walks them —
**provided `instrumentTitle()` can recognise a Russian title.** It cannot today. This is the single
blocker for Russia and it is fix #3.

`pravo.gov.ru` (the parent portal) serves `User-Agent: * / Disallow:` — fully permissive.

| Portal | Finding |
|---|---|
| `www.cbr.ru` (Central Bank) | robots.txt 200 over HTTPS; permissive apart from `/search/` and five specific files. Pillars 6/7/8 |
| `rkn.gov.ru` (Roskomnadzor) | ⚠ timed out on `:443` **and** `:80`. **Unverified** — the data-protection regulator, so worth re-checking properly |
| `customs.gov.ru` | ⚠ timed out on both. **Unverified** — pillars 1/2/10/12 |

---

## Lao PDR

### `laoofficialgazette.gov.la` — Lao Official Gazette

| | |
|---|---|
| robots.txt | **None** — the site soft-404s, returning its 135 KB homepage for `/robots.txt` with status 200 |
| Scheme | **HTTP only.** HTTPS returns `Connection was reset` (consistent across attempts; may be the proxy — re-check) |
| Platform | Yii PHP (`index.php?r=site/index` routing). Server-rendered |
| Language | **12,412 Lao-script characters on the homepage alone** — genuinely Lao, not an English mirror |

**Structure:** paginated listings at `/index.php?r=site/index&Document_page=N`, sortable by
`title`, `legal.issue_date`, `legal.effective_from` and `agency_id` — real metadata fields, which
means issue date and effective date are available per row.

Documents are PDFs at `/kcfinder/upload/files/<number>-<d-m-yyyy>_0001.pdf`.

### ⛔ The blocker: the PDFs are scans

One document sampled — `06-28-8-2026_0001.pdf`, 1,087,136 bytes:

| Marker | Count | Meaning |
|---|---:|---|
| `/Font` | **0** | no embedded fonts |
| `/ToUnicode` | **0** | no character mapping |
| `/Image` | 6 | page images |
| `/DCTDecode` | 2 | JPEG-compressed |

No text layer. `backend/src/parse/pdf.ts` will recover nothing and the document will fall to OCR —
and `backend/src/parse/ocr.ts:65` is `Tesseract.createWorker(['eng', 'hin'], …)`, built for India's
bilingual Gazette scans. **There is no Lao language pack and no Lao confidence heuristic.**

Consequences, stated plainly:

1. Lao produces **zero cells** until `lao.traineddata` is packaged into
   `backend/data/ocr/tessdata` and `ocr.ts` learns to select it.
2. Even once it does, Lao rows land on the **0.65 confidence rung** — *"Quoted words located in
   text recovered by OCR"* (`src/export/index.ts`). That is honest, and the README's Known
   Limitations should say so rather than let the number pass unexplained.
3. OCR quality on Lao script is the risk `docs/architecture.md` §11 names first: *"Open-source OCR
   on scans, especially non-English ones, is the weakest link."*

*Only one PDF was sampled. Sample several more across years before treating "the gazette is
scan-only" as settled — an older or newer run may carry a text layer.*

### Other Lao portals

| Portal | robots.txt | Finding |
|---|---|---|
| `moj.gov.la` (Ministry of Justice) | **`User-agent: * / Disallow: /`** | ⛔ **CLOSED.** Fully disallowed. The fetcher respects robots, so this portal is recorded with `adapter: null` and is not crawled — not a limitation to work around |
| `laotradeportal.gov.la` | 200, `User-agent: Googlebot / Disallow:` | Names only Googlebot; no rule for `*`, so permitted by default. WTO-TFA funded, usually well-structured. **Best second source for Lao** — inspect next |
| `www.na.gov.la` (National Assembly) | 200 over HTTPS, carries an EU DSM art. 4 content-signals reservation | Rules not yet read in full |
| `www.bol.gov.la` (Bank of Lao PDR) | 302 to itself over HTTPS; HTTP times out | Needs a proper look |

---

## What this changes

**1. A fifth code fix, and it is a blocker.** Lao OCR. The plan listed OCR language packs as out of
scope pending evidence; the evidence arrived. Add `lao.traineddata` and a Lao-script confidence
heuristic to `parse/ocr.ts` alongside the existing English one.

**2. Fix #3 is confirmed as the critical path for two of three economies.** Russia is fully
permissive, server-rendered and enumerable, and produces nothing today purely because
`instrumentTitle()` reads English. Mongolia's bespoke adapter would bypass it; Russia's `crawl`
route cannot.

**3. Mongolia should be first, and by a wide margin.** It has a register API, server-rendered full
text, per-row dates, a gazette reference, an in-force filter, a published count to check the
register against, and enabling-power citations in the documents themselves. It is the fastest route
to the first non-English cell this repo has ever produced.

**4. Mongolia needs a `jurisdictionScope` after all** — see the note above. It holds 1,298
sub-national instruments.

## Next

1. Inspect `laotradeportal.gov.la` and `crc.gov.mn`; re-check the three ⚠ hosts from an ordinary
   connection.
2. Sample more Lao gazette PDFs to confirm scan-only.
3. Check what `Disallow: /File` covers on `publication.pravo.gov.ru` before any document fetch.
4. Write `MNG.json` first, then `RUS.json`, then `LAO.json`.

---

## Mongolia's register adapter — specification, and the one thing that blocks it

*Added 21 September 2026, after the title-recognition fix landed. Everything below was measured
against the live site; the adapter is not written, and this says exactly why.*

### The blocker, stated first

`legalinfo.mn`'s listing endpoint is **POST-only in effect**. `GET /mn/ajaxListBody/?...` answers
200 with valid JSON, but ignores every parameter — `filtercategorytypeid=27` and
`filtercategorytypeid=33` return byte-identical bodies, and `page=3` returns page 1. Verified by
comparing returned `lawId` sets. The application reads `$_POST`.

`backend/src/fetch/index.ts` issues `method: 'GET'` and nothing else. So this adapter cannot be
written without teaching the Fetcher to POST — and that module owns robots enforcement, the
per-host rate limit, the cache and `fetch_log`, all of which key on a URL identifying a request.
A POST needs the request body folded into the cache key or two different queries collide in the
cache.

That is a deliberate, self-contained change to the most safety-critical module in the repository,
and it is what checklist item 25 (politeness on by default) is marked on. It should be made on its
own, with `fetch.test.ts`, `robots-rules.test.ts` and `robots-absent.test.ts` green, rather than
folded into an adapter.

### What is already established, so the adapter is transcription once that lands

Endpoint: `POST https://legalinfo.mn/mn/ajaxListBody/`, form-encoded, returning `{Html, word}`
where `Html` is a rendered fragment of **20 rows**. Parameters that matter:
`filtercategorytypeid`, `isactive`, `page`, `sort`, `sortType`. Confirmed working: categories 30,
33 and 34 each return distinct and correct content, and `page=1` against `page=2` returns disjoint
`lawId` sets.

Row shape — the fragment marks its own fields, so no positional parsing is needed:

```html
<div class="legal-list-component" ...>
  <div data-block="title">
    <a href="https://legalinfo.mn/mn/detail?lawId=5756" class="act-name">TITLE</a>
    <span style="font-style: italic">Төрийн мэдээлэл эмхэтгэл: 1996 он, №03</span>
  </div>
  <div data-block="enacteddate"><span>1996-01-02</span></div>
  <div data-block="enforcementdate"><span>1996-01-02</span></div>
  <div data-block="inactive">…</div>
</div>
```

So each row yields a title, a document URL, the gazette reference, the enacted date and the
effective date — `commencedOn` comes off `enforcementdate`, and the listing walked (`isactive`)
is the `statusBasis`, which is the portal answering the standing question rather than us inferring
it. Documents are then server-rendered in full at `/mn/detail?lawId=<ID>`.

### The categories, with the kind each maps to

Taken from the portal's own footer, which publishes the counts. **The kind comes from the category
walked, not from the title** — which is what makes it evidence rather than a guess, and is why the
adapter should walk per category rather than the unfiltered listing.

| id | Category | Count | kind |
|---:|---|---:|---|
| 26 | Монгол Улсын Үндсэн Хууль (Constitution) | 1 | `act` |
| 27 | Монгол Улсын хууль (Law of Mongolia) | 956 | `act` |
| 29 | Монгол Улсын олон улсын гэрээ (International treaty) | 699 | `act` — ratified treaties have force of law; flag in notes |
| 30 | Ерөнхийлөгчийн зарлиг (Presidential decree) | 218 | `order` |
| 28 | Улсын Их Хурлын тогтоол (Khural resolution) | 2,589 | `order` |
| 33 | Засгийн газрын тогтоол (Government resolution) | 5,778 | `regulation` |
| 34 | Сайдын тушаал (Ministerial order) | 988 | `notice` |
| 35 | Засгийн газрын агентлагийн даргын тушаал (agency head's order) | 217 | `notice` |
| 36 | УИХ-аас томилогддог байгууллагын… шийдвэр | 132 | `notice` |
| 390 | Хууль, хяналтын байгууллага | 6 | `notice` |
| 180 | Төрийн зарим чиг үүргийг… хэрэгжүүлж буй байгууллага | 3 | `notice` |
| 186 | Зөвлөл, хороо, бусад байгууллага (councils, committees) | 605 | `guideline` |
| 37 | **Аймаг, нийслэлийн ИТХ-ын шийдвэр** (provincial assembly) | 1,212 | sub-national — see `MNG.json` jurisdictionScope |
| 38 | **Аймаг, нийслэлийн Засаг даргын захирамж** (governor's order) | 86 | sub-national |
| 31 | Үндсэн хуулийн цэцийн шийдвэр (Constitutional Court) | 332 | not an instrument — skip |
| 32 | Улсын дээд шүүхийн тогтоол (Supreme Court) | 259 | not an instrument — skip |
| 16231124857801 | Шүүхийн ерөнхий зөвлөл (General Council of Courts) | 9 | skip |
| | **Total** | **14,090** | |

Note id **27 is the Laws of Mongolia**, not the in-force filter. The listing page's navigation puts
"Хүчинтэй эрх зүйн акт" (in-force acts) beside the same href, and reading the nav rather than the
footer gets this wrong — it did here first time.

### Cost of the walk

14,090 instruments at 20 rows a page is **705 requests**, about twelve minutes at the one-second
floor, and no model time. The register is built once and queried by all 61 indicators. Skipping the
three court categories (600) and the two sub-national ones (1,298) leaves 12,192 national
instruments, which is 610 requests.

---

## Lao OCR — done, measured, and one thing it turned up

*21 September 2026. `@tesseract.js-data/lao@1.0.0` (MIT) added beside the English and Hindi packs,
`'lao'` added to the worker and to the language directory, and the fallback order made a table so
a page that reads as Hindi never costs a Lao pass.*

### Acceptance evidence

The sampled gazette scan — `06-28-8-2026_0001.pdf`, 1,087,136 bytes, zero `/Font`, zero
`/ToUnicode` — was put through the stage cold:

| | |
|---|---|
| Time | **10.2 s** for one page |
| Confidence | **77.0** |
| Lao characters recovered | **1,761** |
| Latin characters | 0 |
| Lines | 35 |

The text is legally usable, not just present. The page is an Instruction (`ຄໍາສັງແນະນໍາ`) on
agricultural contracts issued by a provincial administration committee, and it opens by citing its
own enabling powers:

> `ອີງຕາມ ມາດຕາ 20, ຂໍ້ທີ 16 ຂອງກົດຫນາຍວ່າດ້ວຍການປົກຄອງທ້ອງຖິ່ນ (ສະບັບປັບປຸງ) ສະບັບເລກທີ 78/ສພຊ`
> — *pursuant to Article 20, point 16 of the Law on Local Administration (revised), No. 78/ສພຊ*

> `ອິງຕາມ ດໍາລັດວ່າດ້ວຍກະສິກໍາແບບມີສັນຍາ ສະບັບເລກທີ 56/ລບ`
> — *pursuant to the Decree on contract farming, No. 56/ລບ*

Article numbers, instrument numbers and the made-under chain all survive OCR. `ດໍາລັດ` (Decree) is
`LAO.json`'s `regulation` tier and `ຄໍາແນະນຳ` (Instruction) its `guideline` tier, so the
vocabulary added for title recognition reaches this text too.

**So Lao is no longer blocked.** It sits on the 0.65 confidence rung — *"quoted words located in
text recovered by OCR"* — which is a real ceiling and is stated in `README.md` Known Limitations.

### The thing it turned up: Lao ligature orthography

OCR returned `ກົດຫນາຍ` where the profile's vocabulary has `ກົດໝາຍ` (law). Lao writes some
consonant clusters either as a single ligature codepoint or as `ຫ` plus the base consonant:

| Ligature | Decomposed |
|---|---|
| `ໝ` U+0EDD | `ຫ` + `ມ` |
| `ໜ` U+0EDC | `ຫ` + `ນ` |

Unicode defines no canonical decomposition for these, so `normalize('NFC')` is a no-op on them —
**exactly the situation `backend/src/util/thai.ts` exists for** with Thai SARA AM, and its header
already predicted this class of bug would appear elsewhere.

Two consequences, both real:

1. **Title recognition can miss.** A Lao title OCR'd in decomposed form will not match a
   vocabulary term written with the ligature, or the reverse.
2. **Lexical search can miss.** Two spellings of one word are two different trigram sets, so a
   query and a document that disagree about the spelling do not match.

The fix is a `canonicalizeLao` beside `canonicalizeThai`, folding `ຫ`+`ມ` → `ໝ` and `ຫ`+`ນ` → `ໜ`,
applied at the same two call sites (`index/index.ts` for the query side, `db/index.ts` for the
indexing side) and in `instrumentWords`/`instrumentTitle` for the vocabulary.

**Not fixed here, deliberately.** This sample also shows OCR confusing `ມ` with `ນ` — the two are
visually close — so `ກົດຫນາຍ` is partly a misread and partly an orthographic variant, and
normalising alone would not have recovered it. Distinguishing the two needs more than one page of
evidence. Written down so it is a known, sized piece of work rather than a silent recall loss.

---

## Mongolia's register, built — 21 September 2026

`npm run -w backend zone1 -- --economy MNG --register`

**11,962 instruments registered.** Mongolia's statute book is now the second-largest single-portal
register in this corpus, ahead of Singapore's 6,857. The walk cost **607 network requests, two
served from cache, zero refused by robots.txt, zero refused by the host and zero failed**, at
28.6 MB, in about eleven minutes at the one-second floor. No model time.

| Category | Registered | Portal states |
|---|---:|---:|
| Монгол Улсын Үндсэн Хууль (Constitution) | 1 | 1 |
| Монгол Улсын хууль (Law of Mongolia) | 950 | 956 |
| Монгол Улсын олон улсын гэрээ (International treaty) | 696 | 699 |
| Ерөнхийлөгчийн зарлиг (Presidential decree) | 212 | 218 |
| Улсын Их Хурлын тогтоол (Khural resolution) | 2,565 | 2,589 |
| Засгийн газрын тогтоол (Government resolution) | 5,755 | 5,778 |
| Сайдын тушаал (Ministerial order) | 873 | 988 |
| Засгийн газрын агентлагийн даргын тушаал | 193 | 217 |
| УИХ-аас томилогддог байгууллагын шийдвэр | 119 | 132 |
| Хууль, хяналтын байгууллага | 3 | 6 |
| Төрийн зарим чиг үүргийг хэрэгжүүлж буй байгууллага | 3 | 3 |
| Зөвлөл, хороо, бусад байгууллага | 592 | 605 |
| **Total** | **11,962** | **12,192** |

As stored: 5,755 `regulation`, 2,777 `order`, 1,647 `act`, 1,191 `notice`, 592 `guideline` — which
sums to the category walk exactly, so the kind on every row came from the category it was found
under rather than from its title. All 11,962 are recorded `in-force` on the listing's own authority,
and **11,960 of 11,962 carry a commencement date** taken from the row's effective-date field.

### The 230-instrument shortfall, and what it is not

1.9% fewer registered than the portal's footer states, distributed unevenly — Laws are 0.6% short,
Ministerial orders 11.6%.

The obvious hypothesis was the in-force filter: the walk passes `isactive=1`, and a footer count
that included repealed instruments would explain it. **Tested, and it does not.** Category 390
returns four rows with `isactive=1` and the same four rows without it, against a stated six.

Two things that do account for part of it, and one that is still open:

- **Cross-category duplication.** The adapter keys on document URL across the whole walk, so an
  instrument listed under two categories is registered once. Category 390 registered three of the
  four rows it returned for exactly this reason — the fourth was already held. That is correct, and
  it means the portal's per-category counts cannot be summed into a corpus size.
- **The footer may count what the listing does not return.** Four against six on 390 is the
  endpoint's own answer, not a filter artefact.
- **Open:** whether the remaining gap is stale footer counts, instruments the listing paginates
  past, or a genuine difference in what the two views hold. It is 1.9% and it is recorded per
  category on the run, so it is visible rather than silent — but it has not been explained, and
  this note should not be read as having explained it.

### What the other Mongolian portals gave

`www.mongolbank.mn` was walked by the `sitemap` adapter and listed **no instruments**: the
conventional `/sitemap.xml` exists and contains no URLs, the `Sitemap:` line in its robots.txt
being commented out. Recorded as a hole rather than counted as covered. The Communications
Regulatory Commission, the State Great Khural and Mongolian Customs have no adapter and are
recorded the same way.

---

## Russia's register, and why it is small — 21 September 2026

`npm run -w backend zone1 -- --economy RUS --register` → **85 federal instruments**, 60 requests,
zero refused, zero failed.

Real federal law, correctly typed: `Федеральный закон от 04.08.2026 № 294-ФЗ` as `act`,
`Указ Президента Российской Федерации от 15.08.2026 № 584` as `order`,
`Постановление Правительства` as `regulation`. 112 of the first 114 pointed at real
`/document/<id>` URLs.

### The correctness bug the first walk exposed

The unfiltered walk registered **114 instruments, of which 27 were not federal law** —
`Указ Главы Республики Бурятия`, `Постановление Правительства Томской области`,
`Указ Главы Луганской Народной Республики`. `RUS.json` declares `held: federal` with the
constituent entities' law explicitly *not* held, so those 27 were outside the corpus this profile
says it holds. Two listing pages were also registered as instruments, their headings being
instrument-shaped.

Invisible downstream, which is what makes it serious: a cell answered on a Buryatia decree reads
exactly like a federal finding. It is the error `docs/india-integration.md` deferred State and
Union Territory law to avoid.

**The portal answers it itself.** The 20-digit document id encodes the issuing jurisdiction:

| Prefix | Issuer | In the first 114 |
|---|---|---:|
| `0001` | Federal | 85 |
| `0300` | Republic of Buryatia | 11 |
| `2100` | Chuvash Republic | 4 |
| `7000` | Tomsk Oblast | 4 |
| `0800` | Republic of Kalmykia | 3 |
| `1200`, `1300`, `8100` | Mari El, Mordovia, Luhansk | 5 |

So `crawl` learned `adapterConfig.urlMustMatch`, and `RUS.json` sets it to `/document/0001\d+`.
Opt-in, refused at load if it does not compile, and every rejection recorded through `setAside`
rather than dropped. 114 → exactly 85, with the two listing pages going too.

### Two widenings tried, measured, and not kept

85 instruments is a thin register for a federal statute book, and the obvious response is to let
the crawl walk further. It does not work:

| Configuration | Pages | Instruments | Per page |
|---|---:|---:|---:|
| Default, walking out from the homepage | 60 | **85** | 1.42 |
| Homepage, budget raised to 400 | 400 | 96 | 0.24 |
| Seeded from the portal's 960 declared sitemap listings | 300 | 48 | 0.16 |

The budget is not the constraint — the link graph reachable from the front page at depth 3 is
simply small, and 340 extra requests against a government server bought eleven documents. Seeding
from the sitemap was worse than doing nothing, because those 960 declared URLs are mostly
`/calendar/...` and `/documents/*/daily` date stubs rather than populated listings; the homepage
walk reaches the `block` listings that actually hold documents.

**Both widenings were removed rather than shipped.** Keeping configuration that was measured as
harmful for the one portal it was written for is the speculative building
`docs/thailand-integration-plan.md` warns against. What survives is the jurisdiction filter, which
is a correctness fix and is in use.

### What Russia actually needs

An adapter that knows the portal's shape, the way `frl`, `sso`, `indiacode` and `legalinfo` do.
The documents are enumerable — `/document/0001YYYYMMDDNNNN` is a date plus a sequence — and the
`documents/block/<body>` listings are server-rendered with 60 documents each. That is a tractable
adapter and it is not written.

Until it is, **Russia's register is 85 recent federal instruments and that is what it is.** Stated
here and in the profile rather than left for someone to discover from a thin corpus.

---

## Parsing, measured — 22 September 2026

The registers are catalogues. This is what happened when documents were actually fetched and put
through the parser.

### Mongolia: fixed, and the fix needed a parser of its own

Three documents, before any change:

| Document | Sections | What that was |
|---|---:|---|
| Anti-Corruption Law | **1** | 112,095 characters, beginning `+(976)-11-323317 info@legalinstitute.mn` |
| its transitional law | **1** | 287 characters, same phone number first |
| the Constitution | **199** | split on sub-clause numbers; one section 85 KB, several in the English translation the page also carries |

Both failures are silent. A section is the unit retrieval ranks and the reader reads, so a document
that arrives as one blob is one the cell searched and could not see into — and the cell then
reports no restriction found. Nothing throws and no count is short.

Two causes, neither a vocabulary problem alone. The generic path never scoped to the page's
`.law_content` block, so it took the site furniture with it; and `PROVISION_LINE` in
`parse/html.ts` wants a leading number, a delimiter and a space, where a Mongolian article reads
`1 дүгээр зүйл.Хуулийн зорилт` — number, two words, full stop, no space.

`backend/src/parse/legalinfo.ts` now reads the structure the drafter used. After:
**70, 37 and 1 sections** — the article counts those three instruments have. Offset invariant holds
on every one, no section contains page furniture, and a Mongolian phrase search returns
article-level provisions with their instrument and chapter path.

Three things the documents taught that desk work would have got wrong:

- **An ordinary Law numbers its articles; the Constitution spells the ordinal out.** `1 дүгээр
  зүйл` against `Нэгдүгээр зүйл.`
- **Compound ordinals are two words.** `Арван нэгдүгээр зүйл` is ten-one-th, article 11. A pattern
  anchored on a single token found 16 of the Constitution's 70 articles.
- **JavaScript's `\b` is ASCII-only, so it never matches beside Cyrillic.** `/\bБҮЛЭГ/` is false on
  `НЭГДҮГЭЭР БҮЛЭГ`. Chapter detection silently found none at all on the real Law, and the heading
  paths simply looked like a document without chapters. Worth checking wherever else this codebase
  matches non-Latin script.

### Russia: the documents are PDFs, behind a path robots names

Four documents fetched, **0 parsed, 4 unread** — each recorded `empty`, *"yielded 300 characters of
text, below the 600 needed for a document."*

21 KB of HTML producing 300 characters is a shell. Decoding its numeric character references gives
651 characters, and all of it is metadata: the title
(`Указ Президента Российской Федерации от 21.09.2026 № 672`), the publication number, the
publication date, and `Страница № 1 из 11` — page 1 of 11 of a viewer. **The text is not in the
page.** It is a PDF at `/file/pdf?eoNumber=<id>`, linked from the document page.

And `robots.txt` says `Disallow: /File`.

**This is a judgment call and it is not ours to make quietly.** RFC 9309 compares paths
octet-by-octet, so `/file/` does not match `Disallow: /File`, and this repository's own
`robotsPermits` returns allowed — verified. But the disallow list reads like ASP.NET controller
names (`/Error`, `/Rss`, `/Svg`, `/HtmlConstructor`, `/Search`, `/File` capitalised beside `/app`,
`/js`, `/css` lowercase), routing in that stack is case-insensitive, and on that reading the
publisher meant to disallow the file endpoint and we would be fetching it on a technicality.

Nothing has been fetched from `/file/`. Until the team decides, **Russia has 85 registered
instruments and no readable documents.**

**The lead that may make it moot:** `pravo.gov.ru` — the parent portal, `User-Agent: * / Disallow:`
with nothing disallowed at all — carries `/ips/` and `/proxy/ips` paths. IPS is the
Информационно-правовая система, the legal information system, and it may serve the text on a
path nobody has asked us to avoid. Not yet investigated.

### Russia has a permitted full-text source after all: pravo.gov.ru/proxy/ips

*22 September 2026.* The robots question above does not have to be answered, because the same law
is published where nothing is disallowed at all.

`pravo.gov.ru` serves `User-Agent: * / Disallow:` — an empty disallow, permitting everything — and
proxies the Информационно-правовая система, the State System of Legal Information, at
`/proxy/ips/`. Two endpoints matter, both reached from links on the portal's own front page:

| Endpoint | What it returns |
|---|---|
| `?docbody=&nd=<id>` | the document's card: title, and every amendment edition with its date and number |
| `?doc_itself=&nd=<id>&page=all` | **the full text** |

Measured on `nd=102041458`, the decree on publication and entry into force of federal acts:
**10,647 characters of visible text, 8,264 of them Cyrillic, 113 lines, 19 numbered points**, and
the amendment history stated in the document's own words — *"(В редакции указов Президента
Российской Федерации от 16.05.1997 № 490 …)"*. That is a readable instrument, not a viewer shell.

**So Russia should be read here, not from the publication portal's PDFs.** `publication.pravo.gov.ru`
stays as the gazette — it is the commencement evidence, and its register is already built — and
`/proxy/ips/` becomes the source of text. Nothing is fetched from `/file/`, and the
`Disallow: /File` reading never has to be litigated.

#### The shared-code gap this turned up: the pipeline assumes UTF-8

IPS declares `charset=windows-1251`, and the pipeline never looks. `parse/index.ts` does
`res.body.toString('utf8')` at three call sites, `discover/crawl.ts` at a fourth, and nothing in
`parse/` or `fetch/` consults a declared charset anywhere.

Read as UTF-8 that page yields **zero** Cyrillic characters — not degraded, lost. And it fails in
the shape that hides: a document with no readable text is recorded `empty`, which looks exactly
like a portal that served a stub. Any economy whose portal predates UTF-8 hits this, and legacy
encodings are common on Russian and older Asian government sites.

#### What Russia now needs

1. **Charset-aware decoding** in the fetch or parse boundary — read the `Content-Type` header, fall
   back to the `<meta charset>` the document declares, and decode accordingly. Shared code, and
   the one change here that is not Russia-specific.
2. **An IPS discovery adapter.** The document ids are IPS's own (`nd=102041458`), not the gazette's
   (`0001202609210002`), so the register built from `publication.pravo.gov.ru` does not address
   them and discovery has to run against IPS itself.
3. A parser, or possibly none: the body is plain HTML with numbered points, and the generic path
   may carry it once the text is decoded — worth measuring before writing anything.

Note the body carries Word-export artefacts ("Complex", "Print", "false",
"MicrosoftInternetExplorer4") ahead of the instrument, which a parser will need to drop.
