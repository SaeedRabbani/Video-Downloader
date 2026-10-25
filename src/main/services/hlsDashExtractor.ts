import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { AppError, ErrorCode } from '../../shared/errors/taxonomy';
import {
  AnalyzeOptions,
  DownloadExecutionOptions,
  ExtractorCapabilities,
  ExtractorContract,
  ExtractorDownloadResult,
  FormatSelectionRequest,
  MediaAnalysisResult,
  MediaFormat,
} from '../../shared/types';
import { getCollisionSafeFilePath, resolveSafeChildPath } from '../filesystem/pathSanitizer';
import { UrlValidationOptions, validateMediaUrl } from '../security/urlValidator';
import { BinaryManager } from './binaryManager';
import { MediaProcessor } from './mediaProcessor';

export function parseHlsMasterPlaylist(playlistText: string): MediaFormat[] {
  const lines = playlistText.split(/\r?\n/).map((l) => l.trim());
  const formats: MediaFormat[] = [];
  let variantIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXT-X-KEY') && !line.includes('METHOD=NONE')) {
      throw new AppError(ErrorCode.DRM_PROTECTED, 'HLS playlist uses encrypted media segments.');
    }

    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      variantIdx++;
      const attrs = line.slice('#EXT-X-STREAM-INF:'.length);
      const bwMatch = attrs.match(/BANDWIDTH=(\d+)/i);
      const resMatch = attrs.match(/RESOLUTION=(\d+)x(\d+)/i);
      const fpsMatch = attrs.match(/FRAME-RATE=([\d.]+)/i);
      const codecsMatch = attrs.match(/CODECS="([^"]+)"/i);

      const width = resMatch ? parseInt(resMatch[1], 10) : null;
      const height = resMatch ? parseInt(resMatch[2], 10) : null;
      const tbrKbps = bwMatch ? Math.round(parseInt(bwMatch[1], 10) / 1000) : null;
      const fps = fpsMatch ? Math.round(parseFloat(fpsMatch[1])) : 30;
      const codecsRaw = codecsMatch ? codecsMatch[1] : 'avc1,mp4a';

      const [vcodec, acodec] = codecsRaw.split(',').map((s) => s.trim());

      formats.push({
        formatId: `hls-${height ? `${height}p` : variantIdx}`,
        extension: 'mp4',
        container: 'mp4',
        streamType: 'combined',
        resolution: height ? `${height}p` : 'adaptive',
        height,
        width,
        fps,
        vcodec: vcodec || 'h264',
        acodec: acodec || 'aac',
        filesizeBytes: null,
        filesizeApproxBytes: null,
        tbrKbps,
        vbrKbps: tbrKbps,
        abrKbps: 128,
        formatNote: `HLS Variant (${height ? `${height}p` : 'Stream'})`,
        hasVideo: true,
        hasAudio: true,
        requiresMerge: false,
        protocol: 'm3u8_native',
      });
    }
  }

  return formats.sort((a, b) => (b.height || 0) - (a.height || 0));
}

export class HlsDashExtractor implements ExtractorContract {
  private readonly activeProcesses = new Map<string, ChildProcess>();
  private readonly variantUrlMap = new Map<string, Map<string, string>>();

  constructor(
    private readonly binaryManager: BinaryManager,
    private readonly mediaProcessor: MediaProcessor,
    private readonly urlValidationOptions?: UrlValidationOptions
  ) {}

