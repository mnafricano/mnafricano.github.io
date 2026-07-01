"""Command-line entry point for serving and installing the archiver."""

from __future__ import annotations

import argparse

import uvicorn

from erome_archiver.installer import install_launch_agent, uninstall_launch_agent


def main() -> None:
    parser = argparse.ArgumentParser(description="Archive new public Erome albums locally.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("serve", help="Run the local worker and dashboard")
    subparsers.add_parser("install", help="Install and start the macOS LaunchAgent")
    subparsers.add_parser("uninstall", help="Stop and remove the macOS LaunchAgent")
    args = parser.parse_args()

    if args.command == "serve":
        uvicorn.run("erome_archiver.web:app", host="127.0.0.1", port=8765, log_level="info")
    elif args.command == "install":
        path = install_launch_agent()
        print(f"Installed and started {path}")
        print("Dashboard: http://127.0.0.1:8765")
    elif args.command == "uninstall":
        removed = uninstall_launch_agent()
        print("LaunchAgent removed." if removed else "LaunchAgent was not installed.")
