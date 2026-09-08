# LexDroid

Automated evidence discovery and regulatory mapping for the UN ESCAP **Regulatory Digital Trade
Integration Index (RDTII 2.1)**.

The unit of work is a **cell**: one economy, one indicator. 61 regulatory indicators across 12
pillars. Every cell ends with an answer -- a restriction found, no restriction found, or
unresolved -- and every answer names the instrument it is a claim about.

We automate ESCAP's Zone 1 (evidence discovery) and Zone 2 (mapping and citation). Scoring is
Zone 3, and ESCAP is explicit that it stays with a human researcher; what we compute is a
suggestion with its working shown, not a verdict.

See `docs/architecture.md` for the design and `docs/lessons-from-lexdroid-v1.md` for what this
rebuild is a response to.

## Quick start

```
npm install
npm run setup
npm run dev
```

`npm run setup` creates the working store, derives the 61 indicators from ESCAP's methodology
sheet, and imports their sample kit into a quarantined baseline store. It reports what is missing
rather than failing at the first gap.

Two local models are needed. Both are open weights and both run through
[Ollama](https://ollama.com); nothing leaves the machine.

```
ollama pull bge-m3          # multilingual embeddings for the semantic index
```

## Building a corpus

```
npm run -w backend zone1 -- --economy SGP --register     # walk the portals
npm run -w backend zone1 -- --economy SGP --about "restrictions on transferring personal data abroad" --kind act
npm run -w backend zone1 -- --economy SGP --embed        # build the semantic index
npm run -w backend zone1 -- --economy SGP --status
```

`--register` builds the register: title, kind, official number and URL for every instrument the
portals publish, without fetching any of them. Singapore's is 6,365 instruments from fourteen
requests.

`--about` is the ordinary way to read. It ranks that register against a question -- semantically
and lexically, over titles -- prints what it chose and why, and fetches only that. `--top N` sets
how many. This is not only cheaper: reading a statute book front to back is not something these
portals will let you do, and it is not something the live test leaves time for.

`--read all --kind act` still exists and reads the register in order. It is for building a corpus
over a long period, not for answering a question.

Each stage is resumable: an instrument already read is skipped, and an embedding already computed
is not recomputed. Add `--cache-only` to run without touching the network at all -- in that mode a
missing document is an error rather than a fetch, which is what makes the second-engine pass
verifiably zero-fetch.

Ask the corpus a question:

```
npm run -w backend search -- --economy SGP "requirement to store personal data locally"
```

### Crawling

One request in flight per host, and a delay between requests that honours the site's own
`robots.txt` `Crawl-delay` when it asks for longer than our one-second floor. Singapore Statutes
Online asks for six seconds, and disallows `/search`; both are respected, and discovery uses the
site's browse listings instead. Every request is written to `fetch_log`, which is the run record
ESCAP asks for.

The user agent identifies us. It is also browser-shaped, because the CDN in front of Singapore
Statutes Online answers 403 to anything that is not -- including a plainly labelled research
crawler. We append our name rather than hide behind theirs.

Two settings in `src/fetch` exist for measured reasons rather than taste, and both are commented
where they are set:

- Requests ask for compressed responses and unwrap them. One Singapore Act measured 404,381 bytes
  uncompressed and 31,406 compressed; not asking meant taking thirteen times the bandwidth off a
  government server for identical text.
- The HTTPS client offers cipher suites in a browser's order. Node's default order is read as a
  client fingerprint by that same CDN, which answers a challenge page instead of the document --
  measured on the same machine in the same minute as `curl` receiving it normally. No challenge is
  solved and no credential is presented; the crawl stays within `robots.txt` either way.

### Speed

`docs/architecture.md` §8 sets the budget and says which stage each second belongs to. The short
version: politeness is a per-host constraint, so hosts are crawled in parallel and never hurried;
the corpus is built once and queried by all 61 indicators; the model stage is bounded by the number
of calls it makes, not by shortening its prompts. Nothing is ever made faster by looking at less
evidence -- a cheap filter may reorder candidates, never remove them.

### Running one run on several engines

Reading is the slow stage and it is decode-bound, so the way to make it finish sooner is more
engines, not a busier one. `fleet` splits the work by economy and pillar, hands each unit to a
worker that joins the same run, and shows one progress stream for all of them:

    npm run -w backend fleet -- --economies SGP,MYS --pillars 6,7 --hosts http://127.0.0.1:11434,http://192.168.1.20:11434

One worker per engine endpoint, and the fleet refuses a host listed twice. This is not fussiness:
two workers sharing one Ollama server have their reads batched together by that server, and
`scripts/concurrency.ts` measures what that costs -- 18 of 40 provisions read differently, findings
appearing and vanishing, while a second pass at one-at-a-time agreed with the first on all 40.
Parallelism across engines is safe; parallelism inside one is not.

Each worker's own output goes to `backend/data/fleet/<run id>/`, because several gates interleaving
their decisions on one terminal is not readable. The answers are in the run record either way.

## API

| | |
|---|---|
| `GET /health` | store and rubric status |
| `GET /api/rubric`, `/api/rubric/:id` | the 61 indicators, their bands and provenance |
| `GET /api/economies`, `/api/economies/:code` | Zone 0 profile and the state of the corpus |
| `GET /api/search?economy=SGP&q=...` | both search channels and their fusion |

## Licence

Apache 2.0. See `LICENSE`.
