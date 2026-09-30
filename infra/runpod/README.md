# Renting engines on RunPod

One pod is one engine is one worker. The fleet splits a run by economy and pillar, and each unit is
independent, so N pods finish roughly N times sooner. Nothing about the corpus moves: the SQLite
store, the run record and every decision stay on the machine that launches the run, and only
prompts and answers cross the wire.

## From the interface (the usual way)

*Start a run* → **Runs on** → *Rented GPU* → *Rent GPU*. The interface creates the pod through
RunPod's API with `pod.py` in its environment and nothing else to do:

- It rents the cheapest card with the engine's declared GPU memory (`rented` in
  `backend/data/engines.json`) under its price cap, community tier first and secure if none is
  free, and deletes the pod at once if the price it got is over the cap.
- The pod installs `pciutils` before Ollama. Without `lspci` the Ollama installer cannot see the
  card, fetches the CPU build, and a 27B engine then runs forty times slower on a GPU it never
  uses. `pod.py` also checks the loaded model is entirely in GPU memory before it says ready, and
  `/lex/log` returns `nvidia-smi` and Ollama's GPU lines when it is not.
- It answers on port 8000 through RunPod's HTTPS proxy, behind a random token that exists only in
  the pod's environment and is read back from the RunPod API when needed. Ollama stays on the
  pod's localhost. The proxy drops a request that has sent nothing for 100 seconds, so a long read
  gets a 200 at once, a space every 20 seconds, then the answer.
- *Stop GPU* deletes the pod. The pod is named `lexdroid-<engine id>`, and nothing else on the
  account is touched.

The command line does the same: `npm run -w backend gpu -- status --offers`, `start --engine
engine-b`, `stop --engine engine-b`; and `fleet --on runpod` runs against the engine's pod.

The rest of this page is the manual route: an SSH tunnel to a pod you set up by hand.

## Choosing a pod

The reading engine is `gemma4:12b` at Q4_K_M -- about 7.6 GB of weights, and roughly 8.5 GB of VRAM
in use once a 16k context is allocated. Anything with 16 GB is comfortable and 24 GB is generous;
paying for 48 GB buys nothing here, because a bigger card does not make one stream of tokens decode
faster and a second concurrent stream is exactly what must not happen.

- **Container disk:** 30 GB or more. The two models are about 10 GB together.
- **Image:** any CUDA image. The bootstrap installs Ollama itself.
- **Expose:** SSH only. Do not expose the Ollama port; see below.
- **Community cloud** is the cheaper tier and is fine for this, since a lost pod costs one unit of
  work, not the run.

Check current prices in the console rather than trusting a number written here.

## Bringing one up

Copy `bootstrap.sh` to the pod and run it. It is safe to run twice.

    scp -P <port> bootstrap.sh root@<ip>:/root/
    ssh -p <port> root@<ip> 'bash /root/bootstrap.sh'

It installs Ollama, starts it bound to localhost, pulls `gemma4:12b` and `bge-m3`, builds the
`gemma4-lex-16k` tag from the same definition as `ollama/gemma4-lex-16k.Modelfile`, and loads it so
the first provision of the run is not also a cold start.

It also sets `OLLAMA_NUM_PARALLEL=1`, because batched reads produce different findings rather than
an error -- 18 of 40 provisions changed when this was measured. That is belt and braces rather than
the guarantee: a worker reads one provision at a time and has its pod to itself, so there is never
a second request for the server to bundle with. Set it anyway, and `test/engine-probe.test.ts`
fails if the script stops.

The check that does block a run is that every pod is serving the same build. Two pods on different
quantisations of the same tag answer one run two ways and neither half says so, which is the one
new way to be wrong that renting introduces.

## Reaching them

Ollama has no authentication. A pod port exposed through the RunPod proxy is reachable by anyone
who has the URL, and what they would be spending is your GPU. So the bootstrap binds to localhost,
and `tunnel.sh` carries each pod to a local port over SSH:

    ./tunnel.sh 'root@1.2.3.4 -p 40022' 'root@5.6.7.8 -p 40022'

It prints the `--hosts` line. Leave it running for the length of the run.

If you would rather use the public proxy, put something in front of Ollama that checks a bearer
token, and pass the token as `LEXDROID_ENGINE_TOKEN` inline on the command that launches the run.
Never put it in a file.

## Running

    npm run -w backend engines -- --hosts http://127.0.0.1:11501,http://127.0.0.1:11502
    npm run -w backend fleet -- --economies SGP,MYS --pillars 6,7 --hosts http://127.0.0.1:11501,http://127.0.0.1:11502 --usd-per-hour 0.34

The first proves each pod is reachable, serving the right model, and reading one provision at a
time. The second does the work. `--usd-per-hour` is the price of one pod; the fleet multiplies by
the number of hosts and the wall time and records what the run cost.

Always pass `--hosts`. The fleet does not fall back to `OLLAMA_HOST`, and without it the run is sent
to a local Ollama that is not there, while the pods bill for nothing.

Embed before the fleet, not inside it. The fleet's prepare stage embeds every new title and section
one economy at a time while every pod bills, so run `zone1 --economy X --embed` against one pod
first, then start the fleet with `--skip-prepare`. Each unit keeps the readings it has paid for in
`data/fleet/<run>/<ECO>-p<N>.resume.db`, so a unit that dies and is retried replays them instead
of paying again.

## Stop the pods

Terminate them in the console when the run finishes. A pod bills while it is running, whether or
not anything is asking it to read.

## What has been tested on real pods

On 8 September 2026 both scripts were run against two rented RTX 3090 pods (Community Cloud,
runpod/base:1.0.2-ubuntu2204, 30 GB container disk, port 22/tcp exposed with `startSsh`).

- `bootstrap.sh` completed unmodified in about 90 seconds on a fast pod, and both pods reported
  the same fingerprint, `gemma4/11.9B/Q4_K_M`, and the same model digest.
- `tunnel.sh`'s forwarding requires the pod's direct SSH endpoint; RunPod's proxy host
  `ssh.runpod.io` does not carry `-L`, so `22/tcp` must be in the pod's exposed ports.
- The engine check reported `one at a time (1.89x, 1.88x under two)` on both, so
  `OLLAMA_NUM_PARALLEL=1` does hold on a pod. The same check on the development laptop reports
  `batches (1.10x)`, so a pod is the safer engine, not the riskier one.
- Decode throughput measured 53.4 tokens/sec on a 3090 pod against 24.4 on the laptop.

### The first scored run on rented pods

Run `1cb164cb`, 8 September 2026: Singapore and Malaysia, pillars 6 and 7, four work units across
the two pods. 18 cells in **32.4 minutes** of wall time for **$0.24** of rent, against roughly 48
minutes for the same work run sequentially on the laptop.

Agreement with ESCAP's own answers: **16 of 18 exact, 18 of 18 within one band.** Three reads hit
the output cap and were refused rather than recorded.

## What has still not been tested

Both pods were placed on the same host machine, so a genuine cross-machine fingerprint
disagreement remains unexercised. Reproducibility across two rented pods -- the same cell answered
twice on different hardware -- has not been measured either.
