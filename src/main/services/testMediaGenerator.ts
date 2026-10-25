import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { SampleTestSource } from '../../shared/types';
import { MultiStreamManifest } from './directHttpExtractor';

const execFileAsync = promisify(execFile);

/**
 * Generates real, publicly authorized local reference media streams using FFmpeg
 * so the user and automated tests can verify multi-resolution analysis, separate
 * video+audio stream merging, audio conversion (MP3/M4A), and HLS segment muxing.
 */
export class TestMediaGenerator {
  constructor(private readonly mediaRootDir: string) {
    fs.mkdirSync(this.mediaRootDir, { recursive: true });
  }

  public async ensureTestMediaGenerated(resolvedFfmpegPath?: string | null): Promise<void> {
    const manifestPath = path.join(this.mediaRootDir, 'observatory_broadcast.media.json');
    if (fs.existsSync(manifestPath)) {
      return;
    }

    const ffmpegBin = resolvedFfmpegPath || (process.platform === 'win32' ? 'ffmpeg.exe' : '/usr/bin/ffmpeg');
    if (path.isAbsolute(ffmpegBin) && !fs.existsSync(ffmpegBin)) {
      return;
    }

    // 1. Generate 1080p60 video-only stream (H.264)
    const v1080Path = path.join(this.mediaRootDir, 'observatory_1080p60_video.mp4');
    await execFileAsync(ffmpegBin, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=1920x1080:rate=60:duration=3',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '26',
      '-pix_fmt',
      'yuv420p',
      v1080Path,
    ]);

