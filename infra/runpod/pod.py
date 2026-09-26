#!/usr/bin/env python3
"""
Serve one reading engine from a rented GPU, started by the interface rather than by hand.

The interface creates the pod with this file in its environment and nothing else to do: the pod
installs Ollama, builds the engine from the same Modelfile this repository declares, and answers
on port 8000 behind a bearer token. Ollama itself is bound to localhost and never reachable.

Why a token and not the SSH tunnel bootstrap.sh uses: a tunnel needs an SSH key registered with
RunPod on whatever machine runs the interface, and the machine that demos this is not the one it
was built on. RunPod's HTTPS proxy needs nothing, and a token is what the README said to put in
front of Ollama if the proxy were ever used.

Why the whitespace: that proxy gives up on a request that has sent nothing back for 100 seconds,
and a long provision on a 27B engine can take longer to answer. So the response starts at once,
a space goes out every 20 seconds, and the answer follows. JSON ignores leading whitespace.

Environment, all set by the interface when it creates the pod:
  LEX_TOKEN       the bearer token every request must carry
  LEX_TAG         the tag the pipeline asks for, e.g. qwen3.8-lex-16k
  LEX_MODELFILE   that tag's Modelfile, base64
  LEX_EMBED       the embedding model, pulled alongside (default bge-m3)
  LEX_OLLAMA      the Ollama version to install
"""
import base64
import hmac
import http.client
import json
import os
import re
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("LEX_TOKEN", "")
TAG = os.environ.get("LEX_TAG", "")
MODELFILE = base64.b64decode(os.environ.get("LEX_MODELFILE", "")).decode("utf-8")
EMBED = os.environ.get("LEX_EMBED", "bge-m3")
VERSION = os.environ.get("LEX_OLLAMA", "0.34.4")
PORT = 8000
KEEPALIVE_S = 20

state = {"stage": "starting", "detail": "", "progress": None, "tag": TAG, "gpu": "", "error": None}
lock = threading.Lock()


def status(stage, detail="", progress=None):
    with lock:
        state.update(stage=stage, detail=detail, progress=progress)
    print(f"[{stage}] {detail}", flush=True)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def authorised(self):
        given = self.headers.get("Authorization", "")
        return bool(TOKEN) and hmac.compare_digest(given.encode(), f"Bearer {TOKEN}".encode())

    def refuse(self):
        body = b'{"error":"unauthorised"}'
        self.send_response(401)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.authorised():
            return self.refuse()
        if self.path in ("/lex/status", "/lex/log"):
            with lock:
                body = json.dumps(state if self.path == "/lex/status" else diagnostics()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.forward("GET", b"")

    def do_POST(self):
        if not self.authorised():
            return self.refuse()
        length = int(self.headers.get("Content-Length") or 0)
        self.forward("POST", self.rfile.read(length) if length else b"")

    def forward(self, method, body):
        # Headers now, the answer when it comes, spaces in between.
        result = {}

        def ask():
            try:
                conn = http.client.HTTPConnection("127.0.0.1", 11434, timeout=1800)
                conn.request(method, self.path, body=body or None, headers={"Content-Type": "application/json"})
                res = conn.getresponse()
                result["status"] = res.status
                result["body"] = res.read()
            except Exception as e:  # the engine is down or still starting
                result["status"] = 502
                result["body"] = json.dumps({"error": f"engine unavailable: {e}"}).encode()

        worker = threading.Thread(target=ask, daemon=True)
        worker.start()
        worker.join(KEEPALIVE_S)
        if not worker.is_alive():
            # Answered quickly: pass the status through untouched.
            self.send_response(result["status"])
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(result["body"])))
            self.end_headers()
            self.wfile.write(result["body"])
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

        def chunk(data):
            self.wfile.write(f"{len(data):x}\r\n".encode() + data + b"\r\n")
            self.wfile.flush()

        while worker.is_alive():
            chunk(b" ")
            worker.join(KEEPALIVE_S)
        payload = result["body"]
        if result["status"] >= 400:
            # Too late for the status line, so the failure goes in the body, where the client's
            # JSON parse finds an error and no answer.
            try:
                json.loads(payload)
            except ValueError:
                payload = json.dumps({"error": payload.decode("utf-8", "replace")[:500]}).encode()
        chunk(payload)
        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()


def tail(path, lines=80):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read().splitlines()[-lines:]
    except OSError:
        return []


def diagnostics():
    # What the engine said about the GPU, for when it is not on one. There is no shell on the pod
    # to ask, only this port.
    smi = subprocess.run("nvidia-smi", shell=True, capture_output=True, text=True).stdout
    log = tail("/var/log/ollama.log", 400)
    gpu_lines = [l for l in log if re.search(r"gpu|cuda|offload|library|vram|memory|layers", l, re.I)]
    return {"nvidia_smi": smi, "ollama_gpu_lines": gpu_lines[-60:], "ollama_tail": log[-40:],
            "install_tail": tail("/var/log/ollama-install.log", 30)}


