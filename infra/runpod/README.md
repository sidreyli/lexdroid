# Renting engines on RunPod

One pod is one engine is one worker. The fleet splits a run by economy and pillar, and each unit is
independent, so N pods finish roughly N times sooner. Nothing about the corpus moves: the SQLite
store, the run record and every decision stay on the machine that launches the run, and only
prompts and answers cross the wire.

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

## Stop the pods

Terminate them in the console when the run finishes. A pod bills while it is running, whether or
not anything is asking it to read.

## What has not been tested

The scripts here have been checked for syntax, and the model definition they build has been
verified to produce exactly the tag this repo expects. The engine check has been validated against
two real Ollama servers, one batching and one not, on one GPU. None of it has yet been run against
an actual RunPod pod.
