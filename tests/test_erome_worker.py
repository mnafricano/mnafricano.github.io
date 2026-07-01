import asyncio
import json

import httpx

from erome_archiver.database import Database
from erome_archiver.models import FeedAlbum, Settings
import erome_archiver.service as service_module
from erome_archiver.service import ArchiverWorker, FEED_URL, MAX_UNAPPROVED_BYTES


def no_wait(_: float):
    return asyncio.sleep(0)


def settings_for(tmp_path):
    return Settings(
        archive_path=str(tmp_path / "archive"),
        poll_interval_seconds=30,
        minimum_free_bytes=1024**3,
        page_delay_seconds=0,
    )


def test_first_scan_baselines_every_visible_page_without_queueing(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    database.save_settings(settings_for(tmp_path))

    def handler(request: httpx.Request):
        if request.url.params.get("page") == "2":
            return httpx.Response(200, text='<a href="/a/Older">older</a>')
        return httpx.Response(
            200,
            text='<a href="/a/Current">current</a><a href="/explore/new?page=2">2</a>',
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    worker = ArchiverWorker(database, client=client, sleep=no_wait)
    discovered = asyncio.run(worker.scan_once())
    asyncio.run(client.aclose())

    assert discovered == 0
    assert database.get_setting("baseline_complete") is True
    assert database.known_ids(["Current", "Older"]) == {"Current", "Older"}
    assert database.next_queued() is None


def test_later_scan_queues_new_albums_oldest_first_and_deduplicates(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    database.save_settings(settings_for(tmp_path))
    database.set_setting("baseline_complete", True)
    database.add_feed_albums(
        [FeedAlbum("Known", "https://www.erome.com/a/Known")], "baseline"
    )

    def handler(_: httpx.Request):
        return httpx.Response(
            200,
            text='<a href="/a/Newest">newest</a><a href="/a/OlderNew">older</a>'
            '<a href="/a/Known">known</a><a href="/a/Newest">duplicate</a>',
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    worker = ArchiverWorker(database, client=client, sleep=no_wait)
    discovered = asyncio.run(worker.scan_once())
    first = database.next_queued()
    database.update_album(first["album_id"], status="completed")
    second = database.next_queued()
    asyncio.run(client.aclose())

    assert discovered == 2
    assert first["album_id"] == "OlderNew"
    assert second["album_id"] == "Newest"


def test_download_writes_media_manifest_and_completes_job(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    settings = settings_for(tmp_path)
    database.save_settings(settings)
    album_id = "Download1"
    url = f"https://www.erome.com/a/{album_id}"
    database.add_feed_albums([FeedAlbum(album_id, url)], "queued")
    album_html = f"""
      <h1 class="album-title-page">Download Test</h1><a id="user_name">author</a>
      <div id="album_{album_id}">
        <div class="media-group"><div class="img" data-src="https://cdn.example/pic.jpg"></div></div>
        <div class="media-group"><video><source src="https://cdn.example/movie.mp4" res="720"></video></div>
      </div>
    """

    def handler(request: httpx.Request):
        if str(request.url) == url:
            return httpx.Response(200, text=album_html)
        assert request.headers["Referer"] == url
        if request.url.path.endswith("pic.jpg"):
            return httpx.Response(200, content=b"image-bytes")
        if request.url.path.endswith("movie.mp4"):
            return httpx.Response(200, content=b"video-bytes")
        return httpx.Response(404)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    worker = ArchiverWorker(database, client=client, sleep=no_wait)
    asyncio.run(worker.process_queue())
    asyncio.run(client.aclose())

    data = database.dashboard_data()
    assert data["counts"]["completed"] == 1
    completed = database.get_album(album_id)
    assert completed["bytes_total"] == len(b"image-bytes") + len(b"video-bytes")
    assert completed["progress_percent"] == 100
    folder = tmp_path / "archive" / "Download1 - Download Test"
    assert (folder / "001_pic.jpg").read_bytes() == b"image-bytes"
    assert (folder / "002_movie.mp4").read_bytes() == b"video-bytes"
    manifest = json.loads((folder / "album.json").read_text())
    assert manifest["album_id"] == album_id
    assert manifest["discovered_at"]
    assert [entry["kind"] for entry in manifest["files"]] == ["image", "video"]
    assert all("metadata" in entry for entry in manifest["files"])
    sidecar = json.loads((folder / "media-metadata.json").read_text())
    assert sidecar["album_id"] == album_id
    assert len(sidecar["files"]) == 2


def test_recovery_requeues_an_interrupted_download(tmp_path):
    path = tmp_path / "state.sqlite3"
    database = Database(path)
    database.add_feed_albums(
        [FeedAlbum("Interrupted", "https://www.erome.com/a/Interrupted")], "queued"
    )
    database.update_album("Interrupted", status="downloading")

    recovered = Database(path)

    assert recovered.next_queued()["album_id"] == "Interrupted"


def test_partial_media_download_resumes_with_range_request(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    settings = settings_for(tmp_path)
    database.save_settings(settings)
    album_id = "Resume1"
    url = f"https://www.erome.com/a/{album_id}"
    database.add_feed_albums([FeedAlbum(album_id, url)], "queued")
    folder = tmp_path / "archive" / "Resume1 - Resume Test"
    folder.mkdir(parents=True)
    (folder / "001_file.jpg.partial").write_bytes(b"first")
    album_html = f"""
      <h1 class="album-title-page">Resume Test</h1><a id="user_name">author</a>
      <div id="album_{album_id}">
        <div class="media-group"><div class="img" data-src="https://cdn.example/file.jpg"></div></div>
      </div>
    """

    def handler(request: httpx.Request):
        if str(request.url) == url:
            return httpx.Response(200, text=album_html)
        assert request.headers["Range"] == "bytes=5-"
        assert request.headers["Referer"] == url
        return httpx.Response(206, content=b"-second")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    worker = ArchiverWorker(database, client=client, sleep=no_wait)
    asyncio.run(worker.process_queue())
    asyncio.run(client.aclose())

    assert (folder / "001_file.jpg").read_bytes() == b"first-second"
    album = database.get_album(album_id)
    assert album["bytes_downloaded"] == len(b"first-second")
    assert album["bytes_total"] == len(b"first-second")
    assert album["files_done"] == 1


def test_gone_album_is_skipped_without_an_error(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    database.save_settings(settings_for(tmp_path))
    album_id = "Gone1"
    url = f"https://www.erome.com/a/{album_id}"
    database.add_feed_albums([FeedAlbum(album_id, url)], "queued")

    client = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _: httpx.Response(410, text="gone"))
    )
    worker = ArchiverWorker(database, client=client, sleep=no_wait)
    asyncio.run(worker.process_queue())
    asyncio.run(client.aclose())

    assert database.get_album(album_id)["status"] == "skipped"
    assert database.dashboard_data()["errors"] == []


def test_scanner_runs_while_a_download_is_in_progress(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    database.save_settings(
        settings_for(tmp_path).model_copy(update={"poll_interval_seconds": 5})
    )
    database.add_feed_albums(
        [FeedAlbum("Slow1", "https://www.erome.com/a/Slow1")], "queued"
    )

    class ProbeWorker(ArchiverWorker):
        def __init__(self):
            super().__init__(database)
            self.scan_calls = 0
            self.first_scan = asyncio.Event()
            self.download_started = asyncio.Event()

        async def scan_once(self):
            self.scan_calls += 1
            self.first_scan.set()
            return 0

        async def download_album(self, album_id, url, settings):
            self.download_started.set()
            await asyncio.Event().wait()

    async def scenario():
        worker = ProbeWorker()
        await worker.start()
        await asyncio.wait_for(worker.first_scan.wait(), timeout=1)
        await asyncio.wait_for(worker.download_started.wait(), timeout=1)
        worker.wake()
        for _ in range(100):
            if worker.scan_calls >= 2:
                break
            await asyncio.sleep(0.01)
        assert worker.scan_calls >= 2
        assert worker.current_album_id == "Slow1"
        await worker.stop()

    asyncio.run(scenario())


def test_pause_interrupts_active_transfer_and_requeues_album(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    settings = settings_for(tmp_path)
    database.save_settings(settings)
    album_id = "Pause1"
    url = f"https://www.erome.com/a/{album_id}"
    database.add_feed_albums([FeedAlbum(album_id, url)], "queued")
    album_html = f"""
      <h1 class="album-title-page">Pause Test</h1><a id="user_name">author</a>
      <div id="album_{album_id}">
        <div class="media-group"><div class="img" data-src="https://cdn.example/file.jpg"></div></div>
      </div>
    """

    def handler(request: httpx.Request):
        if str(request.url) == url:
            return httpx.Response(200, text=album_html)
        return httpx.Response(200, content=b"a" * 1024)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    worker = ArchiverWorker(database, client=client, sleep=no_wait)
    database.save_settings(settings.model_copy(update={"paused": True}))
    worker.wake()
    asyncio.run(worker._process_one(settings))
    asyncio.run(client.aclose())

    assert database.get_album(album_id)["status"] == "queued"
    assert database.dashboard_data()["errors"] == []


def test_location_album_folder_gets_pin_prefix(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    album_id = "Pinned1"
    folder = tmp_path / "Pinned1 - Located"
    folder.mkdir()
    database.add_feed_albums(
        [FeedAlbum(album_id, f"https://www.erome.com/a/{album_id}")], "completed"
    )
    database.update_album(album_id, folder=str(folder))
    worker = ArchiverWorker(database)

    pinned = worker._pin_album_folder(album_id, folder)

    assert pinned.name == "📍 Pinned1 - Located"
    assert pinned.is_dir()
    assert database.get_album(album_id)["folder"] == str(pinned)


def test_album_progress_combines_partial_file_bytes(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    album_id = "Progress1"
    database.add_feed_albums(
        [FeedAlbum(album_id, f"https://www.erome.com/a/{album_id}")], "queued"
    )
    database.update_album(album_id, status="downloading", files_total=2)
    database.register_file(album_id, "one.mp4")
    database.register_file(album_id, "two.mp4")
    database.set_file_expected(album_id, "one.mp4", 100)
    database.set_file_expected(album_id, "two.mp4", 200)
    database.set_file_downloaded(album_id, "one.mp4", 50)
    database.set_file_downloaded(album_id, "two.mp4", 50)

    partial = database.get_album(album_id)
    assert partial["bytes_downloaded"] == 100
    assert partial["bytes_total"] == 300
    assert partial["progress_percent"] == 37.5

    database.complete_file(album_id, "one.mp4")
    advanced = database.get_album(album_id)
    assert advanced["files_done"] == 1
    assert advanced["progress_percent"] == 62.5


def test_file_over_500_mb_waits_for_user_and_can_be_skipped(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    settings = settings_for(tmp_path)
    database.save_settings(settings)
    album_id = "Large1"
    url = f"https://www.erome.com/a/{album_id}"
    database.add_feed_albums([FeedAlbum(album_id, url)], "queued")
    album_html = f"""
      <h1 class="album-title-page">Large Test</h1><a id="user_name">author</a>
      <div id="album_{album_id}">
        <div class="media-group"><video poster="https://cdn.example/preview.jpg">
          <source src="https://cdn.example/large.mp4" res="1080">
        </video></div>
      </div>
    """

    def handler(request: httpx.Request):
        if str(request.url) == url:
            return httpx.Response(200, text=album_html)
        return httpx.Response(
            200,
            headers={"Content-Length": str(MAX_UNAPPROVED_BYTES + 1)},
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    worker = ArchiverWorker(database, client=client, sleep=no_wait)
    asyncio.run(worker.process_queue())

    waiting = database.get_album(album_id)
    approvals = database.pending_approvals()
    assert waiting["status"] == "awaiting_approval"
    assert waiting["bytes_downloaded"] == 0
    assert approvals[0]["expected_bytes"] == MAX_UNAPPROVED_BYTES + 1
    assert approvals[0]["preview_url"] == "https://cdn.example/preview.jpg"
    assert not (tmp_path / "archive" / "Large1 - Large Test" / "001_large.mp4").exists()

    assert database.decide_file(album_id, "001_large.mp4", "skipped") is True
    asyncio.run(worker.process_queue())
    asyncio.run(client.aclose())

    completed = database.get_album(album_id)
    assert completed["status"] == "completed"
    manifest = json.loads(
        (
            tmp_path
            / "archive"
            / "Large1 - Large Test"
            / "album.json"
        ).read_text()
    )
    assert manifest["files"][0]["skipped"] is True


def test_unknown_length_download_stops_at_limit_for_approval(tmp_path, monkeypatch):
    monkeypatch.setattr(service_module, "MAX_UNAPPROVED_BYTES", 10)
    database = Database(tmp_path / "state.sqlite3")
    settings = settings_for(tmp_path)
    database.save_settings(settings)
    album_id = "UnknownSize1"
    url = f"https://www.erome.com/a/{album_id}"
    database.add_feed_albums([FeedAlbum(album_id, url)], "queued")
    album_html = f"""
      <h1 class="album-title-page">Unknown Size</h1><a id="user_name">author</a>
      <div id="album_{album_id}">
        <div class="media-group"><div class="img"
          data-src="https://cdn.example/unknown.jpg"></div></div>
      </div>
    """

    class UnknownLengthStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b"123456"
            yield b"789012"

    def handler(request: httpx.Request):
        if str(request.url) == url:
            return httpx.Response(200, text=album_html)
        return httpx.Response(200, stream=UnknownLengthStream())

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    worker = ArchiverWorker(database, client=client, sleep=no_wait)
    asyncio.run(worker.process_queue())
    asyncio.run(client.aclose())

    partial = (
        tmp_path
        / "archive"
        / "UnknownSize1 - Unknown Size"
        / "001_unknown.jpg.partial"
    )
    assert partial.stat().st_size <= 10
    assert database.get_album(album_id)["status"] == "awaiting_approval"
    assert database.pending_approvals()[0]["expected_bytes"] == 12


def test_up_to_ten_album_files_download_in_parallel(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    settings = settings_for(tmp_path).model_copy(update={"download_concurrency": 10})
    database.save_settings(settings)
    album_id = "Parallel1"
    url = f"https://www.erome.com/a/{album_id}"
    database.add_feed_albums([FeedAlbum(album_id, url)], "queued")
    media = "".join(
        f'<div class="media-group"><div class="img" '
        f'data-src="https://cdn.example/file-{index}.jpg"></div></div>'
        for index in range(12)
    )
    album_html = (
        f'<h1 class="album-title-page">Parallel Test</h1>'
        f'<a id="user_name">author</a><div id="album_{album_id}">{media}</div>'
    )
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, text=album_html)
        )
    )

    class ParallelWorker(ArchiverWorker):
        def __init__(self):
            super().__init__(database, client=client, sleep=no_wait)
            self.active = 0
            self.maximum_active = 0

        async def _download_file(
            self, album_id, url, target, settings, *, referer
        ):
            self.active += 1
            self.maximum_active = max(self.maximum_active, self.active)
            try:
                await asyncio.sleep(0.02)
                target.write_bytes(b"image")
                self.database.set_file_expected(album_id, target.name, 5)
                self.database.set_file_downloaded(album_id, target.name, 5)
                self.database.complete_file(album_id, target.name)
                return {}
            finally:
                self.active -= 1

    worker = ParallelWorker()
    asyncio.run(worker.process_queue())
    asyncio.run(client.aclose())

    assert worker.maximum_active == 10
    assert database.get_album(album_id)["status"] == "completed"


def test_cancel_stops_parallel_transfers_and_removes_partial_album(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    settings = settings_for(tmp_path).model_copy(update={"download_concurrency": 10})
    database.save_settings(settings)
    album_id = "CancelParallel1"
    url = f"https://www.erome.com/a/{album_id}"
    database.add_feed_albums([FeedAlbum(album_id, url)], "queued")
    media = "".join(
        f'<div class="media-group"><div class="img" '
        f'data-src="https://cdn.example/file-{index}.jpg"></div></div>'
        for index in range(12)
    )
    album_html = (
        f'<h1 class="album-title-page">Cancel Parallel</h1>'
        f'<a id="user_name">author</a><div id="album_{album_id}">{media}</div>'
    )
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, text=album_html)
        )
    )

    class CancellableWorker(ArchiverWorker):
        def __init__(self):
            super().__init__(database, client=client, sleep=no_wait)
            self.active = 0
            self.all_started = asyncio.Event()

        async def _download_file(
            self, album_id, url, target, settings, *, referer
        ):
            self.active += 1
            if self.active == 10:
                self.all_started.set()
            partial = target.with_name(target.name + ".partial")
            partial.write_bytes(b"partial")
            try:
                while True:
                    self._raise_if_cancelled(album_id)
                    await asyncio.sleep(0.005)
            finally:
                self.active -= 1

    async def scenario():
        worker = CancellableWorker()
        process = asyncio.create_task(worker._process_one(settings))
        await asyncio.wait_for(worker.all_started.wait(), timeout=1)
        assert worker.current_album_id == album_id
        assert worker.cancel_download(album_id) is True
        await asyncio.wait_for(process, timeout=1)
        await client.aclose()
        return worker

    worker = asyncio.run(scenario())
    folder = tmp_path / "archive" / "CancelParallel1 - Cancel Parallel"

    assert worker.active == 0
    assert not folder.exists()
    assert database.get_album(album_id)["status"] == "canceled"
    assert database.next_queued() is None
    assert database.dashboard_data()["errors"] == []


def test_multiple_albums_share_global_ten_file_limit(tmp_path):
    database = Database(tmp_path / "state.sqlite3")
    settings = settings_for(tmp_path).model_copy(
        update={"download_concurrency": 10, "album_concurrency": 3}
    )
    database.save_settings(settings)
    album_ids = ["MultiAlbum1", "MultiAlbum2", "MultiAlbum3"]
    database.add_feed_albums(
        [
            FeedAlbum(album_id, f"https://www.erome.com/a/{album_id}")
            for album_id in album_ids
        ],
        "queued",
    )

    def handler(request: httpx.Request):
        album_id = request.url.path.rsplit("/", 1)[-1]
        media = "".join(
            f'<div class="media-group"><div class="img" '
            f'data-src="https://cdn.example/{album_id}-{index}.jpg"></div></div>'
            for index in range(4)
        )
        return httpx.Response(
            200,
            text=(
                f'<h1 class="album-title-page">{album_id}</h1>'
                f'<a id="user_name">author</a>'
                f'<div id="album_{album_id}">{media}</div>'
            ),
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    class MultiAlbumWorker(ArchiverWorker):
        def __init__(self):
            super().__init__(database, client=client, sleep=no_wait)
            self.active_files = 0
            self.maximum_files = 0
            self.active_albums: set[str] = set()
            self.maximum_albums = 0

        async def _download_file(
            self, album_id, url, target, settings, *, referer
        ):
            self.active_files += 1
            self.active_albums.add(album_id)
            self.maximum_files = max(self.maximum_files, self.active_files)
            self.maximum_albums = max(self.maximum_albums, len(self.active_albums))
            try:
                await asyncio.sleep(0.03)
                target.write_bytes(b"image")
                self.database.set_file_expected(album_id, target.name, 5)
                self.database.set_file_downloaded(album_id, target.name, 5)
                self.database.complete_file(album_id, target.name)
                return {}
            finally:
                self.active_files -= 1
                self.active_albums.discard(album_id)

    async def scenario():
        worker = MultiAlbumWorker()
        await asyncio.gather(
            worker._process_one(settings),
            worker._process_one(settings),
            worker._process_one(settings),
        )
        await client.aclose()
        return worker

    worker = asyncio.run(scenario())

    assert worker.maximum_albums == 3
    assert worker.maximum_files == 10
    assert worker.current_album_ids == set()
    assert all(database.get_album(album_id)["status"] == "completed" for album_id in album_ids)
