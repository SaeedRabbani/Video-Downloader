# Troubleshooting & Release Checklist

## 1. Troubleshooting Guide

### Missing `yt-dlp`, `ffmpeg`, or `ffprobe` Binary
- **Symptom**: Warning banner at the top of the workspace or `MISSING_FFMPEG` / `PACKAGING_DEPENDENCY_ERROR` during extraction or stream merging.
- **Resolution**:
  1. Open the **About** tab to inspect the **Verified Media Processing & Extraction Binaries** table.
  2. On Windows, ensure `yt-dlp.exe`, `ffmpeg.exe`, and `ffprobe.exe` are present in the packaged `resources/binaries/` directory or system `PATH`.

### `AUTHENTICATION_REQUIRED` or `DRM_PROTECTED` Errors
- **Cause**: The target video requires a logged-in account, paid membership, or uses DRM encryption.
- **Resolution**: Universal Video Downloader only supports publicly accessible, unencrypted media that you are authorized to download.

### `INVALID_URL` on Internal or Local Addresses
- **Cause**: SSRF protection blocks private IPv4/IPv6 addresses (`127.0.0.1`, `192.168.x.x`, `10.x.x.x`) and non-HTTP schemes.
- **Resolution**: Use a valid public `https://` or `http://` domain URL.

### `DISK_FULL` or `PERMISSION_DENIED`
- **Cause**: The destination folder lacks write permissions or free disk space is below the required file size + 32 MB safety buffer.
- **Resolution**: Open **Settings** and select a writable user directory with sufficient free space.

---

## 2. Acceptance & Release Verification Checklist

- [x] **A. Starts without a development server**: Production build compiles renderer (`dist/`) and Electron main/preload (`dist-electron/`) bundles.
- [x] **B. URL validation**: Accepts valid HTTP/HTTPS URLs and rejects private IPs, cloud metadata endpoints, credentials, and unsafe schemes.
- [x] **C. Real metadata & format extraction**: Verified with `yt-dlp`, `FFprobe`, and multi-resolution reference manifests.
- [x] **D. Resolution list matches extractor results**: UI presets filter strictly to resolutions returned by the extractor.
- [x] **E. Selected supported format downloads**: Verified via automated integration tests and live server workflow.
- [x] **F. Separate audio and video streams merge via FFmpeg**: Verified 1080p60 video-only + M4A audio-only merge into combined MP4 and verified output streams with `ffprobe`.
- [x] **G. Real backend progress events**: Streamed via Electron IPC / SSE with real byte counts, transfer speeds, and processing stages.
- [x] **H. Cancellation & temp cleanup**: Terminates child processes (`SIGTERM`/`SIGKILL`) and removes `job_<id>` temporary directories.
- [x] **I. Completed files open / play**: Verified via local file streaming, download action, and in-app media inspector.
- [x] **J. SQLite persistence**: History, settings, job snapshots, and rotated diagnostics persist across restarts.
- [x] **K. Windows x64 installer configuration**: Configured in `electron-builder.yml` for NSIS and Portable targets (Note: native Windows `.exe` installer execution requires a Windows x64 host; verified build compilation and binary packaging configuration in this Linux container environment).
- [x] **L. Security hardening**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP headers, sender frame validation, and `shell: false` process spawning verified.
