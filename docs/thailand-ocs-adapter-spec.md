# OCS / searchlaw.ocs.go.th — Reconstructed API Spec

**Status: `adapter: unverified` — static analysis only, no live requests made.**
Source: two downloaded JS bundles (`main.5b32a108ec4092d6ab60.js`, `scripts.132cf3ce0b84e52d9a9b.js`) from `https://searchlaw.ocs.go.th/council-of-state/`. No live calls to the OCS server were made in producing this spec. Confidence is marked per item — treat MEDIUM and especially NONE items as guesses to verify, not facts.

## 1. Endpoints

Base URL: `https://searchlaw.ocs.go.th`
API root: `/ocs-api`

| Method | Path | Confidence |
|---|---|---|
| POST | `/ocs-api/config/getConfigs` | HIGH |
| POST | `/ocs-api/portal-law/law/getLaws` | HIGH |
| POST | `/ocs-api/portal-law/law/getPrimaryLaw` | HIGH |
| POST | `/ocs-api/portal-law/law/getLawSections` | HIGH |
| POST | `/ocs-api/portal-law/law/getLawDoc` | HIGH |
| POST | `/ocs-api/portal-law/law/getLawsByIndex` | HIGH |
| POST | `/ocs-api/portal-law/index/inquiryIndexes` | HIGH |
| POST | `/ocs-api/portal-law/law/inquiryPrimaryLaws` | HIGH |
| POST | `/ocs-api/portal-law/law/getNextLawCode` | MEDIUM |
| POST | `/ocs-api/portal-law/law/inquiryToReplaceLaws` | MEDIUM |

HIGH-confidence paths had their literal string segments independently confirmed via separate enum-object definitions in the bundle (e.g. `portal_law:"portal-law"`, `law:"law"`, `getLaws:"getLaws"`).

**Out of scope, deliberately not resolved:** sibling `portal-law` endpoints for `workflow`, `inbox`, `workflow_index` (maker/checker/approve/reject) — these are internal staff drafting-workflow tooling, not public search, and were not investigated further.

## 2. Authentication

- Client-side variable name: `publicApiKey`
- Underlying config key: `ocs.content.search.public.apiKey` (HIGH — literal string)
- Sent as header: `Authorization: <key>` — **raw key value, no `Bearer ` prefix** (HIGH — literal `Authorization:this.publicApiKey` found in the HTTP call object)

**How the key is obtained:** not hardcoded. Fetched at runtime via `POST /ocs-api/config/getConfigs` requesting group `"CloudSearchUI"`, then finding the array entry whose `value` field equals `"ocs.content.search.public.apiKey"` and reading that entry's `label` field as the key string.
- Group name and lookup key: HIGH (independently confirmed literals)
- Exact response traversal to extract the key: MEDIUM (field names `value`/`label` are directly observed, but the full envelope is reconciled across two call sites, not read from one place — see §5)

A second config value was found via the same mechanism, purpose unresolved: `ocs.content.search.apiPath` (group `"CloudApiPath"`) — possibly an alternate/CDN API path for a subset of calls. Not investigated further.

## 3. Other headers

- `Content-Type: application/json` — HIGH (literal, found adjacent to the Authorization header)
- Origin / Referer — no evidence client code sets these explicitly; browsers set them automatically. Unknown whether the server checks them. **Not tested.**
- Session cookie — no evidence of cookie-based auth for these public endpoints. (Workflow/inbox/approval endpoints, out of scope, may require an authenticated session — not investigated.)
- CSRF or other custom headers — none found in the examined code paths; cannot rule out an interceptor adding one that wasn't located.

## 4. Request body — `getLaws` (the critical gap)

The method backing this call, `getStatuteLawAPI(t)`, sends:

```
new <WrapperClass>(<ActionTypeEnum>.GET_LAW, t)
```

where `ActionTypeEnum.GET_LAW` is the literal string `"getLaws"` (HIGH).

**Two things are unresolved, and both block an actual working call:**

1. **`t` — the real search/filter parameters** (e.g. keyword, page, pageSize, law type, date range). The call site that constructs `t` was not found in the two bundle files examined; it's very likely in a separate, route-lazy-loaded chunk not fetched by static analysis alone (this Angular app only exposes runtime/polyfills/scripts/main in its initial HTML — the search page's own component chunk loads dynamically on navigation, which requires a real browser session to observe). **Confidence: NONE on field names of `t`.**

