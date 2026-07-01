"""Domain models and settings for the archiver."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator


@dataclass(frozen=True)
class FeedAlbum:
    album_id: str
    url: str


@dataclass(frozen=True)
class MediaItem:
    kind: str
    url: str
    resolution: int = 0
    preview_url: str | None = None

    @property
    def remote_name(self) -> str:
        return Path(urlsplit(self.url).path).name or f"media.{self.kind}"


@dataclass
class AlbumPage:
    album_id: str
    url: str
    title: str
    author: str
    media: list[MediaItem] = field(default_factory=list)


class Settings(BaseModel):
    archive_path: str = str(Path.home() / "Downloads" / "Erome Archive")
    poll_interval_seconds: int = Field(default=120, ge=5, le=86_400)
    minimum_free_bytes: int = Field(default=10 * 1024**3, ge=1024**3)
    page_delay_seconds: float = Field(default=1.0, ge=0, le=60)
    download_concurrency: int = Field(default=10, ge=1, le=10)
    album_concurrency: int = Field(default=3, ge=1, le=10)
    paused: bool = False

    @field_validator("archive_path")
    @classmethod
    def normalize_archive_path(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("archive_path cannot be empty")
        return str(Path(value).expanduser().resolve())
