"""Versioned settings, runtime paths, and safe legacy-data migration."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import zipfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


APP_NAME = "Cognitive MPC"
SETTINGS_VERSION = 1


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _atomic_json_write(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(payload, indent=2, sort_keys=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        handle.write(encoded)
        handle.write("\n")
        temporary_name = handle.name
    os.replace(temporary_name, path)


@dataclass(frozen=True)
class RuntimePaths:
    """All mutable application paths in one explicit object."""

    data_dir: Path
    log_dir: Path
    state: Path
    memory: Path
    history: Path
    settings: Path
    approvals: Path
    maintenance: Path
    migration: Path
    backups: Path
    log: Path

    @classmethod
    def app_support(cls, home: Optional[Path] = None) -> "RuntimePaths":
        user_home = (home or Path.home()).expanduser().resolve()
        data_dir = user_home / "Library" / "Application Support" / APP_NAME
        log_dir = user_home / "Library" / "Logs" / APP_NAME
        return cls(
            data_dir=data_dir,
            log_dir=log_dir,
            state=data_dir / "world_state.json",
            memory=data_dir / "memory.json",
            history=data_dir / "chat_history.json",
            settings=data_dir / "settings.json",
            approvals=data_dir / "approvals.json",
            maintenance=data_dir / "maintenance.json",
            migration=data_dir / "migration.json",
            backups=data_dir / "backups",
            log=log_dir / "cycles.jsonl",
        )

    @classmethod
    def project_local(cls, project_root: Path | str) -> "RuntimePaths":
        root = Path(project_root).resolve()
        data_dir = root / "data"
        log_dir = root / "logs"
        return cls(
            data_dir=data_dir,
            log_dir=log_dir,
            state=data_dir / "world_state.json",
            memory=data_dir / "memory.json",
            history=data_dir / "chat_history.json",
            settings=data_dir / "settings.json",
            approvals=data_dir / "approvals.json",
            maintenance=data_dir / "maintenance.json",
            migration=data_dir / "migration.json",
            backups=data_dir / "backups",
            log=log_dir / "cycles.jsonl",
        )

    def ensure_directories(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.backups.mkdir(parents=True, exist_ok=True)


@dataclass
class AppSettings:
    version: int = SETTINGS_VERSION
    model: str = "qwen3:8b"
    ollama_url: str = "http://127.0.0.1:11434"
    workspace_path: str = ""
    shell_enabled: bool = False
    auto_read_enabled: bool = True
    note_writer_enabled: bool = True
    replay_enabled: bool = True
    replay_interval_hours: int = 24
    replay_idle_minutes: int = 10
    backups_enabled: bool = True
    backup_retention: int = 7
    theme: str = "system"
    updated_at: str = ""

    def validate(self) -> None:
        if self.version != SETTINGS_VERSION:
            raise ValueError(f"Unsupported settings version: {self.version}")
        if not self.model.strip():
            raise ValueError("Model name cannot be empty.")
        if not self.ollama_url.startswith(("http://", "https://")):
            raise ValueError("Ollama URL must use http or https.")
        if not 1 <= self.replay_interval_hours <= 168:
            raise ValueError("Replay interval must be between 1 and 168 hours.")
        if not 1 <= self.replay_idle_minutes <= 120:
            raise ValueError("Replay idle time must be between 1 and 120 minutes.")
        if not 1 <= self.backup_retention <= 30:
            raise ValueError("Backup retention must be between 1 and 30.")
        if self.theme not in {"system", "light", "dark"}:
            raise ValueError("Theme must be system, light, or dark.")

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AppSettings":
        known = {field_name for field_name in cls.__dataclass_fields__}
        settings = cls(**{key: value for key, value in data.items() if key in known})
        settings.validate()
        return settings


class SettingsStore:
    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self.settings = self.load()

    def load(self) -> AppSettings:
        if not self.path.exists():
            settings = AppSettings(updated_at=utc_now())
            self.save(settings)
            return settings
        with self.path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if not isinstance(payload, dict):
            raise ValueError("Settings file must be a JSON object.")
        return AppSettings.from_dict(payload)

    def save(self, settings: AppSettings) -> AppSettings:
        settings.updated_at = utc_now()
        settings.validate()
        _atomic_json_write(self.path, settings.to_dict())
        self.settings = settings
        return settings

    def update(self, changes: Dict[str, Any]) -> AppSettings:
        allowed = {
            "model",
            "ollama_url",
            "workspace_path",
            "shell_enabled",
            "auto_read_enabled",
            "note_writer_enabled",
            "replay_enabled",
            "replay_interval_hours",
            "replay_idle_minutes",
            "backups_enabled",
            "backup_retention",
            "theme",
        }
        unknown = set(changes) - allowed
        if unknown:
            raise ValueError(f"Unsupported settings fields: {sorted(unknown)}")
        payload = self.settings.to_dict()
        payload.update(changes)
        return self.save(AppSettings.from_dict(payload))


class DataMigrator:
    """Copy project-local v0 data into macOS Application Support once."""

    LEGACY_FILES = {
        "world_state.json": "state",
        "memory.json": "memory",
        "chat_history.json": "history",
        "settings.json": "settings",
        "approvals.json": "approvals",
    }

    def __init__(
        self,
        project_root: Path | str,
        destination: RuntimePaths,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.destination = destination

    def migrate(self) -> Dict[str, Any]:
        self.destination.ensure_directories()
        if self.destination.migration.exists():
            with self.destination.migration.open("r", encoding="utf-8") as handle:
                return json.load(handle)

        legacy_data = self.project_root / "data"
        legacy_log = self.project_root / "logs" / "cycles.jsonl"
        candidates = [
            legacy_data / filename
            for filename in self.LEGACY_FILES
            if (legacy_data / filename).is_file()
        ]
        if legacy_log.is_file():
            candidates.append(legacy_log)

        copied: List[str] = []
        validation: Dict[str, Any] = {}
        backup_path = ""
        if candidates:
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            backup = self.destination.backups / f"pre-migration-{stamp}.zip"
            with zipfile.ZipFile(backup, "w", zipfile.ZIP_DEFLATED) as archive:
                for source in candidates:
                    archive.write(source, f"legacy/{source.name}")
            backup_path = str(backup)

        try:
            for source in candidates:
                if source == legacy_log:
                    target = self.destination.log
                else:
                    attribute = self.LEGACY_FILES[source.name]
                    target = getattr(self.destination, attribute)
                if target.exists():
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
                if target.suffix == ".json":
                    with target.open("r", encoding="utf-8") as handle:
                        payload = json.load(handle)
                    validation[target.name] = self._validate_record(
                        target.name, payload
                    )
                copied.append(str(target))
        except Exception:
            for filename in copied:
                Path(filename).unlink(missing_ok=True)
            raise

        record = {
            "version": 1,
            "status": "completed",
            "completed_at": utc_now(),
            "source": str(legacy_data),
            "copied": copied,
            "backup": backup_path,
            "validation": validation,
        }
        _atomic_json_write(self.destination.migration, record)
        return record

    @staticmethod
    def _validate_record(filename: str, payload: Any) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            raise ValueError(f"Migrated {filename} must contain a JSON object.")
        version = int(payload.get("version", 1))
        if version != 1:
            raise ValueError(f"Unsupported {filename} schema version: {version}")
        counts: Dict[str, int] = {}
        expected_lists = {
            "world_state.json": ("user_goals", "active_tasks", "recent_observations"),
            "memory.json": ("episodic", "semantic", "procedural"),
            "chat_history.json": ("conversations",),
            "approvals.json": ("requests",),
        }
        for field_name in expected_lists.get(filename, ()):
            value = payload.get(field_name, [])
            if not isinstance(value, list):
                raise ValueError(
                    f"Migrated {filename}.{field_name} must be a list."
                )
            counts[field_name] = len(value)
        return {"schema_version": version, "record_counts": counts}