2. **The wrapper class's serialization shape.** Confirmed only that it's constructed with two arguments (action-type string, payload object). Whether it serializes as `{type, data}`, `{action, payload}`, something else, or whether the payload is merged flat with no wrapper at all — not found. The class uses single-letter minified names that don't correlate across module scopes. **Confidence: NONE. This is the single biggest blocker to calling any of these endpoints correctly, not just `getLaws`.**

For comparison, a *different* endpoint's shape **was** resolved:
`getPrimaryLaw(t)` sends `{ indexId: t }` (HIGH confidence — but this is `getPrimaryLaw`, not `getLaws`).

## 5. Response shape

**`getLaws`:** envelope is `{ data: [...] }` (HIGH — literal `let n=null===(e=t.data)||void 0===e?void 0:e.map(...)` found in the `.then()` handler). Each array item is spread and extended client-side with a computed `lawCategoryDesc` field — meaning the raw server response does *not* include that field; it's derived afterward from something else (likely a category code).

Field names below were observed on a **sibling, not identical** mapping function (likely feeding an index/dropdown list) — suggestive for `getLaws`, not confirmed for it specifically:
- `lawId` (MEDIUM)
- `lawNameTh` (MEDIUM)
- `lawCode` (MEDIUM)

**`getConfigs`:** reconciled from two call sites — array of `{ groupName: string, data: [ {value, label, ...}, ... ] }` (MEDIUM-HIGH — internally consistent across two independent call sites, but not read from one authoritative source).

## 6. Traceability

All findings are from static string/regex search of:
- `main.5b32a108ec4092d6ab60.js`
- `scripts.132cf3ce0b84e52d9a9b.js`

| Finding | Location |
|---|---|
| `API_ROOT_URL="/ocs-api"` | main.js — class with `this.production=!0` |
| Authorization + Content-Type headers | main.js — object literal passed to HTTP call, inside a `portalCloudSearch`-adjacent method |
| `publicApiKey` resolution logic | main.js — constructor calling `this.apiConfigService.getConfig(u.a.CLOUD_SEARCH_UI)` |
| `CLOUD_SEARCH_UI`, `PublicApiKey`, `CloudApiPath` literals | main.js — enum-builder function expressions |
| `getStatuteLawAPI(t)`, `getPrimaryLaw(t)` definitions | main.js — contiguous block also defining `ListConfigs`-style service methods |
| Path segment literals (`index`, `law`, `config`, `inbox`, `workflow`, ...) | main.js — large object literal |
| `GET_LAW` / `GET_PRIMARY_LAW` action-type enum | main.js — enum-builder immediately after the `getIndexes` family |
| `lawId` / `lawNameTh` / `lawCode` | main.js — `.map()` callback immediately preceding the `getPrimaryLaw`/`getStatuteLawAPI` block |
| Confirmed absent from scripts.js | `getStatuteLawAPI`, `lawNameTh`, `lawCode` all return 0 matches in scripts.js — confirms the real caller lives elsewhere, not that it doesn't exist |

## 7. Confidence summary

**HIGH** (independently verified literal strings): base URL, `/ocs-api` root, all endpoint paths except `getNextLawCode` and `inquiryToReplaceLaws`, Authorization header mechanics (raw key, no Bearer), `Content-Type`, config lookup keys, `getLaws` response envelope `{data: [...]}`.

**MEDIUM** (evidenced but reconstructed, not directly read): `getConfigs` response shape, `lawId`/`lawNameTh`/`lawCode` as real field names on `getLaws` specifically, two path segment strings.

**NONE — real, named gaps:**
- The wrapper class's actual JSON serialization (blocks calling *any* of these endpoints correctly)
- `getLaws`'s own request body fields (keyword, pagination, filters, etc.)
- Whether Origin/Referer/a session cookie is checked server-side

## Next step, if resumed later

The wrapper-class shape and `getLaws` request fields most likely live in a lazy-loaded route chunk that only downloads when a real browser navigates to the search page. Resolving them without live requests would mean fetching that chunk (observable via a real browser's network tab, not by guessing chunk filenames) and re-running the same static analysis on it — still zero live API calls. Actually calling the endpoint to confirm the shape works is the step that was deliberately not taken in this session, pending explicit authorization and ideally Thai-counsel review given the ambiguity under the Computer-Related Crime Act.
