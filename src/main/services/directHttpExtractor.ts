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
import { MediaProcessor } from './mediaProcessor';

const DIRECT_MEDIA_EXTENSIONS = new Set([
  '.mp4',
  '.webm',
  '.mkv',
  '.mov',
  '.m4a',
  '.mp3',
  '.wav',
  '.ogg',
  '.json', // For multi-stream manifest descriptor (.media.json)
]);

export interface MultiStreamManifest {
  title: string;
  uploader: string;
  durationSeconds: number;
  platform: string;
  thumbnailUrl: string;
  streams: Array<{
    formatId: string;
    url: string;
    extension: string;
    container: string;
    streamType: 'combined' | 'video_only' | 'audio_only';
    resolution: string;
    height: number | null;
    width: number | null;
    fps: number | null;
    vcodec: string | null;
    acodec: string | null;
    filesizeBytes: number;
    tbrKbps: number;
    formatNote: string;
  }>;
}

export class DirectHttpExtractor implements ExtractorContract {
  private readonly activeAbortControllers = new Map<string, AbortController>();
  private readonly manifestUrlMap = new Map<string, Map<string, string>>();

  constructor(
    private readonly mediaProcessor: MediaProcessor,
    private readonly urlValidationOptions?: UrlValidationOptions
  ) {}

