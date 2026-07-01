import hashlib
import json

from PIL import Image

from erome_archiver.metadata import (
    backfill_album_metadata,
    extract_media_metadata,
    metadata_has_location,
)


def test_image_metadata_includes_hash_dimensions_exif_and_http_headers(tmp_path):
    path = tmp_path / "photo.jpg"
    image = Image.new("RGB", (12, 8), color=(20, 40, 60))
    exif = Image.Exif()
    exif[271] = "Test Camera Company"
    exif[272] = "Test Camera Model"
    exif[34853] = {
        1: "N",
        2: (41.0, 52.0, 0.0),
        3: "W",
        4: (87.0, 38.0, 0.0),
    }
    image.save(path, format="JPEG", exif=exif)

    metadata = extract_media_metadata(
        path,
        "image",
        {
            "Content-Type": "image/jpeg",
            "ETag": '"test-etag"',
            "Server": "not-preserved",
        },
    )

    assert metadata["sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
    assert metadata["embedded"]["width"] == 12
    assert metadata["embedded"]["height"] == 8
    assert metadata["embedded"]["exif"]["Make"] == "Test Camera Company"
    assert metadata["embedded"]["exif"]["Model"] == "Test Camera Model"
    assert metadata_has_location(metadata) is True
    assert metadata["http_headers"] == {
        "content-type": "image/jpeg",
        "etag": '"test-etag"',
    }


def test_invalid_video_metadata_is_nonfatal_and_keeps_file_facts(tmp_path):
    path = tmp_path / "broken.mp4"
    path.write_bytes(b"not an mp4")

    metadata = extract_media_metadata(path, "video")

    assert metadata["bytes"] == 10
    assert len(metadata["sha256"]) == 64
    assert metadata["detected_mime_type"] == "video/mp4"
    assert "extraction_error" in metadata


def test_backfill_enriches_existing_manifest_and_writes_sidecar(tmp_path):
    folder = tmp_path / "Album1 - Existing"
    folder.mkdir()
    image_path = folder / "001_photo.png"
    Image.new("RGB", (4, 3), color="red").save(image_path)
    manifest = {
        "album_id": "Album1",
        "source_url": "https://www.erome.com/a/Album1",
        "files": [
            {
                "index": 1,
                "kind": "image",
                "source_url": "https://cdn.example/photo.png",
                "filename": image_path.name,
            }
        ],
    }
    (folder / "album.json").write_text(json.dumps(manifest), encoding="utf-8")

    outcome = backfill_album_metadata(folder)

    updated = json.loads((folder / "album.json").read_text())
    sidecar = json.loads((folder / "media-metadata.json").read_text())
    assert outcome == {"processed": True, "has_location": False}
    assert updated["files"][0]["metadata"]["embedded"]["width"] == 4
    assert sidecar["album_id"] == "Album1"
    assert sidecar["files"][0]["sha256"] == updated["files"][0]["metadata"]["sha256"]


def test_location_detection_requires_coordinates_or_location_fields():
    image_metadata = {
        "embedded": {
            "exif_ifds": {
                "GPSInfo": {
                    "GPSLatitude": [41, 52, 0],
                    "GPSLongitude": [87, 38, 0],
                }
            }
        }
    }
    video_metadata = {
        "embedded": {"fields": {"latitude": 41.8, "longitude": -87.6}}
    }
    unrelated = {"embedded": {"fields": {"width": 1920, "height": 1080}}}

    assert metadata_has_location(image_metadata) is True
    assert metadata_has_location(video_metadata) is True
    assert metadata_has_location(unrelated) is False
