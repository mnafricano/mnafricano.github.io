"""Isolated HTML selectors for Erome's public feed and album pages."""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlsplit

from bs4 import BeautifulSoup

from erome_archiver.models import AlbumPage, FeedAlbum, MediaItem

ALBUM_PATH = re.compile(r"^/a/([A-Za-z0-9]+)$")


class ParseError(ValueError):
    """Raised when a public page no longer has the expected structure."""


def parse_feed(html: str, base_url: str = "https://www.erome.com") -> tuple[list[FeedAlbum], int]:
    soup = BeautifulSoup(html, "html.parser")
    albums: list[FeedAlbum] = []
    seen: set[str] = set()
    for anchor in soup.select('a[href*="/a/"]'):
        href = str(anchor.get("href", "")).strip()
        absolute = urljoin(base_url, href)
        match = ALBUM_PATH.match(urlsplit(absolute).path.rstrip("/"))
        if not match:
            continue
        album_id = match.group(1)
        if album_id in seen:
            continue
        seen.add(album_id)
        albums.append(FeedAlbum(album_id=album_id, url=f"https://www.erome.com/a/{album_id}"))

    max_page = 1
    for anchor in soup.select('a[href*="page="]'):
        query = parse_qs(urlsplit(str(anchor.get("href", ""))).query)
        try:
            max_page = max(max_page, int(query.get("page", ["1"])[0]))
        except (TypeError, ValueError):
            continue
    return albums, max_page


def parse_album(html: str, album_id: str, url: str) -> AlbumPage:
    soup = BeautifulSoup(html, "html.parser")
    title_node = soup.select_one("h1.album-title-page")
    content = soup.select_one(f"#album_{album_id}")
    if title_node is None or content is None:
        raise ParseError(f"Album {album_id} is missing its title or media container")

    author_node = soup.select_one("#user_name")
    author = author_node.get_text(" ", strip=True) if author_node else "unknown"
    media: list[MediaItem] = []
    seen_urls: set[str] = set()

    for group in content.select(".media-group"):
        image = group.select_one(".img[data-src]")
        if image is not None:
            source = str(image.get("data-src", "")).strip()
            if source and source not in seen_urls:
                preview_node = group.select_one("img[src]")
                preview = (
                    str(preview_node.get("src", "")).strip()
                    if preview_node is not None
                    else ""
                )
                seen_urls.add(source)
                media.append(
                    MediaItem(
                        kind="image",
                        url=source,
                        preview_url=(
                            urljoin(url, preview)
                            if preview and preview != source
                            else None
                        ),
                    )
                )
            continue

        candidates: list[MediaItem] = []
        video_node = group.select_one("video")
        poster = (
            str(video_node.get("poster", "")).strip()
            if video_node is not None
            else ""
        )
        for source_node in group.select("video source[src]"):
            source = str(source_node.get("src", "")).strip()
            try:
                resolution = int(source_node.get("res", 0) or 0)
            except (TypeError, ValueError):
                resolution = 0
            if source:
                candidates.append(
                    MediaItem(
                        kind="video",
                        url=source,
                        resolution=resolution,
                        preview_url=urljoin(url, poster) if poster else None,
                    )
                )
        if candidates:
            best = max(candidates, key=lambda item: item.resolution)
            if best.url not in seen_urls:
                seen_urls.add(best.url)
                media.append(best)

    if not media:
        raise ParseError(f"Album {album_id} contains no downloadable public media")
    return AlbumPage(
        album_id=album_id,
        url=url,
        title=title_node.get_text(" ", strip=True),
        author=author,
        media=media,
    )


def safe_component(value: str, max_length: int = 100) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    normalized = re.sub(r"[\x00-\x1f/:*?\"<>|]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip(" .")
    return (normalized[:max_length].rstrip(" .") or "untitled")


def album_folder_name(album_id: str, title: str) -> str:
    return f"{safe_component(album_id, 32)} - {safe_component(title)}"


def media_filename(index: int, item: MediaItem) -> str:
    name = safe_component(Path(item.remote_name).stem, 80)
    suffix = Path(item.remote_name).suffix.lower()
    if not suffix:
        suffix = ".mp4" if item.kind == "video" else ".jpg"
    return f"{index:03d}_{name}{suffix}"