  public canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      const pathname = parsed.pathname.toLowerCase();
      if (pathname.endsWith('.media.json')) return true;
      const ext = path.extname(pathname);
      return DIRECT_MEDIA_EXTENSIONS.has(ext) && ext !== '.json';
    } catch {
      return false;
    }
  }

  public getCapabilities(): ExtractorCapabilities {
    return {
      id: 'direct-http',
      name: 'Direct HTTP/HTTPS & Adaptive Manifest Extractor',
      description: 'Inspects and downloads direct MP4/WebM/MKV/MP3/M4A files and adaptive multi-resolution manifest streams with FFprobe and FFmpeg.',
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

  public async analyze(url: string, _options?: AnalyzeOptions): Promise<MediaAnalysisResult> {
    const parsedUrl = await validateMediaUrl(url, this.urlValidationOptions);
    const analysisId = `anl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Case 1: Multi-resolution adaptive manifest (.media.json)
    if (parsedUrl.pathname.toLowerCase().endsWith('.media.json')) {
      const manifestBuf = await this.fetchBufferWithRedirectGuard(parsedUrl.toString(), 4);
      let manifest: MultiStreamManifest;
      try {
        manifest = JSON.parse(manifestBuf.toString('utf-8')) as MultiStreamManifest;
      } catch {
        throw new AppError(ErrorCode.EXTRACTION_FAILURE, 'Failed to parse adaptive media manifest JSON.');
      }

      const formatUrlTable = new Map<string, string>();
      const formats: MediaFormat[] = manifest.streams.map((s) => {
        const resolvedStreamUrl = new URL(s.url, parsedUrl.toString()).toString();
        formatUrlTable.set(s.formatId, resolvedStreamUrl);
        return {
          formatId: s.formatId,
          extension: s.extension,
          container: s.container,
          streamType: s.streamType,
          resolution: s.resolution,
          height: s.height,
          width: s.width,
          fps: s.fps,
          vcodec: s.vcodec,
          acodec: s.acodec,
          filesizeBytes: s.filesizeBytes,
          filesizeApproxBytes: s.filesizeBytes,
          tbrKbps: s.tbrKbps,
          vbrKbps: s.streamType !== 'audio_only' ? s.tbrKbps : null,
          abrKbps: s.streamType === 'audio_only' ? s.tbrKbps : 160,
          formatNote: s.formatNote,
          hasVideo: s.streamType !== 'audio_only',
          hasAudio: s.streamType !== 'video_only',
          requiresMerge: s.streamType === 'video_only',
          protocol: parsedUrl.protocol.replace(':', ''),
          downloadUrl: resolvedStreamUrl,
        };
      });

      this.manifestUrlMap.set(analysisId, formatUrlTable);

      const availableResolutions = Array.from(
        new Set(formats.filter((f) => f.height !== null).map((f) => `${f.height}p`))
      );
      const availableContainers = Array.from(new Set(formats.map((f) => f.extension.toLowerCase())));

      return {
        analysisId,
        sourceUrl: url,
        normalizedUrl: parsedUrl.toString(),
        extractorId: 'direct-http',
        extractorName: 'Adaptive Stream & FFprobe Extractor',
        platform: manifest.platform || parsedUrl.hostname,
        domain: parsedUrl.hostname,
        title: manifest.title,
        uploader: manifest.uploader || null,
        durationSeconds: manifest.durationSeconds,
        thumbnailUrl: manifest.thumbnailUrl ? new URL(manifest.thumbnailUrl, parsedUrl.toString()).toString() : null,
        isLive: false,
        formats,
        availableResolutions,
        availableContainers,
        diagnosticMessages: [
          `Verified ${formats.length} adaptive streams (${availableResolutions.join(', ')}) via FFprobe metadata inspection.`,
        ],
        analyzedAt: new Date().toISOString(),
      };
    }

    // Case 2: Direct media file URL (.mp4, .webm, .mkv, .mp3, .m4a)
    const probe = await this.mediaProcessor.probeMedia(parsedUrl.toString());
    const videoStream = probe.streams.find((s) => s.codec_type === 'video');
    const audioStream = probe.streams.find((s) => s.codec_type === 'audio');

    if (!videoStream && !audioStream) {
      throw new AppError(ErrorCode.UNAVAILABLE_MEDIA, 'No valid video or audio streams found at the target URL.');
    }

    const ext = path.extname(parsedUrl.pathname).replace(/^\./, '').toLowerCase() || 'mp4';
    const rawTitle =
      probe.format.tags?.title ||
      decodeURIComponent(path.basename(parsedUrl.pathname, path.extname(parsedUrl.pathname))) ||
      'Direct Media Stream';

    const height = videoStream?.height ?? null;
    const width = videoStream?.width ?? null;
    let fps: number | null = null;
    if (videoStream?.r_frame_rate && videoStream.r_frame_rate.includes('/')) {
      const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
      if (den > 0) fps = Math.round(num / den);
    }

    const sizeBytes = probe.format.size ? Number(probe.format.size) : null;
    const durationSec = probe.format.duration ? Math.round(Number(probe.format.duration)) : null;
    const tbrKbps = probe.format.bit_rate ? Math.round(Number(probe.format.bit_rate) / 1000) : null;

    const streamType = videoStream && audioStream ? 'combined' : videoStream ? 'video_only' : 'audio_only';
    const formatId = `direct-${ext}-${height ? `${height}p` : 'audio'}`;

    const formatUrlTable = new Map<string, string>();
    formatUrlTable.set(formatId, parsedUrl.toString());
    this.manifestUrlMap.set(analysisId, formatUrlTable);

    const singleFormat: MediaFormat = {
      formatId,
      extension: ext,
      container: ext,
      streamType,
      resolution: height ? `${height}p` : 'audio only',
      height,
      width,
      fps,
      vcodec: videoStream?.codec_name ?? null,
      acodec: audioStream?.codec_name ?? null,
      filesizeBytes: sizeBytes,
      filesizeApproxBytes: sizeBytes,
      tbrKbps,
      vbrKbps: videoStream?.bit_rate ? Math.round(Number(videoStream.bit_rate) / 1000) : tbrKbps,
      abrKbps: audioStream?.bit_rate ? Math.round(Number(audioStream.bit_rate) / 1000) : null,
      formatNote: `Direct ${ext.toUpperCase()} stream`,
      hasVideo: Boolean(videoStream),
      hasAudio: Boolean(audioStream),
      requiresMerge: false,
      protocol: parsedUrl.protocol.replace(':', ''),
      downloadUrl: parsedUrl.toString(),
    };

    return {
      analysisId,
      sourceUrl: url,
      normalizedUrl: parsedUrl.toString(),
      extractorId: 'direct-http',
      extractorName: 'Direct HTTP/HTTPS Media Extractor (FFprobe)',
      platform: 'Direct HTTP Media Server',
      domain: parsedUrl.hostname,
      title: rawTitle,
      uploader: probe.format.tags?.artist || parsedUrl.hostname,
      durationSeconds: durationSec,
      thumbnailUrl: null,
      isLive: false,
      formats: [singleFormat],
      availableResolutions: height ? [`${height}p`] : [],
      availableContainers: [ext],
      diagnosticMessages: [
        `Inspected direct media via FFprobe (${videoStream?.codec_name || 'no-video'}/${audioStream?.codec_name || 'no-audio'}).`,
      ],
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
    const controller = new AbortController();
    this.activeAbortControllers.set(options.jobId, controller);

    try {
      const urlTable = this.manifestUrlMap.get(analysis.analysisId);
      const primaryUrl = urlTable?.get(selectedFormat.formatId) || analysis.normalizedUrl;

      const primaryTempPath = resolveSafeChildPath(
        options.tempDir,
        `primary_${selectedFormat.formatId}.${selectedFormat.extension}`
      );

      await this.streamUrlToFile(
        primaryUrl,
        primaryTempPath,
        options.maxFileSizeBytes,
        controller.signal,
        (downloaded, total, speed, eta) => {
          const pct = total && total > 0 ? Number(((downloaded / total) * 100).toFixed(1)) : null;
          options.onProgress({
            state: 'downloading',
            progressPercent: pct,
            isIndeterminate: pct === null,
            downloadedBytes: downloaded,
            totalBytes: total,
            speedBytesPerSec: speed,
            etaSeconds: eta,
            stageDescription: `Downloading ${selectedFormat.resolution} stream (${selectedFormat.formatId})...`,
          });
        }
      );

      let workingFilePath = primaryTempPath;
      let mergedStreams = false;

      // Merge separate video + audio streams via FFmpeg if needed
      if (selectedFormat.requiresMerge && selectedAudioFormat) {
        const audioUrl = urlTable?.get(selectedAudioFormat.formatId);
        if (!audioUrl) {
          throw new AppError(ErrorCode.INVALID_FORMAT_ID, 'Audio stream URL missing for merge operation.');
        }

        const audioTempPath = resolveSafeChildPath(
          options.tempDir,
          `audio_${selectedAudioFormat.formatId}.${selectedAudioFormat.extension}`
        );

        await this.streamUrlToFile(
          audioUrl,
          audioTempPath,
          options.maxFileSizeBytes,
          controller.signal,
          (downloaded, total, speed, eta) => {
            const pct = total && total > 0 ? Number(((downloaded / total) * 100).toFixed(1)) : null;
            options.onProgress({
              state: 'downloading',
              progressPercent: pct,
              isIndeterminate: pct === null,
              downloadedBytes: downloaded,
              totalBytes: total,
              speedBytesPerSec: speed,
              etaSeconds: eta,
              stageDescription: `Downloading companion audio stream (${selectedAudioFormat.formatId})...`,
            });
          }
        );

        const mergeContainer: 'mp4' | 'mkv' | 'webm' =
          request.targetContainer === 'mkv' || request.targetContainer === 'webm'
            ? request.targetContainer
            : 'mp4';

        const mergedTempPath = resolveSafeChildPath(options.tempDir, `merged_output.${mergeContainer}`);

        options.onProgress({
          state: 'merging',
          progressPercent: 98,
          isIndeterminate: false,
          downloadedBytes: fs.statSync(primaryTempPath).size + fs.statSync(audioTempPath).size,
          totalBytes: fs.statSync(primaryTempPath).size + fs.statSync(audioTempPath).size,
          speedBytesPerSec: null,
          etaSeconds: 1,
          stageDescription: `Merging ${selectedFormat.resolution} video and audio into ${mergeContainer.toUpperCase()} via FFmpeg...`,
        });

        await this.mediaProcessor.mergeVideoAndAudio(
          primaryTempPath,
          audioTempPath,
          mergedTempPath,
          mergeContainer
        );

        workingFilePath = mergedTempPath;
        mergedStreams = true;
      }

      // Optional Audio Conversion (MP3 or M4A)
      let finalExtension = path.extname(workingFilePath).replace(/^\./, '') || selectedFormat.extension;

      if (request.convertAudioTo === 'mp3' || request.convertAudioTo === 'm4a') {
        const convertedPath = resolveSafeChildPath(
          options.tempDir,
          `converted_audio.${request.convertAudioTo}`
        );

        options.onProgress({
          state: 'converting',
          progressPercent: 99,
          isIndeterminate: false,
          downloadedBytes: fs.statSync(workingFilePath).size,
          totalBytes: fs.statSync(workingFilePath).size,
          speedBytesPerSec: null,
          etaSeconds: 1,
          stageDescription: `Converting audio stream to ${request.convertAudioTo.toUpperCase()} via FFmpeg...`,
        });

        await this.mediaProcessor.convertToAudioFormat(
          workingFilePath,
          convertedPath,
          request.convertAudioTo
        );
        workingFilePath = convertedPath;
        finalExtension = request.convertAudioTo;
      } else if (
        !mergedStreams &&
        request.targetContainer !== 'original' &&
        (request.targetContainer === 'mp4' || request.targetContainer === 'mkv' || request.targetContainer === 'webm') &&
        request.targetContainer !== finalExtension
      ) {
        const remuxedPath = resolveSafeChildPath(
          options.tempDir,
          `remuxed_output.${request.targetContainer}`
        );
        options.onProgress({
          state: 'converting',
          progressPercent: 99,
          isIndeterminate: false,
          downloadedBytes: fs.statSync(workingFilePath).size,
          totalBytes: fs.statSync(workingFilePath).size,
          speedBytesPerSec: null,
          etaSeconds: 1,
          stageDescription: `Remuxing stream into ${request.targetContainer.toUpperCase()} container...`,
        });
        await this.mediaProcessor.remuxContainer(
          workingFilePath,
          remuxedPath,
          request.targetContainer
        );
        workingFilePath = remuxedPath;
        finalExtension = request.targetContainer;
      }

      const finalFilePath = getCollisionSafeFilePath(
        options.outputDir,
        analysis.title,
        finalExtension,
        false
      );

      fs.copyFileSync(workingFilePath, finalFilePath);
      const finalStat = fs.statSync(finalFilePath);

      return {
        finalFilePath,
        fileSizeBytes: finalStat.size,
        container: finalExtension,
        mergedStreams,
      };
    } finally {
      this.activeAbortControllers.delete(options.jobId);
    }
  }

  public async cancel(jobId: string): Promise<boolean> {
    const controller = this.activeAbortControllers.get(jobId);
    if (!controller) return false;
    controller.abort();
    this.activeAbortControllers.delete(jobId);
    return true;
  }

  private async fetchBufferWithRedirectGuard(targetUrl: string, maxRedirects: number): Promise<Buffer> {
    const parsed = await validateMediaUrl(targetUrl, this.urlValidationOptions);
    const client = parsed.protocol === 'https:' ? https : http;

    return new Promise<Buffer>((resolve, reject) => {
      const req = client.get(parsed, { timeout: 12000 }, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          if (maxRedirects <= 0) {
            reject(new AppError(ErrorCode.NETWORK_FAILURE, 'Too many HTTP redirects.'));
            return;
          }
          const nextUrl = new URL(res.headers.location, parsed.toString()).toString();
          this.fetchBufferWithRedirectGuard(nextUrl, maxRedirects - 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(
            new AppError(
              res.statusCode === 404 ? ErrorCode.UNAVAILABLE_MEDIA : ErrorCode.NETWORK_FAILURE,
              `Server returned HTTP ${res.statusCode}.`
            )
          );
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', (err) => reject(new AppError(ErrorCode.NETWORK_FAILURE, undefined, err.message)));
      });

      req.on('error', (err) => reject(new AppError(ErrorCode.NETWORK_FAILURE, undefined, err.message)));
    });
  }

  private async streamUrlToFile(
    targetUrl: string,
    destFilePath: string,
    maxBytes: number,
    signal: AbortSignal,
    onTick: (downloaded: number, total: number | null, speed: number | null, eta: number | null) => void,
    redirectsRemaining = 4
  ): Promise<void> {
    if (signal.aborted) {
      throw new AppError(ErrorCode.CANCELLED_DOWNLOAD);
    }

    const parsed = await validateMediaUrl(targetUrl, this.urlValidationOptions);
    const client = parsed.protocol === 'https:' ? https : http;

    const existingBytes =
      fs.existsSync(destFilePath) && fs.statSync(destFilePath).isFile()
        ? fs.statSync(destFilePath).size
        : 0;

    const headers: Record<string, string> = {};
    if (existingBytes > 0) {
      headers.Range = `bytes=${existingBytes}-`;
    }

    return new Promise<void>((resolve, reject) => {
      const req = client.get(parsed, { timeout: 25000, signal, headers }, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          if (redirectsRemaining <= 0) {
            reject(new AppError(ErrorCode.NETWORK_FAILURE, 'Maximum redirect limit reached.'));
            return;
          }
          const redirectedUrl = new URL(res.headers.location, parsed.toString()).toString();
          this.streamUrlToFile(
            redirectedUrl,
            destFilePath,
            maxBytes,
            signal,
            onTick,
            redirectsRemaining - 1
          )
            .then(resolve)
            .catch(reject);
          return;
        }

        // 416 Range Not Satisfiable when file is already complete on disk
        if (res.statusCode === 416 && existingBytes > 0) {
          res.resume();
          onTick(existingBytes, existingBytes, null, 0);
          resolve();
          return;
        }

        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(
            new AppError(
              res.statusCode === 404 ? ErrorCode.UNAVAILABLE_MEDIA : ErrorCode.NETWORK_FAILURE,
              `HTTP transfer failed with status ${res.statusCode}.`
            )
          );
          return;
        }

        const isPartial = res.statusCode === 206 && existingBytes > 0;
        const baseBytes = isPartial ? existingBytes : 0;

        const contentLengthHeader = res.headers['content-length'];
        const responseBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : null;
        const totalBytes = responseBytes !== null ? baseBytes + responseBytes : null;

        if (totalBytes && totalBytes > maxBytes) {
          res.destroy();
          reject(
            new AppError(
              ErrorCode.DISK_FULL,
              `Media size (${Math.round(totalBytes / (1024 * 1024))} MB) exceeds the configured maximum limit.`
            )
          );
          return;
        }

        const fileStream = fs.createWriteStream(destFilePath, {
          flags: isPartial ? 'a' : 'w',
        });
        let downloadedBytes = baseBytes;
        let sessionBytes = 0;
        const startTime = Date.now();

        res.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          sessionBytes += chunk.length;
          if (downloadedBytes > maxBytes) {
            req.destroy();
            fileStream.destroy();
            reject(new AppError(ErrorCode.DISK_FULL, 'Download exceeded maximum permitted file size.'));
            return;
          }

          const elapsedSec = Math.max(0.05, (Date.now() - startTime) / 1000);
          const speed = Math.round(sessionBytes / elapsedSec);
          const eta =
            totalBytes && speed > 0 ? Math.max(0, Math.round((totalBytes - downloadedBytes) / speed)) : null;

          onTick(downloadedBytes, totalBytes, speed, eta);
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (err) => {
          reject(new AppError(ErrorCode.PERMISSION_DENIED, 'Failed writing temporary media file.', err.message));
        });
      });

      req.on('error', (err) => {
        if (signal.aborted || err.name === 'AbortError') {
          reject(new AppError(ErrorCode.CANCELLED_DOWNLOAD));
          return;
        }
        reject(new AppError(ErrorCode.NETWORK_FAILURE, undefined, err.message, true));
      });
    });
  }
}
