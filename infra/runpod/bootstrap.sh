#!/usr/bin/env bash
# Prepare a rented GPU to serve one reading engine for LexDroid.
# Run it on the pod. Safe to re-run: every step is skipped if already done.
set -euo pipefail

BASE="${BASE:-gemma4:12b}"
TAG="${TAG:-gemma4-lex-16k}"
NUM_CTX="${NUM_CTX:-16384}"
EXPOSE="${EXPOSE:-0}"

# One request at a time. This is the whole reason a pod is configured rather than just rented:
# a server that batches concurrent reads returns different findings, and says nothing about it.
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_MAX_LOADED_MODELS=1
export OLLAMA_FLASH_ATTENTION=1
export OLLAMA_KV_CACHE_TYPE=q8_0

if [ "$EXPOSE" = "1" ]; then
  export OLLAMA_HOST=0.0.0.0:11434
  echo "!! Binding 0.0.0.0. Ollama has no authentication, so anyone who reaches this port"
  echo "!! can spend this GPU. Put a token-checking proxy in front, or use an SSH tunnel."
else
  export OLLAMA_HOST=127.0.0.1:11434
fi

command -v ollama >/dev/null 2>&1 || curl -fsSL https://ollama.com/install.sh | sh

pgrep -x ollama >/dev/null 2>&1 || { nohup ollama serve > /var/log/ollama.log 2>&1 & sleep 5; }

for i in $(seq 1 30); do
  curl -sf "http://127.0.0.1:11434/api/tags" >/dev/null && break
  [ "$i" = "30" ] && { echo "ollama did not come up; see /var/log/ollama.log"; exit 1; }
  sleep 2
done

ollama pull "$BASE"
ollama pull bge-m3

# The tag the pipeline asks for is the stock base at a wider context, nothing else.
# Kept in step with ollama/*.Modelfile by test/bootstrap-matches-modelfile.test.ts.
printf 'FROM %s\nPARAMETER num_ctx %s\n' "$BASE" "$NUM_CTX" > /tmp/lex.Modelfile
ollama create "$TAG" -f /tmp/lex.Modelfile

# Load it now, so the first provision of the run is not also a cold start.
ollama run "$TAG" "ok" >/dev/null 2>&1 || true

echo
echo "ready: $TAG on $(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo 'unknown GPU')"
ollama ps
