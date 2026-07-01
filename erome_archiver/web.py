"""Local-only FastAPI dashboard."""

from __future__ import annotations

import hashlib
import json
import mimetypes
import random
import shutil
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import AsyncIterator
from urllib.parse import quote

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, HTMLResponse, Response
from PIL import Image, ImageOps
from pydantic import BaseModel

from erome_archiver.database import Database
from erome_archiver.installer import application_support_dir, database_path
from erome_archiver.metadata import metadata_has_location, sidecar_has_location
from erome_archiver.models import Settings
from erome_archiver.service import ArchiverWorker


class ApprovalAction(BaseModel):
    decision: str


class DeleteConfirmation(BaseModel):
    confirm_album_id: str


class CancelDownload(BaseModel):
    album_id: str


def create_app(
    state_path: Path | None = None,
    *,
    start_worker: bool = True,
    worker: ArchiverWorker | None = None,
) -> FastAPI:
    database = worker.database if worker else Database(state_path or database_path())
    active_worker = worker or ArchiverWorker(database)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if start_worker:
            await active_worker.start()
        yield
        if start_worker:
            await active_worker.stop()

    app = FastAPI(title="Erome Public-Feed Archiver", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"]
    )
    app.state.database = database
    app.state.worker = active_worker

    @app.get("/", response_class=HTMLResponse, response_model=None)
    async def index() -> HTMLResponse:
        return HTMLResponse(DASHBOARD_HTML)

    @app.get("/library", response_class=HTMLResponse, response_model=None)
    async def library() -> HTMLResponse:
        return HTMLResponse(LIBRARY_HTML)

    @app.get("/feed", response_class=HTMLResponse, response_model=None)
    async def feed() -> HTMLResponse:
        return HTMLResponse(FEED_HTML)

    @app.get("/api/status")
    async def status() -> dict:
        return {**active_worker.status(), **database.dashboard_data()}

    @app.put("/api/settings")
    async def update_settings(settings: Settings) -> dict:
        database.save_settings(settings)
        active_worker.wake()
        return settings.model_dump()

    @app.post("/api/pause")
    async def pause() -> dict:
        settings = database.get_settings().model_copy(update={"paused": True})
        database.save_settings(settings)
        active_worker.wake()
        return {"paused": True}

    @app.post("/api/resume")
    async def resume() -> dict:
        settings = database.get_settings().model_copy(update={"paused": False})
        database.save_settings(settings)
        active_worker.wake()
        return {"paused": False}

    @app.post("/api/scan-now", status_code=202)
    async def scan_now() -> dict:
        active_worker.wake()
        return {"accepted": True}

    @app.post("/api/cancel-download", status_code=202)
    async def cancel_download(request: CancelDownload) -> dict:
        if not active_worker.cancel_download(request.album_id):
            raise HTTPException(status_code=409, detail="That album is not downloading")
        return {"accepted": True, "album_id": request.album_id}

    @app.post("/api/retry-failed")
    async def retry_failed() -> dict:
        count = database.retry_failed()
        active_worker.wake()
        return {"retried": count}

    @app.post("/api/clear-errors")
    async def clear_errors() -> dict:
        return {"cleared": database.clear_errors()}

    @app.post("/api/approvals/{album_id}/{filename:path}")
    async def decide_approval(
        album_id: str, filename: str, action: ApprovalAction
    ) -> dict:
        if action.decision not in {"approved", "skipped"}:
            raise HTTPException(
                status_code=422, detail="Decision must be approved or skipped"
            )
        if not database.decide_file(album_id, filename, action.decision):
            raise HTTPException(status_code=404, detail="Pending approval not found")
        active_worker.wake()
        return {"album_id": album_id, "filename": filename, "decision": action.decision}

    @app.get("/api/approval-preview/{album_id}/{filename:path}")
    async def approval_preview(album_id: str, filename: str) -> Response:
        approval = next(
            (
                item
                for item in database.pending_approvals()
                if item["album_id"] == album_id and item["filename"] == filename
            ),
            None,
        )
        if approval is None or not approval.get("preview_url"):
            raise HTTPException(status_code=404, detail="Preview unavailable")
        headers = {"Accept": "image/*", "Referer": str(approval["album_url"])}
        limit = 10 * 1024**2
        chunks: list[bytes] = []
        total = 0
        try:
            async with active_worker.client.stream(
                "GET", str(approval["preview_url"]), headers=headers
            ) as remote:
                remote.raise_for_status()
                media_type = remote.headers.get("Content-Type", "").split(";", 1)[0]
                if not media_type.startswith("image/"):
                    raise HTTPException(status_code=404, detail="Preview unavailable")
                try:
                    announced_size = int(remote.headers.get("Content-Length", "0"))
                except ValueError:
                    announced_size = 0
                if announced_size > limit:
                    raise HTTPException(status_code=413, detail="Preview is too large")
                async for chunk in remote.aiter_bytes(128 * 1024):
                    total += len(chunk)
                    if total > limit:
                        raise HTTPException(status_code=413, detail="Preview is too large")
                    chunks.append(chunk)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=404, detail="Preview unavailable") from exc
        return Response(
            b"".join(chunks),
            media_type=media_type,
            headers={"Cache-Control": "private, max-age=3600"},
        )

    @app.get("/api/library")
    async def library_albums(
        q: str = "",
        limit: int = Query(default=12, ge=1, le=50),
        offset: int = Query(default=0, ge=0),
    ) -> dict:
        total, rows = database.library_albums(q, limit, offset)
        albums = [
            album
            for row in rows
            if (album := _album_payload(row)) is not None
        ]
        return {
            "total": total,
            "offset": offset,
            "limit": limit,
            "albums": albums,
        }

    @app.get("/api/feed")
    async def random_feed(
        limit: int = Query(default=24, ge=1, le=60),
    ) -> dict:
        albums = [
            album
            for row in database.random_completed_albums(max(40, limit * 2))
            if (album := _album_payload(row)) is not None
        ]
        items = [
            {
                **file,
                "album_id": album["album_id"],
                "album_title": album["title"],
                "author": album["author"],
                "album_size": len(album["files"]),
                "has_location": album["has_location"] or file["has_location"],
            }
            for album in albums
            for file in album["files"]
        ]
        random.SystemRandom().shuffle(items)
        return {"items": items[:limit]}

    @app.get("/api/albums/{album_id}")
    async def album_details(album_id: str) -> dict:
        row = database.get_album(album_id)
        if row is None or row["status"] != "completed" or not row.get("folder"):
            raise HTTPException(status_code=404, detail="Album not found")
        album = _album_payload(row)
        if album is None:
            raise HTTPException(status_code=404, detail="Album not found")
        return album

    @app.delete("/api/albums/{album_id}")
    async def delete_album(
        album_id: str, confirmation: DeleteConfirmation
    ) -> dict:
        if confirmation.confirm_album_id != album_id:
            raise HTTPException(status_code=422, detail="Album confirmation does not match")
        row = database.get_album(album_id)
        if row is None or row["status"] != "completed" or not row.get("folder"):
            raise HTTPException(status_code=404, detail="Album not found")
        folder = Path(str(row["folder"]))
        if folder.is_symlink() or not folder.is_dir():
            raise HTTPException(status_code=409, detail="Album folder is unavailable")
        manifest = _read_manifest(folder)
        if manifest is None or str(manifest.get("album_id")) != album_id:
            raise HTTPException(
                status_code=409, detail="Album folder could not be safely verified"
            )
        try:
            shutil.rmtree(folder)
        except OSError as exc:
            raise HTTPException(
                status_code=500, detail=f"Could not delete album folder: {exc}"
            ) from exc
        database.mark_album_deleted(album_id)
        cache_folder = application_support_dir() / "thumbnails" / album_id
        with suppress(OSError):
            shutil.rmtree(cache_folder)
        return {"deleted": True, "album_id": album_id}

    @app.get("/api/media/{album_id}/{filename:path}")
    async def media(album_id: str, filename: str) -> FileResponse:
        path, _ = _verified_media_path(database, album_id, filename)
        return FileResponse(path, media_type=mimetypes.guess_type(path.name)[0])

    @app.get("/api/thumbnail/{album_id}/{filename:path}")
    def thumbnail(album_id: str, filename: str) -> FileResponse:
        path, kind = _verified_media_path(database, album_id, filename)
        if kind != "image":
            raise HTTPException(status_code=404, detail="Thumbnail unavailable")
        cache_name = hashlib.sha256(f"{album_id}/{filename}".encode()).hexdigest() + ".jpg"
        cache_path = application_support_dir() / "thumbnails" / album_id / cache_name
        if not cache_path.exists():
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            temporary = cache_path.with_suffix(".partial")
            with Image.open(path) as image:
                frame = ImageOps.exif_transpose(image)
                frame.thumbnail((640, 640))
                if frame.mode not in {"RGB", "L"}:
                    frame = frame.convert("RGB")
                frame.save(temporary, format="JPEG", quality=84, optimize=True)
            temporary.replace(cache_path)
        return FileResponse(cache_path, media_type="image/jpeg")

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):
        database.add_error("api", str(exc))
        raise exc

    return app


