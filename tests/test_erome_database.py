import sqlite3

from erome_archiver.database import Database


def test_existing_database_gains_progress_schema(tmp_path):
    path = tmp_path / "legacy.sqlite3"
    with sqlite3.connect(path) as connection:
        connection.execute(
            """
            CREATE TABLE albums (
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
                error TEXT,
                folder TEXT
            )
            """
        )
        connection.execute(
            "INSERT INTO albums(album_id, url, status, discovered_at) "
            "VALUES('Legacy1', 'https://example/a/Legacy1', 'queued', '2026-01-01')"
        )

    database = Database(path)

    with database.connect() as connection:
        columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(albums)")
        }
        file_table = connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='album_files'"
        ).fetchone()
    assert "bytes_total" in columns
    assert file_table is not None
    assert database.get_album("Legacy1")["progress_percent"] == 0
