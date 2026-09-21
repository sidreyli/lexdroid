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
three court categories and the two sub-national ones drops it to roughly 560.
