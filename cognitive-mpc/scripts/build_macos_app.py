#!/usr/bin/env python3
"""Build an unsigned, self-contained personal macOS .app bundle."""

from __future__ import annotations

import shutil
import stat
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "dist" / "Cognitive MPC.app"
CONTENTS = DESTINATION / "Contents"
RESOURCES = CONTENTS / "Resources"
MACOS = CONTENTS / "MacOS"


def main() -> int:
    if DESTINATION.exists():
        shutil.rmtree(DESTINATION)
    RESOURCES.mkdir(parents=True)
    MACOS.mkdir(parents=True)

    shutil.copy2(ROOT / "packaging" / "Info.plist", CONTENTS / "Info.plist")
    launcher = MACOS / "Cognitive MPC"
    shutil.copy2(ROOT / "packaging" / "launch.sh", launcher)
    launcher.chmod(launcher.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    for filename in ("main.py", "web_server.py", "README.md"):
        shutil.copy2(ROOT / filename, RESOURCES / filename)
    shutil.copytree(
        ROOT / "core",
        RESOURCES / "core",
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
    )
    shutil.copytree(ROOT / "web", RESOURCES / "web")
    shutil.copytree(ROOT / "docs", RESOURCES / "docs")

    print(f"Built unsigned app: {DESTINATION}")
    print("Open it with Finder or: open 'dist/Cognitive MPC.app'")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
