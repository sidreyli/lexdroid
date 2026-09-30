# Operating LexDroid

Everything here is for running the tool outside the interface, or hosting it. A reviewer does not
need it: the [README](../README.md) covers the interface.

## Hosting a read-only copy on Vercel

From the repository root:

```bash
npm run deploy
```

The first deployment asks you to sign in and choose or create a Vercel project. After that, the
same command deploys straight to production. No environment variables or dashboard build overrides
are required. Use `npm run deploy:preview` when you want a preview URL instead.

The Vercel site is deliberately a **read-only snapshot**. It includes the recorded analysis,
workbench, run history, and CSV/XLSX exports, but it does not pretend that Vercel can run the local
pipeline: LexDroid's worker is long-lived and its SQLite store must persist between requests.
Starting runs and recording reviews remain available through `npm run dev` on a machine with the
working store. Set `LEXDROID_READ_ONLY=1` to use the same snapshot mode on another host.

Before deploying, the complete web verification is one command:

```bash
npm run check:deploy
```

For Git-based Vercel deployments, choose `frontend` as the project's Root Directory. Its checked-in
`vercel.json` supplies the remaining settings.

---

## Building a corpus

```
npm run -w backend zone1 -- --economy SGP --register     # walk the portals
npm run -w backend zone1 -- --economy SGP --about "restrictions on transferring personal data abroad" --kind act
npm run -w backend zone1 -- --economy SGP --embed        # build the semantic index
npm run -w backend zone1 -- --economy SGP --status
```

`--register` builds the register — title, kind, official number and URL for every instrument the
portals publish — without fetching any of them. Singapore's is 6,365 instruments from fourteen
requests.

`--about` is the ordinary way to read. It ranks that register against a question — semantically and
lexically, over titles — prints what it chose and why, and fetches only that. `--top N` sets how
many. This is not only cheaper: reading a statute book front to back is not something these portals
will let you do, and it is not something the live test leaves time for.

Each stage is resumable: an instrument already read is skipped, and an embedding already computed is
not recomputed. `--cache-only` runs without touching the network at all.

Ask the corpus a question:

```
npm run -w backend search -- --economy SGP "requirement to store personal data locally"
```

## Speed

`docs/architecture.md` §8 sets the budget and says which stage each second belongs to. The short
version: politeness is a per-host constraint, so hosts are crawled in parallel and never hurried;
the corpus is built once and queried by all 61 indicators; the model stage is bounded by the number
of calls it makes, not by shortening its prompts. Nothing is ever made faster by looking at less
evidence — a cheap filter may reorder candidates, never remove them.

## Running one run on several engines

Reading is the slow stage and it is decode-bound, so the way to make it finish sooner is more
engines, not a busier one. `fleet` splits the work by economy and pillar, hands each unit to a
worker that joins the same run, and shows one progress stream for all of them:

```
npm run -w backend fleet -- --economies SGP,MYS --pillars 6,7 --hosts http://127.0.0.1:11434,http://192.168.1.20:11434
```

One worker per engine endpoint, and the fleet refuses a host listed twice. This is not fussiness:
two workers sharing one Ollama server have their reads batched together by that server, and
`scripts/concurrency.ts` measures what that costs — 18 of 40 provisions read differently, findings
appearing and vanishing, while a second pass at one-at-a-time agreed with the first on all 40.
Parallelism across engines is safe; parallelism inside one is not.

Every host is checked before the run opens, and what blocks a run is that the hosts disagree about
what they are serving. Spreading a run over rented machines makes one tag mean two different builds
— a different quantisation, a different parameter count — and then half the answers come from one
model and half from the other, with nothing in the output saying so. So the family, size and
quantisation are read from each host and compared, which is exact.

```
npm run -w backend engines -- --hosts http://127.0.0.1:11434,http://127.0.0.1:11502
```

runs those checks on their own, which is the thing to do the moment a rented GPU boots.

## Renting the engines

`infra/runpod/bootstrap.sh` prepares a rented GPU: it installs Ollama, builds the reading engine
from the same Modelfile this repo uses, and pins the server to one request at a time.

```
BASE=gemma4:12b TAG=gemma4-lex-16k bash bootstrap.sh
```

It binds to localhost and nothing else, because Ollama has no authentication of its own and a pod
port open to the internet is a GPU anyone can spend. `infra/runpod/tunnel.sh` carries each pod to a
local port over SSH and prints the `--hosts` line to paste:

```
./infra/runpod/tunnel.sh 'root@1.2.3.4 -p 40022' 'root@5.6.7.8 -p 40022'
```

To reach a host over a public URL instead, put a token-checking proxy in front of it and set
`LEXDROID_ENGINE_TOKEN` in the shell that launches the run. It is sent as a bearer token and is
never written to a file.

## The engine cache, and when not to use it

`LEXDROID_ENGINE_CACHE=1` replays stored engine answers instead of asking for them. It is off
unless set, and **must never be on for a run whose numbers will be quoted** — see Known
Limitations. Delete `backend/data/engine-cache.db` to clear it; nothing else is affected.

## HTTP API

| | |
|---|---|
| `GET /health` | store and rubric status |
| `GET /api/rubric`, `/api/rubric/:id` | the 61 indicators, their bands and provenance |
| `GET /api/economies`, `/api/economies/:code` | Zone 0 profile and the state of the corpus |
| `GET /api/search?economy=SGP&q=...` | both search channels and their fusion |

