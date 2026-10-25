import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { AppError, classifyStderrError, ErrorCode } from '../../shared/errors/taxonomy';
import {
  AnalyzeOptions,
  AppSettings,
  DownloadExecutionOptions,
  ExtractorCapabilities,
  ExtractorContract,
  ExtractorDownloadResult,
  FormatSelectionRequest,
  MediaAnalysisResult,
  MediaFormat,
  MediaStreamType,
} from '../../shared/types';
import { getCollisionSafeFilePath, resolveSafeChildPath } from '../filesystem/pathSanitizer';
import { BinaryManager } from './binaryManager';
import { MediaProcessor } from './mediaProcessor';

export interface ParsedProgressTick {
  progressPercent: number | null;
  isIndeterminate: boolean;
  downloadedBytes: number;
  totalBytes: number | null;
  speedBytesPerSec: number | null;
  etaSeconds: number | null;
}

export function parseYtDlpProgressLine(line: string): ParsedProgressTick | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('UVDP|')) {
    const parts = trimmed.split('|');
    if (parts.length >= 7) {
      const downloadedRaw = Number(parts[2]);
      const totalExact = Number(parts[3]);
      const totalEst = Number(parts[4]);
      const speedRaw = Number(parts[5]);
      const etaRaw = Number(parts[6]);

      const downloadedBytes = Number.isFinite(downloadedRaw) && downloadedRaw >= 0 ? downloadedRaw : 0;
      const totalBytes =
        Number.isFinite(totalExact) && totalExact > 0
          ? totalExact
          : Number.isFinite(totalEst) && totalEst > 0
          ? totalEst
          : null;

      const progressPercent =
        totalBytes && totalBytes > 0
          ? Math.min(100, Math.max(0, Number(((downloadedBytes / totalBytes) * 100).toFixed(1))))
          : null;

      return {
        progressPercent,
        isIndeterminate: progressPercent === null,
        downloadedBytes,
        totalBytes,
        speedBytesPerSec: Number.isFinite(speedRaw) && speedRaw > 0 ? speedRaw : null,
        etaSeconds: Number.isFinite(etaRaw) && etaRaw >= 0 ? Math.round(etaRaw) : null,
      };
    }
  }

  if (trimmed.startsWith('[download]')) {
    const pctMatch = trimmed.match(/(\d+(?:\.\d+)?)%/);
    const sizeMatch = trimmed.match(/of\s+~?(\d+(?:\.\d+)?)(KiB|MiB|GiB|B)/i);
    const speedMatch = trimmed.match(/at\s+(\d+(?:\.\d+)?)(KiB|MiB|GiB|B)\/s/i);
    const etaMatch = trimmed.match(/ETA\s+(?:(\d+):)?(\d+):(\d+)/);

    if (!pctMatch && !sizeMatch) return null;

    const unitMultiplier = (unit: string): number => {
      switch (unit.toLowerCase()) {
        case 'gib':
          return 1024 * 1024 * 1024;
        case 'mib':
          return 1024 * 1024;
        case 'kib':
          return 1024;
        default:
          return 1;
      }
    };

    const pct = pctMatch ? Math.min(100, Math.max(0, parseFloat(pctMatch[1]))) : null;
    const totalBytes = sizeMatch
      ? Math.round(parseFloat(sizeMatch[1]) * unitMultiplier(sizeMatch[2]))
      : null;
    const downloadedBytes =
      pct !== null && totalBytes !== null ? Math.round((pct / 100) * totalBytes) : 0;
    const speedBytesPerSec = speedMatch
      ? Math.round(parseFloat(speedMatch[1]) * unitMultiplier(speedMatch[2]))
      : null;
    const etaSeconds = etaMatch
      ? (etaMatch[1] ? parseInt(etaMatch[1], 10) * 3600 : 0) +
        parseInt(etaMatch[2], 10) * 60 +
        parseInt(etaMatch[3], 10)
      : null;

    return {
      progressPercent: pct,
      isIndeterminate: pct === null,
      downloadedBytes,
      totalBytes,
      speedBytesPerSec,
      etaSeconds,
    };
  }

  return null;
}