    // 2. Generate 720p30 combined A/V stream (H.264 + AAC)
    const v720Path = path.join(this.mediaRootDir, 'observatory_720p30_combined.mp4');
    await execFileAsync(ffmpegBin, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=1280x720:rate=30:duration=3',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000:duration=3',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '27',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      v720Path,
    ]);

    // 3. Generate 480p30 combined A/V stream
    const v480Path = path.join(this.mediaRootDir, 'observatory_480p30_combined.mp4');
    await execFileAsync(ffmpegBin, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=854x480:rate=30:duration=3',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=528:sample_rate=44100:duration=3',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '28',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      v480Path,
    ]);

    // 4. Generate 360p30 combined A/V stream
    const v360Path = path.join(this.mediaRootDir, 'observatory_360p30_combined.mp4');
    await execFileAsync(ffmpegBin, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=640x360:rate=30:duration=3',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=528:sample_rate=44100:duration=3',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '30',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      v360Path,
    ]);

    // 5. Generate high-bitrate M4A audio-only stream (for merging with 1080p60 video-only or standalone audio download)
    const audioM4aPath = path.join(this.mediaRootDir, 'observatory_master_audio.m4a');
    await execFileAsync(ffmpegBin, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=660:sample_rate=48000:duration=3',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      audioM4aPath,
    ]);

    // 6. Generate HLS (.m3u8) stream and segments
    const hlsVariantPath = path.join(this.mediaRootDir, 'hls_720p.m3u8');
    const hlsSegmentPattern = path.join(this.mediaRootDir, 'hls_seg_%02d.ts');
    await execFileAsync(ffmpegBin, [
      '-y',
      '-i',
      v720Path,
      '-c',
      'copy',
      '-f',
      'hls',
      '-hls_time',
      '1',
      '-hls_playlist_type',
      'vod',
      '-hls_segment_filename',
      hlsSegmentPattern,
      hlsVariantPath,
    ]);

    const hlsMasterPath = path.join(this.mediaRootDir, 'master_stream.m3u8');
    fs.writeFileSync(
      hlsMasterPath,
      [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-STREAM-INF:BANDWIDTH=1850000,RESOLUTION=1280x720,FRAME-RATE=30.000,CODECS="avc1.64001f,mp4a.40.2"',
        'hls_720p.m3u8',
      ].join('\n'),
      'utf-8'
    );

    // 7. Create SVG thumbnail poster
    const posterPath = path.join(this.mediaRootDir, 'observatory_poster.svg');
    fs.writeFileSync(
      posterPath,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#090d16"/>
            <stop offset="50%" stop-color="#111c2d"/>
            <stop offset="100%" stop-color="#0c1322"/>
          </linearGradient>
        </defs>
        <rect width="1280" height="720" fill="url(#bg)"/>
        <g stroke="#1e293b" stroke-width="1">
          <line x1="0" y1="180" x2="1280" y2="180"/>
          <line x1="0" y1="360" x2="1280" y2="360"/>
          <line x1="0" y1="540" x2="1280" y2="540"/>
          <line x1="320" y1="0" x2="320" y2="720"/>
          <line x1="640" y1="0" x2="640" y2="720"/>
          <line x1="960" y1="0" x2="960" y2="720"/>
        </g>
        <circle cx="640" cy="360" r="140" fill="none" stroke="#0284c7" stroke-width="3" opacity="0.6"/>
        <circle cx="640" cy="360" r="90" fill="none" stroke="#38bdf8" stroke-width="2" opacity="0.85"/>
        <polygon points="615,315 615,405 690,360" fill="#38bdf8"/>
        <text x="64" y="620" fill="#f8fafc" font-family="sans-serif" font-size="34" font-weight="700">Alpine Observatory Reference Broadcast (SMPTE 60fps)</text>
        <text x="64" y="662" fill="#94a3b8" font-family="monospace" font-size="22">H.264 / AAC · 1080p60 DASH + 720p30 + 480p30 + 360p30 + 192kbps M4A</text>
      </svg>`,
      'utf-8'
    );

    const manifest: MultiStreamManifest = {
      title: 'Alpine Observatory Reference Broadcast (Multi-Stream Master)',
      uploader: 'Open Broadcast Lab Archive',
      durationSeconds: 3,
      platform: 'Authorized Media Archive',
      thumbnailUrl: '/local-media/observatory_poster.svg',
      streams: [
        {
          formatId: '137-1080p60-video',
          url: '/local-media/observatory_1080p60_video.mp4',
          extension: 'mp4',
          container: 'mp4',
          streamType: 'video_only',
          resolution: '1080p',
          height: 1080,
          width: 1920,
          fps: 60,
          vcodec: 'avc1.64002a',
          acodec: null,
          filesizeBytes: fs.statSync(v1080Path).size,
          tbrKbps: 2450,
          formatNote: '1080p60 High Profile (Video Only - Merges with Audio via FFmpeg)',
        },
        {
          formatId: '22-720p30-combined',
          url: '/local-media/observatory_720p30_combined.mp4',
          extension: 'mp4',
          container: 'mp4',
          streamType: 'combined',
          resolution: '720p',
          height: 720,
          width: 1280,
          fps: 30,
          vcodec: 'avc1.64001f',
          acodec: 'mp4a.40.2',
          filesizeBytes: fs.statSync(v720Path).size,
          tbrKbps: 1420,
          formatNote: '720p30 Combined A/V Stream',
        },
        {
          formatId: '18-480p30-combined',
          url: '/local-media/observatory_480p30_combined.mp4',
          extension: 'mp4',
          container: 'mp4',
          streamType: 'combined',
          resolution: '480p',
          height: 480,
          width: 854,
          fps: 30,
          vcodec: 'avc1.4d401e',
          acodec: 'mp4a.40.2',
          filesizeBytes: fs.statSync(v480Path).size,
          tbrKbps: 820,
          formatNote: '480p30 Combined A/V Stream',
        },
        {
          formatId: '17-360p30-combined',
          url: '/local-media/observatory_360p30_combined.mp4',
          extension: 'mp4',
          container: 'mp4',
          streamType: 'combined',
          resolution: '360p',
          height: 360,
          width: 640,
          fps: 30,
          vcodec: 'avc1.42e01e',
          acodec: 'mp4a.40.2',
          filesizeBytes: fs.statSync(v360Path).size,
          tbrKbps: 460,
          formatNote: '360p30 Combined A/V Stream',
        },
        {
          formatId: '140-m4a-audio',
          url: '/local-media/observatory_master_audio.m4a',
          extension: 'm4a',
          container: 'm4a',
          streamType: 'audio_only',
          resolution: 'audio only',
          height: null,
          width: null,
          fps: null,
          vcodec: null,
          acodec: 'mp4a.40.2',
          filesizeBytes: fs.statSync(audioM4aPath).size,
          tbrKbps: 192,
          formatNote: 'Master Stereo Audio (192 kbps AAC)',
        },
      ],
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  public getSampleSources(serverOrigin: string): SampleTestSource[] {
    return [
      {
        id: 'sample-adaptive-master',
        label: 'Multi-Resolution Master (1080p60 DASH + 720p + 480p + 360p + M4A)',
        description: 'Authorized multi-stream broadcast manifest supporting separate 1080p60 video + AAC audio FFmpeg merging and audio conversion.',
        url: `${serverOrigin}/local-media/observatory_broadcast.media.json`,
        category: 'multi_res_dash',
      },
      {
        id: 'sample-hls-playlist',
        label: 'Authorized HLS Master Playlist (.m3u8)',
        description: 'HLS VOD stream with MPEG-TS segments assembled and remuxed to MP4 via FFmpeg.',
        url: `${serverOrigin}/local-media/master_stream.m3u8`,
        category: 'hls_stream',
      },
      {
        id: 'sample-direct-mp4',
        label: 'Direct 720p MP4 Reference Stream',
        description: 'Direct HTTP MP4 file inspected via FFprobe with real-time byte transfer progress.',
        url: `${serverOrigin}/local-media/observatory_720p30_combined.mp4`,
        category: 'direct_mp4',
      },
    ];
  }
}
