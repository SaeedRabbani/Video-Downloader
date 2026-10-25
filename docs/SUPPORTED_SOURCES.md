# Supported Sources & Known Limitations

## 1. Supported Media Sources

1. **Public Websites Supported by `yt-dlp`**:
   - Publicly accessible video and audio pages supported by the bundled `yt-dlp` extractor suite.
   - Adaptive DASH streams (separate video and audio tracks merged automatically via `FFmpeg`).
2. **Authorized HLS (`.m3u8`) & MPEG-DASH (`.mpd`) Streams**:
   - Unencrypted master and media playlists over HTTP/HTTPS.
3. **Direct HTTP/HTTPS Media Links**:
   - Direct `.mp4`, `.webm`, `.mkv`, `.mov`, `.m4a`, `.mp3`, `.wav`, and `.ogg` URLs.

## 2. Explicit Security & Legal Boundaries

- **No DRM Circumvention**: Streams protected by Widevine, PlayReady, FairPlay, or AES-128/SAMPLE-AES encryption keys are detected and rejected with `DRM_PROTECTED`.
- **No Credential or Cookie Harvesting**: The application never reads browser cookies, saved passwords, or session tokens (`--no-cookies` is enforced on all `yt-dlp` invocations).
- **No Private Network or Metadata Probing**: Requests to `localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, and `169.254.169.254` are blocked both on initial input and across HTTP redirect hops.

## 3. Known Technical Limitations

- **Source Platform Changes**: Third-party websites frequently change their markup or rate-limit automated requests (`HTTP 429`). Keeping the `yt-dlp` binary updated in `resources/binaries/` is required for ongoing compatibility.
- **Resume Support**: While `yt-dlp` supports `.part` continuation on compatible HTTP range servers, direct stream transfers and FFmpeg HLS remuxing require a full restart if cancelled mid-transfer. The UI explicitly labels these streams.
- **Quality Preservation**: Converting a lower-resolution stream to MP4/MKV or transcoding audio to MP3/M4A does not increase the original source quality.