export interface RawYtDlpFormat {
  format_id?: string;
  ext?: string;
  container?: string;
  vcodec?: string;
  acodec?: string;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  tbr?: number | null;
  vbr?: number | null;
  abr?: number | null;
  format_note?: string;
  resolution?: string;
  protocol?: string;
}

export function normalizeYtDlpFormats(rawFormats: RawYtDlpFormat[]): MediaFormat[] {
  const normalized: MediaFormat[] = [];

  for (const raw of rawFormats) {
    if (!raw.format_id) continue;
    if (raw.ext === 'mhtml' || raw.format_note === 'storyboard') continue;

    const vcodec = raw.vcodec && raw.vcodec !== 'none' ? raw.vcodec : null;
    const acodec = raw.acodec && raw.acodec !== 'none' ? raw.acodec : null;
    const hasVideo = Boolean(vcodec || (raw.height && raw.height > 0));
    const hasAudio = Boolean(acodec);

    if (!hasVideo && !hasAudio) continue;

    let streamType: MediaStreamType = 'combined';
    if (hasVideo && !hasAudio) {
      streamType = 'video_only';
    } else if (!hasVideo && hasAudio) {
      streamType = 'audio_only';
    }

    const height = typeof raw.height === 'number' && raw.height > 0 ? raw.height : null;
    const width = typeof raw.width === 'number' && raw.width > 0 ? raw.width : null;

    const resolution =
      streamType === 'audio_only'
        ? 'audio only'
        : height
        ? `${height}p`
        : raw.resolution || 'unknown';

    normalized.push({
      formatId: String(raw.format_id),
      extension: raw.ext || 'mp4',
      container: raw.container || raw.ext || 'mp4',
      streamType,
      resolution,
      height,
      width,
      fps: typeof raw.fps === 'number' && raw.fps > 0 ? Math.round(raw.fps) : null,
      vcodec,
      acodec,
      filesizeBytes: typeof raw.filesize === 'number' && raw.filesize > 0 ? raw.filesize : null,
      filesizeApproxBytes:
        typeof raw.filesize_approx === 'number' && raw.filesize_approx > 0
          ? raw.filesize_approx
          : null,
      tbrKbps: typeof raw.tbr === 'number' ? Math.round(raw.tbr) : null,
      vbrKbps: typeof raw.vbr === 'number' ? Math.round(raw.vbr) : null,
      abrKbps: typeof raw.abr === 'number' ? Math.round(raw.abr) : null,
      formatNote:
        raw.format_note ||
        (streamType === 'video_only'
          ? 'Video stream'
          : streamType === 'audio_only'
          ? 'Audio stream'
          : 'Combined A/V'),
      hasVideo,
      hasAudio,
      requiresMerge: streamType === 'video_only',
      protocol: raw.protocol || 'https',
    });
  }

  return normalized.sort((a, b) => {
    const hDiff = (b.height || 0) - (a.height || 0);
    if (hDiff !== 0) return hDiff;
    return (b.tbrKbps || 0) - (a.tbrKbps || 0);
  });
}

export class YtDlpExtractor implements ExtractorContract {
  private readonly activeProcesses = new Map<string, ChildProcess>();
  private readonly sessionAuthArgs = new Map<string, string[]>();

  constructor(
    private readonly binaryManager: BinaryManager,
    private readonly mediaProcessor: MediaProcessor,
    private readonly getSettings?: () => AppSettings
  ) {}

  public canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  public getCapabilities(): ExtractorCapabilities {
    return {
      id: 'yt-dlp',
      name: 'yt-dlp Universal Extractor',
      description:
        'Extracts public media streams, adaptive DASH/HLS formats, and metadata across supported websites.',
      supportedProtocols: ['http', 'https'],
      supportsFormatListing: true,
      supportsSeparateStreams: true,
      supportsResume: true,
      supportsLiveStreams: false,
    };
  }

  public getFormats(analysis: MediaAnalysisResult): MediaFormat[] {
    return analysis.formats;
  }

