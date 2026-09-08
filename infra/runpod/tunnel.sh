#!/usr/bin/env bash
# Reach pods that are not exposed to the internet.
#   ./tunnel.sh 'root@1.2.3.4 -p 40022' 'root@5.6.7.8 -p 40022'
# Opens one local port per pod and prints the --hosts line to paste into a fleet run.
set -euo pipefail

[ "$#" -ge 1 ] || { echo "usage: $0 'root@HOST -p PORT' [more...]"; exit 1; }

PORT=11501
HOSTS=""
PIDS=""

cleanup() {
  echo
  echo "closing tunnels"
  for pid in $PIDS; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

for pod in "$@"; do
  # -N: no remote command, this process exists only to carry the port.
  ssh -N -o ExitOnForwardFailure=yes -L "${PORT}:127.0.0.1:11434" $pod &
  PIDS="$PIDS $!"
  HOSTS="${HOSTS:+$HOSTS,}http://127.0.0.1:${PORT}"
  echo "  ${PORT} -> ${pod}"
  PORT=$((PORT + 1))
done

sleep 3
echo
echo "  --hosts ${HOSTS}"
echo
echo "Leave this running. Ctrl-C closes the tunnels."
wait