def on_gpu(tag):
    c = http.client.HTTPConnection("127.0.0.1", 11434, timeout=10)
    c.request("GET", "/api/ps")
    models = json.loads(c.getresponse().read()).get("models", [])
    m = next((m for m in models if m.get("name", "").split(":")[0] == tag), None)
    return (m or {}).get("size_vram", 0), (m or {}).get("size", 0)


def run(cmd, **kw):
    return subprocess.run(cmd, shell=True, check=True, **kw)


def ollama_up():
    try:
        c = http.client.HTTPConnection("127.0.0.1", 11434, timeout=3)
        c.request("GET", "/api/tags")
        return c.getresponse().status == 200
    except Exception:
        return False


def pull(model):
    # Through the API, so progress can be reported rather than guessed at.
    c = http.client.HTTPConnection("127.0.0.1", 11434, timeout=3600)
    c.request("POST", "/api/pull", body=json.dumps({"model": model, "stream": True}),
              headers={"Content-Type": "application/json"})
    res = c.getresponse()
    started = time.time()
    for line in res:
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get("error"):
            raise RuntimeError(f"pull {model}: {event['error']}")
        total, done = event.get("total"), event.get("completed")
        if total and done:
            rate = done / max(time.time() - started, 1) / 1e6
            status("pulling", f"{model}: {done / 1e9:.1f} of {total / 1e9:.1f} GB at {rate:.0f} MB/s", done / total)


def prepare():
    try:
        env = dict(os.environ)
        # One request at a time: a server that batches concurrent reads returns different findings.
        env.update(OLLAMA_HOST="127.0.0.1:11434", OLLAMA_NUM_PARALLEL="1", OLLAMA_MAX_LOADED_MODELS="2",
                   OLLAMA_FLASH_ATTENTION="1", OLLAMA_KV_CACHE_TYPE="q8_0", OLLAMA_KEEP_ALIVE="-1")
        try:
            gpu = subprocess.run("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader",
                                 shell=True, capture_output=True, text=True).stdout.strip()
        except Exception:
            gpu = ""
        with lock:
            state["gpu"] = gpu
        if subprocess.run("command -v ollama", shell=True, capture_output=True).returncode != 0:
            status("installing", f"Ollama {VERSION}")
            # The installer decides whether to fetch the CUDA libraries by looking for the card with
            # lspci. Without it, it installs the CPU build, says so in one warning line, and the
            # engine then runs forty times slower on a GPU it never uses.
            run("apt-get -qq update >/dev/null 2>&1; apt-get -qq install -y zstd pciutils >/dev/null 2>&1 || true")
            run(f"curl -fsSL https://ollama.com/install.sh | OLLAMA_VERSION={VERSION} sh >/var/log/ollama-install.log 2>&1")
        status("starting", "Ollama")
        subprocess.Popen("ollama serve >/var/log/ollama.log 2>&1", shell=True, env=env)
        for _ in range(60):
            if ollama_up():
                break
            time.sleep(2)
        else:
            raise RuntimeError("Ollama did not come up; see /var/log/ollama.log")

        base = re.search(r"^FROM\s+(\S+)", MODELFILE, re.M).group(1)
        pull(base)
        pull(EMBED)
        status("building", TAG)
        with open("/tmp/lex.Modelfile", "w") as f:
            f.write(MODELFILE)
        run(f"ollama create {TAG} -f /tmp/lex.Modelfile >/dev/null")
        # Load it now, so the first provision of the run is not also a cold start.
        status("loading", TAG)
        c = http.client.HTTPConnection("127.0.0.1", 11434, timeout=900)
        c.request("POST", "/api/generate", body=json.dumps({"model": TAG, "prompt": "ok", "stream": False,
                                                             "think": False, "options": {"num_predict": 1}}),
                  headers={"Content-Type": "application/json"})
        c.getresponse().read()
        # A model Ollama placed on the CPU answers, forty times slower, and says nothing about it.
        # A run on it would be billed by the hour for an afternoon; refuse it here instead.
        vram, size = on_gpu(TAG)
        if size and vram < 0.9 * size:
            raise RuntimeError(f"{TAG} loaded with {vram / 1e9:.1f} of {size / 1e9:.1f} GB on the GPU; "
                               "see /lex/log for what Ollama said")
        status("ready", f"{TAG} on {gpu}", 1.0)
    except Exception as e:
        with lock:
            state["error"] = str(e)
        status("failed", str(e))


if __name__ == "__main__":
    if not TOKEN or not TAG or not MODELFILE:
        sys.exit("LEX_TOKEN, LEX_TAG and LEX_MODELFILE must all be set")
    threading.Thread(target=prepare, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
