import { AppError, ErrorCode } from '../errors/taxonomy';
import {
  AppSettings,
  BulkQueueRequest,
  ContainerFormat,
  FormatSelectionRequest,
  QualityPreset,
} from '../types';

const VALID_QUALITY_PRESETS = new Set<QualityPreset>([
  'best',
  'highest_resolution',
  '2160p',
  '1440p',
  '1080p',
  '720p',
  '480p',
  '360p',
  'audio_only',
]);

const VALID_CONTAINERS = new Set<ContainerFormat>([
  'mp4',
  'webm',
  'mkv',
  'mp3',
  'm4a',
  'original',
]);

export function validateFormatSelectionInput(raw: unknown): FormatSelectionRequest {
  if (!raw || typeof raw !== 'object') {
    throw new AppError(ErrorCode.INVALID_FORMAT_ID, 'Invalid format selection payload.');
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.analysisId !== 'string' || !obj.analysisId.trim()) {
    throw new AppError(ErrorCode.INVALID_FORMAT_ID, 'Missing analysis session identifier.');
  }
  if (typeof obj.url !== 'string' || !obj.url.trim()) {
    throw new AppError(ErrorCode.INVALID_URL, 'Missing target URL in download request.');
  }
  if (typeof obj.formatId !== 'string' || !obj.formatId.trim() || !/^[a-zA-Z0-9._+-]{1,64}$/.test(obj.formatId)) {
    throw new AppError(ErrorCode.INVALID_FORMAT_ID, 'Format ID contains invalid characters.');
  }
  if (obj.audioFormatId !== undefined && obj.audioFormatId !== null) {
    if (typeof obj.audioFormatId !== 'string' || !/^[a-zA-Z0-9._+-]{1,64}$/.test(obj.audioFormatId)) {
      throw new AppError(ErrorCode.INVALID_FORMAT_ID, 'Audio format ID contains invalid characters.');
    }
  }

  const qualityPreset = (obj.qualityPreset as QualityPreset) || 'best';
  if (!VALID_QUALITY_PRESETS.has(qualityPreset)) {
    throw new AppError(ErrorCode.INVALID_FORMAT_ID, 'Unsupported quality preset.');
  }

  const targetContainer = (obj.targetContainer as ContainerFormat) || 'mp4';
  if (!VALID_CONTAINERS.has(targetContainer)) {
    throw new AppError(ErrorCode.INVALID_FORMAT_ID, 'Unsupported output container.');
  }

  const convertAudioTo =
    obj.convertAudioTo === 'mp3' || obj.convertAudioTo === 'm4a' ? obj.convertAudioTo : 'none';

  return {
    analysisId: obj.analysisId.trim(),
    url: obj.url.trim(),
    formatId: obj.formatId.trim(),
    audioFormatId: typeof obj.audioFormatId === 'string' ? obj.audioFormatId.trim() : null,
    qualityPreset,
    targetContainer,
    convertAudioTo,
    preserveOriginal: Boolean(obj.preserveOriginal),
  };
}

export function validateBulkQueueInput(raw: unknown): BulkQueueRequest {
  if (!raw || typeof raw !== 'object') {
    throw new AppError(ErrorCode.INVALID_URL, 'Invalid bulk queue request payload.');
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.urls)) {
    throw new AppError(ErrorCode.INVALID_URL, 'Bulk queue requires an array of URLs.');
  }

  const cleanedUrls = Array.from(
    new Set(
      obj.urls
        .filter((u): u is string => typeof u === 'string')
        .map((u) => u.trim())
        .filter((u) => u.length > 0)
    )
  ).slice(0, 50);

  if (cleanedUrls.length === 0) {
    throw new AppError(ErrorCode.INVALID_URL, 'Please provide at least one valid HTTP/HTTPS URL.');
  }

  const qualityPreset = VALID_QUALITY_PRESETS.has(obj.qualityPreset as QualityPreset)
    ? (obj.qualityPreset as QualityPreset)
    : 'best';

  const targetContainer = VALID_CONTAINERS.has(obj.targetContainer as ContainerFormat)
    ? (obj.targetContainer as ContainerFormat)
    : 'mp4';

  const convertAudioTo =
    obj.convertAudioTo === 'mp3' || obj.convertAudioTo === 'm4a' ? obj.convertAudioTo : 'none';

  return {
    urls: cleanedUrls,
    qualityPreset,
    targetContainer,
    convertAudioTo,
  };
}

