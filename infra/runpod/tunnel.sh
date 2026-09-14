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

# A dropped link is a flake, not a dead pod, but the engine pool cannot tell the two apart and
# retires the host for the rest of the run. So the tunnel comes back by itself.
carry() {
  local port="$1"; shift
  while :; do
    ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=20 -o ServerAliveCountMax=3 \
        -o ConnectTimeout=15 -L "${port}:127.0.0.1:11434" $@ || true
    echo "  ${port} dropped; reconnecting"
    sleep 3
  done
}

for pod in "$@"; do
  carry "$PORT" $pod &
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
