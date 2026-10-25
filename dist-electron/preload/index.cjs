// src/preload/index.ts
var import_electron = require("electron");

// src/shared/events/channels.ts
var IPC_CHANNELS = {
  ANALYZE_URL: "uvd:analyze-url",
  START_DOWNLOAD: "uvd:start-download",
  BULK_ENQUEUE: "uvd:bulk-enqueue",
  CANCEL_JOB: "uvd:cancel-job",
  RETRY_JOB: "uvd:retry-job",
  REMOVE_JOB: "uvd:remove-job",
  GET_JOBS: "uvd:get-jobs",
  GET_HISTORY: "uvd:get-history",
  REMOVE_HISTORY_ITEM: "uvd:remove-history-item",
  DELETE_DOWNLOADED_FILE: "uvd:delete-downloaded-file",
  CLEAR_HISTORY: "uvd:clear-history",
  OPEN_FILE: "uvd:open-file",
  OPEN_FOLDER: "uvd:open-folder",
  SELECT_DIRECTORY: "uvd:select-directory",
  SELECT_COOKIES_FILE: "uvd:select-cookies-file",
  GET_SETTINGS: "uvd:get-settings",
  UPDATE_SETTINGS: "uvd:update-settings",
  GET_BINARY_STATUS: "uvd:get-binary-status",
  CHECK_EXTRACTOR_UPDATES: "uvd:check-extractor-updates",
  GET_DIAGNOSTICS: "uvd:get-diagnostics",
  CLEAR_DIAGNOSTICS: "uvd:clear-diagnostics",
  GET_SAMPLE_SOURCES: "uvd:get-sample-sources",
  WINDOW_MINIMIZE: "uvd:window-minimize",
  WINDOW_MAXIMIZE: "uvd:window-maximize",
  WINDOW_CLOSE: "uvd:window-close",
  JOB_PROGRESS_EVENT: "uvd:job-progress-event"
};
var ALLOWED_INVOKE_CHANNELS = /* @__PURE__ */ new Set([
  IPC_CHANNELS.ANALYZE_URL,
  IPC_CHANNELS.START_DOWNLOAD,
  IPC_CHANNELS.BULK_ENQUEUE,
  IPC_CHANNELS.CANCEL_JOB,
  IPC_CHANNELS.RETRY_JOB,
  IPC_CHANNELS.REMOVE_JOB,
  IPC_CHANNELS.GET_JOBS,
  IPC_CHANNELS.GET_HISTORY,
  IPC_CHANNELS.REMOVE_HISTORY_ITEM,
  IPC_CHANNELS.DELETE_DOWNLOADED_FILE,
  IPC_CHANNELS.CLEAR_HISTORY,
  IPC_CHANNELS.OPEN_FILE,
  IPC_CHANNELS.OPEN_FOLDER,
  IPC_CHANNELS.SELECT_DIRECTORY,
  IPC_CHANNELS.SELECT_COOKIES_FILE,
  IPC_CHANNELS.GET_SETTINGS,
  IPC_CHANNELS.UPDATE_SETTINGS,
  IPC_CHANNELS.GET_BINARY_STATUS,
  IPC_CHANNELS.CHECK_EXTRACTOR_UPDATES,
  IPC_CHANNELS.GET_DIAGNOSTICS,
  IPC_CHANNELS.CLEAR_DIAGNOSTICS,
  IPC_CHANNELS.GET_SAMPLE_SOURCES,
  IPC_CHANNELS.WINDOW_MINIMIZE,
  IPC_CHANNELS.WINDOW_MAXIMIZE,
  IPC_CHANNELS.WINDOW_CLOSE
]);

// src/preload/index.ts
var electronAPI = {
  analyzeUrl: (url) => import_electron.ipcRenderer.invoke(IPC_CHANNELS.ANALYZE_URL, url),
  startDownload: (request) => import_electron.ipcRenderer.invoke(IPC_CHANNELS.START_DOWNLOAD, request),
  bulkEnqueue: (request) => import_electron.ipcRenderer.invoke(IPC_CHANNELS.BULK_ENQUEUE, request),
  cancelJob: (jobId) => import_electron.ipcRenderer.invoke(IPC_CHANNELS.CANCEL_JOB, jobId),
  retryJob: (jobId) => import_electron.ipcRenderer.invoke(IPC_CHANNELS.RETRY_JOB, jobId),
  removeJob: (jobId) => import_electron.ipcRenderer.invoke(IPC_CHANNELS.REMOVE_JOB, jobId),
  getJobs: () => import_electron.ipcRenderer.invoke(IPC_CHANNELS.GET_JOBS),
  getHistory: () => import_electron.ipcRenderer.invoke(IPC_CHANNELS.GET_HISTORY),
  removeHistoryItem: (historyId) => import_electron.ipcRenderer.invoke(IPC_CHANNELS.REMOVE_HISTORY_ITEM, historyId),
  deleteDownloadedFile: (payload) => import_electron.ipcRenderer.invoke(IPC_CHANNELS.DELETE_DOWNLOADED_FILE, payload),
  clearHistory: () => import_electron.ipcRenderer.invoke(IPC_CHANNELS.CLEAR_HISTORY),
  openFile: (filePath) => import_electron.ipcRenderer.invoke(IPC_CHANNELS.OPEN_FILE, filePath),
  openFolder: (filePathOrDir) => import_electron.ipcRenderer.invoke(IPC_CHANNELS.OPEN_FOLDER, filePathOrDir),
  selectDirectory: () => import_electron.ipcRenderer.invoke(IPC_CHANNELS.SELECT_DIRECTORY),
  selectCookiesFile: () => import_electron.ipcRenderer.invoke(IPC_CHANNELS.SELECT_COOKIES_FILE),
  getSettings: () => import_electron.ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  updateSettings: (partial) => import_electron.ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SETTINGS, partial),
  getBinaryStatus: () => import_electron.ipcRenderer.invoke(IPC_CHANNELS.GET_BINARY_STATUS),
  checkExtractorUpdates: () => import_electron.ipcRenderer.invoke(IPC_CHANNELS.CHECK_EXTRACTOR_UPDATES),
  getDiagnostics: () => import_electron.ipcRenderer.invoke(IPC_CHANNELS.GET_DIAGNOSTICS),
  clearDiagnostics: () => import_electron.ipcRenderer.invoke(IPC_CHANNELS.CLEAR_DIAGNOSTICS),
  getSampleSources: () => import_electron.ipcRenderer.invoke(IPC_CHANNELS.GET_SAMPLE_SOURCES),
  minimizeWindow: () => import_electron.ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  toggleMaximizeWindow: () => import_electron.ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
  closeWindow: () => import_electron.ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  onJobProgress: (callback) => {
    const listener = (_event, data) => {
      callback(data);
    };
    import_electron.ipcRenderer.on(IPC_CHANNELS.JOB_PROGRESS_EVENT, listener);
    return () => {
      import_electron.ipcRenderer.removeListener(IPC_CHANNELS.JOB_PROGRESS_EVENT, listener);
    };
  }
};
import_electron.contextBridge.exposeInMainWorld("electronAPI", Object.freeze(electronAPI));
