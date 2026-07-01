#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required. Install it from https://brew.sh and rerun this script."
  exit 1
fi

if ! command -v ollama >/dev/null 2>&1; then
  brew install --cask ollama
fi

if ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  ollama serve >"$HOME/Library/Logs/Cognitive MPC-setup-ollama.log" 2>&1 &
  for _ in {1..30}; do
    sleep 0.5
    curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break
  done
fi

ollama pull qwen3:8b
python3 "$ROOT/scripts/build_macos_app.py"
echo
echo "Setup complete."
echo "Open: $ROOT/dist/Cognitive MPC.app"