export function validatePartialSettings(raw: unknown): Partial<AppSettings> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const input = raw as Record<string, unknown>;
  const validated: Partial<AppSettings> = {};

  if (typeof input.defaultDownloadDir === 'string' && input.defaultDownloadDir.trim().length > 0) {
    validated.defaultDownloadDir = input.defaultDownloadDir.trim();
  }
  if (typeof input.defaultResolution === 'string' && VALID_QUALITY_PRESETS.has(input.defaultResolution as QualityPreset)) {
    validated.defaultResolution = input.defaultResolution as QualityPreset;
  }
  if (typeof input.defaultOutputFormat === 'string' && VALID_CONTAINERS.has(input.defaultOutputFormat as ContainerFormat)) {
    validated.defaultOutputFormat = input.defaultOutputFormat as ContainerFormat;
  }
  if (typeof input.maxConcurrentDownloads === 'number' && Number.isFinite(input.maxConcurrentDownloads)) {
    validated.maxConcurrentDownloads = Math.max(1, Math.min(8, Math.floor(input.maxConcurrentDownloads)));
  }
  if (typeof input.maxDownloadSizeMB === 'number' && Number.isFinite(input.maxDownloadSizeMB)) {
    validated.maxDownloadSizeMB = Math.max(50, Math.min(50000, Math.floor(input.maxDownloadSizeMB)));
  }
  if (
    input.tempFileCleanupPolicy === 'immediate' ||
    input.tempFileCleanupPolicy === 'on_exit' ||
    input.tempFileCleanupPolicy === 'keep_for_debug'
  ) {
    validated.tempFileCleanupPolicy = input.tempFileCleanupPolicy;
  }
  if (input.theme === 'dark' || input.theme === 'light') {
    validated.theme = input.theme;
  }
  if (
    input.audioConversionPreference === 'none' ||
    input.audioConversionPreference === 'mp3' ||
    input.audioConversionPreference === 'm4a'
  ) {
    validated.audioConversionPreference = input.audioConversionPreference;
  }
  if (typeof input.extractorAutoUpdateCheck === 'boolean') {
    validated.extractorAutoUpdateCheck = input.extractorAutoUpdateCheck;
  }
  if (typeof input.enablePlatformExtractors === 'boolean') {
    validated.enablePlatformExtractors = input.enablePlatformExtractors;
  }
  if (typeof input.overwriteExistingFiles === 'boolean') {
    validated.overwriteExistingFiles = input.overwriteExistingFiles;
  }
  if (
    input.cookiesFromBrowser === 'auto' ||
    input.cookiesFromBrowser === 'none' ||
    input.cookiesFromBrowser === 'firefox' ||
    input.cookiesFromBrowser === 'edge' ||
    input.cookiesFromBrowser === 'chrome' ||
    input.cookiesFromBrowser === 'brave'
  ) {
    validated.cookiesFromBrowser = input.cookiesFromBrowser;
  }
  if (typeof input.cookiesFilePath === 'string') {
    validated.cookiesFilePath = input.cookiesFilePath.trim();
  }
  if (typeof input.proxyUrl === 'string') {
    const trimmedProxy = input.proxyUrl.trim();
    if (
      trimmedProxy === '' ||
      /^(https?|socks4|socks5|socks5h):\/\/[^\s]+$/i.test(trimmedProxy)
    ) {
      validated.proxyUrl = trimmedProxy;
    }
  }
  if (typeof input.geoBypassCountry === 'string') {
    const trimmedGeo = input.geoBypassCountry.trim();
    if (
      trimmedGeo === 'auto' ||
      trimmedGeo === 'none' ||
      /^[A-Z]{2}$/i.test(trimmedGeo)
    ) {
      validated.geoBypassCountry =
        trimmedGeo === 'auto' || trimmedGeo === 'none'
          ? trimmedGeo
          : trimmedGeo.toUpperCase();
    }
  }

  return validated;
}
