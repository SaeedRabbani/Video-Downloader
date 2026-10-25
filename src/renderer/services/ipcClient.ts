import { ElectronPreloadApi } from '../../preload/api';
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
} from '../../shared/types';

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    const message =
      payload?.error?.userMessage ||
      payload?.error?.message ||
      'An unexpected error occurred while communicating with the local backend.';
    const err = new Error(message) as Error & { code?: string; retryable?: boolean };
    err.code = payload?.error?.code || 'EXTRACTION_FAILURE';
    err.retryable = Boolean(payload?.error?.retryable);
    throw err;
  }
  return payload.data as T;
}

class DualModeIpcClient implements ElectronPreloadApi {
  private get nativeBridge(): ElectronPreloadApi | undefined {
    return typeof window !== 'undefined' ? window.electronAPI : undefined;
  }

  public isElectronNative(): boolean {
    return Boolean(this.nativeBridge);
  }

  private unwrapElectronError(err: unknown): never {
    if (err instanceof Error) {
      const cleaned = err.message.replace(
        /^Error invoking remote method '[^']+':\s*(?:AppError:\s*|Error:\s*)?/i,
        ''
      );
      throw new Error(cleaned);
    }
    throw err;
  }

  public async analyzeUrl(url: string): Promise<MediaAnalysisResult> {
    if (this.nativeBridge) {
      try {
        return await this.nativeBridge.analyzeUrl(url);
      } catch (err) {
        this.unwrapElectronError(err);
      }
    }
    return apiRequest<MediaAnalysisResult>('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  public async startDownload(request: FormatSelectionRequest): Promise<DownloadJob> {
    if (this.nativeBridge) return this.nativeBridge.startDownload(request);
    return apiRequest<DownloadJob>('/api/downloads/start', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  public async bulkEnqueue(request: BulkQueueRequest): Promise<BulkQueueResult> {
    if (this.nativeBridge) {
      try {
        return await this.nativeBridge.bulkEnqueue(request);
      } catch (err) {
        this.unwrapElectronError(err);
      }
    }
    return apiRequest<BulkQueueResult>('/api/downloads/bulk', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  public async cancelJob(jobId: string): Promise<DownloadJob> {
    if (this.nativeBridge) return this.nativeBridge.cancelJob(jobId);
    return apiRequest<DownloadJob>('/api/downloads/cancel', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    });
  }

  public async retryJob(jobId: string): Promise<DownloadJob> {
    if (this.nativeBridge) return this.nativeBridge.retryJob(jobId);
    return apiRequest<DownloadJob>('/api/downloads/retry', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    });
  }

  public async removeJob(jobId: string): Promise<{ removed: boolean; jobId: string }> {
    if (this.nativeBridge) return this.nativeBridge.removeJob(jobId);
    return apiRequest<{ removed: boolean; jobId: string }>('/api/downloads/remove', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    });
  }

  public async getJobs(): Promise<DownloadJob[]> {
    if (this.nativeBridge) return this.nativeBridge.getJobs();
    return apiRequest<DownloadJob[]>('/api/downloads');
  }

  public async getHistory(): Promise<HistoryRecord[]> {
    if (this.nativeBridge) return this.nativeBridge.getHistory();
    return apiRequest<HistoryRecord[]>('/api/history');
  }

  public async removeHistoryItem(historyId: string): Promise<boolean> {
    if (this.nativeBridge) return this.nativeBridge.removeHistoryItem(historyId);
    return apiRequest<boolean>('/api/history/remove', {
      method: 'POST',
      body: JSON.stringify({ historyId }),
    });
  }

  public async deleteDownloadedFile(payload: {
    historyId: string;
    confirmed: boolean;
  }): Promise<{ deleted: boolean; historyId: string }> {
    if (this.nativeBridge) return this.nativeBridge.deleteDownloadedFile(payload);
    return apiRequest<{ deleted: boolean; historyId: string }>('/api/history/delete-file', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async clearHistory(): Promise<{ cleared: boolean }> {
    if (this.nativeBridge) return this.nativeBridge.clearHistory();
    return apiRequest<{ cleared: boolean }>('/api/history/clear', {
      method: 'POST',
    });
  }

  public async openFile(filePath: string): Promise<{ opened: boolean }> {
    if (this.nativeBridge) return this.nativeBridge.openFile(filePath);
    const a = document.createElement('a');
    a.href = `/api/files/stream?path=${encodeURIComponent(filePath)}&download=1`;
    a.download = filePath.split(/[\\/]/).pop() || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return { opened: true };
  }

  public async openFolder(filePathOrDir: string): Promise<{ opened: boolean }> {
    if (this.nativeBridge) return this.nativeBridge.openFolder(filePathOrDir);
    return { opened: true };
  }

  public async selectDirectory(): Promise<string | null> {
    if (this.nativeBridge) return this.nativeBridge.selectDirectory();
    return null;
  }

  public async selectCookiesFile(): Promise<string | null> {
    if (this.nativeBridge) return this.nativeBridge.selectCookiesFile();
    return null;
  }

  public async getAvailableDirectories(): Promise<string[]> {
    return apiRequest<string[]>('/api/settings/directories');
  }

  public async getSettings(): Promise<AppSettings> {
    if (this.nativeBridge) return this.nativeBridge.getSettings();
    return apiRequest<AppSettings>('/api/settings');
  }

  public async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    if (this.nativeBridge) return this.nativeBridge.updateSettings(partial);
    return apiRequest<AppSettings>('/api/settings', {
      method: 'POST',
      body: JSON.stringify(partial),
    });
  }

  public async getBinaryStatus(): Promise<BinaryStatusReport> {
    if (this.nativeBridge) return this.nativeBridge.getBinaryStatus();
    return apiRequest<BinaryStatusReport>('/api/binaries/status');
  }

  public async checkExtractorUpdates(): Promise<{
    currentVersion: string | null;
    statusMessage: string;
    upToDate: boolean;
  }> {
    if (this.nativeBridge) return this.nativeBridge.checkExtractorUpdates();
    return apiRequest<{
      currentVersion: string | null;
      statusMessage: string;
      upToDate: boolean;
    }>('/api/binaries/check-updates', { method: 'POST' });
  }

  public async getDiagnostics(): Promise<DiagnosticEntry[]> {
    if (this.nativeBridge) return this.nativeBridge.getDiagnostics();
    return apiRequest<DiagnosticEntry[]>('/api/diagnostics');
  }

  public async clearDiagnostics(): Promise<{ cleared: boolean }> {
    if (this.nativeBridge) return this.nativeBridge.clearDiagnostics();
    return apiRequest<{ cleared: boolean }>('/api/diagnostics/clear', {
      method: 'POST',
    });
  }

  public async getSampleSources(): Promise<SampleTestSource[]> {
    if (this.nativeBridge) return this.nativeBridge.getSampleSources();
    return apiRequest<SampleTestSource[]>('/api/samples');
  }

  public async minimizeWindow(): Promise<{ minimized: boolean }> {
    if (this.nativeBridge) return this.nativeBridge.minimizeWindow();
    return { minimized: false };
  }

  public async toggleMaximizeWindow(): Promise<{ maximized: boolean }> {
    if (this.nativeBridge) return this.nativeBridge.toggleMaximizeWindow();
    return { maximized: false };
  }

  public async closeWindow(): Promise<{ closed: boolean }> {
    if (this.nativeBridge) return this.nativeBridge.closeWindow();
    return { closed: false };
  }

  public onJobProgress(callback: (event: DownloadProgressEvent) => void): () => void {
    if (this.nativeBridge) {
      return this.nativeBridge.onJobProgress(callback);
    }

    const evtSource = new EventSource('/api/events');
    evtSource.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as DownloadProgressEvent;
        callback(parsed);
      } catch {
        // Ignore malformed SSE event
      }
    };
    return () => {
      evtSource.close();
    };
  }
}

export const ipcClient = new DualModeIpcClient();
