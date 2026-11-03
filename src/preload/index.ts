import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '../shared/events/channels';
import {
  AppSettings,
  BulkQueueRequest,
  DownloadProgressEvent,
  FormatSelectionRequest,
} from '../shared/types';
import { ElectronPreloadApi } from './api';

const electronAPI: ElectronPreloadApi = {
  analyzeUrl: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.ANALYZE_URL, url),
  startDownload: (request: FormatSelectionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.START_DOWNLOAD, request),
  bulkEnqueue: (request: BulkQueueRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.BULK_ENQUEUE, request),
  pauseJob: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.PAUSE_JOB, jobId),
  resumeJob: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.RESUME_JOB, jobId),
  cancelJob: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.CANCEL_JOB, jobId),
  retryJob: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.RETRY_JOB, jobId),
  removeJob: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.REMOVE_JOB, jobId),
  getJobs: () => ipcRenderer.invoke(IPC_CHANNELS.GET_JOBS),
  getHistory: () => ipcRenderer.invoke(IPC_CHANNELS.GET_HISTORY),
  removeHistoryItem: (historyId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.REMOVE_HISTORY_ITEM, historyId),
  deleteDownloadedFile: (payload: { historyId: string; confirmed: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.DELETE_DOWNLOADED_FILE, payload),
  clearHistory: () => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_HISTORY),
  openFile: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_FILE, filePath),
  openFolder: (filePathOrDir: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_FOLDER, filePathOrDir),
  selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_DIRECTORY),
  selectCookiesFile: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_COOKIES_FILE),
  getAvailableDirectories: () => ipcRenderer.invoke(IPC_CHANNELS.GET_AVAILABLE_DIRECTORIES),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  updateSettings: (partial: Partial<AppSettings>) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SETTINGS, partial),
  getBinaryStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_BINARY_STATUS),
  checkExtractorUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.CHECK_EXTRACTOR_UPDATES),
  getDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.GET_DIAGNOSTICS),
  clearDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_DIAGNOSTICS),
  getSampleSources: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SAMPLE_SOURCES),
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  toggleMaximizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  onJobProgress: (callback: (event: DownloadProgressEvent) => void) => {
    const listener = (_event: IpcRendererEvent, data: DownloadProgressEvent) => {
      callback(data);
    };
    ipcRenderer.on(IPC_CHANNELS.JOB_PROGRESS_EVENT, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.JOB_PROGRESS_EVENT, listener);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', Object.freeze(electronAPI));
