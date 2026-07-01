"""Best-effort embedded metadata extraction for downloaded media."""

from __future__ import annotations

import hashlib
import json
import mimetypes
import os
from datetime import date, datetime, timedelta
from fractions import Fraction
from pathlib import Path
from typing import Any

from hachoir.metadata import extractMetadata
from hachoir.parser import createParser
from PIL import ExifTags, Image

HTTP_METADATA_HEADERS = {
    "accept-ranges",
    "content-disposition",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "last-modified",
}
METADATA_VERSION = 2


def extract_media_metadata(
    path: Path,
    kind: str,
    response_headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "extractor_version": METADATA_VERSION,
        "filename": path.name,
        "bytes": path.stat().st_size,
        "sha256": _sha256(path),
        "detected_mime_type": mimetypes.guess_type(path.name)[0],
        "http_headers": {
            key.lower(): value
            for key, value in (response_headers or {}).items()
            if key.lower() in HTTP_METADATA_HEADERS
        },
    }
    try:
        if kind == "image":
            result["embedded"] = _image_metadata(path)
        elif kind == "video":
            result["embedded"] = _video_metadata(path)
    except Exception as exc:
        result["extraction_error"] = f"{type(exc).__name__}: {exc}"
    return result


def metadata_has_location(metadata: dict[str, Any]) -> bool:
    embedded = metadata.get("embedded")
    if not isinstance(embedded, dict):
        return False

    exif_ifds = embedded.get("exif_ifds", {})
    gps = exif_ifds.get("GPSInfo", {}) if isinstance(exif_ifds, dict) else {}
    if isinstance(gps, dict):
        keys = {str(key).lower() for key in gps}
        if any("latitude" in key for key in keys) and any(
            "longitude" in key for key in keys
        ):
            return True

    fields = embedded.get("fields", {})
    if not isinstance(fields, dict):
        return False
    present = {
        str(key).lower()
        for key, value in fields.items()
        if value not in (None, "", [], {})
    }
    if "latitude" in present and "longitude" in present:
        return True
    return bool(present.intersection({"location", "city", "country", "gps_coordinates"}))


def sidecar_has_location(path: Path) -> bool:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    return any(
        isinstance(entry, dict) and metadata_has_location(entry)
        for entry in payload.get("files", [])
    )


def sidecar_needs_refresh(path: Path) -> bool:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return True
    return payload.get("extractor_version") != METADATA_VERSION


def backfill_album_metadata(folder: Path) -> dict[str, bool]:
    manifest_path = folder / "album.json"
    if not manifest_path.exists():
        return {"processed": False, "has_location": False}
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = manifest.get("files")
    if not isinstance(files, list):
        return {"processed": False, "has_location": False}

    sidecar_files: list[dict[str, Any]] = []
    changed = False
    for entry in files:
        if not isinstance(entry, dict):
            continue
        filename = entry.get("filename")
        kind = entry.get("kind")
        if not isinstance(filename, str) or kind not in {"image", "video"}:
            continue
        media_path = folder / filename
        if not media_path.is_file():
            continue
        metadata = entry.get("metadata")
        if (
            not isinstance(metadata, dict)
            or metadata.get("extractor_version") != METADATA_VERSION
        ):
            metadata = extract_media_metadata(media_path, kind)
            entry["metadata"] = metadata
            changed = True
        sidecar_files.append(
            {
                "index": entry.get("index"),
                "kind": kind,
                "source_url": entry.get("source_url"),
                **metadata,
            }
        )

    sidecar = {
        "extractor_version": METADATA_VERSION,
        "album_id": manifest.get("album_id"),
        "source_url": manifest.get("source_url"),
        "generated_at": datetime.now().astimezone().isoformat(),
        "files": sidecar_files,
    }
    _write_json_atomic(folder / "media-metadata.json", sidecar)
    if changed:
        _write_json_atomic(manifest_path, manifest)
    return {
        "processed": True,
        "has_location": any(metadata_has_location(entry) for entry in sidecar_files),
    }


def _write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    temporary = path.with_name(f"{path.name}.partial")
    temporary.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    os.replace(temporary, path)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _image_metadata(path: Path) -> dict[str, Any]:
    with Image.open(path) as image:
        metadata: dict[str, Any] = {
            "format": image.format,
            "mime_type": Image.MIME.get(image.format or ""),
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
            "frames": getattr(image, "n_frames", 1),
            "animated": bool(getattr(image, "is_animated", False)),
            "info": {
                str(key): _json_safe(value)
                for key, value in image.info.items()
                if key != "exif"
            },
            "exif": {},
        }
        exif = image.getexif()
        if exif:
            metadata["exif"] = {
                ExifTags.TAGS.get(tag, str(tag)): _json_safe(value)
                for tag, value in exif.items()
            }
            ifd_groups: dict[str, Any] = {}
            for name in ("Exif", "GPSInfo", "Interop"):
                ifd_id = getattr(ExifTags.IFD, name, None)
                if ifd_id is None:
                    continue
                try:
                    values = exif.get_ifd(ifd_id)
                except (KeyError, TypeError, ValueError):
                    continue
                if not values:
                    continue
                tags = ExifTags.GPSTAGS if name == "GPSInfo" else ExifTags.TAGS
                ifd_groups[name] = {
                    tags.get(tag, str(tag)): _json_safe(value)
                    for tag, value in values.items()
                }
            if ifd_groups:
                metadata["exif_ifds"] = ifd_groups
        return metadata


def _video_metadata(path: Path) -> dict[str, Any]:
    parser = createParser(str(path))
    if parser is None:
        raise ValueError("No compatible video/container parser found")
    metadata = extractMetadata(parser, quality=1.0)
    if metadata is None:
        raise ValueError("No embedded video metadata found")

    structured: dict[str, Any] = {}
    for key in (
        "title",
        "artist",
        "author",
        "duration",
        "width",
        "height",
        "frame_rate",
        "bit_rate",
        "aspect_ratio",
        "pixel_format",
        "compression",
        "mime_type",
        "creation_date",
        "last_modification",
        "copyright",
        "producer",
        "comment",
        "location",
        "latitude",
        "longitude",
        "altitude",
        "city",
        "country",
    ):
        try:
            value = metadata.get(key)
        except (KeyError, TypeError, ValueError):
            continue
        if value is not None:
            structured[key] = _json_safe(value)
    return {
        "fields": structured,
        "formatted": _json_safe(metadata.exportDictionary().get("Metadata", {})),
    }


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, timedelta):
        return value.total_seconds()
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Fraction):
        return {"numerator": value.numerator, "denominator": value.denominator}
    if isinstance(value, bytes):
        if len(value) <= 256:
            return {"encoding": "hex", "value": value.hex()}
        return {
            "type": "bytes",
            "length": len(value),
            "sha256": hashlib.sha256(value).hexdigest(),
        }
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    numerator = getattr(value, "numerator", None)
    denominator = getattr(value, "denominator", None)
    if isinstance(numerator, int) and isinstance(denominator, int):
        return {"numerator": numerator, "denominator": denominator}
    return str(value)
