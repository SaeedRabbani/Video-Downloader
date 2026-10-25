import { useCallback, useEffect, useState } from 'react';
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
import { ipcClient } from '../services/ipcClient';

export type NavSection = 'home' | 'downloads' | 'history' | 'settings' | 'about';

export function useDownloaderState() {
  const [activeSection, setActiveSection] = useState<NavSection>('home');
  const [urlInput, setUrlInput] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isBulkQueuing, setIsBulkQueuing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<MediaAnalysisResult | null>(null);

  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [binaryStatus, setBinaryStatus] = useState<BinaryStatusReport | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);
  const [sampleSources, setSampleSources] = useState<SampleTestSource[]>([]);
  const [availableDirs, setAvailableDirs] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);

  const showToast = useCallback((text: string, type: 'info' | 'error' | 'success' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [jobsData, historyData, settingsData, binData, samplesData, dirsData] = await Promise.all([
        ipcClient.getJobs(),
        ipcClient.getHistory(),
        ipcClient.getSettings(),
        ipcClient.getBinaryStatus(),
        ipcClient.getSampleSources(),
        ipcClient.getAvailableDirectories().catch(() => []),
      ]);
      setJobs(jobsData);
      setHistory(historyData);
      setSettings(settingsData);
      setBinaryStatus(binData);
      setSampleSources(samplesData);
      setAvailableDirs(dirsData);
    } catch (err) {
      console.error('Failed initial state sync:', err);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  // Apply dark/light theme class to document root
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings?.theme]);

  // Subscribe to real-time job progress events
  useEffect(() => {
    const unsubscribe = ipcClient.onJobProgress((evt: DownloadProgressEvent) => {
      setJobs((prevJobs) => {
        const idx = prevJobs.findIndex((j) => j.jobId === evt.jobId);
        if (idx === -1) {
          void ipcClient.getJobs().then(setJobs);
          return prevJobs;
        }
        const updated = [...prevJobs];
        updated[idx] = {
          ...updated[idx],
          state: evt.state,
          progressPercent: evt.progressPercent,
          isIndeterminate: evt.isIndeterminate,
          downloadedBytes: evt.downloadedBytes,
          totalBytes: evt.totalBytes ?? updated[idx].totalBytes,
          speedBytesPerSec: evt.speedBytesPerSec,
          etaSeconds: evt.etaSeconds,
          stageDescription: evt.stageDescription,
          outputFilePath: evt.outputFilePath ?? updated[idx].outputFilePath,
          errorCode: evt.errorCode ?? updated[idx].errorCode,
          userErrorMessage: evt.userErrorMessage ?? updated[idx].userErrorMessage,
          updatedAt: new Date().toISOString(),
        };
        return updated;
      });

      if (evt.state === 'completed' || evt.state === 'failed' || evt.state === 'cancelled') {
        void ipcClient.getHistory().then(setHistory);
        void ipcClient.getJobs().then(setJobs);
      }
    });

    return unsubscribe;
  }, []);

  const analyzeUrl = useCallback(
    async (targetUrl?: string) => {
      const urlToAnalyze = (targetUrl ?? urlInput).trim();
      if (!urlToAnalyze) {
        setAnalysisError('Please enter a valid HTTP or HTTPS video URL.');
        return null;
      }

      setIsAnalyzing(true);
      setAnalysisError(null);
      try {
        const result = await ipcClient.analyzeUrl(urlToAnalyze);
        setCurrentAnalysis(result);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to analyze URL.';
        setAnalysisError(msg);
        setCurrentAnalysis(null);
        return null;
      } finally {
        setIsAnalyzing(false);
      }
    },
    [urlInput]
  );

  const startDownload = useCallback(
    async (request: FormatSelectionRequest) => {
      try {
        const job = await ipcClient.startDownload(request);
        setJobs((prev) => [job, ...prev.filter((j) => j.jobId !== job.jobId)]);
        showToast(`Queued download: "${job.title}" (${job.selectedResolution})`, 'success');
        return job;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not start download.';
        showToast(msg, 'error');
        throw err;
      }
    },
    [showToast]
  );

  const bulkEnqueue = useCallback(
    async (request: BulkQueueRequest): Promise<BulkQueueResult | null> => {
      setIsBulkQueuing(true);
      setAnalysisError(null);
      try {
        const result = await ipcClient.bulkEnqueue(request);
        const freshJobs = await ipcClient.getJobs();
        setJobs(freshJobs);
        if (result.queuedCount > 0 && result.failedCount === 0) {
          showToast(
            `Queued ${result.queuedCount} video download${result.queuedCount === 1 ? '' : 's'}.`,
            'success'
          );
        } else if (result.queuedCount > 0 && result.failedCount > 0) {
          showToast(
            `Queued ${result.queuedCount} of ${result.total} URLs (${result.failedCount} failed).`,
            'info'
          );
        } else {
          showToast('Failed to queue URLs. Check error details below.', 'error');
        }
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Bulk queue failed.';
        setAnalysisError(msg);
        showToast(msg, 'error');
        return null;
      } finally {
        setIsBulkQueuing(false);
      }
    },
    [showToast]
  );

  const cancelJob = useCallback(
    async (jobId: string) => {
      try {
        const updated = await ipcClient.cancelJob(jobId);
        setJobs((prev) => prev.map((j) => (j.jobId === jobId ? updated : j)));
        showToast('Download cancelled and temporary files cleaned up.', 'info');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to cancel job.', 'error');
      }
    },
    [showToast]
  );

  const retryJob = useCallback(
    async (jobId: string) => {
      try {
        const updated = await ipcClient.retryJob(jobId);
        setJobs((prev) => prev.map((j) => (j.jobId === jobId ? updated : j)));
        showToast('Download job re-queued.', 'info');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Retry failed.', 'error');
      }
    },
    [showToast]
  );

  const removeJob = useCallback(
    async (jobId: string) => {
      try {
        await ipcClient.removeJob(jobId);
        setJobs((prev) => prev.filter((j) => j.jobId !== jobId));
        showToast('Download entry removed from list.', 'info');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to remove entry.', 'error');
      }
    },
    [showToast]
  );

  const updateSettings = useCallback(
    async (partial: Partial<AppSettings>) => {
      try {
        const updated = await ipcClient.updateSettings(partial);
        setSettings(updated);
        showToast('Settings saved to SQLite database.', 'success');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to update settings.', 'error');
      }
    },
    [showToast]
  );

  const removeHistoryItem = useCallback(
    async (historyId: string) => {
      await ipcClient.removeHistoryItem(historyId);
      setHistory((prev) => prev.filter((h) => h.id !== historyId));
      showToast('History record removed (downloaded file preserved).', 'info');
    },
    [showToast]
  );

  const deleteDownloadedFile = useCallback(
    async (historyId: string) => {
      try {
        await ipcClient.deleteDownloadedFile({ historyId, confirmed: true });
        const freshHistory = await ipcClient.getHistory();
        setHistory(freshHistory);
        showToast('Downloaded media file permanently deleted from disk.', 'info');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to delete file.', 'error');
      }
    },
    [showToast]
  );

  const clearHistory = useCallback(async () => {
    await ipcClient.clearHistory();
    setHistory([]);
    showToast('Download history cleared (downloaded files on disk were preserved).', 'info');
  }, [showToast]);

  const loadDiagnostics = useCallback(async () => {
    const list = await ipcClient.getDiagnostics();
    setDiagnostics(list);
    return list;
  }, []);

  const clearDiagnostics = useCallback(async () => {
    await ipcClient.clearDiagnostics();
    setDiagnostics([]);
    showToast('Diagnostic log history cleared.', 'info');
  }, [showToast]);

  return {
    activeSection,
    setActiveSection,
    urlInput,
    setUrlInput,
    isAnalyzing,
    isBulkQueuing,
    analysisError,
    setAnalysisError,
    currentAnalysis,
    setCurrentAnalysis,
    jobs,
    history,
    settings,
    binaryStatus,
    diagnostics,
    sampleSources,
    availableDirs,
    toastMessage,
    showToast,
    analyzeUrl,
    startDownload,
    bulkEnqueue,
    cancelJob,
    retryJob,
    removeJob,
    updateSettings,
    removeHistoryItem,
    deleteDownloadedFile,
    clearHistory,
    loadDiagnostics,
    clearDiagnostics,
    refreshAll,
  };
}
