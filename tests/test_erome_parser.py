import pytest

from erome_archiver.parser import (
    ParseError,
    album_folder_name,
    media_filename,
    parse_album,
    parse_feed,
)


def test_parse_feed_deduplicates_album_links_and_finds_last_page():
    html = """
    <a href="/a/First123">one</a>
    <a href="https://www.erome.com/a/First123">duplicate</a>
    <a href="/a/Second456">two</a>
    <a href="/explore/new?page=2">2</a>
    <a href="/explore/new?page=50">50</a>
    """
    albums, max_page = parse_feed(html)

    assert [album.album_id for album in albums] == ["First123", "Second456"]
    assert albums[0].url == "https://www.erome.com/a/First123"
    assert max_page == 50


def test_parse_album_deduplicates_markup_and_selects_highest_video_resolution():
    html = """
    <h1 class="album-title-page">A Test / Album</h1>
    <a id="user_name">sample-user</a>
    <div id="album_Album1">
      <div class="media-group">
        <div class="img" data-src="https://s1.example/Album1/photo.jpg?v=1"></div>
        <img src="https://s1.example/Album1/photo.jpg?v=1">
      </div>
      <div class="media-group">
        <video poster="https://v1.example/video-preview.jpg"><source src="https://v1.example/video_480p.mp4" res="480"></video>
        <video><source src="https://v1.example/video_720p.mp4" res="720"></video>
        <video><source src="https://v1.example/video_720p.mp4" res="720"></video>
      </div>
    </div>
    """
    album = parse_album(html, "Album1", "https://www.erome.com/a/Album1")

    assert album.title == "A Test / Album"
    assert album.author == "sample-user"
    assert [item.kind for item in album.media] == ["image", "video"]
    assert album.media[1].url.endswith("video_720p.mp4")
    assert album.media[1].resolution == 720
    assert album.media[1].preview_url == "https://v1.example/video-preview.jpg"
    assert album_folder_name(album.album_id, album.title) == "Album1 - A Test Album"
    assert media_filename(2, album.media[1]) == "002_video_720p.mp4"


def test_parse_album_rejects_missing_public_media_container():
    with pytest.raises(ParseError):
        parse_album("<h1 class='album-title-page'>Broken</h1>", "Missing", "https://example")