  private getInitialCookieArgs(settings?: AppSettings): string[] {
    if (!settings) return ['--no-cookies'];
    if (settings.cookiesFilePath && fs.existsSync(settings.cookiesFilePath)) {
      return ['--cookies', settings.cookiesFilePath];
    }
    if (
      settings.cookiesFromBrowser &&
      settings.cookiesFromBrowser !== 'auto' &&
      settings.cookiesFromBrowser !== 'none'
    ) {
      return ['--cookies-from-browser', settings.cookiesFromBrowser];
    }
    return ['--no-cookies'];
  }

  private getNetworkAndSiteArgs(url: string, settings?: AppSettings): string[] {
    const args: string[] = [];

    if (settings?.proxyUrl && settings.proxyUrl.trim()) {
      args.push('--proxy', settings.proxyUrl.trim());
    }

    if (settings?.geoBypassCountry && settings.geoBypassCountry !== 'none') {
      const countryCode =
        settings.geoBypassCountry === 'auto' ? 'US' : settings.geoBypassCountry.toUpperCase();
      args.push('--xff', countryCode);
    }

    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host.includes('bilibili.com') || host.includes('b23.tv')) {
        args.push(
          '--add-header',
          'Referer:https://www.bilibili.com/',
          '--user-agent',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        );
      }
    } catch {
      // Ignore URL parse error
    }

    return args;
  }

  private runYtDlpAnalyzeAttempt(
    ytDlpBin: string,
    url: string,
    extraAuthArgs: string[],
    timeoutMs: number
  ): Promise<{ stdout: string; stderr: string }> {
    const settings = this.getSettings?.();
    const networkArgs = this.getNetworkAndSiteArgs(url, settings);

    const args = [
      '--dump-single-json',
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates',
      '--geo-bypass',
      '--js-runtimes',
      'node',
      '--extractor-args',
      'youtube:player_client=default,mweb,tv_simply,android_vr',
      '--socket-timeout',
      '15',
      ...networkArgs,
      ...extraAuthArgs,
      '--',
      url,
    ];

    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(ytDlpBin, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let outBuf = '';
      let errBuf = '';

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new AppError(ErrorCode.NETWORK_FAILURE, 'Extractor analysis timed out.', errBuf, true));
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        outBuf += chunk.toString();
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        errBuf += chunk.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(
          new AppError(
            ErrorCode.EXTRACTION_FAILURE,
            `Failed to launch yt-dlp process: ${err.message}`,
            err.message
          )
        );
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          const combinedErr = errBuf || outBuf || `yt-dlp exited with code ${code}`;
          const errObj = classifyStderrError(combinedErr) as AppError & { rawStderr?: string };
          errObj.rawStderr = combinedErr;
          reject(errObj);
          return;
        }
        resolve({ stdout: outBuf, stderr: errBuf });
      });
    });
  }

  public async analyze(url: string, options?: AnalyzeOptions): Promise<MediaAnalysisResult> {
    const binStatus = await this.binaryManager.verifyAllBinaries();
    if (!binStatus.ytDlp.available || !binStatus.ytDlp.resolvedPath) {
      throw new AppError(
        ErrorCode.PACKAGING_DEPENDENCY_ERROR,
        'yt-dlp binary is not available in resources/binaries or system PATH.'
      );
    }

    const settings = this.getSettings?.();
    const timeoutMs = options?.timeoutMs ?? 30000;
    let winningAuthArgs = this.getInitialCookieArgs(settings);
    let authDiagnosticNote: string | null = null;

    let result: { stdout: string; stderr: string } | null = null;

    try {
      result = await this.runYtDlpAnalyzeAttempt(
        binStatus.ytDlp.resolvedPath,
        url,
        winningAuthArgs,
        timeoutMs
      );
    } catch (firstErr) {
      const rawStderr =
        (firstErr as { rawStderr?: string })?.rawStderr ||
        (firstErr instanceof AppError ? firstErr.technicalDetail || firstErr.message : String(firstErr));
      const lower = rawStderr.toLowerCase();

      const isBotOrSignInChallenge =
        lower.includes('not a bot') ||
        lower.includes('sign in') ||
        lower.includes('cookies-from-browser') ||
        lower.includes('login_required');

      // If YouTube/source triggered a bot challenge and auto cookie fallback is enabled,
      // automatically try installed local browser profiles (firefox, edge, chrome, brave)
      if (isBotOrSignInChallenge && (!settings || settings.cookiesFromBrowser !== 'none')) {
        const candidateBrowsers =
          settings?.cookiesFromBrowser &&
          settings.cookiesFromBrowser !== 'auto'
            ? [settings.cookiesFromBrowser]
            : ['firefox', 'edge', 'chrome', 'brave'];

        let chromiumLockedCookieDb = false;

        for (const browser of candidateBrowsers) {
          try {
            const browserArgs = ['--cookies-from-browser', browser];
            result = await this.runYtDlpAnalyzeAttempt(
              binStatus.ytDlp.resolvedPath,
              url,
              browserArgs,
              20000
            );
            winningAuthArgs = browserArgs;
            authDiagnosticNote = `Verified via local ${browser} session profile.`;
            break;
          } catch (retryErr) {
            const retryStderr = (
              (retryErr as { rawStderr?: string })?.rawStderr || ''
            ).toLowerCase();
            if (
              retryStderr.includes('could not copy') ||
              retryStderr.includes('cookie database') ||
              retryStderr.includes('dpapi') ||
              retryStderr.includes('permission denied')
            ) {
              chromiumLockedCookieDb = true;
            }
          }
        }

        if (!result) {
          if (chromiumLockedCookieDb) {
            throw new AppError(
              ErrorCode.AUTHENTICATION_REQUIRED,
              'YouTube requested bot verification ("Sign in to confirm you\'re not a bot"), and your open Edge/Chrome browser locked its cookie database on Windows. Close Edge/Chrome completely and click Analyze URL again, use Firefox, or select an exported cookies.txt file in Settings.',
              rawStderr,
              true
            );
          }
          throw new AppError(
            ErrorCode.AUTHENTICATION_REQUIRED,
            'YouTube requested bot verification ("Sign in to confirm you\'re not a bot"). To resolve this on Windows: sign in to YouTube in Firefox/Edge/Chrome (close Edge/Chrome before analyzing so its cookie DB is unlocked), or select an exported cookies.txt file in Settings.',
            rawStderr,
            true
          );
        }
      } else {
        const isNetworkTimeoutOrRefused =
          lower.includes('timed out') ||
          lower.includes('connection reset') ||
          lower.includes('unreachable') ||
          lower.includes('getaddrinfo') ||
          lower.includes('ssl') ||
          lower.includes('451') ||
          lower.includes('geo');
        if (isNetworkTimeoutOrRefused && (!settings?.proxyUrl || !settings.proxyUrl.trim())) {
          throw new AppError(
            ErrorCode.NETWORK_FAILURE,
            'Could not reach the source website (it may be regionally blocked in your country/ISP, such as Bilibili in Pakistan). Open "Unblock / Proxy" on the Home bar or in Settings to configure an HTTP/SOCKS5 proxy and Geo-Bypass country.',
            rawStderr,
            true
          );
        }
        throw firstErr;
      }
    }

    const { stdout, stderr } = result;

    let parsed: Record<string, unknown>;
    try {
      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}');
      const jsonSlice =
        jsonStart !== -1 && jsonEnd > jsonStart ? stdout.slice(jsonStart, jsonEnd + 1) : stdout;
      parsed = JSON.parse(jsonSlice) as Record<string, unknown>;
    } catch {
      throw classifyStderrError(stderr || 'Extractor returned non-JSON output.');
    }

    const rawFormats = Array.isArray(parsed.formats)
      ? (parsed.formats as RawYtDlpFormat[])
      : [
          {
            format_id: String(parsed.format_id || 'default'),
            ext: String(parsed.ext || 'mp4'),
            vcodec: String(parsed.vcodec || 'h264'),
            acodec: String(parsed.acodec || 'aac'),
            height: typeof parsed.height === 'number' ? parsed.height : null,
            width: typeof parsed.width === 'number' ? parsed.width : null,
            fps: typeof parsed.fps === 'number' ? parsed.fps : null,
            filesize: typeof parsed.filesize === 'number' ? parsed.filesize : null,
          },
        ];

    const formats = normalizeYtDlpFormats(rawFormats);
    if (formats.length === 0) {
      throw new AppError(
        ErrorCode.UNAVAILABLE_MEDIA,
        'No downloadable media formats were returned by the source.'
      );
    }

    const parsedUrl = new URL(url);
    const availableResolutions = Array.from(
      new Set(formats.filter((f) => f.height !== null).map((f) => `${f.height}p`))
    );
    const availableContainers = Array.from(
      new Set(formats.map((f) => f.extension.toLowerCase()))
    );

    const analysisId = `anl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.sessionAuthArgs.set(analysisId, winningAuthArgs);

    const diagnosticMessages = [
      `Extractor "${
        typeof parsed.extractor_key === 'string' ? parsed.extractor_key : 'generic'
      }" returned ${formats.length} stream format(s).`,
    ];
    if (authDiagnosticNote) {
      diagnosticMessages[0] += ` (${authDiagnosticNote})`;
    }

    return {
      analysisId,
      sourceUrl: url,
      normalizedUrl: typeof parsed.webpage_url === 'string' ? parsed.webpage_url : url,
      extractorId: 'yt-dlp',
      extractorName:
        typeof parsed.extractor_key === 'string'
          ? `yt-dlp (${parsed.extractor_key})`
          : 'yt-dlp',
      platform:
        typeof parsed.extractor_key === 'string' ? parsed.extractor_key : parsedUrl.hostname,
      domain: parsedUrl.hostname,
      title:
        typeof parsed.title === 'string' && parsed.title.trim()
          ? parsed.title.trim()
          : 'Untitled Video',
      uploader: typeof parsed.uploader === 'string' ? parsed.uploader : null,
      durationSeconds:
        typeof parsed.duration === 'number' ? Math.round(parsed.duration) : null,
      thumbnailUrl: typeof parsed.thumbnail === 'string' ? parsed.thumbnail : null,
      isLive: Boolean(parsed.is_live),
      formats,
      availableResolutions,
      availableContainers,
      diagnosticMessages,
      analyzedAt: new Date().toISOString(),
    };
  }

  public async download(
    analysis: MediaAnalysisResult,
    selectedFormat: MediaFormat,
    selectedAudioFormat: MediaFormat | null,
    request: FormatSelectionRequest,
    options: DownloadExecutionOptions
  ): Promise<ExtractorDownloadResult> {
    const binStatus = await this.binaryManager.verifyAllBinaries();
    if (!binStatus.ytDlp.available || !binStatus.ytDlp.resolvedPath) {
      throw new AppError(ErrorCode.PACKAGING_DEPENDENCY_ERROR, 'yt-dlp binary is unavailable.');
    }

    const formatExpr =
      selectedFormat.requiresMerge && selectedAudioFormat
        ? `${selectedFormat.formatId}+${selectedAudioFormat.formatId}`
        : selectedFormat.formatId;

    const tempTemplate = resolveSafeChildPath(options.tempDir, 'stream_%(id)s.%(ext)s');
    const maxFileSizeArg = `${Math.max(
      10,
      Math.floor(options.maxFileSizeBytes / (1024 * 1024))
    )}M`;

    const settings = this.getSettings?.();
    const authArgs =
      this.sessionAuthArgs.get(analysis.analysisId) ||
      this.getInitialCookieArgs(settings);
    const networkArgs = this.getNetworkAndSiteArgs(analysis.sourceUrl, settings);

    const args: string[] = [
      '--no-playlist',
      '--newline',
      '--no-check-certificates',
      '--geo-bypass',
      '--js-runtimes',
      'node',
      '--extractor-args',
      'youtube:player_client=default,mweb,tv_simply,android_vr',
      ...networkArgs,
      ...authArgs,
      '--max-filesize',
      maxFileSizeArg,
      '--progress-template',
      'download:UVDP|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s',
      '-f',
      formatExpr,
      '-o',
      tempTemplate,
    ];

    if (binStatus.ffmpeg.available && binStatus.ffmpeg.resolvedPath) {
      args.push('--ffmpeg-location', binStatus.ffmpeg.resolvedPath);
    }

    const desiredContainer =
      request.convertAudioTo !== 'none'
        ? request.convertAudioTo
        : request.targetContainer === 'original'
        ? selectedFormat.extension
        : request.targetContainer;

    if (
      selectedFormat.requiresMerge &&
      (desiredContainer === 'mp4' || desiredContainer === 'mkv' || desiredContainer === 'webm')
    ) {
      args.push('--merge-output-format', desiredContainer);
    }

    args.push('--', analysis.sourceUrl);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(binStatus.ytDlp.resolvedPath!, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.activeProcesses.set(options.jobId, child);

      let stderr = '';

      child.stdout?.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split(/\r?\n/);
        for (const line of lines) {
          const tick = parseYtDlpProgressLine(line);
          if (tick) {
            options.onProgress({
              state: 'downloading',
              progressPercent: tick.progressPercent,
              isIndeterminate: tick.isIndeterminate,
              downloadedBytes: tick.downloadedBytes,
              totalBytes: tick.totalBytes,
              speedBytesPerSec: tick.speedBytesPerSec,
              etaSeconds: tick.etaSeconds,
              stageDescription: 'Downloading media stream via yt-dlp...',
            });
          } else if (line.includes('[Merger]')) {
            options.onProgress({
              state: 'merging',
              progressPercent: 99,
              isIndeterminate: false,
              downloadedBytes: 0,
              totalBytes: null,
              speedBytesPerSec: null,
              etaSeconds: 1,
              stageDescription: 'Merging video and audio streams with FFmpeg...',
            });
          }
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
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
          reject(classifyStderrError(stderr || `yt-dlp exited with code ${code}`));
          return;
        }
        resolve();
      });
    });

    const files = fs
      .readdirSync(options.tempDir)
      .filter((f) => !f.endsWith('.part') && !f.endsWith('.ytdl'));
    if (files.length === 0) {
      throw new AppError(
        ErrorCode.INTERRUPTED_PROCESS,
        'yt-dlp finished but no output file was found.'
      );
    }

    let currentTempFile = path.join(options.tempDir, files[0]);
    let finalExt = path.extname(currentTempFile).replace(/^\./, '') || desiredContainer;

    if (request.convertAudioTo === 'mp3' || request.convertAudioTo === 'm4a') {
      options.onProgress({
        state: 'converting',
        progressPercent: 99,
        isIndeterminate: false,
        downloadedBytes: fs.statSync(currentTempFile).size,
        totalBytes: fs.statSync(currentTempFile).size,
        speedBytesPerSec: null,
        etaSeconds: 1,
        stageDescription: `Converting audio to ${request.convertAudioTo.toUpperCase()} via FFmpeg...`,
      });
      const convertedTemp = resolveSafeChildPath(
        options.tempDir,
        `converted.${request.convertAudioTo}`
      );
      await this.mediaProcessor.convertToAudioFormat(
        currentTempFile,
        convertedTemp,
        request.convertAudioTo,
        undefined,
        (proc) => this.activeProcesses.set(options.jobId, proc)
      );
      this.activeProcesses.delete(options.jobId);
      currentTempFile = convertedTemp;
      finalExt = request.convertAudioTo;
    }

    const finalFilePath = getCollisionSafeFilePath(
      options.outputDir,
      analysis.title,
      finalExt,
      false
    );

    fs.copyFileSync(currentTempFile, finalFilePath);
    const stat = fs.statSync(finalFilePath);

    return {
      finalFilePath,
      fileSizeBytes: stat.size,
      container: finalExt,
      mergedStreams: Boolean(selectedFormat.requiresMerge && selectedAudioFormat),
    };
  }

  public async cancel(jobId: string): Promise<boolean> {
    const proc = this.activeProcesses.get(jobId);
    if (!proc) return false;
    try {
      proc.kill('SIGTERM');
      setTimeout(() => {
        try {
          if (!proc.killed) proc.kill('SIGKILL');
        } catch {
          // Ignore
        }
      }, 1500);
      this.activeProcesses.delete(jobId);
      return true;
    } catch {
      return false;
    }
  }
}
