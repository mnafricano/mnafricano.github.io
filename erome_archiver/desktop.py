"""Double-clickable macOS desktop entry point."""

from __future__ import annotations

import os
import socket
import threading
import time
import webbrowser

import uvicorn

from erome_archiver.web import app

DASHBOARD_URL = "http://127.0.0.1:8765"


def server_is_running() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", 8765), timeout=0.25):
            return True
    except OSError:
        return False


def open_dashboard_when_ready() -> None:
    for _ in range(80):
        if server_is_running():
            if os.environ.get("EROME_ARCHIVER_NO_BROWSER") != "1":
                webbrowser.open(DASHBOARD_URL)
            return
        time.sleep(0.1)


def main() -> None:
    if server_is_running():
        if os.environ.get("EROME_ARCHIVER_NO_BROWSER") != "1":
            webbrowser.open(DASHBOARD_URL)
        return

    threading.Thread(target=open_dashboard_when_ready, daemon=True).start()
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8765,
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    main()
