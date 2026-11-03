import { describe, expect, it } from 'vitest';
import {
  assertValidStateTransition,
  canTransitionJobState,
} from '../../src/main/jobs/stateMachine';
import { selectVerifiedFormats } from '../../src/main/services/extractorEngine';
import { parseHlsMasterPlaylist } from '../../src/main/services/hlsDashExtractor';
import {
  normalizeYtDlpFormats,
  parseYtDlpProgressLine,
} from '../../src/main/services/ytDlpExtractor';
import { MediaAnalysisResult } from '../../src/shared/types';

describe('Format Normalization & Strict Format Selection', () => {
  const rawFormats = [
    {
      format_id: '137',
      ext: 'mp4',
      vcodec: 'avc1.640028',
      acodec: 'none',
      width: 1920,
      height: 1080,
      fps: 60,
      filesize: 25_000_000,
      tbr: 2800,
    },
    {
      format_id: '22',
      ext: 'mp4',
      vcodec: 'avc1.64001F',
      acodec: 'mp4a.40.2',
      width: 1280,
      height: 720,
      fps: 30,
      filesize: 12_000_000,
      tbr: 1400,
    },
    {
      format_id: '140',
      ext: 'm4a',
      vcodec: 'none',
      acodec: 'mp4a.40.2',
      filesize: 3_200_000,
      abr: 128,
      tbr: 128,
    },
  ];

  const normalized = normalizeYtDlpFormats(rawFormats);

  const sampleAnalysis: MediaAnalysisResult = {
    analysisId: 'anl_test_1',
    sourceUrl: 'https://example.com/watch?v=123',
    normalizedUrl: 'https://example.com/watch?v=123',
    extractorId: 'yt-dlp',
    extractorName: 'yt-dlp',
    platform: 'ExampleVideo',
    domain: 'example.com',
    title: 'Test Video',
    uploader: 'Test Channel',
    durationSeconds: 120,
    thumbnailUrl: null,
    isLive: false,
    formats: normalized,
    availableResolutions: ['1080p', '720p'],
    availableContainers: ['mp4', 'm4a'],
    diagnosticMessages: [],
    analyzedAt: new Date().toISOString(),
  };

  it('normalizes video-only, combined, and audio-only formats accurately', () => {
    expect(normalized).toHaveLength(3);
    const f1080 = normalized.find((f) => f.formatId === '137')!;
    expect(f1080.streamType).toBe('video_only');
    expect(f1080.requiresMerge).toBe(true);
    expect(f1080.resolution).toBe('1080p');

    const f720 = normalized.find((f) => f.formatId === '22')!;
    expect(f720.streamType).toBe('combined');
    expect(f720.requiresMerge).toBe(false);

    const fAudio = normalized.find((f) => f.formatId === '140')!;
    expect(fAudio.streamType).toBe('audio_only');
    expect(fAudio.resolution).toBe('audio only');
  });

  it('selects separate video + companion audio when 1080p video-only format is requested', () => {
    const selection = selectVerifiedFormats(sampleAnalysis, {
      analysisId: 'anl_test_1',
      url: sampleAnalysis.sourceUrl,
      formatId: '137',
      qualityPreset: '1080p',
      targetContainer: 'mp4',
      convertAudioTo: 'none',
      preserveOriginal: false,
    });
    expect(selection.primaryFormat.formatId).toBe('137');
    expect(selection.companionAudioFormat?.formatId).toBe('140');
  });

  it('rejects unverified format IDs and refuses to silently downgrade unavailable resolutions', () => {
    expect(() =>
      selectVerifiedFormats(sampleAnalysis, {
        analysisId: 'anl_test_1',
        url: sampleAnalysis.sourceUrl,
        formatId: 'nonexistent-format-999',
        qualityPreset: 'best',
        targetContainer: 'mp4',
        convertAudioTo: 'none',
        preserveOriginal: false,
      })
    ).toThrow();

    expect(() =>
      selectVerifiedFormats(sampleAnalysis, {
        analysisId: 'anl_test_1',
        url: sampleAnalysis.sourceUrl,
        formatId: 'auto',
        qualityPreset: '2160p', // 4K not in analysis
        targetContainer: 'mp4',
        convertAudioTo: 'none',
        preserveOriginal: false,
      })
    ).toThrow();
  });
});

describe('Progress Parsing & HLS Manifest Parsing', () => {
  it('parses structured UVDP progress lines and standard yt-dlp progress lines', () => {
    const tick1 = parseYtDlpProgressLine('UVDP|downloading|5242880|10485760|10485760|2097152|2');
    expect(tick1).not.toBeNull();
    expect(tick1?.progressPercent).toBe(50);
    expect(tick1?.isIndeterminate).toBe(false);
    expect(tick1?.downloadedBytes).toBe(5242880);
    expect(tick1?.totalBytes).toBe(10485760);

    // Indeterminate when total bytes are NA
    const tickIndeterminate = parseYtDlpProgressLine('UVDP|downloading|1048576|NA|NA|512000|NA');
    expect(tickIndeterminate?.isIndeterminate).toBe(true);
    expect(tickIndeterminate?.progressPercent).toBeNull();

    const tickStd = parseYtDlpProgressLine('[download]  75.0% of   20.00MiB at    4.00MiB/s ETA 00:01');
    expect(tickStd?.progressPercent).toBe(75);
    expect(tickStd?.etaSeconds).toBe(1);
  });

  it('parses HLS master playlists and rejects DRM-encrypted HLS manifests', () => {
    const m3u8 = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.64002a,mp4a.40.2"',
      '1080p.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=1280x720,FRAME-RATE=30.000,CODECS="avc1.4d401f,mp4a.40.2"',
      '720p.m3u8',
    ].join('\n');

    const variants = parseHlsMasterPlaylist(m3u8);
    expect(variants).toHaveLength(2);
    expect(variants[0].height).toBe(1080);
    expect(variants[1].height).toBe(720);

    const drmPlaylist = '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://drm"\n';
    expect(() => parseHlsMasterPlaylist(drmPlaylist)).toThrow();
  });
});

describe('Download Job State Machine Transitions', () => {
  it('permits valid lifecycle transitions including pause and resume and blocks invalid transitions', () => {
    expect(canTransitionJobState('queued', 'downloading')).toBe(true);
    expect(canTransitionJobState('queued', 'paused')).toBe(true);
    expect(canTransitionJobState('downloading', 'pausing')).toBe(true);
    expect(canTransitionJobState('pausing', 'paused')).toBe(true);
    expect(canTransitionJobState('paused', 'queued')).toBe(true);
    expect(canTransitionJobState('downloading', 'merging')).toBe(true);
    expect(canTransitionJobState('merging', 'completed')).toBe(true);
    expect(canTransitionJobState('failed', 'queued')).toBe(true); // Retry
    expect(canTransitionJobState('cancelled', 'queued')).toBe(true); // Retry

    // Invalid: completed -> downloading directly
    expect(canTransitionJobState('completed', 'downloading')).toBe(false);
    expect(() => assertValidStateTransition('completed', 'downloading')).toThrow();
  });
});
