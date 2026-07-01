"""Validated local snapshot creation, rotation, and restore."""

from __future__ import annotations

import json
import os
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from .config import RuntimePaths


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class BackupManager:
    FILES = {
        "world_state.json": "state",
        "memory.json": "memory",
        "chat_history.json": "history",
        "settings.json": "settings",
        "approvals.json": "approvals",
        "maintenance.json": "maintenance",
    }

    def __init__(self, paths: RuntimePaths, retention: int = 7) -> None:
        self.paths = paths
        self.retention = retention
        self.paths.backups.mkdir(parents=True, exist_ok=True)

    def create(self, reason: str = "manual") -> Dict[str, Any]:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        destination = self.paths.backups / f"backup-{stamp}.zip"
        manifest = {
            "version": 1,
            "created_at": utc_now(),
            "reason": reason,
            "files": [],
        }
        with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
            for archive_name, attribute in self.FILES.items():
                source = getattr(self.paths, attribute)
                if source.is_file():
                    archive.write(source, archive_name)
                    manifest["files"].append(archive_name)
            archive.writestr("manifest.json", json.dumps(manifest, indent=2))
        self.rotate()
        return {
            "id": destination.stem,
            "path": str(destination),
            **manifest,
        }

    def list(self) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        for path in sorted(self.paths.backups.glob("backup-*.zip"), reverse=True):
            try:
                with zipfile.ZipFile(path) as archive:
                    manifest = json.loads(archive.read("manifest.json"))
                results.append(
                    {
                        "id": path.stem,
                        "path": str(path),
                        "size": path.stat().st_size,
                        **manifest,
                    }
                )
            except (OSError, KeyError, ValueError, zipfile.BadZipFile):
                results.append(
                    {
                        "id": path.stem,
                        "path": str(path),
                        "size": path.stat().st_size,
                        "invalid": True,
                    }
                )
        return results

    def rotate(self) -> None:
        backups = sorted(
            self.paths.backups.glob("backup-*.zip"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        for path in backups[self.retention :]:
            path.unlink(missing_ok=True)

    def restore(self, backup_id: str) -> Dict[str, Any]:
        if not backup_id.startswith("backup-") or "/" in backup_id or ".." in backup_id:
            raise ValueError("Invalid backup identifier.")
        source = self.paths.backups / f"{backup_id}.zip"
        if not source.is_file():
            raise FileNotFoundError("Backup not found.")

        staged: Dict[str, bytes] = {}
        with zipfile.ZipFile(source) as archive:
            names = set(archive.namelist())
            if "manifest.json" not in names:
                raise ValueError("Backup has no manifest.")
            manifest = json.loads(archive.read("manifest.json"))
            for archive_name in manifest.get("files", []):
                if archive_name not in self.FILES or archive_name not in names:
                    raise ValueError(f"Unexpected backup file: {archive_name}")
                payload = archive.read(archive_name)
                json.loads(payload)
                staged[archive_name] = payload

        safety = self.create(reason="pre-restore")
        for archive_name, payload in staged.items():
            target = getattr(self.paths, self.FILES[archive_name])
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                "wb", dir=target.parent, delete=False
            ) as handle:
                handle.write(payload)
                temporary_name = handle.name
            os.replace(temporary_name, target)
        return {
            "restored": backup_id,
            "restored_at": utc_now(),
            "files": sorted(staged),
            "safety_backup": safety["id"],
        }

    def export_bundle(self) -> Dict[str, Any]:
        bundle: Dict[str, Any] = {"version": 1, "exported_at": utc_now()}
        for archive_name, attribute in self.FILES.items():
            source = getattr(self.paths, attribute)
            if source.is_file():
                with source.open("r", encoding="utf-8") as handle:
                    bundle[archive_name] = json.load(handle)
        return bundle
