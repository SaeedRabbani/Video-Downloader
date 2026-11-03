import {
  AppSettings,
  BinaryStatusReport,
  BulkQueueRequest,
  BulkQueueResult,
  DiagnosticEntry,
  DownloadJob,
  DownloadProgressEvent,
  FormatSelectionRequest,
  HistoryRecord,
  MediaAnalysisResult,
  SampleTestSource,
} from '../shared/types';

export interface ElectronPreloadApi {
  analyzeUrl(url: string): Promise<MediaAnalysisResult>;
  startDownload(request: FormatSelectionRequest): Promise<DownloadJob>;
  bulkEnqueue(request: BulkQueueRequest): Promise<BulkQueueResult>;
  pauseJob(jobId: string): Promise<DownloadJob>;
  resumeJob(jobId: string): Promise<DownloadJob>;
  cancelJob(jobId: string): Promise<DownloadJob>;
  retryJob(jobId: string): Promise<DownloadJob>;
  removeJob(jobId: string): Promise<{ removed: boolean; jobId: string }>;
  getJobs(): Promise<DownloadJob[]>;
  getHistory(): Promise<HistoryRecord[]>;
  removeHistoryItem(historyId: string): Promise<boolean>;
  deleteDownloadedFile(payload: { historyId: string; confirmed: boolean }): Promise<{ deleted: boolean; historyId: string }>;
  clearHistory(): Promise<{ cleared: boolean }>;
  openFile(filePath: string): Promise<{ opened: boolean }>;
  openFolder(filePathOrDir: string): Promise<{ opened: boolean }>;
  selectDirectory(): Promise<string | null>;
  selectCookiesFile(): Promise<string | null>;
  getAvailableDirectories(): Promise<string[]>;
  getSettings(): Promise<AppSettings>;
  updateSettings(partial: Partial<AppSettings>): Promise<AppSettings>;
  getBinaryStatus(): Promise<BinaryStatusReport>;
  checkExtractorUpdates(): Promise<{ currentVersion: string | null; statusMessage: string; upToDate: boolean }>;
  getDiagnostics(): Promise<DiagnosticEntry[]>;
  clearDiagnostics(): Promise<{ cleared: boolean }>;
  getSampleSources(): Promise<SampleTestSource[]>;
  minimizeWindow(): Promise<{ minimized: boolean }>;
  toggleMaximizeWindow(): Promise<{ maximized: boolean }>;
  closeWindow(): Promise<{ closed: boolean }>;
  onJobProgress(callback: (event: DownloadProgressEvent) => void): () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronPreloadApi;
  }
}
