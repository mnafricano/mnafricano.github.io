# Super Book Piper TTS Setup

This folder contains an updated static website with chapter-level audio controls.

## Files

- `index.html` — updated Super Book site with Listen buttons
- `generate_audio.py` — extracts narration text and generates MP3 files with Piper
- `audio/` — generated MP3 files go here
- `narration_text/` — extracted text files go here

## Run on your Mac

```bash
cd path/to/super_book_tts_site
python3 -m pip install beautifulsoup4
brew install ffmpeg
python3 generate_audio.py
open index.html
```

The script assumes your voice is here:

```txt
~/piper-voices/en_US-lessac-medium.onnx
```

To use a different Piper voice:

```bash
python3 generate_audio.py --model ~/piper-voices/YOUR-VOICE.onnx
```

To regenerate everything:

```bash
python3 generate_audio.py --force
```
