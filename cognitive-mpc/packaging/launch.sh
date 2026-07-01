#!/bin/zsh
set -u

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RESOURCES="$APP_ROOT/Resources"
URL="http://127.0.0.1:8787/"
LOCK="/tmp/cognitive-mpc-${UID}.lock"
LOG_DIR="$HOME/Library/Logs/Cognitive MPC"
mkdir -p "$LOG_DIR"

alert() {
  /usr/bin/osascript -e "display alert \"Cognitive MPC\" message \"$1\" as critical" >/dev/null
}

if ! /bin/mkdir "$LOCK" 2>/dev/null; then
  /usr/bin/open "$URL"
  exit 0
fi
trap '/bin/rm -rf "$LOCK"' EXIT INT TERM

PYTHON="$(command -v python3 || true)"
if [[ -z "$PYTHON" ]]; then
  alert "Python 3 is required. Install the macOS Command Line Tools or Python 3, then reopen the app."
  exit 1
fi
PYTHON_COMMAND=("$PYTHON")
if [[ "$(/usr/bin/uname -m)" == "arm64" && "$PYTHON" == "/usr/bin/python3" ]]; then
  PYTHON_COMMAND=(/usr/bin/arch -arm64e "$PYTHON")
fi

OLLAMA="$(command -v ollama || true)"
if [[ -z "$OLLAMA" && -x /opt/homebrew/bin/ollama ]]; then
  OLLAMA=/opt/homebrew/bin/ollama
fi
if [[ -z "$OLLAMA" ]]; then
  alert "Ollama is not installed. Run scripts/setup_macos.sh from the Cognitive MPC folder, then reopen the app."
  exit 1
fi

if ! /usr/bin/curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  "$OLLAMA" serve >>"$LOG_DIR/ollama.log" 2>&1 &
  for _ in {1..30}; do
    /bin/sleep 0.25
    /usr/bin/curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break
  done
fi
if ! /usr/bin/curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  alert "Ollama could not start. Open Ollama once, or inspect ~/Library/Logs/Cognitive MPC/ollama.log."
  exit 1
fi

if ! "$OLLAMA" list | /usr/bin/grep -q '^qwen3:8b'; then
  alert "The qwen3:8b model is missing. Run: ollama pull qwen3:8b"
  exit 1
fi

if /usr/bin/curl -fsS http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
  /usr/bin/open "$URL"
  while /usr/bin/curl -fsS http://127.0.0.1:8787/api/health >/dev/null 2>&1; do
    /bin/sleep 2
  done
  exit 0
fi
if /usr/sbin/lsof -nP -iTCP:8787 -sTCP:LISTEN >/dev/null 2>&1; then
  alert "Port 8787 is already used by another application. Close that application and reopen Cognitive MPC."
  exit 1
fi

cd "$RESOURCES" || exit 1
"${PYTHON_COMMAND[@]}" web_server.py --host 127.0.0.1 --port 8787 --no-open >>"$LOG_DIR/app.log" 2>&1 &
SERVER_PID=$!
trap '/bin/kill "$SERVER_PID" 2>/dev/null; /bin/rm -rf "$LOCK"' EXIT INT TERM

for _ in {1..80}; do
  /bin/sleep 0.25
  if /usr/bin/curl -fsS http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
    /usr/bin/open "$URL"
    wait "$SERVER_PID"
    exit $?
  fi
  if ! /bin/kill -0 "$SERVER_PID" 2>/dev/null; then
    alert "Cognitive MPC stopped during startup. Inspect ~/Library/Logs/Cognitive MPC/app.log."
    exit 1
  fi
done

alert "Cognitive MPC did not become ready in time. Inspect ~/Library/Logs/Cognitive MPC/app.log."
exit 1
