import json

from fastapi.testclient import TestClient
from PIL import Image

from erome_archiver.database import Database
from erome_archiver.models import FeedAlbum
from erome_archiver.service import ArchiverWorker
from erome_archiver.web import create_app


def test_dashboard_and_control_endpoints(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    worker = ArchiverWorker(database)
    app = create_app(start_worker=False, worker=worker)

    with TestClient(app) as client:
        root = client.get("/")
        status = client.get("/api/status")
        paused = client.post("/api/pause")
        resumed = client.post("/api/resume")

    assert root.status_code == 200
    assert "Public-Feed Archiver" in root.text
    assert 'id="interval" type="number" min="5"' in root.text
    assert 'id="transfers" type="number" min="1" max="10"' in root.text
    assert 'id="albums" type="number" min="1" max="10"' in root.text
    assert status.status_code == 200
    assert status.json()["settings"]["poll_interval_seconds"] == 120
    assert status.json()["settings"]["download_concurrency"] == 10
    assert status.json()["settings"]["album_concurrency"] == 3
    assert paused.json() == {"paused": True}
    assert resumed.json() == {"paused": False}


def test_settings_validation_and_failed_retry(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    database.add_feed_albums([FeedAlbum("Failed1", "https://example/a/Failed1")], "queued")
    database.fail_album("Failed1", "network error")
    app = create_app(start_worker=False, worker=ArchiverWorker(database))

    with TestClient(app) as client:
        valid = client.put(
            "/api/settings",
            json={
                "archive_path": str(tmp_path / "archive"),
                "poll_interval_seconds": 5,
                "minimum_free_bytes": 1024**3,
                "page_delay_seconds": 0,
                "download_concurrency": 2,
                "paused": False,
            },
        )
        invalid = client.put(
            "/api/settings",
            json={
                "archive_path": str(tmp_path / "archive"),
                "poll_interval_seconds": 1,
                "minimum_free_bytes": 1024**3,
                "page_delay_seconds": 0,
                "download_concurrency": 2,
                "paused": False,
            },
        )
        retried = client.post("/api/retry-failed")

    assert valid.status_code == 200
    assert valid.json()["poll_interval_seconds"] == 5
    assert invalid.status_code == 422
    assert database.get_settings().poll_interval_seconds == 5
    assert retried.json() == {"retried": 1}
    assert database.next_queued()["album_id"] == "Failed1"
    assert database.dashboard_data()["errors"] == []


def test_clear_error_history_endpoint(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    database.add_error("worker", "temporary problem")
    app = create_app(start_worker=False, worker=ArchiverWorker(database))

    with TestClient(app) as client:
        cleared = client.post("/api/clear-errors")

    assert cleared.json() == {"cleared": 1}
    assert database.dashboard_data()["errors"] == []


def test_cancel_download_endpoint_targets_only_the_active_album(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    album_id = "CancelApi1"
    database.add_feed_albums(
        [FeedAlbum(album_id, f"https://www.erome.com/a/{album_id}")], "queued"
    )
    worker = ArchiverWorker(database)
    worker.current_album_id = album_id
    app = create_app(start_worker=False, worker=worker)

    with TestClient(app) as client:
        wrong = client.post(
            "/api/cancel-download",
            json={"album_id": "DifferentAlbum"},
        )
        accepted = client.post(
            "/api/cancel-download",
            json={"album_id": album_id},
        )

    assert wrong.status_code == 409
    assert accepted.status_code == 202
    assert accepted.json() == {"accepted": True, "album_id": album_id}
    assert database.get_album(album_id)["status"] == "canceling"


def test_large_file_approval_endpoint_requeues_album(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    album_id = "Approval1"
    filename = "001_large.mp4"
    database.add_feed_albums(
        [FeedAlbum(album_id, f"https://www.erome.com/a/{album_id}")], "queued"
    )
    database.update_album(
        album_id,
        status="awaiting_approval",
        title="Large Album",
        files_total=1,
    )
    database.register_file(
        album_id,
        filename,
        kind="video",
        source_url="https://cdn.example/large.mp4",
        preview_url="https://cdn.example/preview.jpg",
    )
    database.request_file_approval(album_id, filename, 600 * 1024**2)
    app = create_app(start_worker=False, worker=ArchiverWorker(database))

    with TestClient(app) as client:
        status = client.get("/api/status")
        approved = client.post(
            f"/api/approvals/{album_id}/{filename}",
            json={"decision": "approved"},
        )

    assert status.json()["approvals"][0]["title"] == "Large Album"
    assert approved.status_code == 200
    assert approved.json()["decision"] == "approved"
    assert database.get_album(album_id)["status"] == "queued"


def test_saved_library_lists_and_securely_serves_archived_media(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    album_id = "Library1"
    folder = tmp_path / "Library1 - Album Name"
    folder.mkdir()
    image_path = folder / "001_photo.png"
    Image.new("RGB", (20, 10), color="blue").save(image_path)
    (folder / "album.json").write_text(
        json.dumps(
            {
                "album_id": album_id,
                "title": "Album Name",
                "author": "Album Author",
                "files": [
                    {
                        "index": 1,
                        "kind": "image",
                        "filename": image_path.name,
                        "bytes": image_path.stat().st_size,
                        "metadata": {
                            "embedded": {
                                "exif_ifds": {
                                    "GPSInfo": {
                                        "GPSLatitude": [1, 2, 3],
                                        "GPSLongitude": [4, 5, 6],
                                    }
                                }
                            }
                        },
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    database.add_feed_albums(
        [FeedAlbum(album_id, f"https://www.erome.com/a/{album_id}")], "queued"
    )
    database.update_album(
        album_id,
        status="completed",
        title="Album Name",
        author="Album Author",
        folder=str(folder),
        completed_at="2026-01-01T00:00:00+00:00",
        files_total=1,
        files_done=1,
    )
    app = create_app(start_worker=False, worker=ArchiverWorker(database))

    with TestClient(app) as client:
        page = client.get("/library")
        feed_page = client.get("/feed")
        listing = client.get("/api/library")
        shuffled = client.get("/api/feed?limit=10")
        media = client.get(f"/api/media/{album_id}/{image_path.name}")
        thumbnail = client.get(f"/api/thumbnail/{album_id}/{image_path.name}")
        blocked = client.get(f"/api/media/{album_id}/album.json")

    assert page.status_code == 200
    assert "Saved Library" in page.text
    assert feed_page.status_code == 200
    assert "Shuffle Feed" in feed_page.text
    assert ".feed-media { position:absolute" in feed_page.text
    assert "object-fit:contain; object-position:center" in feed_page.text
    album = listing.json()["albums"][0]
    assert album["title"] == "Album Name"
    assert album["has_location"] is True
    assert album["files"][0]["kind"] == "image"
    assert media.content == image_path.read_bytes()
    assert thumbnail.headers["content-type"] == "image/jpeg"
    assert shuffled.json()["items"][0]["album_title"] == "Album Name"
    assert blocked.status_code == 404


def test_album_delete_requires_matching_confirmation_and_removes_whole_folder(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    album_id = "Delete1"
    folder = tmp_path / "Delete1 - Full Album"
    folder.mkdir()
    image_path = folder / "001_photo.png"
    video_path = folder / "002_video.mp4"
    Image.new("RGB", (30, 20), color="purple").save(image_path)
    video_path.write_bytes(b"video")
    (folder / "album.json").write_text(
        json.dumps(
            {
                "album_id": album_id,
                "title": "Full Album",
                "author": "Album Author",
                "files": [
                    {
                        "index": 1,
                        "kind": "image",
                        "filename": image_path.name,
                        "bytes": image_path.stat().st_size,
                        "metadata": {},
                    },
                    {
                        "index": 2,
                        "kind": "video",
                        "filename": video_path.name,
                        "bytes": video_path.stat().st_size,
                        "metadata": {},
                    },
                ],
            }
        ),
        encoding="utf-8",
    )
    database.add_feed_albums(
        [FeedAlbum(album_id, f"https://www.erome.com/a/{album_id}")], "queued"
    )
    database.update_album(
        album_id,
        status="completed",
        title="Full Album",
        author="Album Author",
        folder=str(folder),
        completed_at="2026-01-01T00:00:00+00:00",
        files_total=2,
        files_done=2,
    )
    app = create_app(start_worker=False, worker=ArchiverWorker(database))

    with TestClient(app) as client:
        details = client.get(f"/api/albums/{album_id}")
        mismatch = client.request(
            "DELETE",
            f"/api/albums/{album_id}",
            json={"confirm_album_id": "SomethingElse"},
        )
        assert folder.exists()
        deleted = client.request(
            "DELETE",
            f"/api/albums/{album_id}",
            json={"confirm_album_id": album_id},
        )
        missing = client.get(f"/api/albums/{album_id}")

    assert details.status_code == 200
    assert len(details.json()["files"]) == 2
    assert mismatch.status_code == 422
    assert deleted.json() == {"deleted": True, "album_id": album_id}
    assert not folder.exists()
    assert missing.status_code == 404
    assert database.get_album(album_id)["status"] == "deleted"
    assert database.known_ids([album_id]) == {album_id}
