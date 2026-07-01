"""Small SQLite state store used by both the worker and dashboard."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterator

from erome_archiver.models import AlbumPage, FeedAlbum, Settings


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class Database:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS albums (
                    album_id TEXT PRIMARY KEY,
                    url TEXT NOT NULL,
                    title TEXT,
                    author TEXT,
                    status TEXT NOT NULL,
                    discovered_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    files_total INTEGER NOT NULL DEFAULT 0,
                    files_done INTEGER NOT NULL DEFAULT 0,
                    bytes_downloaded INTEGER NOT NULL DEFAULT 0,
                    bytes_total INTEGER NOT NULL DEFAULT 0,
                    error TEXT,
                    folder TEXT
                );
                CREATE INDEX IF NOT EXISTS albums_status_idx ON albums(status, discovered_at);
                CREATE TABLE IF NOT EXISTS album_files (
                    album_id TEXT NOT NULL REFERENCES albums(album_id) ON DELETE CASCADE,
                    filename TEXT NOT NULL,
                    expected_bytes INTEGER NOT NULL DEFAULT 0,
                    downloaded_bytes INTEGER NOT NULL DEFAULT 0,
                    completed INTEGER NOT NULL DEFAULT 0,
                    kind TEXT,
                    source_url TEXT,
                    preview_url TEXT,
                    approval_state TEXT NOT NULL DEFAULT 'not_required',
                    PRIMARY KEY(album_id, filename)
                );
                CREATE TABLE IF NOT EXISTS errors (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    context TEXT NOT NULL,
                    message TEXT NOT NULL
                );
                """
            )
            album_columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(albums)").fetchall()
            }
            if "bytes_total" not in album_columns:
                connection.execute(
                    "ALTER TABLE albums ADD COLUMN bytes_total INTEGER NOT NULL DEFAULT 0"
                )
            file_columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(album_files)").fetchall()
            }
            for column, definition in {
                "kind": "TEXT",
                "source_url": "TEXT",
                "preview_url": "TEXT",
                "approval_state": "TEXT NOT NULL DEFAULT 'not_required'",
            }.items():
                if column not in file_columns:
                    connection.execute(
                        f"ALTER TABLE album_files ADD COLUMN {column} {definition}"
                    )
            interrupted_ids = [
                row["album_id"]
                for row in connection.execute(
                    "SELECT album_id FROM albums "
                    "WHERE status IN ('downloading', 'parsing')"
                ).fetchall()
            ]
            connection.execute(
                "UPDATE albums SET status='queued', started_at=NULL, "
                "files_done=0, bytes_downloaded=0 "
                "WHERE status IN ('downloading', 'parsing')"
            )
            connection.executemany(
                "UPDATE album_files SET downloaded_bytes=0, completed=0 "
                "WHERE album_id=?",
                [(album_id,) for album_id in interrupted_ids],
            )
            connection.executemany(
                "UPDATE albums SET bytes_total=COALESCE(("
                "SELECT SUM(expected_bytes) FROM album_files WHERE album_id=?"
                "), 0) WHERE album_id=?",
                [(album_id, album_id) for album_id in interrupted_ids],
            )
            connection.execute(
                "DELETE FROM errors WHERE context LIKE 'album:%' AND NOT EXISTS ("
                "SELECT 1 FROM albums "
                "WHERE albums.album_id=substr(errors.context, 7) "
                "AND albums.status='failed')"
            )

    def get_setting(self, key: str, default: Any = None) -> Any:
        with self.connect() as connection:
            row = connection.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def set_setting(self, key: str, value: Any) -> None:
        with self.connect() as connection:
            connection.execute(
                "INSERT INTO settings(key, value) VALUES(?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, json.dumps(value)),
            )

    def get_settings(self) -> Settings:
        raw = self.get_setting("app_settings", {})
        return Settings.model_validate(raw)

    def save_settings(self, settings: Settings) -> None:
        self.set_setting("app_settings", settings.model_dump())

    def known_ids(self, ids: list[str]) -> set[str]:
        if not ids:
            return set()
        placeholders = ",".join("?" for _ in ids)
        with self.connect() as connection:
            rows = connection.execute(
                f"SELECT album_id FROM albums WHERE album_id IN ({placeholders})", ids
            ).fetchall()
        return {row["album_id"] for row in rows}

    def add_feed_albums(self, albums: list[FeedAlbum], status: str) -> int:
        inserted = 0
        now = utc_now()
        with self.connect() as connection:
            for album in albums:
                cursor = connection.execute(
                    "INSERT OR IGNORE INTO albums(album_id, url, status, discovered_at) "
                    "VALUES(?, ?, ?, ?)",
                    (album.album_id, album.url, status, now),
                )
                inserted += cursor.rowcount
        return inserted

    def next_queued(self) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM albums WHERE status='queued' ORDER BY discovered_at, rowid LIMIT 1"
            ).fetchone()
        return dict(row) if row else None

    def claim_next_queued(self) -> dict[str, Any] | None:
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT * FROM albums WHERE status='queued' "
                "ORDER BY discovered_at, rowid LIMIT 1"
            ).fetchone()
            if row is None:
                return None
            connection.execute(
                "UPDATE albums SET status='parsing', started_at=?, error=NULL "
                "WHERE album_id=? AND status='queued'",
                (utc_now(), row["album_id"]),
            )
            claimed = dict(row)
            claimed["status"] = "parsing"
        return claimed

    def get_album(self, album_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM albums WHERE album_id=?", (album_id,)
            ).fetchone()
            if row is None:
                return None
            album = dict(row)
            album["progress_percent"] = self._progress_percent(
                connection,
                album_id,
                int(album["files_total"]),
                str(album["status"]),
            )
        return album

    def completed_albums(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT album_id, url, folder FROM albums "
                "WHERE status='completed' AND folder IS NOT NULL "
                "ORDER BY completed_at"
            ).fetchall()
        return [dict(row) for row in rows]

    def library_albums(
        self, query: str = "", limit: int = 12, offset: int = 0
    ) -> tuple[int, list[dict[str, Any]]]:
        where = "status='completed' AND folder IS NOT NULL"
        parameters: list[Any] = []
        if query.strip():
            where += " AND (title LIKE ? OR author LIKE ? OR album_id LIKE ?)"
            pattern = f"%{query.strip()}%"
            parameters.extend([pattern, pattern, pattern])
        with self.connect() as connection:
            count = connection.execute(
                f"SELECT COUNT(*) AS count FROM albums WHERE {where}",
                parameters,
            ).fetchone()["count"]
            rows = connection.execute(
                f"SELECT album_id, title, author, folder, completed_at, files_total "
                f"FROM albums WHERE {where} "
                "ORDER BY completed_at DESC LIMIT ? OFFSET ?",
                [*parameters, limit, offset],
            ).fetchall()
        return int(count), [dict(row) for row in rows]

    def random_completed_albums(self, limit: int = 80) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT album_id, title, author, folder, completed_at, files_total "
                "FROM albums WHERE status='completed' AND folder IS NOT NULL "
                "ORDER BY RANDOM() LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def mark_album_deleted(self, album_id: str) -> None:
        with self.connect() as connection:
            connection.execute(
                "UPDATE albums SET status='deleted', folder=NULL, files_total=0, "
                "files_done=0, bytes_downloaded=0, bytes_total=0, error=NULL "
                "WHERE album_id=?",
                (album_id,),
            )
            connection.execute(
                "DELETE FROM album_files WHERE album_id=?",
                (album_id,),
            )
            connection.execute(
                "DELETE FROM errors WHERE context IN (?, ?)",
                (f"album:{album_id}", f"metadata:{album_id}"),
            )

    def update_album(self, album_id: str, **values: Any) -> None:
        if not values:
            return
        assignments = ", ".join(f"{key}=?" for key in values)
        with self.connect() as connection:
            connection.execute(
                f"UPDATE albums SET {assignments} WHERE album_id=?",
                [*values.values(), album_id],
            )

    def set_album_page(self, album: AlbumPage, folder: str) -> None:
        self.clear_errors(f"album:{album.album_id}")
        self.update_album(
            album.album_id,
            title=album.title,
            author=album.author,
            files_total=len(album.media),
            folder=folder,
            status="downloading",
            started_at=utc_now(),
            error=None,
        )

    def increment_progress(self, album_id: str, byte_count: int = 0, file_done: bool = False) -> None:
        with self.connect() as connection:
            connection.execute(
                "UPDATE albums SET bytes_downloaded=bytes_downloaded+?, "
                "files_done=files_done+? WHERE album_id=?",
                (byte_count, int(file_done), album_id),
            )

    def register_file(
        self,
        album_id: str,
        filename: str,
        *,
        kind: str | None = None,
        source_url: str | None = None,
        preview_url: str | None = None,
    ) -> None:
        with self.connect() as connection:
            connection.execute(
                "INSERT INTO album_files("
                "album_id, filename, kind, source_url, preview_url"
                ") VALUES(?, ?, ?, ?, ?) "
                "ON CONFLICT(album_id, filename) DO UPDATE SET "
                "kind=COALESCE(excluded.kind, album_files.kind), "
                "source_url=COALESCE(excluded.source_url, album_files.source_url), "
                "preview_url=COALESCE(excluded.preview_url, album_files.preview_url)",
                (album_id, filename, kind, source_url, preview_url),
            )

    def file_approval_state(self, album_id: str, filename: str) -> str:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT approval_state FROM album_files "
                "WHERE album_id=? AND filename=?",
                (album_id, filename),
            ).fetchone()
        return str(row["approval_state"]) if row else "not_required"

    def request_file_approval(
        self, album_id: str, filename: str, expected_bytes: int
    ) -> None:
        with self.connect() as connection:
            connection.execute(
                "UPDATE album_files SET approval_state='pending', "
                "expected_bytes=MAX(expected_bytes, ?) "
                "WHERE album_id=? AND filename=? "
                "AND approval_state NOT IN ('approved', 'skipped')",
                (expected_bytes, album_id, filename),
            )
            connection.execute(
                "UPDATE albums SET status='awaiting_approval' WHERE album_id=?",
                (album_id,),
            )
            self._refresh_album_totals(connection, album_id)

    def decide_file(self, album_id: str, filename: str, decision: str) -> bool:
        if decision not in {"approved", "skipped"}:
            raise ValueError("Decision must be approved or skipped")
        with self.connect() as connection:
            cursor = connection.execute(
                "UPDATE album_files SET approval_state=?, completed=? "
                "WHERE album_id=? AND filename=? AND approval_state='pending'",
                (decision, int(decision == "skipped"), album_id, filename),
            )
            if not cursor.rowcount:
                return False
            pending = connection.execute(
                "SELECT 1 FROM album_files "
                "WHERE album_id=? AND approval_state='pending' LIMIT 1",
                (album_id,),
            ).fetchone()
            if pending is None:
                connection.execute(
                    "UPDATE albums SET status='queued', started_at=NULL, error=NULL "
                    "WHERE album_id=? AND status='awaiting_approval'",
                    (album_id,),
                )
            self._refresh_album_totals(connection, album_id)
        return True

    def pending_approvals(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT f.album_id, f.filename, f.expected_bytes, f.downloaded_bytes, "
                "f.kind, f.preview_url, a.title, a.author, a.url AS album_url "
                "FROM album_files f JOIN albums a ON a.album_id=f.album_id "
                "WHERE f.approval_state='pending' "
                "ORDER BY a.discovered_at, f.filename"
            ).fetchall()
        return [dict(row) for row in rows]

    def set_file_expected(self, album_id: str, filename: str, byte_count: int) -> None:
        if byte_count <= 0:
            return
        with self.connect() as connection:
            connection.execute(
                "UPDATE album_files SET expected_bytes=MAX(expected_bytes, ?) "
                "WHERE album_id=? AND filename=?",
                (byte_count, album_id, filename),
            )
            self._refresh_album_totals(connection, album_id)

    def set_file_downloaded(self, album_id: str, filename: str, byte_count: int) -> None:
        with self.connect() as connection:
            connection.execute(
                "UPDATE album_files SET downloaded_bytes=MAX(0, ?) "
                "WHERE album_id=? AND filename=?",
                (byte_count, album_id, filename),
            )
            self._refresh_album_totals(connection, album_id)

    def increment_file_downloaded(
        self, album_id: str, filename: str, byte_count: int
    ) -> None:
        with self.connect() as connection:
            connection.execute(
                "UPDATE album_files SET downloaded_bytes=MAX(0, downloaded_bytes+?) "
                "WHERE album_id=? AND filename=?",
                (byte_count, album_id, filename),
            )
            self._refresh_album_totals(connection, album_id)

    def complete_file(self, album_id: str, filename: str) -> None:
        with self.connect() as connection:
            connection.execute(
                "UPDATE album_files SET completed=1, "
                "expected_bytes=MAX(expected_bytes, downloaded_bytes) "
                "WHERE album_id=? AND filename=?",
                (album_id, filename),
            )
            self._refresh_album_totals(connection, album_id)

    def complete_album(self, album_id: str) -> None:
        self.update_album(album_id, status="completed", completed_at=utc_now(), error=None)
        self.clear_errors(f"album:{album_id}")

    def cancel_album(self, album_id: str) -> None:
        with self.connect() as connection:
            connection.execute(
                "UPDATE albums SET status='canceled', folder=NULL, error=NULL, "
                "files_total=0, files_done=0, bytes_downloaded=0, bytes_total=0 "
                "WHERE album_id=?",
                (album_id,),
            )
            connection.execute(
                "DELETE FROM album_files WHERE album_id=?",
                (album_id,),
            )
            connection.execute(
                "DELETE FROM errors WHERE context IN (?, ?)",
                (f"album:{album_id}", f"metadata:{album_id}"),
            )

    def fail_album(self, album_id: str, message: str, status: str = "failed") -> None:
        self.update_album(album_id, status=status, error=message)
        self.add_error(f"album:{album_id}", message)

    def retry_failed(self) -> int:
        with self.connect() as connection:
            failed_ids = [
                row["album_id"]
                for row in connection.execute(
                    "SELECT album_id FROM albums WHERE status='failed'"
                ).fetchall()
            ]
            cursor = connection.execute(
                "UPDATE albums SET status='queued', error=NULL, files_done=0, "
                "bytes_downloaded=0, started_at=NULL WHERE status='failed'"
            )
            connection.executemany(
                "UPDATE album_files SET downloaded_bytes=0, completed=0 "
                "WHERE album_id=?",
                [(album_id,) for album_id in failed_ids],
            )
            connection.executemany(
                "DELETE FROM errors WHERE context=?",
                [(f"album:{album_id}",) for album_id in failed_ids],
            )
        return cursor.rowcount

    def add_error(self, context: str, message: str) -> None:
        with self.connect() as connection:
            connection.execute(
                "INSERT INTO errors(created_at, context, message) VALUES(?, ?, ?)",
                (utc_now(), context, message[:2000]),
            )

    def clear_errors(self, context: str | None = None) -> int:
        with self.connect() as connection:
            if context is None:
                cursor = connection.execute("DELETE FROM errors")
            else:
                cursor = connection.execute("DELETE FROM errors WHERE context=?", (context,))
        return cursor.rowcount

    def dashboard_data(self) -> dict[str, Any]:
        with self.connect() as connection:
            counts = {
                row["status"]: row["count"]
                for row in connection.execute(
                    "SELECT status, COUNT(*) AS count FROM albums GROUP BY status"
                ).fetchall()
            }
            jobs = [
                dict(row)
                for row in connection.execute(
                    "SELECT * FROM albums WHERE status NOT IN ('baseline', 'deleted') "
                    "ORDER BY CASE status "
                    "WHEN 'downloading' THEN 0 WHEN 'parsing' THEN 0 "
                    "WHEN 'failed' THEN 1 WHEN 'queued' THEN 2 "
                    "WHEN 'completed' THEN 3 ELSE 4 END, "
                    "discovered_at DESC LIMIT 50"
                ).fetchall()
            ]
            for job in jobs:
                job["progress_percent"] = self._progress_percent(
                    connection,
                    str(job["album_id"]),
                    int(job["files_total"]),
                    str(job["status"]),
                )
            errors = [
                dict(row)
                for row in connection.execute(
                    "SELECT created_at, context, message FROM errors ORDER BY id DESC LIMIT 20"
                ).fetchall()
            ]
        return {
            "counts": counts,
            "jobs": jobs,
            "errors": errors,
            "approvals": self.pending_approvals(),
        }

    @staticmethod
    def _refresh_album_totals(
        connection: sqlite3.Connection, album_id: str
    ) -> None:
        connection.execute(
            "UPDATE albums SET "
            "bytes_downloaded=COALESCE(("
            "SELECT SUM(downloaded_bytes) FROM album_files WHERE album_id=?"
            "), 0), "
            "bytes_total=COALESCE(("
            "SELECT SUM(CASE WHEN approval_state='skipped' THEN 0 "
            "ELSE expected_bytes END) FROM album_files WHERE album_id=?"
            "), 0), "
            "files_done=COALESCE(("
            "SELECT SUM(completed) FROM album_files WHERE album_id=?"
            "), 0) "
            "WHERE album_id=?",
            (album_id, album_id, album_id, album_id),
        )

    @staticmethod
    def _progress_percent(
        connection: sqlite3.Connection,
        album_id: str,
        files_total: int,
        status: str,
    ) -> float:
        if status == "completed":
            return 100.0
        if files_total <= 0:
            return 0.0
        row = connection.execute(
            "SELECT COALESCE(SUM(CASE "
            "WHEN completed=1 THEN 1.0 "
            "WHEN expected_bytes>0 THEN MIN(0.999, "
            "downloaded_bytes * 1.0 / expected_bytes) "
            "ELSE 0 END), 0) AS progress FROM album_files WHERE album_id=?",
            (album_id,),
        ).fetchone()
        return max(0.0, min(99.9, float(row["progress"]) / files_total * 100))
