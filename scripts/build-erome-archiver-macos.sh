#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

if [ "$(uname -m)" != "arm64" ]; then
  echo "This build script targets Apple Silicon (arm64)." >&2
  exit 1
fi

.venv/bin/python -m PyInstaller --noconfirm --clean EromeArchiver.spec
echo "Built: $ROOT/dist/Erome Archiver.app"