app = create_app()


def _read_manifest(folder: Path) -> dict | None:
    try:
        payload = json.loads((folder / "album.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _album_payload(row: dict) -> dict | None:
    folder = Path(str(row["folder"]))
    manifest = _read_manifest(folder)
    if manifest is None:
        return None
    files = []
    for entry in manifest.get("files", []):
        if not isinstance(entry, dict):
            continue
        filename = entry.get("filename")
        kind = entry.get("kind")
        if not isinstance(filename, str) or kind not in {"image", "video"}:
            continue
        if not (folder / filename).is_file():
            continue
        encoded_id = quote(str(row["album_id"]), safe="")
        encoded_name = quote(filename, safe="")
        metadata = entry.get("metadata")
        files.append(
            {
                "filename": filename,
                "kind": kind,
                "bytes": entry.get("bytes", 0),
                "has_location": (
                    metadata_has_location(metadata)
                    if isinstance(metadata, dict)
                    else False
                ),
                "media_url": f"/api/media/{encoded_id}/{encoded_name}",
                "thumbnail_url": (
                    f"/api/thumbnail/{encoded_id}/{encoded_name}"
                    if kind == "image"
                    else None
                ),
            }
        )
    return {
        "album_id": row["album_id"],
        "title": row.get("title") or manifest.get("title") or row["album_id"],
        "author": row.get("author") or manifest.get("author") or "unknown",
        "completed_at": row.get("completed_at"),
        "folder_name": folder.name,
        "has_location": folder.name.startswith("📍")
        or sidecar_has_location(folder / "media-metadata.json")
        or any(file["has_location"] for file in files),
        "files": files,
    }


def _verified_media_path(
    database: Database, album_id: str, filename: str
) -> tuple[Path, str]:
    row = database.get_album(album_id)
    if row is None or row["status"] != "completed" or not row.get("folder"):
        raise HTTPException(status_code=404, detail="Media not found")
    folder = Path(str(row["folder"])).resolve()
    manifest = _read_manifest(folder)
    if manifest is None:
        raise HTTPException(status_code=404, detail="Media not found")
    allowed = {
        str(entry.get("filename")): str(entry.get("kind"))
        for entry in manifest.get("files", [])
        if isinstance(entry, dict)
    }
    if filename not in allowed:
        raise HTTPException(status_code=404, detail="Media not found")
    path = (folder / filename).resolve()
    if path.parent != folder or not path.is_file():
        raise HTTPException(status_code=404, detail="Media not found")
    return path, allowed[filename]


DASHBOARD_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Erome Archiver</title>
  <style>
    :root { color-scheme: dark; --bg:#101114; --panel:#191b20; --line:#30343c;
      --text:#f4f0e8; --muted:#9da4b1; --accent:#75d6c7; --warn:#f1c75b; --bad:#ff8297; }
    * { box-sizing:border-box } body { margin:0; background:var(--bg); color:var(--text);
      font:15px/1.45 Inter,system-ui,-apple-system,sans-serif }
    main { width:min(1120px,calc(100% - 32px)); margin:auto; padding:28px 0 48px }
    header,.actions,.row { display:flex; gap:12px; align-items:center; justify-content:space-between }
    .actions .row { flex-wrap:wrap; justify-content:flex-end }
    .header-actions { display:flex; gap:10px; align-items:center }
    .nav-link { color:var(--text); text-decoration:none; padding:8px 12px;
      border:1px solid var(--line); border-radius:999px; font-weight:700 }
    h1 { margin:0; font-size:clamp(28px,5vw,52px); letter-spacing:-.04em }
    h2 { font-size:16px; margin:0 0 14px } p { color:var(--muted) }
    .pill { padding:8px 12px; border:1px solid var(--line); border-radius:999px }
    .grid { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin:22px 0 }
    .card { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px }
    .metric { font-size:30px; font-weight:750; display:block }
    .label { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.08em }
    .columns { display:grid; grid-template-columns:2fr 1fr; gap:12px }
    .activity-card { margin-top:12px }
    .activity-card>strong { display:block; margin-bottom:10px }
    .activity-list { display:grid; gap:8px }
    .activity-row { display:grid; grid-template-columns:minmax(0,1fr) auto;
      gap:12px; align-items:center; padding-top:10px; border-top:1px solid var(--line) }
    .activity-row:first-child { padding-top:0; border-top:0 }
    .activity-copy>span { color:var(--muted); overflow-wrap:anywhere }
    .progress-track { height:7px; margin-top:7px; border-radius:999px; overflow:hidden;
      background:#0c0e12; border:1px solid var(--line) }
    .progress-track>span { display:block; height:100%; border-radius:inherit;
      background:var(--accent); transition:width .3s ease }
    .progress-track.compact { min-width:110px; margin-top:5px; height:6px }
    button,input { border:1px solid var(--line); border-radius:8px; padding:10px 12px;
      background:#111319; color:var(--text); font:inherit }
    button { cursor:pointer; background:var(--accent); color:#09201c; border:0; font-weight:700 }
    button:disabled { cursor:wait; opacity:.65 }
    button.secondary { background:#282c34; color:var(--text) } button.warn { background:var(--warn) }
    button.danger { background:#4a202a; color:#ffbdc8; border:1px solid #ff829755 }
    label { display:block; color:var(--muted); margin:10px 0 5px } input { width:100% }
    table { width:100%; border-collapse:collapse } th,td { text-align:left; padding:10px 8px;
      border-bottom:1px solid var(--line); font-size:13px } th { color:var(--muted) }
    td:first-child { max-width:440px; overflow:hidden; text-overflow:ellipsis }
    .job-status { display:inline-block; padding:3px 7px; border-radius:999px;
      background:#282c34; font-size:12px }
    .job-status.downloading,.job-status.parsing { color:var(--accent) }
    .job-status.canceling { color:var(--bad) }
    .job-status.awaiting_approval { color:var(--warn) }
    .job-status.failed { color:var(--bad) }
    .approval-heading { display:flex; justify-content:space-between; gap:16px; align-items:start }
    .approval-heading p { margin:2px 0 0 }
    .approval-grid { display:grid; gap:12px; margin-top:14px }
    .approval-card { display:grid; grid-template-columns:180px minmax(0,1fr); gap:16px;
      padding:12px; border:1px solid var(--line); border-radius:10px; background:#111319 }
    .approval-preview { width:100%; aspect-ratio:16/10; object-fit:contain; border-radius:8px;
      background:#08090b; border:1px solid var(--line) }
    .approval-placeholder { display:grid; place-items:center; color:var(--muted); font-size:32px }
    .approval-copy h3 { margin:0 0 4px; font-size:16px }
    .approval-copy p { margin:4px 0 }
    .approval-actions { display:flex; gap:8px; margin-top:12px }
    .scroll { overflow:auto; max-height:440px } .error { color:var(--bad); overflow-wrap:anywhere }
    .notice { min-height:20px; margin:8px 0 0; font-size:13px }
    .notice.ok { color:var(--accent) } .notice.bad { color:var(--bad) }
    .help { display:block; margin-top:5px; line-height:1.35 }
    small { color:var(--muted) }
    @media(max-width:760px){header,.actions{align-items:flex-start;flex-direction:column}
      .grid{grid-template-columns:1fr 1fr}.columns{grid-template-columns:1fr}
      .approval-card{grid-template-columns:1fr}.activity-row{grid-template-columns:1fr}}
  </style>
</head>
<body><main>
  <header><div><h1>Public-Feed Archiver</h1><p>Public albums, saved locally. Oversized files wait for your approval.</p></div>
    <div class="header-actions"><a class="nav-link" href="/feed">Shuffle Feed</a>
      <a class="nav-link" href="/library">Saved Library</a>
      <div id="state" class="pill">Loading…</div></div></header>
  <div class="grid">
    <div class="card"><span id="queued" class="metric">—</span><span class="label">Queued</span></div>
    <div class="card"><span id="approvalCount" class="metric">—</span><span class="label">Needs approval</span></div>
    <div class="card"><span id="completed" class="metric">—</span><span class="label">Completed</span></div>
    <div class="card"><span id="failed" class="metric">—</span><span class="label">Failed</span></div>
    <div class="card"><span id="disk" class="metric">—</span><span class="label">Disk free</span></div>
  </div>
  <div class="actions card">
    <div><strong>Controls</strong><br><small id="lastScan">Last scan: —</small></div>
    <div class="row"><button id="pause" class="warn">Pause</button><button id="scan">Scan now</button>
      <button id="retry" class="secondary">Retry failed</button>
      <button id="clearErrors" class="secondary">Clear errors</button></div>
  </div>
  <div class="activity-card card"><strong>Current activity</strong>
    <div id="activities" class="activity-list"><small>Starting…</small></div></div>
  <section id="approvalSection" class="card" style="margin-top:12px" hidden>
    <div class="approval-heading"><div><h2>Large files need your approval</h2>
      <p>Nothing over 500 MB continues downloading until you choose.</p></div></div>
    <div id="approvals" class="approval-grid"></div>
  </section>
  <div class="columns" style="margin-top:12px">
    <section class="card"><h2>Recent albums</h2><div class="scroll"><table>
      <thead><tr><th>Album</th><th>Status</th><th>Files</th><th>Downloaded</th></tr></thead>
      <tbody id="jobs"></tbody></table></div></section>
    <aside>
      <section class="card"><h2>Settings</h2>
        <label for="path">Archive path</label><input id="path">
        <label for="interval">Polling interval (seconds)</label><input id="interval" type="number" min="5" max="86400">
        <small class="help">Minimum 5 seconds. Polling discovers posts; download speed is independent.</small>
        <label for="threshold">Pause below free space (GB)</label><input id="threshold" type="number" min="1">
        <label for="transfers">Parallel file downloads</label><input id="transfers" type="number" min="1" max="10">
        <small class="help">Global limit shared by every active album.</small>
        <label for="albums">Parallel album downloads</label><input id="albums" type="number" min="1" max="10">
        <small class="help">Download between 1 and 10 albums at the same time.</small>
        <button id="save" style="margin-top:14px;width:100%">Save settings</button>
        <p id="settingsNotice" class="notice" role="status"></p>
      </section>
      <section class="card" style="margin-top:12px"><h2>Recent errors</h2><div id="errors"></div></section>
    </aside>
  </div>
</main><script>
const $=id=>document.getElementById(id);
const fmtDisk=n=>n==null?'—':(n/1073741824).toFixed(1)+' GB';
const fmtBytes=n=>{if(n==null)return '—';if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';
  if(n<1073741824)return (n/1048576).toFixed(1)+' MB';return (n/1073741824).toFixed(1)+' GB'};
const percent=value=>Math.max(0,Math.min(100,Number(value)||0));
const progressBar=value=>`<div class="progress-track compact" role="progressbar" aria-valuemin="0" aria-valuemax="100"
  aria-valuenow="${percent(value).toFixed(1)}"><span style="width:${percent(value).toFixed(1)}%"></span></div>`;
let current=null,settingsDirty=false;
async function api(path,options={}){
  const r=await fetch(path,options);
  if(!r.ok){const raw=await r.text();let message=raw;try{const parsed=JSON.parse(raw);
    message=parsed.detail?.[0]?.msg||parsed.detail||raw}catch{}throw Error(message)}
  return r.json()
}
function text(value){const node=document.createElement('span');node.textContent=value??'';return node.innerHTML}
function notice(message,type='ok'){$('settingsNotice').textContent=message;$('settingsNotice').className='notice '+type}
function activityMarkup(album){
  const value=percent(album.progress_percent),encoded=encodeURIComponent(album.album_id);
  return `<div class="activity-row"><div class="activity-copy">
    <span>${text(album.title||album.album_id)} · ${album.files_done}/${album.files_total} files ·
      ${fmtBytes(album.bytes_downloaded)}${album.bytes_total?' / '+fmtBytes(album.bytes_total):''} · ${value.toFixed(1)}%</span>
    <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"
      aria-valuenow="${value.toFixed(1)}"><span style="width:${value.toFixed(1)}%"></span></div></div>
    <button class="danger" data-cancel-album="${encoded}" ${album.status==='canceling'?'disabled':''}>
      ${album.status==='canceling'?'Canceling…':'Cancel download'}</button></div>`;
}
function approvalMarkup(a){
  const album=encodeURIComponent(a.album_id),filename=encodeURIComponent(a.filename);
  const preview=a.preview_url
    ?`<img class="approval-preview" loading="lazy" src="/api/approval-preview/${album}/${filename}" alt="Preview of ${text(a.filename)}">`
    :`<div class="approval-preview approval-placeholder" aria-label="No visual preview available">${a.kind==='video'?'▶':'▧'}</div>`;
  return `<article class="approval-card">${preview}<div class="approval-copy">
    <h3>${text(a.title||a.album_id)}</h3>
    <p>${text(a.author||'unknown')} · ${text(a.kind||'media')} · ${fmtBytes(a.expected_bytes)}</p>
    <p><small>${text(a.filename)}</small></p>
    <div class="approval-actions">
      <button data-album="${album}" data-filename="${filename}" data-decision="approved">Download file</button>
      <button class="secondary" data-album="${album}" data-filename="${filename}" data-decision="skipped">Skip file</button>
    </div></div></article>`;
}
async function refresh(){
  try{
    current=await api('/api/status'); $('state').textContent=current.pause_reason?'paused · '+current.pause_reason:current.state;
    $('queued').textContent=current.counts.queued||0;$('approvalCount').textContent=current.approvals.length;
    $('completed').textContent=current.counts.completed||0;
    $('failed').textContent=current.counts.failed||0;$('disk').textContent=fmtDisk(current.free_bytes);
    $('lastScan').textContent='Last scan: '+(current.last_scan_at?new Date(current.last_scan_at).toLocaleString():'not yet');
    $('pause').textContent=current.settings.paused?'Resume':'Pause';
    if(!settingsDirty){
      $('path').value=current.settings.archive_path;$('interval').value=current.settings.poll_interval_seconds;
      $('threshold').value=(current.settings.minimum_free_bytes/1073741824).toFixed(0);
      $('transfers').value=current.settings.download_concurrency;
      $('albums').value=current.settings.album_concurrency;
    }
    const active=current.current_albums||[];
    $('activities').innerHTML=active.length?active.map(activityMarkup).join(''):
      `<small>${current.metadata_album_id?`Extracting metadata for existing album ${text(current.metadata_album_id)}…`:
      (current.state==='scanning'?'Checking the public feed…':'Waiting for the next download.')}</small>`;
    $('approvalSection').hidden=!current.approvals.length;
    $('approvals').innerHTML=current.approvals.map(approvalMarkup).join('');
    $('jobs').innerHTML=current.jobs.map(j=>`<tr><td title="${text((j.title||j.album_id)+' · '+(j.author||''))}">${text((j.title||j.album_id)+' · '+(j.author||''))}</td>
      <td><span class="job-status ${text(j.status)}">${text(j.status)}</span></td><td>${j.files_done}/${j.files_total}</td>
      <td>${fmtBytes(j.bytes_downloaded)}${j.bytes_total?' / '+fmtBytes(j.bytes_total):''}${['downloading','parsing'].includes(j.status)?progressBar(j.progress_percent):''}</td></tr>`).join('');
    $('errors').innerHTML=current.errors.length?current.errors.map(e=>`<p class="error">${text(e.context+': '+e.message)}</p>`).join(''):'<small>None</small>';
  }catch(e){$('state').textContent='dashboard error';}
}
$('approvals').onclick=async event=>{
  const button=event.target.closest('button[data-decision]');if(!button)return;
  button.disabled=true;
  try{await api(`/api/approvals/${button.dataset.album}/${button.dataset.filename}`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({decision:button.dataset.decision})});await refresh()}
  catch(e){button.disabled=false;alert(e.message||'Could not save that decision.')}
};
$('pause').onclick=async()=>{await api(current.settings.paused?'/api/resume':'/api/pause',{method:'POST'});refresh()};
$('activities').onclick=async event=>{
  const button=event.target.closest('[data-cancel-album]');if(!button)return;
  const albumId=decodeURIComponent(button.dataset.cancelAlbum);
  if(!confirm('Cancel this album download? Its downloaded and partial files will be removed.'))return;
  button.disabled=true;button.textContent='Canceling…';
  try{await api('/api/cancel-download',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({album_id:albumId})});await refresh()}
  catch(e){notice(e.message||'Could not cancel the download.','bad');button.disabled=false}
};
$('scan').onclick=async()=>{await api('/api/scan-now',{method:'POST'});refresh()};
$('retry').onclick=async()=>{await api('/api/retry-failed',{method:'POST'});refresh()};
$('clearErrors').onclick=async()=>{await api('/api/clear-errors',{method:'POST'});refresh()};
for(const id of ['path','interval','threshold','transfers','albums'])$(id).addEventListener('input',()=>{settingsDirty=true;notice('Unsaved changes','')});
$('save').onclick=async()=>{
  const button=$('save'),body={...current.settings,archive_path:$('path').value,
    poll_interval_seconds:Number($('interval').value),minimum_free_bytes:Number($('threshold').value)*1073741824,
    download_concurrency:Number($('transfers').value),album_concurrency:Number($('albums').value)};
  button.disabled=true;button.textContent='Saving…';
  try{current.settings=await api('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    settingsDirty=false;notice('Settings saved.','ok');await refresh()}
  catch(e){notice(e.message||'Could not save settings.','bad')}
  finally{button.disabled=false;button.textContent='Save settings'}
};
refresh();setInterval(refresh,3000);
</script></body></html>"""


FEED_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Shuffle Feed · Erome Archiver</title>
  <style>
    :root { color-scheme:dark; --bg:#08090b; --panel:#17191e; --line:#343841;
      --text:#f7f3eb; --muted:#a6adb8; --accent:#75d6c7; --bad:#ff8297; }
    * { box-sizing:border-box }
    html,body { margin:0; height:100%; overflow:hidden; background:var(--bg);
      color:var(--text); font:15px/1.45 Inter,system-ui,-apple-system,sans-serif }
    nav { position:fixed; z-index:20; top:0; left:0; right:0; height:62px; display:flex;
      align-items:center; justify-content:space-between; gap:16px; padding:0 22px;
      background:linear-gradient(#090a0dda,transparent); pointer-events:none }
    nav>* { pointer-events:auto }
    .brand { font-weight:850; letter-spacing:-.02em }
    .nav-links { display:flex; gap:8px }
    .nav-link { color:var(--text); text-decoration:none; padding:8px 12px;
      border:1px solid #ffffff2b; background:#0d0f13aa; border-radius:999px; font-weight:700 }
    #feed { height:100svh; overflow-y:auto; scroll-snap-type:y mandatory;
      overscroll-behavior-y:contain; scrollbar-width:none }
    #feed::-webkit-scrollbar { display:none }
    .slide { position:relative; width:100%; height:100svh; scroll-snap-align:start;
      scroll-snap-stop:always; overflow:hidden; background:#050608; display:grid;
      grid-template-rows:54px minmax(0,1fr) auto }
    .media-stage { grid-row:2; position:relative; min-width:0; min-height:0; overflow:hidden }
    .feed-media { position:absolute; inset:0; width:100%; height:100%;
      min-width:0; min-height:0; display:block;
      object-fit:contain; object-position:center; background:#050608 }
    .slide-info { grid-row:3; position:relative; z-index:2; display:flex; align-items:flex-end;
      justify-content:space-between; gap:18px; padding:14px max(20px,calc((100vw - 840px)/2)) 20px;
      background:#050608 }
    .meta { min-width:0 }
    .meta h2 { margin:0 0 4px; font-size:clamp(20px,3vw,30px); letter-spacing:-.025em }
    .meta p { margin:3px 0; color:#e3e1dc }
    .rail { flex:0 0 auto; display:grid; gap:10px }
    button { border:0; border-radius:999px; padding:11px 15px; font:inherit; font-weight:800;
      cursor:pointer; background:#252932df; color:var(--text); backdrop-filter:blur(8px) }
    button.delete { background:#381b24e8; color:#ffb5c1; border:1px solid #ff82974d }
    button:disabled { opacity:.55; cursor:wait }
    .empty { height:100svh; display:grid; place-items:center; padding:30px; text-align:center;
      color:var(--muted) }
    dialog { width:min(980px,calc(100% - 28px)); max-height:90svh; padding:0; overflow:hidden;
      border:1px solid var(--line); border-radius:16px; background:var(--panel); color:var(--text);
      box-shadow:0 24px 80px #000c }
    dialog::backdrop { background:#000c; backdrop-filter:blur(5px) }
    .modal-head { display:flex; justify-content:space-between; gap:18px; padding:20px;
      border-bottom:1px solid var(--line) }
    .modal-head h2 { margin:0 0 4px; font-size:24px }
    .modal-head p { margin:0; color:var(--muted) }
    .album-grid { padding:16px; display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr));
      gap:10px; max-height:55svh; overflow:auto }
    .album-media { width:100%; aspect-ratio:1/1; object-fit:contain; background:#08090b;
      border:1px solid var(--line); border-radius:9px }
    .modal-actions { display:flex; justify-content:flex-end; gap:10px; padding:16px 20px;
      border-top:1px solid var(--line) }
    .confirm-delete { background:var(--bad); color:#26050c }
    .modal-error { color:var(--bad); margin:0 auto 0 0; align-self:center }
    @media(max-width:640px){
      nav{padding:0 12px}.brand{font-size:13px}.nav-link{padding:7px 10px;font-size:13px}
      .slide{grid-template-rows:56px minmax(0,1fr) auto}
      .slide-info{padding:12px 14px 18px}.meta h2{font-size:20px}
      .album-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .modal-head{padding:16px}.modal-actions{padding:13px 16px}
    }
  </style>
</head>
<body>
  <nav><div class="brand">Shuffle Feed</div><div class="nav-links">
    <a class="nav-link" href="/library">Library</a><a class="nav-link" href="/">Dashboard</a>
  </div></nav>
  <main id="feed" aria-label="Random saved media feed"></main>
  <dialog id="deleteDialog" aria-labelledby="deleteTitle">
    <div class="modal-head"><div><h2 id="deleteTitle">Delete this album?</h2>
      <p id="deleteSummary">Loading the full album…</p></div>
      <button id="closeDialog" aria-label="Close">✕</button></div>
    <div id="albumGrid" class="album-grid"></div>
    <div class="modal-actions"><p id="deleteError" class="modal-error"></p>
      <button id="cancelDelete">Cancel</button>
      <button id="confirmDelete" class="confirm-delete">Yes, delete entire album</button></div>
  </dialog>
<script>
const feed=document.getElementById('feed'),dialog=document.getElementById('deleteDialog');
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt=n=>{if(!n)return '0 B';if(n<1048576)return (n/1024).toFixed(1)+' KB';
  if(n<1073741824)return (n/1048576).toFixed(1)+' MB';return (n/1073741824).toFixed(1)+' GB'};
let loading=false,modalAlbum=null;const seen=new Set();
async function api(path,options={}){
  const response=await fetch(path,options);
  if(!response.ok){const raw=await response.text();let message=raw;try{message=JSON.parse(raw).detail||raw}catch{}
    throw Error(message)}
  return response.json();
}
function slideMarkup(item){
  const media=item.kind==='video'
    ?`<video class="feed-media" src="${item.media_url}" controls muted loop playsinline preload="metadata"></video>`
    :`<img class="feed-media" src="${item.media_url}" alt="${esc(item.album_title)}" loading="lazy">`;
  return `<article class="slide" data-album="${esc(item.album_id)}" data-file="${esc(item.filename)}">
    <div class="media-stage">${media}</div><div class="slide-info"><div class="meta">
      <h2>${item.has_location?'📍 ':''}${esc(item.album_title)}</h2>
      <p>${esc(item.author)} · ${item.album_size} item${item.album_size===1?'':'s'}</p>
      <p>${esc(item.filename)} · ${fmt(item.bytes)}</p></div>
    <div class="rail"><button class="delete" data-delete-album="${esc(item.album_id)}"
      aria-label="Delete album ${esc(item.album_title)}">Delete</button></div></div></article>`;
}
const observer=new IntersectionObserver(entries=>{
  for(const entry of entries){const video=entry.target.querySelector('video');if(!video)continue;
    if(entry.isIntersecting&&entry.intersectionRatio>=.7)video.play().catch(()=>{});
    else video.pause()}
},{root:feed,threshold:[.1,.7]});
async function loadMore(){
  if(loading)return;loading=true;
  try{
    const data=await api('/api/feed?limit=24');
    const fresh=data.items.filter(item=>{const key=item.album_id+'/'+item.filename;
      if(seen.has(key))return false;seen.add(key);return true});
    if(!fresh.length&&!feed.children.length)feed.innerHTML='<div class="empty">No saved pictures or videos yet.</div>';
    const holder=document.createElement('div');holder.innerHTML=fresh.map(slideMarkup).join('');
    while(holder.firstElementChild){const slide=holder.firstElementChild;feed.appendChild(slide);observer.observe(slide)}
  }catch(error){if(!feed.children.length)feed.innerHTML=`<div class="empty">${esc(error.message)}</div>`}
  finally{loading=false}
}
feed.addEventListener('scroll',()=>{if(feed.scrollTop+feed.clientHeight*2>=feed.scrollHeight)loadMore()},{passive:true});
feed.addEventListener('click',event=>{const button=event.target.closest('[data-delete-album]');
  if(button)openDelete(button.dataset.deleteAlbum)});
function albumMedia(file){
  return file.kind==='video'
    ?`<video class="album-media" src="${file.media_url}" controls preload="metadata"></video>`
    :`<img class="album-media" src="${file.thumbnail_url||file.media_url}" alt="${esc(file.filename)}" loading="lazy">`;
}
async function openDelete(albumId){
  document.getElementById('deleteError').textContent='';
  document.getElementById('deleteSummary').textContent='Loading the full album…';
  document.getElementById('albumGrid').innerHTML='';
  document.getElementById('confirmDelete').disabled=true;dialog.showModal();
  try{
    modalAlbum=await api('/api/albums/'+encodeURIComponent(albumId));
    document.getElementById('deleteTitle').textContent='Delete “'+modalAlbum.title+'”?';
    document.getElementById('deleteSummary').textContent=
      `Are you sure? This permanently deletes all ${modalAlbum.files.length} items in the album.`;
    document.getElementById('albumGrid').innerHTML=modalAlbum.files.map(albumMedia).join('');
    document.getElementById('confirmDelete').disabled=false;
  }catch(error){document.getElementById('deleteError').textContent=error.message}
}
function closeDelete(){dialog.close();modalAlbum=null;
  document.querySelectorAll('#albumGrid video').forEach(video=>video.pause())}
document.getElementById('closeDialog').onclick=closeDelete;
document.getElementById('cancelDelete').onclick=closeDelete;
document.getElementById('confirmDelete').onclick=async()=>{
  if(!modalAlbum)return;const button=document.getElementById('confirmDelete');
  button.disabled=true;document.getElementById('deleteError').textContent='';
  try{
    const albumId=modalAlbum.album_id;
    await api('/api/albums/'+encodeURIComponent(albumId),{method:'DELETE',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm_album_id:albumId})});
    document.querySelectorAll(`.slide[data-album="${CSS.escape(albumId)}"]`).forEach(slide=>slide.remove());
    closeDelete();if(!feed.querySelector('.slide')){seen.clear();await loadMore()}
  }catch(error){document.getElementById('deleteError').textContent=error.message;button.disabled=false}
};
loadMore();
</script></body></html>"""


LIBRARY_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Saved Library · Erome Archiver</title>
  <style>
    :root { color-scheme:dark; --bg:#101114; --panel:#191b20; --line:#30343c;
      --text:#f4f0e8; --muted:#9da4b1; --accent:#75d6c7; --bad:#ff8297; }
    * { box-sizing:border-box } body { margin:0; background:var(--bg); color:var(--text);
      font:15px/1.45 Inter,system-ui,-apple-system,sans-serif }
    main { width:min(1180px,calc(100% - 32px)); margin:auto; padding:28px 0 56px }
    header { display:flex; justify-content:space-between; gap:20px; align-items:end }
    h1 { margin:0; font-size:clamp(32px,5vw,54px); letter-spacing:-.04em }
    p { color:var(--muted) } a { color:inherit }
    .nav { text-decoration:none; border:1px solid var(--line); border-radius:999px;
      padding:9px 13px; font-weight:700; white-space:nowrap }
    .toolbar { display:grid; grid-template-columns:1fr auto; gap:10px; margin:24px 0 12px }
    input,button { border:1px solid var(--line); border-radius:9px; padding:11px 13px;
      background:#111319; color:var(--text); font:inherit }
    button { cursor:pointer; background:var(--accent); color:#09201c; border:0; font-weight:750 }
    button.secondary { background:#282c34; color:var(--text) }
    .count { margin:0 0 14px }
    #albums { display:grid; gap:12px }
    details { background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden }
    summary { list-style:none; cursor:pointer; padding:17px; display:grid;
      grid-template-columns:minmax(0,1fr) auto; gap:16px; align-items:center }
    summary::-webkit-details-marker { display:none }
    .album-title { font-size:17px; font-weight:780; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
    .album-meta { color:var(--muted); font-size:13px; margin-top:3px }
    .file-count { color:var(--muted); white-space:nowrap }
    .media-grid { border-top:1px solid var(--line); padding:14px; display:grid;
      grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:12px }
    .media { min-width:0; background:#101216; border:1px solid var(--line); border-radius:10px;
      overflow:hidden }
    .media-frame { display:block; width:100%; aspect-ratio:1/1; object-fit:contain; background:#08090b }
    .media footer { padding:9px 10px; color:var(--muted); font-size:12px;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
    .empty { text-align:center; padding:50px 20px; border:1px dashed var(--line);
      border-radius:12px; color:var(--muted) }
    #loadMore { display:block; margin:18px auto 0; min-width:160px }
    .error { color:var(--bad) }
    @media(max-width:680px){header{align-items:flex-start;flex-direction:column}
      .toolbar{grid-template-columns:1fr}.media-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      summary{grid-template-columns:1fr}.file-count{display:none}}
  </style>
</head>
<body><main>
  <header><div><h1>Saved Library</h1><p>Browse completed albums, pictures, videos, and location indicators.</p></div>
    <div><a class="nav" href="/feed">Shuffle Feed</a>
      <a class="nav" href="/">Dashboard</a></div></header>
  <div class="toolbar"><input id="search" type="search" placeholder="Search album names or authors">
    <button id="searchButton">Search</button></div>
  <p id="count" class="count">Loading saved albums…</p>
  <div id="albums"></div>
  <button id="loadMore" class="secondary" hidden>Load more</button>
</main><script>
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt=n=>{if(!n)return '0 B';if(n<1048576)return (n/1024).toFixed(1)+' KB';
  if(n<1073741824)return (n/1048576).toFixed(1)+' MB';return (n/1073741824).toFixed(1)+' GB'};
let offset=0,total=0,query='',loading=false;
function mediaMarkup(file){
  const pin=file.has_location?'📍 ':'',label=pin+esc(file.filename);
  const visual=file.kind==='image'
    ?`<a href="${file.media_url}" target="_blank"><img class="media-frame" loading="lazy" src="${file.thumbnail_url}" alt="${label}"></a>`
    :`<video class="media-frame" controls preload="metadata" src="${file.media_url}"></video>`;
  return `<article class="media">${visual}<footer title="${label}">${label} · ${fmt(file.bytes)}</footer></article>`;
}
function albumMarkup(album){
  const pin=album.has_location?'📍 ':'';
  return `<details data-album="${esc(album.album_id)}"><summary><div>
    <div class="album-title" title="${esc(album.title)}">${pin}${esc(album.title)}</div>
    <div class="album-meta">${esc(album.author)} · ${esc(album.folder_name)}</div></div>
    <div class="file-count">${album.files.length} item${album.files.length===1?'':'s'}</div></summary>
    <div class="media-grid">${album.files.map(mediaMarkup).join('')||'<div class="empty">No readable media files.</div>'}</div></details>`;
}
async function load(reset=false){
  if(loading)return;loading=true;
  if(reset){offset=0;$('albums').innerHTML=''}
  try{
    const response=await fetch(`/api/library?q=${encodeURIComponent(query)}&limit=12&offset=${offset}`);
    if(!response.ok)throw Error(await response.text());
    const data=await response.json();total=data.total;
    $('albums').insertAdjacentHTML('beforeend',data.albums.map(albumMarkup).join(''));
    offset+=data.limit;$('count').textContent=`${total} saved album${total===1?'':'s'}`;
    $('loadMore').hidden=offset>=total;
    if(total===0)$('albums').innerHTML='<div class="empty">No saved albums match this search.</div>';
  }catch(error){$('count').innerHTML=`<span class="error">${esc(error.message)}</span>`}
  finally{loading=false}
}
function runSearch(){query=$('search').value.trim();load(true)}
$('searchButton').onclick=runSearch;
$('search').onkeydown=event=>{if(event.key==='Enter')runSearch()};
$('loadMore').onclick=()=>load(false);
load(true);
</script></body></html>"""
