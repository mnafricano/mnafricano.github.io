"""macOS LaunchAgent rendering and lifecycle helpers."""

from __future__ import annotations

import os
import plistlib
import subprocess
import sys
from pathlib import Path

LABEL = "com.mnafricano.erome-archiver"


def application_support_dir() -> Path:
    return Path.home() / "Library" / "Application Support" / "Erome Archiver"


def database_path() -> Path:
    return application_support_dir() / "state.sqlite3"


def launch_agent_path() -> Path:
    return Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"


def launch_agent_payload(python_executable: str | None = None) -> dict:
    support = application_support_dir()
    executable = python_executable or sys.executable
    return {
        "Label": LABEL,
        "ProgramArguments": [executable, "-m", "erome_archiver", "serve"],
        "RunAtLoad": True,
        "KeepAlive": {"SuccessfulExit": False},
        "ProcessType": "Background",
        "StandardOutPath": str(support / "archiver.log"),
        "StandardErrorPath": str(support / "archiver-error.log"),
        "EnvironmentVariables": {"PYTHONUNBUFFERED": "1"},
    }


def render_launch_agent(python_executable: str | None = None) -> bytes:
    return plistlib.dumps(launch_agent_payload(python_executable), sort_keys=True)


def install_launch_agent() -> Path:
    if sys.platform != "darwin":
        raise RuntimeError("LaunchAgent installation is only available on macOS")
    support = application_support_dir()
    support.mkdir(parents=True, exist_ok=True)
    path = launch_agent_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(render_launch_agent())
    domain = f"gui/{os.getuid()}"
    subprocess.run(["launchctl", "bootout", domain, str(path)], check=False, capture_output=True)
    result = subprocess.run(
        ["launchctl", "bootstrap", domain, str(path)], check=False, capture_output=True, text=True
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "launchctl bootstrap failed")
    return path


def uninstall_launch_agent() -> bool:
    if sys.platform != "darwin":
        raise RuntimeError("LaunchAgent removal is only available on macOS")
    path = launch_agent_path()
    subprocess.run(
        ["launchctl", "bootout", f"gui/{os.getuid()}", str(path)],
        check=False,
        capture_output=True,
    )
    if path.exists():
        path.unlink()
        return True
    return False