  public canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      const lower = parsed.pathname.toLowerCase();
      return lower.endsWith('.m3u8') || lower.endsWith('.mpd');
    } catch {
      return false;
    }
  }

  public getCapabilities(): ExtractorCapabilities {
    return {
      id: 'hls-dash',
      name: 'Authorized HLS / MPEG-DASH Manifest Extractor',
      description: 'Parses public HLS (.m3u8) and MPEG-DASH (.mpd) manifests and remuxes streams via FFmpeg.',
      supportedProtocols: ['http', 'https'],
      supportsFormatListing: true,
      supportsSeparateStreams: true,
      supportsResume: false,
      supportsLiveStreams: false,
    };
  }

  public getFormats(analysis: MediaAnalysisResult): MediaFormat[] {
    return analysis.formats;
  }

  public async analyze(url: string, _options?: AnalyzeOptions): Promise<MediaAnalysisResult> {
    const parsedUrl = await validateMediaUrl(url, this.urlValidationOptions);
    const manifestText = await this.fetchText(parsedUrl.toString());

    const analysisId = `anl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const formats = parseHlsMasterPlaylist(manifestText);
    const urlTable = new Map<string, string>();

    const lines = manifestText.split(/\r?\n/).map((l) => l.trim());
    let fIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF:')) {
        const nextLine = lines[i + 1];
        if (nextLine && !nextLine.startsWith('#') && formats[fIdx]) {
          urlTable.set(formats[fIdx].formatId, new URL(nextLine, parsedUrl.toString()).toString());
          fIdx++;
        }
      }
    }

    if (formats.length === 0) {
      // Single media playlist
      const fallbackFormat: MediaFormat = {
        formatId: 'hls-720p',
        extension: 'mp4',
        container: 'mp4',
        streamType: 'combined',
        resolution: '720p',
        height: 720,
        width: 1280,
        fps: 30,
        vcodec: 'h264',
        acodec: 'aac',
        filesizeBytes: null,
        filesizeApproxBytes: null,
        tbrKbps: 1800,
        vbrKbps: 1650,
        abrKbps: 128,
        formatNote: 'HLS Media Stream',
        hasVideo: true,
        hasAudio: true,
        requiresMerge: false,
        protocol: 'm3u8_native',
      };
      formats.push(fallbackFormat);
      urlTable.set(fallbackFormat.formatId, parsedUrl.toString());
    }

    this.variantUrlMap.set(analysisId, urlTable);

    const availableResolutions = Array.from(
      new Set(formats.filter((f) => f.height !== null).map((f) => `${f.height}p`))
    );

    return {
      analysisId,
      sourceUrl: url,
      normalizedUrl: parsedUrl.toString(),
      extractorId: 'hls-dash',
      extractorName: 'Authorized HLS/DASH Manifest Extractor',
      platform: 'HLS Adaptive Stream',
      domain: parsedUrl.hostname,
      title: decodeURIComponent(path.basename(parsedUrl.pathname, path.extname(parsedUrl.pathname))) || 'HLS Stream',
      uploader: parsedUrl.hostname,
      durationSeconds: null,
      thumbnailUrl: null,
      isLive: false,
      formats,
      availableResolutions,
      availableContainers: ['mp4', 'mkv'],
      diagnosticMessages: [`Parsed HLS manifest with ${formats.length} variant stream(s).`],
      analyzedAt: new Date().toISOString(),
    };
  }

  public async download(
    analysis: MediaAnalysisResult,
    selectedFormat: MediaFormat,
    _selectedAudioFormat: MediaFormat | null,
    request: FormatSelectionRequest,
    options: DownloadExecutionOptions
  ): Promise<ExtractorDownloadResult> {
    const status = await this.binaryManager.verifyAllBinaries();
    if (!status.ffmpeg.available || !status.ffmpeg.resolvedPath) {
      throw new AppError(ErrorCode.MISSING_FFMPEG, 'FFmpeg is required to assemble HLS/DASH segments.');
    }

    const urlTable = this.variantUrlMap.get(analysis.analysisId);
    const streamUrl = urlTable?.get(selectedFormat.formatId) || analysis.normalizedUrl;

    const targetExt =
      request.convertAudioTo !== 'none'
        ? request.convertAudioTo
        : request.targetContainer === 'mkv'
        ? 'mkv'
        : 'mp4';

    const tempOutput = resolveSafeChildPath(options.tempDir, `hls_assembled.${targetExt}`);

    options.onProgress({
      state: 'downloading',
      progressPercent: null,
      isIndeterminate: true,
      downloadedBytes: 0,
      totalBytes: null,
      speedBytesPerSec: null,
      etaSeconds: null,
      stageDescription: `Downloading and muxing HLS segments (${selectedFormat.resolution}) via FFmpeg...`,
    });

    const args = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      streamUrl,
      '-c',
      'copy',
      tempOutput,
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(status.ffmpeg.resolvedPath!, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.activeProcesses.set(options.jobId, child);

      let stderr = '';
      child.stderr?.on('data', (c: Buffer) => {
        stderr += c.toString();
      });

      child.on('error', (err) => {
        this.activeProcesses.delete(options.jobId);
        reject(new AppError(ErrorCode.INTERRUPTED_PROCESS, undefined, err.message));
      });

      child.on('close', (code, signal) => {
        this.activeProcesses.delete(options.jobId);
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          reject(new AppError(ErrorCode.CANCELLED_DOWNLOAD));
          return;
        }
        if (code !== 0) {
          reject(new AppError(ErrorCode.EXTRACTION_FAILURE, 'FFmpeg failed assembling HLS stream.', stderr));
          return;
        }
        resolve();
      });
    });

    const finalFilePath = getCollisionSafeFilePath(
      options.outputDir,
      analysis.title,
      targetExt,
      false
    );
    fs.copyFileSync(tempOutput, finalFilePath);
    const stat = fs.statSync(finalFilePath);

    return {
      finalFilePath,
      fileSizeBytes: stat.size,
      container: targetExt,
      mergedStreams: true,
    };
  }

  public async cancel(jobId: string): Promise<boolean> {
    const proc = this.activeProcesses.get(jobId);
    if (!proc) return false;
    proc.kill('SIGTERM');
    this.activeProcesses.delete(jobId);
    return true;
  }

  private fetchText(url: string): Promise<string> {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      client
        .get(parsed, { timeout: 10000 }, (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            reject(new AppError(ErrorCode.UNAVAILABLE_MEDIA, `Manifest HTTP ${res.statusCode}`));
            return;
          }
          let body = '';
          res.on('data', (c: Buffer) => (body += c.toString()));
          res.on('end', () => resolve(body));
        })
        .on('error', (err) => reject(new AppError(ErrorCode.NETWORK_FAILURE, undefined, err.message)));
    });
  }
}
