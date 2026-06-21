#!/usr/bin/env python3
"""
Generate static MP3 narration files for The Super Book using Piper TTS.

Run from the project folder:
  python3 generate_audio.py

Optional:
  python3 generate_audio.py --model ~/piper-voices/en_US-lessac-medium.onnx
  python3 generate_audio.py --html index.html
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("Missing dependency: beautifulsoup4")
    print("Install it with: python3 -m pip install beautifulsoup4")
    sys.exit(1)


def slugify(text: str) -> str:
    text = text.lower().replace("&", "and")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:70].strip("-") or "chapter"


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    # Piper reads some symbols awkwardly; make them audiobook-friendly.
    replacements = {
        "—": ", ",
        "–": ", ",
        "…": "...",
        "“": '"',
        "”": '"',
        "‘": "'",
        "’": "'",
        "✦": "",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def extract_chapters(html_path: Path, text_dir: Path) -> list[tuple[int, str, Path, Path]]:
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    text_dir.mkdir(parents=True, exist_ok=True)
    chapters = []

    for index, chapter in enumerate(soup.select(".chapter"), start=1):
        title_el = chapter.select_one(".chapter-title")
        title = title_el.get_text(" ", strip=True) if title_el else f"Chapter {index}"
        base = f"chapter-{index:02d}-{slugify(title)}"
        txt_path = text_dir / f"{base}.txt"
        mp3_path = Path("audio") / f"{base}.mp3"

        clone = BeautifulSoup(str(chapter), "html.parser")
        # Remove audio UI if the updated HTML already contains it.
        for audio_panel in clone.select(".audio-panel"):
            audio_panel.decompose()
        # Skip labels/citations that sound weird in narration.
        for tag in clone.select(".chapter-rule, .insight-label"):
            tag.decompose()

        body_text = clean_text(clone.get_text("\n", strip=True))
        txt_path.write_text(body_text + "\n", encoding="utf-8")
        chapters.append((index, title, txt_path, mp3_path))

    return chapters


def run(cmd: list[str], *, input_text: str | None = None) -> None:
    result = subprocess.run(cmd, input=input_text, text=True)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--html", default="index.html", help="Path to the website HTML file")
    parser.add_argument("--model", default="~/piper-voices/en_US-lessac-medium.onnx", help="Path to Piper .onnx voice model")
    parser.add_argument("--output", default="audio", help="Output audio folder")
    parser.add_argument("--text", default="narration_text", help="Extracted narration text folder")
    parser.add_argument("--force", action="store_true", help="Regenerate files even if MP3 already exists")
    args = parser.parse_args()

    html_path = Path(args.html).expanduser()
    model_path = Path(args.model).expanduser()
    output_dir = Path(args.output).expanduser()
    text_dir = Path(args.text).expanduser()

    if not html_path.exists():
        print(f"HTML file not found: {html_path}")
        sys.exit(1)
    if not model_path.exists():
        print(f"Piper model not found: {model_path}")
        sys.exit(1)
    if shutil.which("ffmpeg") is None:
        print("ffmpeg is required for MP3 conversion.")
        print("Install it with: brew install ffmpeg")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)
    chapters = extract_chapters(html_path, text_dir)

    print(f"Found {len(chapters)} sections.")
    for index, title, txt_path, mp3_rel in chapters:
        mp3_path = Path(mp3_rel)
        wav_path = output_dir / (mp3_path.stem + ".wav")
        mp3_path = output_dir / mp3_path.name

        if mp3_path.exists() and not args.force:
            print(f"Skipping existing: {mp3_path}")
            continue

        print(f"Generating {index:02d}: {title}")
        text = txt_path.read_text(encoding="utf-8")

        run([
            sys.executable, "-m", "piper",
            "--model", str(model_path),
            "--output_file", str(wav_path),
        ], input_text=text)

        run([
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", str(wav_path),
            "-codec:a", "libmp3lame",
            "-qscale:a", "2",
            str(mp3_path),
        ])

        wav_path.unlink(missing_ok=True)
        print(f"Saved: {mp3_path}")

    print("Done. Open index.html in your browser and press the Listen buttons.")


if __name__ == "__main__":
    main()
