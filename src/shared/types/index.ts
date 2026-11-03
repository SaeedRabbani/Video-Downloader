export type MediaStreamType = 'combined' | 'video_only' | 'audio_only';

export type ContainerFormat = 'mp4' | 'webm' | 'mkv' | 'mp3' | 'm4a' | 'original';

export type QualityPreset =
  | 'best'
  | 'highest_resolution'
  | '2160p'
  | '1440p'
  | '1080p'
  | '720p'
  | '480p'
  | '360p'
  | 'audio_only';

export type JobState =
  | 'queued'
  | 'analyzing'
  | 'downloading'
  | 'merging'
  | 'converting'
  | 'pausing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelling'
  | 'cancelled';

export interface MediaFormat {
  formatId: string;
  extension: string;
  container: string;
  streamType: MediaStreamType;
  resolution: string; // e.g., "1920x1080", "1280x720", "audio only"
  height: number | null;
  width: number | null;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  filesizeBytes: number | null;
  filesizeApproxBytes: number | null;
  tbrKbps: number | null;
  vbrKbps: number | null;
  abrKbps: number | null;
  formatNote: string;
  hasVideo: boolean;
  hasAudio: boolean;
  requiresMerge: boolean;
  protocol: string;
  downloadUrl?: string | null;
}

export interface MediaAnalysisResult {
  analysisId: string;
  sourceUrl: string;
  normalizedUrl: string;
  extractorId: string;
  extractorName: string;
  platform: string;
  domain: string;
  title: string;
  uploader: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  isLive: boolean;
  formats: MediaFormat[];
  availableResolutions: string[];
  availableContainers: string[];
  diagnosticMessages: string[];
  analyzedAt: string;
}

export interface FormatSelectionRequest {
  analysisId: string;
  url: string;
  formatId: string;
  audioFormatId?: string | null;
  qualityPreset: QualityPreset;
  targetContainer: ContainerFormat;
  convertAudioTo: 'none' | 'mp3' | 'm4a';
  preserveOriginal: boolean;
  customSubdirectory?: string;
}

export interface DownloadJob {
  jobId: string;
  analysisId: string;
  url: string;
  directDownloadUrl?: string | null;
  title: string;
  thumbnailUrl: string | null;
  platform: string;
  extractorId: string;
  selectedFormatId: string;
  selectedAudioFormatId: string | null;
  selectedResolution: string;
  selectedContainer: string;
  requiresMerge: boolean;
  convertAudioTo: 'none' | 'mp3' | 'm4a';
  state: JobState;
  progressPercent: number | null; // null when indeterminate
  isIndeterminate: boolean;
  downloadedBytes: number;
  totalBytes: number | null;
  speedBytesPerSec: number | null;
  etaSeconds: number | null;
  stageDescription: string;
  outputFilePath: string | null;
  tempFilePaths: string[];
  supportsResume: boolean;
  errorCode: string | null;
  userErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface DownloadProgressEvent {
  jobId: string;
  state: JobState;
  progressPercent: number | null;
  isIndeterminate: boolean;
  downloadedBytes: number;
  totalBytes: number | null;
  speedBytesPerSec: number | null;
  etaSeconds: number | null;
  stageDescription: string;
  outputFilePath?: string | null;
  errorCode?: string | null;
  userErrorMessage?: string | null;
}

export interface HistoryRecord {
  id: string;
  jobId: string;
  title: string;
  sourceUrl: string;
  platform: string;
  selectedFormat: string;
  resolution: string;
  filePath: string;
  fileSizeBytes: number;
  completedAt: string;
  status: 'completed' | 'missing_file' | 'deleted';
  fileExists: boolean;
}

export type BrowserCookieSource = 'auto' | 'none' | 'firefox' | 'edge' | 'chrome' | 'brave';

export interface AppSettings {
  defaultDownloadDir: string;
  defaultResolution: QualityPreset;
  defaultOutputFormat: ContainerFormat;
  maxConcurrentDownloads: number;
  maxDownloadSizeMB: number;
  tempFileCleanupPolicy: 'immediate' | 'on_exit' | 'keep_for_debug';
  theme: 'dark' | 'light';
  audioConversionPreference: 'none' | 'mp3' | 'm4a';
  extractorAutoUpdateCheck: boolean;
  enablePlatformExtractors: boolean;
  overwriteExistingFiles: boolean;
  cookiesFromBrowser: BrowserCookieSource;
  cookiesFilePath: string;
  proxyUrl: string;
  geoBypassCountry: string;
}

export interface BulkQueueRequest {
  urls: string[];
  qualityPreset: QualityPreset;
  targetContainer: ContainerFormat;
  convertAudioTo: 'none' | 'mp3' | 'm4a';
}

export interface BulkQueueItemResult {
  url: string;
  ok: boolean;
  job?: DownloadJob;
  error?: string;
}

export interface BulkQueueResult {
  total: number;
  queuedCount: number;
  failedCount: number;
  results: BulkQueueItemResult[];
}

export interface BinaryInfo {
  name: 'yt-dlp' | 'ffmpeg' | 'ffprobe';
  available: boolean;
  version: string | null;
  resolvedPath: string | null;
  bundled: boolean;
  error: string | null;
}

export interface BinaryStatusReport {
  allReady: boolean;
  ytDlp: BinaryInfo;
  ffmpeg: BinaryInfo;
  ffprobe: BinaryInfo;
  checkedAt: string;
}

export interface ExtractorCapabilities {
  id: string;
  name: string;
  description: string;
  supportedProtocols: ('http' | 'https')[];
  supportsFormatListing: boolean;
  supportsSeparateStreams: boolean;
  supportsResume: boolean;
  supportsLiveStreams: boolean;
}

export interface AnalyzeOptions {
  timeoutMs?: number;
  maxPlaylistItems?: number;
}

export interface DownloadExecutionOptions {
  jobId: string;
  outputDir: string;
  tempDir: string;
  maxFileSizeBytes: number;
  ffmpegPath: string | null;
  onProgress: (progress: Omit<DownloadProgressEvent, 'jobId'>) => void;
}

export interface ExtractorDownloadResult {
  finalFilePath: string;
  fileSizeBytes: number;
  container: string;
  mergedStreams: boolean;
}

export interface ExtractorContract {
  canHandle(url: string): boolean;
  analyze(url: string, options?: AnalyzeOptions): Promise<MediaAnalysisResult>;
  getFormats(analysis: MediaAnalysisResult): MediaFormat[];
  download(
    analysis: MediaAnalysisResult,
    selectedFormat: MediaFormat,
    selectedAudioFormat: MediaFormat | null,
    request: FormatSelectionRequest,
    options: DownloadExecutionOptions
  ): Promise<ExtractorDownloadResult>;
  cancel(jobId: string): Promise<boolean>;
  getCapabilities(): ExtractorCapabilities;
}

export interface DiagnosticEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  category: string;
  code: string | null;
  message: string;
  redactedContext: string | null;
}

export interface SampleTestSource {
  id: string;
  label: string;
  description: string;
  url: string;
  category: 'multi_res_dash' | 'hls_stream' | 'direct_mp4' | 'audio_stream';
}
