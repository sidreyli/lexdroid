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

Two models are needed. Both are open weights and both run through
[Ollama](https://ollama.com), on this machine by default -- no proprietary API is ever called.

```
ollama pull bge-m3          # multilingual embeddings for the semantic index
ollama pull gemma4:12b      # the base the reading engine is built from
ollama create gemma4-lex-16k -f ollama/gemma4-lex-16k.Modelfile
```

The reading engine is stock `gemma4:12b` at a wider context and nothing else; the Modelfile in
`ollama/` is the whole of it. `qwen3-lex-16k` beside it is the second declared engine for the
engine-swap comparison, built the same way from `qwen3:8b`.

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

Every host is checked before the run opens, and what blocks a run is that the hosts disagree about
what they are serving. Spreading a run over rented machines makes one tag mean two different
builds -- a different quantisation, a different parameter count -- and then half the answers come
from one model and half from the other, with nothing in the output saying so. So the family, size
and quantisation are read from each host and compared, which is exact.

The fleet also times two concurrent requests against one alone, and reports whether the server ran
them together. That is a cross-check rather than a gate, and the distinction is worth keeping
straight: a worker reads one provision at a time and has its engine to itself, so there is never a
second request for the server to bundle with. The protection is structural. The timing would be a
poor gate anyway -- the same server here measured 1.11x, then read above the threshold once a
second model was resident and memory was tight. `--require-serial` makes it blocking, which is
what to use when something else shares the engine.

    npm run -w backend engines -- --hosts http://127.0.0.1:11434,http://127.0.0.1:11502

runs those checks on their own, which is the thing to do the moment a rented GPU boots.

### Renting the engines

The fleet does not care whether a host is on the desk or in a datacentre, so a run can be spread
over GPUs hired by the hour. `infra/runpod/bootstrap.sh` prepares one: it installs Ollama, builds the
reading engine from the same Modelfile this repo uses, and pins the server to one request at a time.

    BASE=gemma4:12b TAG=gemma4-lex-16k bash bootstrap.sh

It binds to localhost and nothing else, because Ollama has no authentication of its own and a pod
port open to the internet is a GPU anyone can spend. `infra/runpod/tunnel.sh` carries each pod to a
local port over SSH and prints the `--hosts` line to paste:

    ./infra/runpod/tunnel.sh 'root@1.2.3.4 -p 40022' 'root@5.6.7.8 -p 40022'

To reach a host over a public URL instead, put a token-checking proxy in front of it and set
`LEXDROID_ENGINE_TOKEN` in the shell that launches the run. It is sent as a bearer token and is never
written to a file.

Rented hardware bills for the hour it is held rather than the seconds it decodes, so the charge is
hosts times wall time. `--usd-per-hour` records it into the run record, where the rest of the
run cost already lives:

    npm run -w backend fleet -- --economies SGP,MYS --pillars 6,7 --hosts ... --usd-per-hour 0.34

Two things do not move. The corpus and the run record stay in the SQLite file on this machine, so
only prompts and answers cross the wire; and the engine stays the same open weights, so no
proprietary API is called either way. What does change is that provisions are read on hardware
somebody else owns, and a submission should say that rather than repeat that nothing leaves the
machine.

Each worker's own output goes to `backend/data/fleet/<run id>/`, because several gates interleaving
their decisions on one terminal is not readable. The answers are in the run record either way.

### The engine cache, and when not to use it

`LEXDROID_ENGINE_CACHE=1` replays stored engine answers instead of asking for them, which turns a
forty-minute pillar into seconds while a scoring rule is being worked on. It is off unless set.

It must never be on for a run whose numbers will be quoted. A change is validated by running two
economies and seeing whether it moves both toward ESCAP's answers; replayed readings make that a
replay rather than a measurement, and a scoring change could be "validated" without ever meeting a
fresh reading. Every replayed call is counted into `run_cost.cached_calls`, and a run that used one
carries a note on its own record saying it is not quotable. Delete `backend/data/engine-cache.db` to
clear it; nothing else is affected.

## API

| | |
|---|---|
| `GET /health` | store and rubric status |
| `GET /api/rubric`, `/api/rubric/:id` | the 61 indicators, their bands and provenance |
| `GET /api/economies`, `/api/economies/:code` | Zone 0 profile and the state of the corpus |
| `GET /api/search?economy=SGP&q=...` | both search channels and their fusion |

## Licence

Apache 2.0. See `LICENSE`.
