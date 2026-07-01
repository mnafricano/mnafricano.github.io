"""Polling, queueing, and resilient media downloads."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import time
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from erome_archiver.database import Database, utc_now
from erome_archiver.metadata import (
    METADATA_VERSION,
    backfill_album_metadata,
    extract_media_metadata,
    metadata_has_location,
    sidecar_has_location,
    sidecar_needs_refresh,
)
from erome_archiver.models import AlbumPage, FeedAlbum, MediaItem, Settings
from erome_archiver.parser import album_folder_name, media_filename, parse_album, parse_feed

FEED_URL = "https://www.erome.com/explore/new"
USER_AGENT = "EromeArchiver/0.1 (local personal archiver; public pages only)"
MAX_UNAPPROVED_BYTES = 500 * 1024**2


class LowDiskError(RuntimeError):
    pass


class ResourceGoneError(RuntimeError):
    pass


class PauseRequested(RuntimeError):
    pass


class FileApprovalRequired(RuntimeError):
    pass


class DownloadCancelled(RuntimeError):
    pass


class ArchiverWorker:
    def __init__(
        self,
        database: Database,
        client: httpx.AsyncClient | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ):
        self.database = database
        self.client = client or httpx.AsyncClient(
            follow_redirects=True,
            timeout=httpx.Timeout(60, connect=20),
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
        )
        self._owns_client = client is None
        self._sleep = sleep
        self._stop = asyncio.Event()
        self._scan_wake = asyncio.Event()
        self._download_wake = asyncio.Event()
        self._metadata_wake = asyncio.Event()
        self._page_request_lock = asyncio.Lock()
        self._task: asyncio.Task[None] | None = None
        self._last_page_request = 0.0
        self.state = "stopped"
        self.scanning = False
        self.pause_reason: str | None = None
        self.current_album_ids: set[str] = set()
        self.metadata_album_id: str | None = None
        self._cancelled_albums: set[str] = set()
        self._transfer_condition = asyncio.Condition()
        self._active_transfers = 0

    @property
    def current_album_id(self) -> str | None:
        return sorted(self.current_album_ids)[0] if self.current_album_ids else None

    @current_album_id.setter
    def current_album_id(self, album_id: str | None) -> None:
        self.current_album_ids.clear()
        if album_id:
            self.current_album_ids.add(album_id)

    async def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop.clear()
            self._task = asyncio.create_task(self.run_forever(), name="erome-archiver-worker")

    async def stop(self) -> None:
        self._stop.set()
        self.wake()
        if self._task:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
        if self._owns_client:
            await self.client.aclose()
        self.state = "stopped"

    def wake(self) -> None:
        self._scan_wake.set()
        self._download_wake.set()
        self._metadata_wake.set()
        try:
            asyncio.get_running_loop().create_task(self._notify_transfer_waiters())
        except RuntimeError:
            pass

    def cancel_download(self, album_id: str) -> bool:
        if not album_id or album_id not in self.current_album_ids:
            return False
        self._cancelled_albums.add(album_id)
        self.database.update_album(album_id, status="canceling", error=None)
        self._download_wake.set()
        try:
            asyncio.get_running_loop().create_task(self._notify_transfer_waiters())
        except RuntimeError:
            pass
        return True

    def _raise_if_cancelled(self, album_id: str) -> None:
        if album_id in self._cancelled_albums:
            raise DownloadCancelled(f"Download canceled for album {album_id}")

    async def _notify_transfer_waiters(self) -> None:
        async with self._transfer_condition:
            self._transfer_condition.notify_all()

    @asynccontextmanager
    async def _transfer_slot(self, album_id: str):
        async with self._transfer_condition:
            while (
                self._active_transfers
                >= self.database.get_settings().download_concurrency
            ):
                self._raise_if_cancelled(album_id)
                await self._transfer_condition.wait()
            self._raise_if_cancelled(album_id)
            self._active_transfers += 1
        try:
            yield
        finally:
            async with self._transfer_condition:
                self._active_transfers -= 1
                self._transfer_condition.notify_all()

    def status(self) -> dict[str, Any]:
        settings = self.database.get_settings()
        free_bytes = self.free_bytes(settings)
        pause_reason = "manual" if settings.paused else self.pause_reason
        current_albums = [
            album
            for album_id in sorted(self.current_album_ids)
            if (album := self.database.get_album(album_id)) is not None
        ]
        current_album = current_albums[0] if current_albums else None
        if pause_reason:
            state = "paused"
        elif current_albums and all(
            album["status"] == "canceling" for album in current_albums
        ):
            state = "canceling"
        elif current_albums:
            state = "downloading"
        elif self.scanning:
            state = "scanning"
        elif self._task and not self._task.done():
            state = "idle"
        else:
            state = self.state
        return {
            "state": state,
            "pause_reason": pause_reason,
            "current_album_id": self.current_album_id,
            "current_album": current_album,
            "current_albums": current_albums,
            "active_transfers": self._active_transfers,
            "metadata_album_id": self.metadata_album_id,
            "last_scan_at": self.database.get_setting("last_scan_at"),
            "baseline_complete": self.database.get_setting("baseline_complete", False),
            "free_bytes": free_bytes,
            "settings": settings.model_dump(),
        }

    async def run_forever(self) -> None:
        self.state = "starting"
        try:
            await asyncio.gather(
                self._scan_loop(),
                self._metadata_backfill_loop(),
                *(
                    self._download_slot_loop(slot)
                    for slot in range(10)
                ),
            )
        finally:
            self.scanning = False
            self.current_album_ids.clear()
            self.metadata_album_id = None
            self.state = "stopped"

    async def _scan_loop(self) -> None:
        while not self._stop.is_set():
            settings = self.database.get_settings()
            if settings.paused:
                await self._wait_for_wake(self._scan_wake, 5)
                continue
            self.scanning = True
            try:
                try:
                    await self.scan_once()
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    self.database.add_error("scanner", str(exc))
            finally:
                self.scanning = False
            await self._wait_for_wake(
                self._scan_wake,
                self.database.get_settings().poll_interval_seconds,
            )

    async def _download_slot_loop(self, slot: int) -> None:
        while not self._stop.is_set():
            settings = self.database.get_settings()
            if settings.paused or slot >= settings.album_concurrency:
                await self._wait_for_wake(self._download_wake, 1)
                continue
            if not self.has_disk_space(settings):
                self.pause_reason = "low_disk"
                await self._wait_for_wake(self._download_wake, 30)
                continue
            self.pause_reason = None
            try:
                processed = await self._process_one(settings)
            except LowDiskError:
                self.pause_reason = "low_disk"
                await self._wait_for_wake(self._download_wake, 30)
                continue
            if not processed:
                await self._wait_for_wake(self._download_wake, 1)

    async def _metadata_backfill_loop(self) -> None:
        while not self._stop.is_set():
            if self.database.get_settings().paused:
                await self._wait_for_wake(self._metadata_wake, 5)
                continue
            processed = False
            for row in self.database.completed_albums():
                if self._stop.is_set() or self.database.get_settings().paused:
                    break
                folder = Path(str(row["folder"]))
                if folder.name.startswith("📍"):
                    continue
                self.metadata_album_id = str(row["album_id"])
                try:
                    sidecar = folder / "media-metadata.json"
                    if sidecar.exists() and not sidecar_needs_refresh(sidecar):
                        has_location = await asyncio.to_thread(
                            sidecar_has_location, sidecar
                        )
                    else:
                        processed = True
                        outcome = await asyncio.to_thread(
                            backfill_album_metadata, folder
                        )
                        has_location = outcome["has_location"]
                    if has_location:
                        processed = True
                        self._pin_album_folder(str(row["album_id"]), folder)
                except Exception as exc:
                    self.database.add_error(
                        f"metadata:{row['album_id']}",
                        f"Could not extract existing media metadata: {exc}",
                    )
                finally:
                    self.metadata_album_id = None
                await self._sleep(0.25)
            await self._wait_for_wake(self._metadata_wake, 5 if processed else 60)

    def _pin_album_folder(self, album_id: str, folder: Path) -> Path:
        if folder.name.startswith("📍"):
            self.database.update_album(album_id, folder=str(folder))
            return folder
        destination = folder.with_name(f"📍 {folder.name}")
        if destination.exists():
            self.database.add_error(
                f"metadata:{album_id}",
                f"Could not add location pin because {destination.name} already exists",
            )
            return folder
        folder.rename(destination)
        self.database.update_album(album_id, folder=str(destination))
        return destination

    @staticmethod
    async def _wait_for_wake(event: asyncio.Event, timeout: float) -> None:
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
        except TimeoutError:
            pass
        finally:
            event.clear()

    async def scan_once(self) -> int:
        first_html = await self._request_page(FEED_URL)
        first_albums, max_page = parse_feed(first_html)
        if not self.database.get_setting("baseline_complete", False):
            self.database.add_feed_albums(first_albums, "baseline")
            for page in range(2, max_page + 1):
                html = await self._request_page(f"{FEED_URL}?page={page}")
                albums, _ = parse_feed(html)
                self.database.add_feed_albums(albums, "baseline")
            self.database.set_setting("baseline_complete", True)
            self.database.set_setting("last_scan_at", utc_now())
            return 0

        discovered: list[FeedAlbum] = []
        seen_during_scan: set[str] = set()
        page = 1
        albums = first_albums
        while True:
            ids = [album.album_id for album in albums]
            known = self.database.known_ids(ids)
            for album in albums:
                if album.album_id not in known and album.album_id not in seen_during_scan:
                    seen_during_scan.add(album.album_id)
                    discovered.append(album)
            if known or page >= max_page:
                break
            page += 1
            html = await self._request_page(f"{FEED_URL}?page={page}")
            albums, _ = parse_feed(html)

        inserted = self.database.add_feed_albums(list(reversed(discovered)), "queued")
        self.database.set_setting("last_scan_at", utc_now())
        return inserted

    async def process_queue(self) -> None:
        while not self._stop.is_set():
            settings = self.database.get_settings()
            if settings.paused:
                return
            if not self.has_disk_space(settings):
                raise LowDiskError("Downloads paused because free disk space is below the threshold")
            if not await self._process_one(settings):
                return

    async def _process_one(self, settings: Settings) -> bool:
        row = self.database.claim_next_queued()
        if row is None:
            return False
        album_id = str(row["album_id"])
        self.current_album_ids.add(album_id)
        try:
            await self.download_album(album_id, str(row["url"]), settings)
        except LowDiskError:
            self.database.update_album(album_id, status="queued")
            raise
        except ResourceGoneError:
            self.database.update_album(album_id, status="skipped", error=None)
            self.database.clear_errors(f"album:{album_id}")
        except PauseRequested:
            self.database.update_album(album_id, status="queued", error=None)
        except DownloadCancelled:
            row = self.database.get_album(album_id) or {}
            folder_value = row.get("folder")
            if folder_value:
                shutil.rmtree(Path(str(folder_value)), ignore_errors=True)
            self.database.cancel_album(album_id)
        except Exception as exc:
            self.database.fail_album(album_id, str(exc))
        finally:
            self._cancelled_albums.discard(album_id)
            self.current_album_ids.discard(album_id)
        return True

    async def download_album(self, album_id: str, url: str, settings: Settings) -> None:
        self._raise_if_cancelled(album_id)
        self.database.update_album(album_id, status="parsing", error=None)
        html = await self._request_page(url)
        self._raise_if_cancelled(album_id)
        album = parse_album(html, album_id, url)
        archive_root = Path(settings.archive_path)
        archive_root.mkdir(parents=True, exist_ok=True)
        folder = archive_root / album_folder_name(album.album_id, album.title)
        folder.mkdir(parents=True, exist_ok=True)
        self.database.set_album_page(album, str(folder))

        results: list[dict[str, Any] | None] = [None] * len(album.media)

        async def transfer(index: int, item: MediaItem) -> None:
            async with self._transfer_slot(album.album_id):
                self._raise_if_cancelled(album.album_id)
                filename = media_filename(index + 1, item)
                target = folder / filename
                self.database.register_file(
                    album.album_id,
                    filename,
                    kind=item.kind,
                    source_url=item.url,
                    preview_url=item.preview_url,
                )
                approval_state = self.database.file_approval_state(
                    album.album_id, filename
                )
                if approval_state == "skipped":
                    results[index] = {
                        "index": index + 1,
                        "kind": item.kind,
                        "source_url": item.url,
                        "filename": filename,
                        "bytes": 0,
                        "resolution": item.resolution or None,
                        "skipped": True,
                        "skip_reason": "Skipped by user because the file exceeds 500 MB",
                        "metadata": {},
                    }
                    return
                try:
                    response_headers = await self._download_file(
                        album.album_id,
                        item.url,
                        target,
                        settings,
                        referer=album.url,
                    )
                except FileApprovalRequired:
                    return
                self._raise_if_cancelled(album.album_id)
                extracted = await asyncio.to_thread(
                    extract_media_metadata,
                    target,
                    item.kind,
                    response_headers,
                )
                results[index] = {
                    "index": index + 1,
                    "kind": item.kind,
                    "source_url": item.url,
                    "filename": filename,
                    "bytes": target.stat().st_size,
                    "resolution": item.resolution or None,
                    "metadata": extracted,
                }

        tasks = [
            asyncio.create_task(transfer(index, item))
            for index, item in enumerate(album.media)
        ]
        try:
            await asyncio.gather(*tasks)
        except BaseException:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise
        self._raise_if_cancelled(album.album_id)
        if any(
            approval["album_id"] == album.album_id
            for approval in self.database.pending_approvals()
        ):
            self.database.update_album(album.album_id, status="awaiting_approval")
            return
        if any(
            result is not None and metadata_has_location(result["metadata"])
            for result in results
        ):
            folder = self._pin_album_folder(album.album_id, folder)
        album_row = self.database.get_album(album.album_id) or {}
        manifest = self._manifest(
            album,
            [result for result in results if result is not None],
            album_row.get("discovered_at"),
        )
        temporary_manifest = folder / "album.json.partial"
        temporary_manifest.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(temporary_manifest, folder / "album.json")
        metadata_sidecar = {
            "extractor_version": METADATA_VERSION,
            "album_id": album.album_id,
            "source_url": album.url,
            "generated_at": datetime.now(UTC).isoformat(),
            "files": [
                {
                    "index": result["index"],
                    "kind": result["kind"],
                    "source_url": result["source_url"],
                    **result["metadata"],
                }
                for result in results
                if result is not None
            ],
        }
        temporary_sidecar = folder / "media-metadata.json.partial"
        temporary_sidecar.write_text(
            json.dumps(metadata_sidecar, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        os.replace(temporary_sidecar, folder / "media-metadata.json")
        self.database.complete_album(album.album_id)

    async def _download_file(
        self,
        album_id: str,
        url: str,
        target: Path,
        settings: Settings,
        *,
        referer: str,
    ) -> dict[str, str]:
        filename = target.name
        self._raise_if_cancelled(album_id)
        if target.exists():
            size = target.stat().st_size
            self.database.set_file_expected(album_id, filename, size)
            self.database.set_file_downloaded(album_id, filename, size)
            self.database.complete_file(album_id, filename)
            return {}
        if self.database.file_approval_state(album_id, filename) == "pending":
            raise FileApprovalRequired(filename)
        partial = target.with_name(f"{target.name}.partial")
        initial_partial_size = partial.stat().st_size if partial.exists() else 0
        self.database.set_file_downloaded(album_id, filename, initial_partial_size)
        last_error: Exception | None = None
        for attempt in range(4):
            self._raise_if_cancelled(album_id)
            if self.database.get_settings().paused:
                raise PauseRequested("Download paused by the user")
            if not self.has_disk_space(settings):
                raise LowDiskError("Downloads paused because free disk space is below the threshold")
            offset = partial.stat().st_size if partial.exists() else 0
            headers = {"Accept": "*/*", "Referer": referer}
            if offset:
                headers["Range"] = f"bytes={offset}-"
            try:
                async with self.client.stream("GET", url, headers=headers) as response:
                    if response.status_code == 416 and self._partial_is_complete(response, offset):
                        self.database.set_file_expected(album_id, filename, offset)
                        self.database.set_file_downloaded(album_id, filename, offset)
                        os.replace(partial, target)
                        self.database.complete_file(album_id, filename)
                        return dict(response.headers)
                    if response.status_code == 429 or response.status_code >= 500:
                        retry_after = self._retry_after(response)
                        raise httpx.HTTPStatusError(
                            f"Transient HTTP {response.status_code}",
                            request=response.request,
                            response=response,
                        ) from RetryDelay(retry_after)
                    response.raise_for_status()
                    append = offset > 0 and response.status_code == 206
                    expected_bytes = self._response_total_bytes(response, offset)
                    if expected_bytes:
                        self.database.set_file_expected(
                            album_id, filename, expected_bytes
                        )
                    if (
                        expected_bytes > MAX_UNAPPROVED_BYTES
                        and self.database.file_approval_state(album_id, filename)
                        != "approved"
                    ):
                        self.database.request_file_approval(
                            album_id, filename, expected_bytes
                        )
                        raise FileApprovalRequired(filename)
                    if offset and not append:
                        self.database.set_file_downloaded(album_id, filename, 0)
                    mode = "ab" if append else "wb"
                    written_bytes = offset if append else 0
                    with partial.open(mode) as output:
                        async for chunk in response.aiter_bytes(256 * 1024):
                            self._raise_if_cancelled(album_id)
                            if self.database.get_settings().paused:
                                raise PauseRequested("Download paused by the user")
                            if not self.has_disk_space(settings):
                                raise LowDiskError(
                                    "Downloads paused because free disk space is below the threshold"
                                )
                            if (
                                not expected_bytes
                                and written_bytes + len(chunk) > MAX_UNAPPROVED_BYTES
                                and self.database.file_approval_state(
                                    album_id, filename
                                )
                                != "approved"
                            ):
                                self.database.request_file_approval(
                                    album_id,
                                    filename,
                                    written_bytes + len(chunk),
                                )
                                raise FileApprovalRequired(filename)
                            output.write(chunk)
                            written_bytes += len(chunk)
                            self.database.increment_file_downloaded(
                                album_id, filename, len(chunk)
                            )
                os.replace(partial, target)
                self.database.complete_file(album_id, filename)
                return dict(response.headers)
            except LowDiskError:
                raise
            except (httpx.HTTPError, OSError) as exc:
                last_error = exc
                if attempt == 3:
                    break
                delay = 2**attempt
                if isinstance(exc.__cause__, RetryDelay):
                    delay = max(delay, exc.__cause__.seconds)
                await self._sleep(delay)
        raise RuntimeError(f"Could not download {url}: {last_error}")

    async def _request_page(self, url: str) -> str:
        async with self._page_request_lock:
            return await self._request_page_locked(url)

    async def _request_page_locked(self, url: str) -> str:
        settings = self.database.get_settings()
        elapsed = time.monotonic() - self._last_page_request
        if elapsed < settings.page_delay_seconds:
            await self._sleep(settings.page_delay_seconds - elapsed)

        last_error: Exception | None = None
        for attempt in range(4):
            try:
                response = await self.client.get(url)
                self._last_page_request = time.monotonic()
                if response.status_code in {404, 410}:
                    raise ResourceGoneError(
                        f"Public resource is no longer available (HTTP {response.status_code})"
                    )
                if response.status_code == 429 or response.status_code >= 500:
                    await self._sleep(max(2**attempt, self._retry_after(response)))
                    continue
                response.raise_for_status()
                return response.text
            except httpx.HTTPError as exc:
                last_error = exc
                if attempt < 3:
                    await self._sleep(2**attempt)
        raise RuntimeError(f"Could not fetch {url}: {last_error or 'repeated server error'}")

    @staticmethod
    def _retry_after(response: httpx.Response) -> float:
        try:
            return min(300.0, max(0.0, float(response.headers.get("Retry-After", "0"))))
        except ValueError:
            return 0.0

    @staticmethod
    def _partial_is_complete(response: httpx.Response, offset: int) -> bool:
        content_range = response.headers.get("Content-Range", "")
        if not content_range.startswith("bytes */"):
            return False
        try:
            return int(content_range.removeprefix("bytes */")) == offset
        except ValueError:
            return False

    @staticmethod
    def _response_total_bytes(response: httpx.Response, offset: int) -> int:
        content_range = response.headers.get("Content-Range", "")
        if "/" in content_range:
            total = content_range.rsplit("/", 1)[-1]
            if total != "*":
                try:
                    return int(total)
                except ValueError:
                    pass
        try:
            content_length = int(response.headers.get("Content-Length", "0"))
        except ValueError:
            return 0
        if content_length <= 0:
            return 0
        return content_length + offset if response.status_code == 206 else content_length

    @staticmethod
    def _manifest(
        album: AlbumPage, files: list[dict[str, Any]], discovered_at: str | None
    ) -> dict[str, Any]:
        return {
            "album_id": album.album_id,
            "title": album.title,
            "author": album.author,
            "source_url": album.url,
            "discovered_at": discovered_at,
            "downloaded_at": datetime.now(UTC).isoformat(),
            "files": files,
        }

    @staticmethod
    def free_bytes(settings: Settings) -> int | None:
        path = Path(settings.archive_path)
        candidate = path
        while not candidate.exists() and candidate != candidate.parent:
            candidate = candidate.parent
        try:
            return shutil.disk_usage(candidate).free
        except OSError:
            return None

    def has_disk_space(self, settings: Settings) -> bool:
        free = self.free_bytes(settings)
        return free is None or free >= settings.minimum_free_bytes


class RetryDelay(Exception):
    def __init__(self, seconds: float):
        self.seconds = seconds
        super().__init__(f"retry after {seconds} seconds")
