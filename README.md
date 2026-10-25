# Universal Video Downloader — Windows Desktop Edition

A production-oriented Windows desktop media analysis, format selection, FFmpeg stream merging, and download management application built with **Electron**, **React**, **TypeScript**, **Vite**, **Tailwind CSS**, **SQLite**, **yt-dlp**, and **FFmpeg/FFprobe**.

---

## 1. Key Capabilities

- **Provider-Based Extraction Engine**:
  - **yt-dlp Integration**: Extracts real metadata, adaptive video-only/audio-only streams, and combined formats from compatible publicly accessible websites via safe argument arrays (`child_process.spawn` with `shell: false`).
  - **Authorized HLS & MPEG-DASH Support**: Parses `.m3u8` master/variant playlists, detects encrypted/DRM segments, and remuxes segments into `.mp4` or `.mkv` via FFmpeg.
  - **Direct HTTP/HTTPS Media Support**: Inspects direct media files and adaptive manifests using `ffprobe` and streams bytes with redirect-hop SSRF validation.
- **Real Format Selection & FFmpeg Processing**:
  - Displays only actual resolutions (`2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p`, `audio only`), codecs, frame rates, and file sizes returned by the extractor.
  - Validates every requested format ID against the cached analysis result before starting a transfer.
  - Merges separate video-only and audio-only streams using FFmpeg without unnecessary video re-encoding.
  - Supports optional audio extraction/conversion to **MP3** (`libmp3lame`) or **M4A** (`aac`).
- **Typed Download Job State Machine & SQLite Persistence**:
  - Enforces valid state transitions (`queued` → `analyzing` → `downloading` → `merging` → `converting` → `completed` / `failed` / `cancelling` / `cancelled`).
  - Persists user settings, download history, job snapshots (with graceful startup recovery), and redacted diagnostic logs in SQLite (`node:sqlite` WAL mode).

---

## 2. Development & Testing Commands

```bash
# Install dependencies
npm install

# Run automated unit and integration tests (Vitest)
npm test

# Run TypeScript typechecking
npm run lint

# Start the development server & UI on port 3000
npm run dev

# Build production renderer and Electron main/preload bundles
npm run build

# Package Windows x64 NSIS installer and Portable executable
npm run package:win
```

---

## 3. Windows Packaging & Binary Bundling

Place Windows x64 binaries in `resources/binaries/` prior to running `npm run package:win`:
- `resources/binaries/yt-dlp.exe`
- `resources/binaries/ffmpeg.exe`
- `resources/binaries/ffprobe.exe`

`electron-builder` packages these into `resources/binaries` via `extraResources` so the installed Windows application resolves them via `process.resourcesPath` without requiring a global Node.js or Python installation.

### Code Signing & SmartScreen Notice
Unsigned development builds on Windows 10/11 will display a Microsoft Defender SmartScreen prompt ("Windows protected your PC"). For public distribution, configure an Authenticode certificate via `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables before running `npm run package:win`.
