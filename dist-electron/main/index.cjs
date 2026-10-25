var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/main/index.ts
var import_electron3 = require("electron");
var import_node_path12 = __toESM(require("node:path"), 1);

// src/main/ipc/handlers.ts
var import_electron = require("electron");
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);

// src/shared/errors/taxonomy.ts
var USER_ERROR_MESSAGES = {
  ["INVALID_URL" /* INVALID_URL */]: "The provided URL is not a valid or safe HTTP/HTTPS media address. Private network, localhost, and non-HTTP schemes are blocked.",
  ["UNSUPPORTED_WEBSITE" /* UNSUPPORTED_WEBSITE */]: "This website or URL format is not supported by any active extractor module.",
  ["UNAVAILABLE_MEDIA" /* UNAVAILABLE_MEDIA */]: "The requested media could not be found, has been removed, or is not publicly accessible.",
  ["AUTHENTICATION_REQUIRED" /* AUTHENTICATION_REQUIRED */]: "This media requires account authentication, cookie verification, or a paid subscription. Universal Video Downloader does not bypass login walls or collect session cookies.",
  ["DRM_PROTECTED" /* DRM_PROTECTED */]: "This stream is encrypted with Digital Rights Management (DRM). Protected content cannot be extracted or downloaded.",
  ["NETWORK_FAILURE" /* NETWORK_FAILURE */]: "A network connection error or timeout occurred while reaching the media server. Please check your connection and try again.",
  ["SOURCE_RATE_LIMITED" /* SOURCE_RATE_LIMITED */]: "The remote server rate-limited the request (HTTP 429). Wait a few moments before retrying.",
  ["EXTRACTION_FAILURE" /* EXTRACTION_FAILURE */]: "The media extractor could not parse stream metadata from the source page.",
  ["MISSING_FFMPEG" /* MISSING_FFMPEG */]: "FFmpeg or FFprobe is missing or inaccessible. Stream merging and format conversion require a verified FFmpeg binary.",
  ["INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */]: "The requested format ID does not match the verified analysis result for this media source. Please re-analyze the URL.",
  ["UNSUPPORTED_CODEC" /* UNSUPPORTED_CODEC */]: "The selected stream uses a codec incompatible with the requested container format.",
  ["DISK_FULL" /* DISK_FULL */]: "Insufficient disk space in the destination directory or the file exceeds the configured maximum download size limit.",
  ["PERMISSION_DENIED" /* PERMISSION_DENIED */]: "Write permission was denied for the selected download folder. Choose a user-writable directory.",
  ["FILE_COLLISION" /* FILE_COLLISION */]: "A file with the same name already exists and automatic overwrite is disabled.",
  ["CANCELLED_DOWNLOAD" /* CANCELLED_DOWNLOAD */]: "The download job was cancelled by the user and temporary files were cleaned up.",
  ["INTERRUPTED_PROCESS" /* INTERRUPTED_PROCESS */]: "The background extraction or media-processing process terminated unexpectedly.",
  ["PACKAGING_DEPENDENCY_ERROR" /* PACKAGING_DEPENDENCY_ERROR */]: "A required runtime dependency binary could not be initialized."
};
var AppError = class extends Error {
  constructor(code, customUserMessage, technicalDetail, retryable = false) {
    const userMessage = customUserMessage || USER_ERROR_MESSAGES[code];
    super(userMessage);
    this.name = "AppError";
    this.code = code;
    this.userMessage = userMessage;
    this.technicalDetail = technicalDetail ? redactSensitiveData(technicalDetail) : void 0;
    this.retryable = retryable;
  }
  toSafeJSON() {
    return {
      code: this.code,
      userMessage: this.userMessage,
      retryable: this.retryable
    };
  }
};
function redactSensitiveData(input) {
  if (!input) return "";
  return input.replace(
    /([?&](?:token|sig|signature|key|auth|secret|password|session|hdnts|Policy|Key-Pair-Id)=)[^&\s"']+/gi,
    "$1[REDACTED]"
  ).replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, "$1[REDACTED]").replace(/(https?:\/\/)([^/@\s]+@)/gi, "$1[REDACTED]@");
}
function extractCleanReasonFromStderr(stderr) {
  if (!stderr) return null;
  const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("Deprecated Feature:"));
  const errorLine = lines.find((l) => l.toUpperCase().startsWith("ERROR:"));
  const rawReason = errorLine ? errorLine.replace(/^ERROR:\s*(\[[^\]]+\]\s*[^:]+:\s*)?/i, "") : lines[lines.length - 1];
  if (!rawReason) return null;
  const cleaned = redactSensitiveData(rawReason).slice(0, 240);
  return cleaned || null;
}
function classifyStderrError(stderr) {
  const lower = stderr.toLowerCase();
  const specificReason = extractCleanReasonFromStderr(stderr);
  if (lower.includes("drm") || lower.includes("widevine") || lower.includes("playready") || lower.includes("encrypted")) {
    return new AppError("DRM_PROTECTED" /* DRM_PROTECTED */, void 0, stderr, false);
  }
  if (lower.includes("not a bot") || lower.includes("sign in") || lower.includes("login required") || lower.includes("members-only") || lower.includes("private video") || lower.includes("cookies-from-browser") || lower.includes("401") || lower.includes("403 forbidden")) {
    return new AppError(
      "AUTHENTICATION_REQUIRED" /* AUTHENTICATION_REQUIRED */,
      specificReason ? `Source requires authentication or bot verification (${specificReason}). Universal Video Downloader does not harvest browser cookies or bypass login walls.` : void 0,
      stderr,
      false
    );
  }
  if (lower.includes("429") || lower.includes("too many requests") || lower.includes("rate limit")) {
    return new AppError("SOURCE_RATE_LIMITED" /* SOURCE_RATE_LIMITED */, void 0, stderr, true);
  }
  if (lower.includes("unsupported url") || lower.includes("no suitable extractor")) {
    return new AppError(
      "UNSUPPORTED_WEBSITE" /* UNSUPPORTED_WEBSITE */,
      specificReason ? `Unsupported URL or webpage (${specificReason}). Paste a direct video link or a supported public media URL.` : void 0,
      stderr,
      false
    );
  }
  if (lower.includes("404") || lower.includes("not found") || lower.includes("video unavailable") || lower.includes("incomplete youtube id")) {
    return new AppError(
      "UNAVAILABLE_MEDIA" /* UNAVAILABLE_MEDIA */,
      specificReason ? `Media unavailable: ${specificReason}` : void 0,
      stderr,
      false
    );
  }
  if (lower.includes("no space left") || lower.includes("enospc") || lower.includes("file is larger than max-filesize")) {
    return new AppError("DISK_FULL" /* DISK_FULL */, void 0, stderr, false);
  }
  if (lower.includes("eacces") || lower.includes("eperm") || lower.includes("permission denied")) {
    return new AppError("PERMISSION_DENIED" /* PERMISSION_DENIED */, void 0, stderr, false);
  }
  if (lower.includes("timed out") || lower.includes("connection refused") || lower.includes("enotfound") || lower.includes("network is unreachable") || lower.includes("unable to download webpage")) {
    return new AppError(
      "NETWORK_FAILURE" /* NETWORK_FAILURE */,
      specificReason ? `Network error while contacting source: ${specificReason}` : void 0,
      stderr,
      true
    );
  }
  return new AppError(
    "EXTRACTION_FAILURE" /* EXTRACTION_FAILURE */,
    specificReason ? `The media extractor could not parse stream metadata: ${specificReason}` : void 0,
    stderr,
    true
  );
}

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

// src/shared/schemas/validation.ts
var VALID_QUALITY_PRESETS = /* @__PURE__ */ new Set([
  "best",
  "highest_resolution",
  "2160p",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p",
  "audio_only"
]);
var VALID_CONTAINERS = /* @__PURE__ */ new Set([
  "mp4",
  "webm",
  "mkv",
  "mp3",
  "m4a",
  "original"
]);
function validateFormatSelectionInput(raw) {
  if (!raw || typeof raw !== "object") {
    throw new AppError("INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */, "Invalid format selection payload.");
  }
  const obj = raw;
  if (typeof obj.analysisId !== "string" || !obj.analysisId.trim()) {
    throw new AppError("INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */, "Missing analysis session identifier.");
  }
  if (typeof obj.url !== "string" || !obj.url.trim()) {
    throw new AppError("INVALID_URL" /* INVALID_URL */, "Missing target URL in download request.");
  }
  if (typeof obj.formatId !== "string" || !obj.formatId.trim() || !/^[a-zA-Z0-9._+-]{1,64}$/.test(obj.formatId)) {
    throw new AppError("INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */, "Format ID contains invalid characters.");
  }
  if (obj.audioFormatId !== void 0 && obj.audioFormatId !== null) {
    if (typeof obj.audioFormatId !== "string" || !/^[a-zA-Z0-9._+-]{1,64}$/.test(obj.audioFormatId)) {
      throw new AppError("INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */, "Audio format ID contains invalid characters.");
    }
  }
  const qualityPreset = obj.qualityPreset || "best";
  if (!VALID_QUALITY_PRESETS.has(qualityPreset)) {
    throw new AppError("INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */, "Unsupported quality preset.");
  }
  const targetContainer = obj.targetContainer || "mp4";
  if (!VALID_CONTAINERS.has(targetContainer)) {
    throw new AppError("INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */, "Unsupported output container.");
  }
  const convertAudioTo = obj.convertAudioTo === "mp3" || obj.convertAudioTo === "m4a" ? obj.convertAudioTo : "none";
  return {
    analysisId: obj.analysisId.trim(),
    url: obj.url.trim(),
    formatId: obj.formatId.trim(),
    audioFormatId: typeof obj.audioFormatId === "string" ? obj.audioFormatId.trim() : null,
    qualityPreset,
    targetContainer,
    convertAudioTo,
    preserveOriginal: Boolean(obj.preserveOriginal)
  };
}
function validateBulkQueueInput(raw) {
  if (!raw || typeof raw !== "object") {
    throw new AppError("INVALID_URL" /* INVALID_URL */, "Invalid bulk queue request payload.");
  }
  const obj = raw;
  if (!Array.isArray(obj.urls)) {
    throw new AppError("INVALID_URL" /* INVALID_URL */, "Bulk queue requires an array of URLs.");
  }
  const cleanedUrls = Array.from(
    new Set(
      obj.urls.filter((u) => typeof u === "string").map((u) => u.trim()).filter((u) => u.length > 0)
    )
  ).slice(0, 50);
  if (cleanedUrls.length === 0) {
    throw new AppError("INVALID_URL" /* INVALID_URL */, "Please provide at least one valid HTTP/HTTPS URL.");
  }
  const qualityPreset = VALID_QUALITY_PRESETS.has(obj.qualityPreset) ? obj.qualityPreset : "best";
  const targetContainer = VALID_CONTAINERS.has(obj.targetContainer) ? obj.targetContainer : "mp4";
  const convertAudioTo = obj.convertAudioTo === "mp3" || obj.convertAudioTo === "m4a" ? obj.convertAudioTo : "none";
  return {
    urls: cleanedUrls,
    qualityPreset,
    targetContainer,
    convertAudioTo
  };
}
function validatePartialSettings(raw) {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const input = raw;
  const validated = {};
  if (typeof input.defaultDownloadDir === "string" && input.defaultDownloadDir.trim().length > 0) {
    validated.defaultDownloadDir = input.defaultDownloadDir.trim();
  }
  if (typeof input.defaultResolution === "string" && VALID_QUALITY_PRESETS.has(input.defaultResolution)) {
    validated.defaultResolution = input.defaultResolution;
  }
  if (typeof input.defaultOutputFormat === "string" && VALID_CONTAINERS.has(input.defaultOutputFormat)) {
    validated.defaultOutputFormat = input.defaultOutputFormat;
  }
  if (typeof input.maxConcurrentDownloads === "number" && Number.isFinite(input.maxConcurrentDownloads)) {
    validated.maxConcurrentDownloads = Math.max(1, Math.min(8, Math.floor(input.maxConcurrentDownloads)));
  }
  if (typeof input.maxDownloadSizeMB === "number" && Number.isFinite(input.maxDownloadSizeMB)) {
    validated.maxDownloadSizeMB = Math.max(50, Math.min(5e4, Math.floor(input.maxDownloadSizeMB)));
  }
  if (input.tempFileCleanupPolicy === "immediate" || input.tempFileCleanupPolicy === "on_exit" || input.tempFileCleanupPolicy === "keep_for_debug") {
    validated.tempFileCleanupPolicy = input.tempFileCleanupPolicy;
  }
  if (input.theme === "dark" || input.theme === "light") {
    validated.theme = input.theme;
  }
  if (input.audioConversionPreference === "none" || input.audioConversionPreference === "mp3" || input.audioConversionPreference === "m4a") {
    validated.audioConversionPreference = input.audioConversionPreference;
  }
  if (typeof input.extractorAutoUpdateCheck === "boolean") {
    validated.extractorAutoUpdateCheck = input.extractorAutoUpdateCheck;
  }
  if (typeof input.enablePlatformExtractors === "boolean") {
    validated.enablePlatformExtractors = input.enablePlatformExtractors;
  }
  if (typeof input.overwriteExistingFiles === "boolean") {
    validated.overwriteExistingFiles = input.overwriteExistingFiles;
  }
  if (input.cookiesFromBrowser === "auto" || input.cookiesFromBrowser === "none" || input.cookiesFromBrowser === "firefox" || input.cookiesFromBrowser === "edge" || input.cookiesFromBrowser === "chrome" || input.cookiesFromBrowser === "brave") {
    validated.cookiesFromBrowser = input.cookiesFromBrowser;
  }
  if (typeof input.cookiesFilePath === "string") {
    validated.cookiesFilePath = input.cookiesFilePath.trim();
  }
  if (typeof input.proxyUrl === "string") {
    const trimmedProxy = input.proxyUrl.trim();
    if (trimmedProxy === "" || /^(https?|socks4|socks5|socks5h):\/\/[^\s]+$/i.test(trimmedProxy)) {
      validated.proxyUrl = trimmedProxy;
    }
  }
  if (typeof input.geoBypassCountry === "string") {
    const trimmedGeo = input.geoBypassCountry.trim();
    if (trimmedGeo === "auto" || trimmedGeo === "none" || /^[A-Z]{2}$/i.test(trimmedGeo)) {
      validated.geoBypassCountry = trimmedGeo === "auto" || trimmedGeo === "none" ? trimmedGeo : trimmedGeo.toUpperCase();
    }
  }
  return validated;
}

// src/main/ipc/senderValidation.ts
function validateIpcSender(event, channel, allowedOrigins = ["file://", "http://localhost:3000", "http://127.0.0.1:3000"]) {
  if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
    throw new AppError(
      "PERMISSION_DENIED" /* PERMISSION_DENIED */,
      `Blocked unauthorized IPC channel "${channel}".`
    );
  }
  const frame = event?.senderFrame;
  if (!frame || typeof frame.url !== "string" || !frame.url) {
    throw new AppError("PERMISSION_DENIED" /* PERMISSION_DENIED */, "Missing IPC sender frame identity.");
  }
  if (frame.parent !== void 0 && frame.parent !== null) {
    throw new AppError("PERMISSION_DENIED" /* PERMISSION_DENIED */, "Subframe IPC calls are forbidden.");
  }
  const frameUrl = frame.url;
  if (frameUrl.startsWith("file://")) {
    return true;
  }
  try {
    const parsed = new URL(frameUrl);
    if (allowedOrigins.includes(parsed.origin)) {
      return true;
    }
  } catch {
  }
  throw new AppError(
    "PERMISSION_DENIED" /* PERMISSION_DENIED */,
    `Untrusted IPC sender origin: "${frameUrl}".`
  );
}

// src/main/ipc/handlers.ts
function registerElectronIpcHandlers(container, getMainWindow) {
  const handleSecure = (channel, handler) => {
    import_electron.ipcMain.handle(channel, async (event, ...args) => {
      validateIpcSender(event, channel);
      try {
        return await handler(...args);
      } catch (err) {
        const appErr = err instanceof AppError ? err : new AppError(
          "EXTRACTION_FAILURE" /* EXTRACTION_FAILURE */,
          err instanceof Error ? err.message : void 0,
          err instanceof Error ? err.stack : String(err)
        );
        container.repositories.logDiagnostic({
          level: "error",
          category: `ipc:${channel}`,
          code: appErr.code,
          message: appErr.userMessage,
          redactedContext: appErr.technicalDetail || null
        });
        throw new Error(appErr.userMessage);
      }
    });
  };
  handleSecure(IPC_CHANNELS.ANALYZE_URL, async (url) => {
    return await container.extractorEngine.analyzeUrl(url);
  });
  handleSecure(IPC_CHANNELS.START_DOWNLOAD, async (request) => {
    return container.jobManager.enqueueDownload(request);
  });
  handleSecure(IPC_CHANNELS.BULK_ENQUEUE, async (request) => {
    return await container.jobManager.bulkEnqueueUrls(request);
  });
  handleSecure(IPC_CHANNELS.CANCEL_JOB, async (jobId) => {
    return await container.jobManager.cancelJob(jobId);
  });
  handleSecure(IPC_CHANNELS.RETRY_JOB, async (jobId) => {
    return await container.jobManager.retryJob(jobId);
  });
  handleSecure(IPC_CHANNELS.REMOVE_JOB, async (jobId) => {
    return await container.jobManager.removeJob(jobId);
  });
  handleSecure(IPC_CHANNELS.GET_JOBS, async () => {
    return container.jobManager.getAllJobs();
  });
  handleSecure(IPC_CHANNELS.GET_HISTORY, async () => {
    return container.repositories.getHistory();
  });
  handleSecure(IPC_CHANNELS.REMOVE_HISTORY_ITEM, async (historyId) => {
    return container.repositories.removeHistoryItem(historyId);
  });
  handleSecure(
    IPC_CHANNELS.DELETE_DOWNLOADED_FILE,
    async (payload) => {
      if (!payload?.confirmed) {
        throw new AppError(
          "PERMISSION_DENIED" /* PERMISSION_DENIED */,
          "Explicit user confirmation is required before deleting downloaded media."
        );
      }
      const item = container.repositories.getHistoryItemById(payload.historyId);
      if (!item) {
        throw new AppError("UNAVAILABLE_MEDIA" /* UNAVAILABLE_MEDIA */, "History record not found.");
      }
      if (item.filePath && import_node_fs.default.existsSync(item.filePath)) {
        container.filesystemManager.deleteAuthorizedFile(item.filePath);
      }
      container.repositories.markHistoryFileDeleted(payload.historyId);
      return { deleted: true, historyId: payload.historyId };
    }
  );
  handleSecure(IPC_CHANNELS.CLEAR_HISTORY, async () => {
    container.repositories.clearHistory();
    return { cleared: true };
  });
  handleSecure(IPC_CHANNELS.OPEN_FILE, async (filePath) => {
    if (!container.filesystemManager.isAuthorizedFilePath(filePath)) {
      throw new AppError("PERMISSION_DENIED" /* PERMISSION_DENIED */, "Refusing to open file outside authorized download folders.");
    }
    if (!import_node_fs.default.existsSync(filePath)) {
      throw new AppError("UNAVAILABLE_MEDIA" /* UNAVAILABLE_MEDIA */, "File no longer exists at the recorded location.");
    }
    const errMsg = await import_electron.shell.openPath(import_node_path.default.resolve(filePath));
    if (errMsg) {
      throw new AppError("PERMISSION_DENIED" /* PERMISSION_DENIED */, `Could not open file: ${errMsg}`);
    }
    return { opened: true };
  });
  handleSecure(IPC_CHANNELS.OPEN_FOLDER, async (filePathOrDir) => {
    const resolved = import_node_path.default.resolve(filePathOrDir);
    if (!container.filesystemManager.isAuthorizedFilePath(resolved) && resolved !== import_node_path.default.resolve(container.repositories.getSettings().defaultDownloadDir)) {
      throw new AppError("PERMISSION_DENIED" /* PERMISSION_DENIED */, "Unauthorized directory path.");
    }
    if (import_node_fs.default.existsSync(resolved) && import_node_fs.default.statSync(resolved).isFile()) {
      import_electron.shell.showItemInFolder(resolved);
    } else {
      await import_electron.shell.openPath(import_node_path.default.dirname(resolved));
    }
    return { opened: true };
  });
  handleSecure(IPC_CHANNELS.SELECT_DIRECTORY, async () => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await import_electron.dialog.showOpenDialog(win, {
      title: "Select Default Download Folder",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const chosenDir = container.filesystemManager.authorizeDirectory(result.filePaths[0]);
    container.repositories.updateSettings({ defaultDownloadDir: chosenDir });
    return chosenDir;
  });
  handleSecure(IPC_CHANNELS.SELECT_COOKIES_FILE, async () => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await import_electron.dialog.showOpenDialog(win, {
      title: "Select Netscape cookies.txt File",
      properties: ["openFile"],
      filters: [
        { name: "Cookies Text File", extensions: ["txt"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const chosenFile = import_node_path.default.resolve(result.filePaths[0]);
    container.repositories.updateSettings({ cookiesFilePath: chosenFile });
    return chosenFile;
  });
  handleSecure(IPC_CHANNELS.GET_SETTINGS, async () => {
    return container.repositories.getSettings();
  });
  handleSecure(IPC_CHANNELS.UPDATE_SETTINGS, async (partial) => {
    const validated = validatePartialSettings(partial);
    if (validated.defaultDownloadDir) {
      validated.defaultDownloadDir = container.filesystemManager.authorizeDirectory(
        validated.defaultDownloadDir
      );
    }
    return container.repositories.updateSettings(validated);
  });
  handleSecure(IPC_CHANNELS.GET_BINARY_STATUS, async () => {
    return await container.binaryManager.verifyAllBinaries(true);
  });
  handleSecure(IPC_CHANNELS.CHECK_EXTRACTOR_UPDATES, async () => {
    return await container.binaryManager.checkExtractorUpdateStatus();
  });
  handleSecure(IPC_CHANNELS.GET_DIAGNOSTICS, async () => {
    return container.repositories.getDiagnostics();
  });
  handleSecure(IPC_CHANNELS.CLEAR_DIAGNOSTICS, async () => {
    container.repositories.clearDiagnostics();
    return { cleared: true };
  });
  handleSecure(IPC_CHANNELS.GET_SAMPLE_SOURCES, async () => {
    return container.testMediaGenerator.getSampleSources(container.getLocalMediaOrigin());
  });
  handleSecure(IPC_CHANNELS.WINDOW_MINIMIZE, async () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.minimize();
    }
    return { minimized: true };
  });
  handleSecure(IPC_CHANNELS.WINDOW_MAXIMIZE, async () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      if (win.isMaximized()) {
        win.unmaximize();
        return { maximized: false };
      } else {
        win.maximize();
        return { maximized: true };
      }
    }
    return { maximized: false };
  });
  handleSecure(IPC_CHANNELS.WINDOW_CLOSE, async () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.close();
    }
    return { closed: true };
  });
  container.jobManager.on("job-progress", (evt) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.JOB_PROGRESS_EVENT, evt);
    }
  });
}

// src/main/services/appContainer.ts
var import_node_fs12 = __toESM(require("node:fs"), 1);
var import_node_http3 = __toESM(require("node:http"), 1);
var import_node_os = __toESM(require("node:os"), 1);
var import_node_path10 = __toESM(require("node:path"), 1);

// src/main/filesystem/filesystemManager.ts
var import_node_fs3 = __toESM(require("node:fs"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);

// src/main/filesystem/pathSanitizer.ts
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var WINDOWS_RESERVED_NAMES = /* @__PURE__ */ new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9"
]);
function sanitizeFilename(rawName, fallback = "video_download") {
  if (!rawName || typeof rawName !== "string") {
    return fallback;
  }
  let cleaned = rawName.replace(/[\x00-\x1f\x7f]/g, "").replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/[. ]+$/g, "").replace(/^[. ]+/g, "");
  cleaned = cleaned.replace(/\.\.+/g, "_");
  if (!cleaned) {
    cleaned = fallback;
  }
  const stemUpper = cleaned.split(".")[0].toUpperCase();
  if (WINDOWS_RESERVED_NAMES.has(stemUpper)) {
    cleaned = `_${cleaned}`;
  }
  if (cleaned.length > 140) {
    cleaned = cleaned.slice(0, 140).replace(/[. ]+$/g, "");
  }
  return cleaned || fallback;
}
function resolveSafeChildPath(baseDir, fileName) {
  const resolvedBase = import_node_path2.default.resolve(baseDir);
  const sanitizedFile = import_node_path2.default.basename(fileName);
  const resolvedTarget = import_node_path2.default.resolve(resolvedBase, sanitizedFile);
  const relative = import_node_path2.default.relative(resolvedBase, resolvedTarget);
  if (relative.startsWith("..") || import_node_path2.default.isAbsolute(relative)) {
    throw new AppError(
      "PERMISSION_DENIED" /* PERMISSION_DENIED */,
      "Path traversal attempt detected and blocked."
    );
  }
  return resolvedTarget;
}
function getCollisionSafeFilePath(baseDir, rawTitle, extension, overwrite = false) {
  const cleanExt = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "mp4";
  const stem = sanitizeFilename(rawTitle);
  const initialCandidate = resolveSafeChildPath(baseDir, `${stem}.${cleanExt}`);
  if (overwrite || !import_node_fs2.default.existsSync(initialCandidate)) {
    return initialCandidate;
  }
  for (let counter = 1; counter <= 999; counter++) {
    const candidate = resolveSafeChildPath(baseDir, `${stem} (${counter}).${cleanExt}`);
    if (!import_node_fs2.default.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new AppError(
    "FILE_COLLISION" /* FILE_COLLISION */,
    "Unable to allocate a unique filename in the destination directory."
  );
}

// src/main/filesystem/filesystemManager.ts
var FilesystemManager = class {
  constructor(initialDownloadDir, tempRootDir) {
    this.tempRootDir = tempRootDir;
    this.authorizedBaseDirs = /* @__PURE__ */ new Set();
    this.ensureDirectoryExists(initialDownloadDir);
    this.ensureDirectoryExists(tempRootDir);
    this.authorizeDirectory(initialDownloadDir);
  }
  authorizeDirectory(dirPath) {
    const resolved = import_node_path3.default.resolve(dirPath);
    if (resolved === import_node_path3.default.parse(resolved).root) {
      throw new AppError(
        "PERMISSION_DENIED" /* PERMISSION_DENIED */,
        "Cannot use the filesystem root directory directly as a download folder."
      );
    }
    this.ensureDirectoryExists(resolved);
    this.authorizedBaseDirs.add(resolved);
    return resolved;
  }
  ensureDirectoryExists(dirPath) {
    try {
      import_node_fs3.default.mkdirSync(dirPath, { recursive: true });
      import_node_fs3.default.accessSync(dirPath, import_node_fs3.default.constants.W_OK);
    } catch (err) {
      throw new AppError(
        "PERMISSION_DENIED" /* PERMISSION_DENIED */,
        `Directory "${dirPath}" is not writable or could not be created.`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }
  verifyDiskSpace(dirPath, requiredBytes) {
    try {
      const stats = import_node_fs3.default.statfsSync(dirPath);
      const availableBytes = Number(stats.bavail) * Number(stats.bsize);
      if (availableBytes > 0 && availableBytes < requiredBytes + 32 * 1024 * 1024) {
        throw new AppError(
          "DISK_FULL" /* DISK_FULL */,
          `Insufficient free disk space (${Math.round(availableBytes / (1024 * 1024))} MB available).`
        );
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
    }
  }
  createJobTempDir(jobId) {
    const safeJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, "");
    const jobTemp = resolveSafeChildPath(this.tempRootDir, `job_${safeJobId}`);
    import_node_fs3.default.mkdirSync(jobTemp, { recursive: true });
    return jobTemp;
  }
  cleanupJobTempDir(jobId) {
    try {
      const safeJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, "");
      const jobTemp = resolveSafeChildPath(this.tempRootDir, `job_${safeJobId}`);
      if (import_node_fs3.default.existsSync(jobTemp)) {
        import_node_fs3.default.rmSync(jobTemp, { recursive: true, force: true });
      }
    } catch {
    }
  }
  atomicFinalizeFile(tempFilePath, finalFilePath) {
    if (!import_node_fs3.default.existsSync(tempFilePath)) {
      throw new AppError(
        "INTERRUPTED_PROCESS" /* INTERRUPTED_PROCESS */,
        "Temporary output file was not produced by the downloader."
      );
    }
    const parentDir = import_node_path3.default.dirname(finalFilePath);
    this.ensureDirectoryExists(parentDir);
    try {
      import_node_fs3.default.renameSync(tempFilePath, finalFilePath);
    } catch {
      import_node_fs3.default.copyFileSync(tempFilePath, finalFilePath);
      import_node_fs3.default.unlinkSync(tempFilePath);
    }
    const stat = import_node_fs3.default.statSync(finalFilePath);
    return stat.size;
  }
  isAuthorizedFilePath(filePath) {
    const resolved = import_node_path3.default.resolve(filePath);
    for (const baseDir of this.authorizedBaseDirs) {
      const rel = import_node_path3.default.relative(baseDir, resolved);
      if (!rel.startsWith("..") && !import_node_path3.default.isAbsolute(rel)) {
        return true;
      }
    }
    return false;
  }
  deleteAuthorizedFile(filePath) {
    if (!this.isAuthorizedFilePath(filePath)) {
      throw new AppError(
        "PERMISSION_DENIED" /* PERMISSION_DENIED */,
        "Refusing to delete a file outside the authorized download directories."
      );
    }
    if (import_node_fs3.default.existsSync(filePath)) {
      import_node_fs3.default.unlinkSync(filePath);
      return true;
    }
    return false;
  }
};

// src/main/jobs/jobManager.ts
var import_node_events = require("node:events");

// src/main/security/urlValidator.ts
var import_promises = __toESM(require("node:dns/promises"), 1);
var import_node_net = __toESM(require("node:net"), 1);
var BLOCKED_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata",
  "instance-data",
  "0.0.0.0",
  "[::1]",
  "[::]"
]);
function isPrivateOrReservedIp(ip) {
  const normalized = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const mappedV4 = normalized.slice("::ffff:".length);
    if (import_node_net.default.isIPv4(mappedV4)) {
      return isPrivateOrReservedIp(mappedV4);
    }
  }
  if (import_node_net.default.isIPv4(normalized)) {
    const parts = normalized.split(".").map(Number);
    const [a, b] = parts;
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (import_node_net.default.isIPv6(normalized)) {
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fe80:")) return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("ff")) return true;
    return false;
  }
  return true;
}
function validateMediaUrlSync(rawUrl, options) {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new AppError("INVALID_URL" /* INVALID_URL */, "Please enter a non-empty URL.");
  }
  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    throw new AppError("INVALID_URL" /* INVALID_URL */, "URL exceeds maximum permitted length (2048 characters).");
  }
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    throw new AppError("INVALID_URL" /* INVALID_URL */, "URL contains invalid control characters.");
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AppError("INVALID_URL" /* INVALID_URL */, "Malformed URL syntax. Include https:// or http://.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError(
      "INVALID_URL" /* INVALID_URL */,
      `Unsupported URL protocol "${parsed.protocol}". Only HTTP and HTTPS are allowed.`
    );
  }
  if (parsed.username || parsed.password) {
    throw new AppError(
      "INVALID_URL" /* INVALID_URL */,
      "URLs containing embedded credentials (username:password) are disallowed for security."
    );
  }
  const hostname = parsed.hostname.toLowerCase();
  if (options?.allowAuthorizedLocalTestServerPort && (hostname === "127.0.0.1" || hostname === "localhost") && parsed.port === String(options.allowAuthorizedLocalTestServerPort) && parsed.pathname.startsWith("/local-media/")) {
    return parsed;
  }
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new AppError(
      "INVALID_URL" /* INVALID_URL */,
      "Requests to localhost, internal domains, or cloud metadata endpoints are blocked."
    );
  }
  if (/^(0x[0-9a-f]+|\d+)$/i.test(hostname)) {
    throw new AppError(
      "INVALID_URL" /* INVALID_URL */,
      "Numeric or hex-encoded IP hostnames are disallowed."
    );
  }
  const bareIp = hostname.replace(/^\[|\]$/g, "");
  if (import_node_net.default.isIP(bareIp) !== 0) {
    if (isPrivateOrReservedIp(bareIp)) {
      throw new AppError(
        "INVALID_URL" /* INVALID_URL */,
        "Requests to private network, loopback, or link-local IP addresses are blocked."
      );
    }
  }
  if (!hostname.includes(".")) {
    throw new AppError("INVALID_URL" /* INVALID_URL */, "URL hostname must be a valid public domain.");
  }
  return parsed;
}
async function validateMediaUrl(rawUrl, options) {
  const parsed = validateMediaUrlSync(rawUrl, options);
  const hostname = parsed.hostname.toLowerCase();
  if (options?.allowAuthorizedLocalTestServerPort && (hostname === "127.0.0.1" || hostname === "localhost") && parsed.port === String(options.allowAuthorizedLocalTestServerPort) && parsed.pathname.startsWith("/local-media/")) {
    return parsed;
  }
  if (options?.resolveDns !== false && import_node_net.default.isIP(hostname.replace(/^\[|\]$/g, "")) === 0) {
    try {
      const records = await import_promises.default.lookup(hostname, { all: true });
      for (const rec of records) {
        if (isPrivateOrReservedIp(rec.address)) {
          throw new AppError(
            "INVALID_URL" /* INVALID_URL */,
            `Domain "${hostname}" resolves to a restricted private or loopback IP address (DNS rebinding protection).`
          );
        }
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
    }
  }
  return parsed;
}

// src/main/services/extractorEngine.ts
var PRESET_HEIGHT_MAP = {
  "2160p": 2160,
  "1440p": 1440,
  "1080p": 1080,
  "720p": 720,
  "480p": 480,
  "360p": 360
};
function selectVerifiedFormats(analysis, request) {
  const { formats } = analysis;
  if (!formats || formats.length === 0) {
    throw new AppError("UNAVAILABLE_MEDIA" /* UNAVAILABLE_MEDIA */, "Analysis contains no selectable formats.");
  }
  if (request.formatId && request.formatId !== "auto") {
    const exact = formats.find((f) => f.formatId === request.formatId);
    if (!exact) {
      throw new AppError(
        "INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */,
        `Requested format ID "${request.formatId}" does not exist in the analysis result for "${analysis.title}".`
      );
    }
    let companionAudio2 = null;
    if (exact.requiresMerge) {
      if (request.audioFormatId) {
        companionAudio2 = formats.find((f) => f.formatId === request.audioFormatId && f.hasAudio) || null;
        if (!companionAudio2) {
          throw new AppError(
            "INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */,
            `Requested companion audio format ID "${request.audioFormatId}" is invalid.`
          );
        }
      } else {
        companionAudio2 = formats.filter((f) => f.streamType === "audio_only").sort((a, b) => (b.abrKbps || b.tbrKbps || 0) - (a.abrKbps || a.tbrKbps || 0))[0] || formats.find((f) => f.hasAudio) || null;
      }
    }
    return { primaryFormat: exact, companionAudioFormat: companionAudio2 };
  }
  if (request.qualityPreset === "audio_only") {
    const audioFormats = formats.filter((f) => f.streamType === "audio_only" || f.hasAudio).sort((a, b) => {
      if (a.streamType === "audio_only" && b.streamType !== "audio_only") return -1;
      if (b.streamType === "audio_only" && a.streamType !== "audio_only") return 1;
      return (b.abrKbps || b.tbrKbps || 0) - (a.abrKbps || a.tbrKbps || 0);
    });
    if (audioFormats.length === 0) {
      throw new AppError("INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */, "No audio stream is available for this source.");
    }
    return { primaryFormat: audioFormats[0], companionAudioFormat: null };
  }
  const targetHeight = PRESET_HEIGHT_MAP[request.qualityPreset];
  const videoFormats = formats.filter((f) => f.hasVideo);
  if (videoFormats.length === 0) {
    throw new AppError("INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */, "No video streams are available for this source.");
  }
  let chosenVideo;
  if (targetHeight) {
    chosenVideo = videoFormats.find((f) => f.height === targetHeight);
    if (!chosenVideo) {
      throw new AppError(
        "INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */,
        `Requested resolution ${request.qualityPreset} is not available from this source. Available: ${analysis.availableResolutions.join(", ") || "none"}.`
      );
    }
  } else {
    chosenVideo = [...videoFormats].sort((a, b) => {
      const hDiff = (b.height || 0) - (a.height || 0);
      if (hDiff !== 0) return hDiff;
      return (b.tbrKbps || 0) - (a.tbrKbps || 0);
    })[0];
  }
  let companionAudio = null;
  if (chosenVideo.requiresMerge) {
    companionAudio = formats.filter((f) => f.streamType === "audio_only").sort((a, b) => (b.abrKbps || b.tbrKbps || 0) - (a.abrKbps || a.tbrKbps || 0))[0] || null;
  }
  return { primaryFormat: chosenVideo, companionAudioFormat: companionAudio };
}
var ExtractorEngine = class {
  constructor(urlValidationOptions) {
    this.urlValidationOptions = urlValidationOptions;
    this.extractors = [];
    this.analysisCache = /* @__PURE__ */ new Map();
  }
  registerExtractor(extractor) {
    this.extractors.push(extractor);
  }
  getCapabilitiesList() {
    return this.extractors.map((e) => e.getCapabilities());
  }
  resolveExtractorForUrl(url) {
    for (const extractor of this.extractors) {
      if (extractor.canHandle(url)) {
        return extractor;
      }
    }
    throw new AppError("UNSUPPORTED_WEBSITE" /* UNSUPPORTED_WEBSITE */);
  }
  async analyzeUrl(url) {
    const validatedUrl = await validateMediaUrl(url, this.urlValidationOptions);
    const extractor = this.resolveExtractorForUrl(validatedUrl.toString());
    const result = await extractor.analyze(validatedUrl.toString());
    this.analysisCache.set(result.analysisId, result);
    if (this.analysisCache.size > 100) {
      const oldestKey = this.analysisCache.keys().next().value;
      if (oldestKey) this.analysisCache.delete(oldestKey);
    }
    return result;
  }
  getStoredAnalysis(analysisId) {
    const cached = this.analysisCache.get(analysisId);
    if (!cached) {
      throw new AppError(
        "INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */,
        "Analysis session expired or was not found. Please analyze the URL again."
      );
    }
    return cached;
  }
  getExtractorById(extractorId) {
    const found = this.extractors.find((e) => e.getCapabilities().id === extractorId);
    if (!found) {
      throw new AppError("UNSUPPORTED_WEBSITE" /* UNSUPPORTED_WEBSITE */, `Extractor "${extractorId}" is not registered.`);
    }
    return found;
  }
};

// src/main/jobs/stateMachine.ts
var ALLOWED_TRANSITIONS = {
  queued: /* @__PURE__ */ new Set(["analyzing", "downloading", "cancelling", "cancelled", "failed"]),
  analyzing: /* @__PURE__ */ new Set(["downloading", "cancelling", "cancelled", "failed"]),
  downloading: /* @__PURE__ */ new Set(["downloading", "merging", "converting", "completed", "cancelling", "cancelled", "failed"]),
  merging: /* @__PURE__ */ new Set(["merging", "converting", "completed", "cancelling", "cancelled", "failed"]),
  converting: /* @__PURE__ */ new Set(["converting", "completed", "cancelling", "cancelled", "failed"]),
  cancelling: /* @__PURE__ */ new Set(["cancelled", "failed"]),
  completed: /* @__PURE__ */ new Set([]),
  // Terminal unless explicitly retried via resetForRetry
  failed: /* @__PURE__ */ new Set(["queued"]),
  // Retry transitions failed -> queued
  cancelled: /* @__PURE__ */ new Set(["queued"])
  // Retry transitions cancelled -> queued
};
function canTransitionJobState(from, to) {
  if (from === to && (from === "downloading" || from === "merging" || from === "converting")) {
    return true;
  }
  return ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
}
function assertValidStateTransition(from, to) {
  if (!canTransitionJobState(from, to)) {
    throw new Error(`Invalid job state transition: "${from}" -> "${to}"`);
  }
}
function isTerminalJobState(state) {
  return state === "completed" || state === "failed" || state === "cancelled";
}

// src/main/jobs/jobManager.ts
var JobManager = class extends import_node_events.EventEmitter {
  constructor(extractorEngine, filesystemManager, repositories, binaryManager) {
    super();
    this.extractorEngine = extractorEngine;
    this.filesystemManager = filesystemManager;
    this.repositories = repositories;
    this.binaryManager = binaryManager;
    this.jobs = /* @__PURE__ */ new Map();
    this.jobRequests = /* @__PURE__ */ new Map();
    this.completedJobIds = /* @__PURE__ */ new Set();
    this.activeCount = 0;
    this.recoverPersistedJobsOnStartup();
  }
  /**
   * Restores persisted jobs from SQLite on application startup.
   * Any job that was left in an active state when the application closed is transitioned to 'failed'
   * with an INTERRUPTED_PROCESS code and its temporary directory is cleaned up.
   */
  recoverPersistedJobsOnStartup() {
    const persisted = this.repositories.loadPersistedJobs();
    for (const job of persisted) {
      if (!isTerminalJobState(job.state)) {
        job.state = "failed";
        job.errorCode = "INTERRUPTED_PROCESS" /* INTERRUPTED_PROCESS */;
        job.userErrorMessage = "Application restarted while this transfer was in progress. Click Retry to restart the download.";
        job.stageDescription = "Interrupted by application restart";
        job.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.filesystemManager.cleanupJobTempDir(job.jobId);
        this.repositories.saveJobSnapshot(job);
      } else if (job.state === "completed") {
        this.completedJobIds.add(job.jobId);
      }
      this.jobs.set(job.jobId, job);
    }
  }
  getAllJobs() {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }
  enqueueDownload(rawRequest) {
    const request = validateFormatSelectionInput(rawRequest);
    const analysis = this.extractorEngine.getStoredAnalysis(request.analysisId);
    const { primaryFormat, companionAudioFormat } = selectVerifiedFormats(analysis, request);
    const extractor = this.extractorEngine.getExtractorById(analysis.extractorId);
    const capabilities = extractor.getCapabilities();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const targetContainer = request.convertAudioTo !== "none" ? request.convertAudioTo : request.targetContainer === "original" ? primaryFormat.extension : request.targetContainer;
    const totalEst = (primaryFormat.filesizeBytes || primaryFormat.filesizeApproxBytes || 0) + (companionAudioFormat?.filesizeBytes || companionAudioFormat?.filesizeApproxBytes || 0);
    const job = {
      jobId,
      analysisId: analysis.analysisId,
      url: analysis.sourceUrl,
      title: analysis.title,
      thumbnailUrl: analysis.thumbnailUrl,
      platform: analysis.platform,
      extractorId: analysis.extractorId,
      selectedFormatId: primaryFormat.formatId,
      selectedAudioFormatId: companionAudioFormat?.formatId || null,
      selectedResolution: primaryFormat.resolution,
      selectedContainer: targetContainer,
      requiresMerge: Boolean(primaryFormat.requiresMerge && companionAudioFormat),
      convertAudioTo: request.convertAudioTo,
      state: "queued",
      progressPercent: 0,
      isIndeterminate: false,
      downloadedBytes: 0,
      totalBytes: totalEst > 0 ? totalEst : null,
      speedBytesPerSec: null,
      etaSeconds: null,
      stageDescription: "Queued for download",
      outputFilePath: null,
      tempFilePaths: [],
      supportsResume: capabilities.supportsResume,
      errorCode: null,
      userErrorMessage: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null
    };
    this.jobs.set(jobId, job);
    this.jobRequests.set(jobId, request);
    this.repositories.saveJobSnapshot(job);
    this.repositories.logDiagnostic({
      level: "info",
      category: "job-queue",
      code: null,
      message: `Enqueued job ${jobId} for "${job.title}" (${job.selectedResolution} / ${job.selectedContainer})`,
      redactedContext: job.url
    });
    this.emitProgress(job);
    this.processQueue();
    return job;
  }
  async bulkEnqueueUrls(rawRequest) {
    const validated = validateBulkQueueInput(rawRequest);
    const results = [];
    let queuedCount = 0;
    let failedCount = 0;
    for (const url of validated.urls) {
      try {
        const analysis = await this.extractorEngine.analyzeUrl(url);
        let chosenPreset = validated.qualityPreset;
        if (chosenPreset !== "best" && chosenPreset !== "highest_resolution" && chosenPreset !== "audio_only" && !analysis.availableResolutions.includes(chosenPreset)) {
          chosenPreset = "best";
        }
        const { primaryFormat, companionAudioFormat } = selectVerifiedFormats(analysis, {
          analysisId: analysis.analysisId,
          url: analysis.sourceUrl,
          formatId: "auto",
          qualityPreset: chosenPreset,
          targetContainer: validated.targetContainer,
          convertAudioTo: validated.convertAudioTo,
          preserveOriginal: validated.targetContainer === "original" && validated.convertAudioTo === "none"
        });
        const job = this.enqueueDownload({
          analysisId: analysis.analysisId,
          url: analysis.sourceUrl,
          formatId: primaryFormat.formatId,
          audioFormatId: companionAudioFormat?.formatId || null,
          qualityPreset: chosenPreset,
          targetContainer: validated.targetContainer,
          convertAudioTo: validated.convertAudioTo,
          preserveOriginal: validated.targetContainer === "original" && validated.convertAudioTo === "none"
        });
        queuedCount++;
        results.push({ url, ok: true, job });
      } catch (err) {
        failedCount++;
        const msg = err instanceof AppError ? err.userMessage : err instanceof Error ? err.message : "Failed to analyze or queue URL.";
        results.push({ url, ok: false, error: msg });
      }
    }
    return {
      total: validated.urls.length,
      queuedCount,
      failedCount,
      results
    };
  }
  async removeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      this.repositories.removePersistedJob(jobId);
      return { removed: false, jobId };
    }
    if (!isTerminalJobState(job.state)) {
      await this.cancelJob(jobId);
    }
    this.filesystemManager.cleanupJobTempDir(jobId);
    this.jobs.delete(jobId);
    this.jobRequests.delete(jobId);
    this.completedJobIds.delete(jobId);
    this.repositories.removePersistedJob(jobId);
    return { removed: true, jobId };
  }
  async cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new AppError("INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */, `Job "${jobId}" not found.`);
    }
    if (isTerminalJobState(job.state)) {
      return job;
    }
    if (job.state === "queued") {
      this.transitionState(job, "cancelled", "Cancelled while in queue");
      job.errorCode = "CANCELLED_DOWNLOAD" /* CANCELLED_DOWNLOAD */;
      job.userErrorMessage = USER_ERROR_MESSAGES["CANCELLED_DOWNLOAD" /* CANCELLED_DOWNLOAD */];
      this.filesystemManager.cleanupJobTempDir(jobId);
      this.repositories.saveJobSnapshot(job);
      this.emitProgress(job);
      return job;
    }
    this.transitionState(job, "cancelling", "Stopping process and cleaning temporary files...");
    this.emitProgress(job);
    try {
      const extractor = this.extractorEngine.getExtractorById(job.extractorId);
      await extractor.cancel(jobId);
    } catch {
    }
    if (canTransitionJobState(job.state, "cancelled")) {
      this.transitionState(job, "cancelled", "Download cancelled");
    }
    job.errorCode = "CANCELLED_DOWNLOAD" /* CANCELLED_DOWNLOAD */;
    job.userErrorMessage = USER_ERROR_MESSAGES["CANCELLED_DOWNLOAD" /* CANCELLED_DOWNLOAD */];
    this.filesystemManager.cleanupJobTempDir(jobId);
    this.repositories.saveJobSnapshot(job);
    this.emitProgress(job);
    return job;
  }
  async retryJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new AppError("INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */, `Job "${jobId}" not found.`);
    }
    if (job.state !== "failed" && job.state !== "cancelled") {
      throw new AppError("INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */, "Only failed or cancelled jobs can be retried.");
    }
    try {
      this.extractorEngine.getStoredAnalysis(job.analysisId);
    } catch {
      const freshAnalysis = await this.extractorEngine.analyzeUrl(job.url);
      job.analysisId = freshAnalysis.analysisId;
      const savedReq = this.jobRequests.get(jobId);
      if (savedReq) {
        savedReq.analysisId = freshAnalysis.analysisId;
      }
    }
    if (!this.jobRequests.has(jobId)) {
      this.jobRequests.set(jobId, {
        analysisId: job.analysisId,
        url: job.url,
        formatId: job.selectedFormatId,
        audioFormatId: job.selectedAudioFormatId,
        qualityPreset: "best",
        targetContainer: job.selectedContainer || "mp4",
        convertAudioTo: job.convertAudioTo,
        preserveOriginal: true
      });
    }
    this.completedJobIds.delete(jobId);
    this.transitionState(job, "queued", "Re-queued for retry");
    job.progressPercent = 0;
    job.downloadedBytes = 0;
    job.speedBytesPerSec = null;
    job.etaSeconds = null;
    job.errorCode = null;
    job.userErrorMessage = null;
    this.repositories.saveJobSnapshot(job);
    this.emitProgress(job);
    this.processQueue();
    return job;
  }
  processQueue() {
    let maxConcurrent = 2;
    try {
      const settings = this.repositories.getSettings();
      maxConcurrent = Math.max(1, settings.maxConcurrentDownloads || 2);
    } catch {
      return;
    }
    if (this.activeCount >= maxConcurrent) {
      return;
    }
    const queuedJobs = Array.from(this.jobs.values()).filter((j) => j.state === "queued").sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (const nextJob of queuedJobs) {
      if (this.activeCount >= maxConcurrent) break;
      this.activeCount++;
      this.executeJob(nextJob).finally(() => {
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.processQueue();
      });
    }
  }
  async executeJob(job) {
    const settings = this.repositories.getSettings();
    const outputDir = this.filesystemManager.authorizeDirectory(settings.defaultDownloadDir);
    const tempDir = this.filesystemManager.createJobTempDir(job.jobId);
    job.tempFilePaths = [tempDir];
    try {
      const maxBytes = (settings.maxDownloadSizeMB || 4096) * 1024 * 1024;
      this.filesystemManager.verifyDiskSpace(outputDir, job.totalBytes || 32 * 1024 * 1024);
      this.transitionState(job, "downloading", "Initializing media stream transfer...");
      this.emitProgress(job);
      const analysis = this.extractorEngine.getStoredAnalysis(job.analysisId);
      const req = this.jobRequests.get(job.jobId) || {
        analysisId: job.analysisId,
        url: job.url,
        formatId: job.selectedFormatId,
        audioFormatId: job.selectedAudioFormatId,
        qualityPreset: "best",
        targetContainer: job.selectedContainer || "mp4",
        convertAudioTo: job.convertAudioTo,
        preserveOriginal: true
      };
      const { primaryFormat, companionAudioFormat } = selectVerifiedFormats(analysis, req);
      const extractor = this.extractorEngine.getExtractorById(analysis.extractorId);
      const binReport = await this.binaryManager.verifyAllBinaries();
      const result = await extractor.download(
        analysis,
        primaryFormat,
        companionAudioFormat,
        req,
        {
          jobId: job.jobId,
          outputDir,
          tempDir,
          maxFileSizeBytes: maxBytes,
          ffmpegPath: binReport.ffmpeg.resolvedPath,
          onProgress: (tick) => {
            if (job.state === "cancelling" || job.state === "cancelled") return;
            if (tick.state !== job.state && canTransitionJobState(job.state, tick.state)) {
              this.transitionState(job, tick.state, tick.stageDescription);
            } else {
              job.stageDescription = tick.stageDescription;
            }
            job.progressPercent = tick.progressPercent;
            job.isIndeterminate = tick.isIndeterminate;
            job.downloadedBytes = tick.downloadedBytes;
            job.totalBytes = tick.totalBytes ?? job.totalBytes;
            job.speedBytesPerSec = tick.speedBytesPerSec;
            job.etaSeconds = tick.etaSeconds;
            job.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
            this.emitProgress(job);
          }
        }
      );
      if (this.completedJobIds.has(job.jobId)) {
        return;
      }
      this.completedJobIds.add(job.jobId);
      this.transitionState(job, "completed", "Download and verification complete");
      job.progressPercent = 100;
      job.isIndeterminate = false;
      job.downloadedBytes = result.fileSizeBytes;
      job.totalBytes = result.fileSizeBytes;
      job.speedBytesPerSec = null;
      job.etaSeconds = 0;
      job.outputFilePath = result.finalFilePath;
      job.completedAt = (/* @__PURE__ */ new Date()).toISOString();
      this.repositories.saveJobSnapshot(job);
      this.repositories.addHistoryRecord({
        id: `hist_${job.jobId}`,
        jobId: job.jobId,
        title: job.title,
        sourceUrl: job.url,
        platform: job.platform,
        selectedFormat: `${job.selectedFormatId} (${result.container.toUpperCase()})`,
        resolution: job.selectedResolution,
        filePath: result.finalFilePath,
        fileSizeBytes: result.fileSizeBytes,
        completedAt: job.completedAt,
        status: "completed"
      });
      this.repositories.logDiagnostic({
        level: "info",
        category: "download-complete",
        code: null,
        message: `Completed job ${job.jobId} -> ${result.finalFilePath} (${result.fileSizeBytes} bytes)`,
        redactedContext: null
      });
      this.emitProgress(job);
    } catch (err) {
      if (job.state === "cancelled" || err instanceof AppError && err.code === "CANCELLED_DOWNLOAD" /* CANCELLED_DOWNLOAD */) {
        if (canTransitionJobState(job.state, "cancelled")) {
          this.transitionState(job, "cancelled", "Cancelled by user");
        }
        job.errorCode = "CANCELLED_DOWNLOAD" /* CANCELLED_DOWNLOAD */;
        job.userErrorMessage = USER_ERROR_MESSAGES["CANCELLED_DOWNLOAD" /* CANCELLED_DOWNLOAD */];
      } else {
        const appErr = err instanceof AppError ? err : new AppError(
          "EXTRACTION_FAILURE" /* EXTRACTION_FAILURE */,
          void 0,
          err instanceof Error ? err.message : String(err)
        );
        if (canTransitionJobState(job.state, "failed")) {
          this.transitionState(job, "failed", "Download failed");
        }
        job.errorCode = appErr.code;
        job.userErrorMessage = appErr.userMessage;
        try {
          if (this.jobs.has(job.jobId)) {
            this.repositories.logDiagnostic({
              level: "error",
              category: "download-failed",
              code: appErr.code,
              message: appErr.userMessage,
              redactedContext: appErr.technicalDetail || null
            });
          }
        } catch {
        }
      }
      if (this.jobs.has(job.jobId)) {
        try {
          this.repositories.saveJobSnapshot(job);
        } catch {
        }
        this.emitProgress(job);
      }
    } finally {
      if (settings.tempFileCleanupPolicy === "immediate") {
        this.filesystemManager.cleanupJobTempDir(job.jobId);
      }
    }
  }
  transitionState(job, nextState, stageDescription) {
    assertValidStateTransition(job.state, nextState);
    job.state = nextState;
    job.stageDescription = stageDescription;
    job.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  }
  emitProgress(job) {
    const evt = {
      jobId: job.jobId,
      state: job.state,
      progressPercent: job.progressPercent,
      isIndeterminate: job.isIndeterminate,
      downloadedBytes: job.downloadedBytes,
      totalBytes: job.totalBytes,
      speedBytesPerSec: job.speedBytesPerSec,
      etaSeconds: job.etaSeconds,
      stageDescription: job.stageDescription,
      outputFilePath: job.outputFilePath,
      errorCode: job.errorCode,
      userErrorMessage: job.userErrorMessage
    };
    this.emit("job-progress", evt, job);
  }
};

// src/main/storage/database.ts
var import_node_fs4 = __toESM(require("node:fs"), 1);
var import_node_path4 = __toESM(require("node:path"), 1);
var import_node_sqlite = require("node:sqlite");

// src/main/storage/migrations.ts
var MIGRATIONS = [
  {
    version: 1,
    name: "initial_schema",
    upSql: `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS download_history (
        id TEXT PRIMARY KEY NOT NULL,
        job_id TEXT NOT NULL,
        title TEXT NOT NULL,
        source_url TEXT NOT NULL,
        platform TEXT NOT NULL,
        selected_format TEXT NOT NULL,
        resolution TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed'
      );

      CREATE INDEX IF NOT EXISTS idx_history_completed_at ON download_history(completed_at DESC);

      CREATE TABLE IF NOT EXISTS persisted_jobs (
        job_id TEXT PRIMARY KEY NOT NULL,
        payload_json TEXT NOT NULL,
        state TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS diagnostics_log (
        id TEXT PRIMARY KEY NOT NULL,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        code TEXT,
        message TEXT NOT NULL,
        redacted_context TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_diagnostics_timestamp ON diagnostics_log(timestamp DESC);
    `
  }
];
function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const appliedRows = db.prepare("SELECT version FROM schema_migrations ORDER BY version ASC").all();
  const appliedVersions = new Set(appliedRows.map((r) => r.version));
  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }
    db.exec("BEGIN TRANSACTION");
    try {
      db.exec(migration.upSql);
      const insertStmt = db.prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
      );
      insertStmt.run(migration.version, migration.name, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(
        `Database migration v${migration.version} (${migration.name}) failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

// src/main/storage/database.ts
var SqliteDatabase = class {
  constructor(dbFilePath) {
    this.dbFilePath = dbFilePath;
    if (dbFilePath !== ":memory:") {
      import_node_fs4.default.mkdirSync(import_node_path4.default.dirname(dbFilePath), { recursive: true });
    }
    this.db = new import_node_sqlite.DatabaseSync(dbFilePath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    runMigrations(this.db);
  }
  close() {
    try {
      this.db.close();
    } catch {
    }
  }
};

// src/main/storage/repositories.ts
var import_node_fs5 = __toESM(require("node:fs"), 1);
var StorageRepositories = class {
  constructor(sqlite, defaultDownloadDir) {
    this.sqlite = sqlite;
    this.defaultSettings = {
      defaultDownloadDir,
      defaultResolution: "best",
      defaultOutputFormat: "mp4",
      maxConcurrentDownloads: 2,
      maxDownloadSizeMB: 4096,
      tempFileCleanupPolicy: "immediate",
      theme: "dark",
      audioConversionPreference: "none",
      extractorAutoUpdateCheck: true,
      enablePlatformExtractors: true,
      overwriteExistingFiles: false,
      cookiesFromBrowser: "auto",
      cookiesFilePath: "",
      proxyUrl: "",
      geoBypassCountry: "auto"
    };
  }
  getSettings() {
    const rows = this.sqlite.db.prepare("SELECT key, value_json FROM settings").all();
    const merged = { ...this.defaultSettings };
    for (const row of rows) {
      try {
        merged[row.key] = JSON.parse(row.value_json);
      } catch {
      }
    }
    return merged;
  }
  updateSettings(partial) {
    const current = this.getSettings();
    const updated = { ...current, ...partial };
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const upsert = this.sqlite.db.prepare(`
      INSERT INTO settings (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `);
    this.sqlite.db.exec("BEGIN TRANSACTION");
    try {
      for (const [key, val] of Object.entries(updated)) {
        upsert.run(key, JSON.stringify(val), now);
      }
      this.sqlite.db.exec("COMMIT");
    } catch (err) {
      this.sqlite.db.exec("ROLLBACK");
      throw err;
    }
    return updated;
  }
  addHistoryRecord(record) {
    const stmt = this.sqlite.db.prepare(`
      INSERT INTO download_history (
        id, job_id, title, source_url, platform, selected_format,
        resolution, file_path, file_size_bytes, completed_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        file_path = excluded.file_path,
        file_size_bytes = excluded.file_size_bytes,
        completed_at = excluded.completed_at,
        status = excluded.status
    `);
    stmt.run(
      record.id,
      record.jobId,
      record.title,
      redactSensitiveData(record.sourceUrl),
      record.platform,
      record.selectedFormat,
      record.resolution,
      record.filePath,
      record.fileSizeBytes,
      record.completedAt,
      record.status
    );
    const fileExists = Boolean(record.filePath && import_node_fs5.default.existsSync(record.filePath));
    return {
      ...record,
      fileExists,
      status: record.status === "deleted" ? "deleted" : fileExists ? "completed" : "missing_file"
    };
  }
  getHistory() {
    const rows = this.sqlite.db.prepare(`
        SELECT
          id, job_id, title, source_url, platform, selected_format,
          resolution, file_path, file_size_bytes, completed_at, status
        FROM download_history
        ORDER BY completed_at DESC
        LIMIT 500
      `).all();
    return rows.map((r) => {
      const exists = Boolean(r.file_path && import_node_fs5.default.existsSync(r.file_path));
      const computedStatus = r.status === "deleted" ? "deleted" : exists ? "completed" : "missing_file";
      return {
        id: r.id,
        jobId: r.job_id,
        title: r.title,
        sourceUrl: r.source_url,
        platform: r.platform,
        selectedFormat: r.selected_format,
        resolution: r.resolution,
        filePath: r.file_path,
        fileSizeBytes: Number(r.file_size_bytes),
        completedAt: r.completed_at,
        status: computedStatus,
        fileExists: exists
      };
    });
  }
  getHistoryItemById(id) {
    const row = this.sqlite.db.prepare("SELECT * FROM download_history WHERE id = ?").get(id);
    if (!row) return null;
    const exists = Boolean(row.file_path && import_node_fs5.default.existsSync(row.file_path));
    return {
      id: row.id,
      jobId: row.job_id,
      title: row.title,
      sourceUrl: row.source_url,
      platform: row.platform,
      selectedFormat: row.selected_format,
      resolution: row.resolution,
      filePath: row.file_path,
      fileSizeBytes: Number(row.file_size_bytes),
      completedAt: row.completed_at,
      status: row.status === "deleted" ? "deleted" : exists ? "completed" : "missing_file",
      fileExists: exists
    };
  }
  markHistoryFileDeleted(id) {
    this.sqlite.db.prepare("UPDATE download_history SET status = 'deleted' WHERE id = ?").run(id);
  }
  removeHistoryItem(id) {
    const res = this.sqlite.db.prepare("DELETE FROM download_history WHERE id = ?").run(id);
    return Number(res.changes) > 0;
  }
  clearHistory() {
    this.sqlite.db.prepare("DELETE FROM download_history").run();
  }
  saveJobSnapshot(job) {
    const stmt = this.sqlite.db.prepare(`
      INSERT INTO persisted_jobs (job_id, payload_json, state, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        payload_json = excluded.payload_json,
        state = excluded.state,
        updated_at = excluded.updated_at
    `);
    stmt.run(job.jobId, JSON.stringify(job), job.state, job.updatedAt);
  }
  removePersistedJob(jobId) {
    const res = this.sqlite.db.prepare("DELETE FROM persisted_jobs WHERE job_id = ?").run(jobId);
    return Number(res.changes) > 0;
  }
  loadPersistedJobs() {
    const rows = this.sqlite.db.prepare("SELECT payload_json FROM persisted_jobs ORDER BY updated_at DESC LIMIT 100").all();
    const jobs = [];
    for (const r of rows) {
      try {
        jobs.push(JSON.parse(r.payload_json));
      } catch {
      }
    }
    return jobs;
  }
  logDiagnostic(entry) {
    const fullEntry = {
      id: `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level: entry.level,
      category: entry.category,
      code: entry.code,
      message: redactSensitiveData(entry.message),
      redactedContext: entry.redactedContext ? redactSensitiveData(entry.redactedContext) : null
    };
    const insert = this.sqlite.db.prepare(`
      INSERT INTO diagnostics_log (id, timestamp, level, category, code, message, redacted_context)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      fullEntry.id,
      fullEntry.timestamp,
      fullEntry.level,
      fullEntry.category,
      fullEntry.code,
      fullEntry.message,
      fullEntry.redactedContext
    );
    this.sqlite.db.exec(`
      DELETE FROM diagnostics_log
      WHERE id NOT IN (
        SELECT id FROM diagnostics_log ORDER BY timestamp DESC LIMIT 300
      )
    `);
    return fullEntry;
  }
  getDiagnostics() {
    const rows = this.sqlite.db.prepare(`
        SELECT id, timestamp, level, category, code, message, redacted_context
        FROM diagnostics_log
        ORDER BY timestamp DESC
        LIMIT 200
      `).all();
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      level: r.level,
      category: r.category,
      code: r.code,
      message: r.message,
      redactedContext: r.redacted_context
    }));
  }
  clearDiagnostics() {
    this.sqlite.db.prepare("DELETE FROM diagnostics_log").run();
  }
};

// src/main/services/binaryManager.ts
var import_node_child_process = require("node:child_process");
var import_node_fs6 = __toESM(require("node:fs"), 1);
var import_node_https = __toESM(require("node:https"), 1);
var import_node_path5 = __toESM(require("node:path"), 1);
var import_node_util = require("node:util");
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process.execFile);
var BinaryManager = class {
  constructor(customResourceDir) {
    this.cachedReport = null;
    const dirs = [];
    if (customResourceDir) {
      dirs.push(customResourceDir);
    }
    const procWithResources = process;
    if (procWithResources.resourcesPath) {
      dirs.push(import_node_path5.default.join(procWithResources.resourcesPath, "binaries"));
      dirs.push(procWithResources.resourcesPath);
    }
    dirs.push(import_node_path5.default.resolve(process.cwd(), "resources", "binaries"));
    this.resourceDirs = dirs;
  }
  resolveBinaryCandidatePaths(name) {
    const isWin = process.platform === "win32";
    const exeName = isWin ? `${name}.exe` : name;
    const candidates = [];
    for (const dir of this.resourceDirs) {
      candidates.push({ path: import_node_path5.default.join(dir, exeName), bundled: true });
    }
    if (!isWin) {
      candidates.push({ path: `/usr/bin/${name}`, bundled: false });
      candidates.push({ path: `/usr/local/bin/${name}`, bundled: false });
    }
    candidates.push({ path: exeName, bundled: false });
    return candidates;
  }
  async probeBinary(name) {
    const candidates = this.resolveBinaryCandidatePaths(name);
    const versionArgs = name === "yt-dlp" ? ["--version"] : ["-version"];
    for (const candidate of candidates) {
      if (import_node_path5.default.isAbsolute(candidate.path) && !import_node_fs6.default.existsSync(candidate.path)) {
        continue;
      }
      if (process.platform !== "win32" && candidate.bundled && import_node_fs6.default.existsSync(candidate.path)) {
        try {
          import_node_fs6.default.chmodSync(candidate.path, 493);
        } catch {
        }
      }
      try {
        const { stdout } = await execFileAsync(candidate.path, versionArgs, {
          timeout: 1e4,
          windowsHide: true
        });
        const lines = stdout.trim().split(/\r?\n/).filter((l) => !l.startsWith("Deprecated Feature:"));
        const firstLine = lines[0] || "available";
        return {
          name,
          available: true,
          version: firstLine.slice(0, 120),
          resolvedPath: candidate.path,
          bundled: candidate.bundled,
          error: null
        };
      } catch {
      }
    }
    if (name === "yt-dlp") {
      const downloadedPath = await this.tryBootstrapYtDlpBinary();
      if (downloadedPath) {
        try {
          const { stdout } = await execFileAsync(downloadedPath, ["--version"], {
            timeout: 1e4,
            windowsHide: true
          });
          return {
            name: "yt-dlp",
            available: true,
            version: stdout.trim().split(/\r?\n/)[0] || "available",
            resolvedPath: downloadedPath,
            bundled: true,
            error: null
          };
        } catch {
        }
      }
    }
    return {
      name,
      available: false,
      version: null,
      resolvedPath: null,
      bundled: false,
      error: `Required binary "${name}" was not found in resources/binaries or system PATH.`
    };
  }
  async tryBootstrapYtDlpBinary() {
    try {
      const targetDir = this.resourceDirs[this.resourceDirs.length - 1];
      import_node_fs6.default.mkdirSync(targetDir, { recursive: true });
      const isWin = process.platform === "win32";
      const fileName = isWin ? "yt-dlp.exe" : "yt-dlp";
      const destPath = import_node_path5.default.join(targetDir, fileName);
      if (import_node_fs6.default.existsSync(destPath)) return destPath;
      const releaseUrl = isWin ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
      await this.downloadFileWithRedirects(releaseUrl, destPath, 5);
      if (!isWin) {
        import_node_fs6.default.chmodSync(destPath, 493);
      }
      return destPath;
    } catch {
      return null;
    }
  }
  downloadFileWithRedirects(url, destPath, maxRedirects) {
    return new Promise((resolve, reject) => {
      import_node_https.default.get(url, { timeout: 2e4 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (maxRedirects <= 0) {
            reject(new Error("Too many redirects"));
            return;
          }
          this.downloadFileWithRedirects(res.headers.location, destPath, maxRedirects - 1).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const out = import_node_fs6.default.createWriteStream(destPath);
        res.pipe(out);
        out.on("finish", () => {
          out.close();
          resolve();
        });
        out.on("error", reject);
      }).on("error", reject);
    });
  }
  async verifyAllBinaries(forceRefresh = false) {
    if (this.cachedReport && !forceRefresh) {
      return this.cachedReport;
    }
    const [ytDlp, ffmpeg, ffprobe] = await Promise.all([
      this.probeBinary("yt-dlp"),
      this.probeBinary("ffmpeg"),
      this.probeBinary("ffprobe")
    ]);
    this.cachedReport = {
      allReady: ytDlp.available && ffmpeg.available && ffprobe.available,
      ytDlp,
      ffmpeg,
      ffprobe,
      checkedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return this.cachedReport;
  }
  async checkExtractorUpdateStatus() {
    const report = await this.verifyAllBinaries(true);
    if (!report.ytDlp.available || !report.ytDlp.resolvedPath) {
      return {
        currentVersion: null,
        statusMessage: "yt-dlp binary is not available.",
        upToDate: false
      };
    }
    return {
      currentVersion: report.ytDlp.version,
      statusMessage: `Extractor binary verified (${report.ytDlp.version} at ${report.ytDlp.resolvedPath}).`,
      upToDate: true
    };
  }
};

// src/main/services/directHttpExtractor.ts
var import_node_fs7 = __toESM(require("node:fs"), 1);
var import_node_http = __toESM(require("node:http"), 1);
var import_node_https2 = __toESM(require("node:https"), 1);
var import_node_path6 = __toESM(require("node:path"), 1);
var DIRECT_MEDIA_EXTENSIONS = /* @__PURE__ */ new Set([
  ".mp4",
  ".webm",
  ".mkv",
  ".mov",
  ".m4a",
  ".mp3",
  ".wav",
  ".ogg",
  ".json"
  // For multi-stream manifest descriptor (.media.json)
]);
var DirectHttpExtractor = class {
  constructor(mediaProcessor, urlValidationOptions) {
    this.mediaProcessor = mediaProcessor;
    this.urlValidationOptions = urlValidationOptions;
    this.activeAbortControllers = /* @__PURE__ */ new Map();
    this.manifestUrlMap = /* @__PURE__ */ new Map();
  }
  canHandle(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      const pathname = parsed.pathname.toLowerCase();
      if (pathname.endsWith(".media.json")) return true;
      const ext = import_node_path6.default.extname(pathname);
      return DIRECT_MEDIA_EXTENSIONS.has(ext) && ext !== ".json";
    } catch {
      return false;
    }
  }
  getCapabilities() {
    return {
      id: "direct-http",
      name: "Direct HTTP/HTTPS & Adaptive Manifest Extractor",
      description: "Inspects and downloads direct MP4/WebM/MKV/MP3/M4A files and adaptive multi-resolution manifest streams with FFprobe and FFmpeg.",
      supportedProtocols: ["http", "https"],
      supportsFormatListing: true,
      supportsSeparateStreams: true,
      supportsResume: false,
      supportsLiveStreams: false
    };
  }
  getFormats(analysis) {
    return analysis.formats;
  }
  async analyze(url, _options) {
    const parsedUrl = await validateMediaUrl(url, this.urlValidationOptions);
    const analysisId = `anl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (parsedUrl.pathname.toLowerCase().endsWith(".media.json")) {
      const manifestBuf = await this.fetchBufferWithRedirectGuard(parsedUrl.toString(), 4);
      let manifest;
      try {
        manifest = JSON.parse(manifestBuf.toString("utf-8"));
      } catch {
        throw new AppError("EXTRACTION_FAILURE" /* EXTRACTION_FAILURE */, "Failed to parse adaptive media manifest JSON.");
      }
      const formatUrlTable2 = /* @__PURE__ */ new Map();
      const formats = manifest.streams.map((s) => {
        const resolvedStreamUrl = new URL(s.url, parsedUrl.toString()).toString();
        formatUrlTable2.set(s.formatId, resolvedStreamUrl);
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
          vbrKbps: s.streamType !== "audio_only" ? s.tbrKbps : null,
          abrKbps: s.streamType === "audio_only" ? s.tbrKbps : 160,
          formatNote: s.formatNote,
          hasVideo: s.streamType !== "audio_only",
          hasAudio: s.streamType !== "video_only",
          requiresMerge: s.streamType === "video_only",
          protocol: parsedUrl.protocol.replace(":", "")
        };
      });
      this.manifestUrlMap.set(analysisId, formatUrlTable2);
      const availableResolutions = Array.from(
        new Set(formats.filter((f) => f.height !== null).map((f) => `${f.height}p`))
      );
      const availableContainers = Array.from(new Set(formats.map((f) => f.extension.toLowerCase())));
      return {
        analysisId,
        sourceUrl: url,
        normalizedUrl: parsedUrl.toString(),
        extractorId: "direct-http",
        extractorName: "Adaptive Stream & FFprobe Extractor",
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
          `Verified ${formats.length} adaptive streams (${availableResolutions.join(", ")}) via FFprobe metadata inspection.`
        ],
        analyzedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    const probe = await this.mediaProcessor.probeMedia(parsedUrl.toString());
    const videoStream = probe.streams.find((s) => s.codec_type === "video");
    const audioStream = probe.streams.find((s) => s.codec_type === "audio");
    if (!videoStream && !audioStream) {
      throw new AppError("UNAVAILABLE_MEDIA" /* UNAVAILABLE_MEDIA */, "No valid video or audio streams found at the target URL.");
    }
    const ext = import_node_path6.default.extname(parsedUrl.pathname).replace(/^\./, "").toLowerCase() || "mp4";
    const rawTitle = probe.format.tags?.title || decodeURIComponent(import_node_path6.default.basename(parsedUrl.pathname, import_node_path6.default.extname(parsedUrl.pathname))) || "Direct Media Stream";
    const height = videoStream?.height ?? null;
    const width = videoStream?.width ?? null;
    let fps = null;
    if (videoStream?.r_frame_rate && videoStream.r_frame_rate.includes("/")) {
      const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
      if (den > 0) fps = Math.round(num / den);
    }
    const sizeBytes = probe.format.size ? Number(probe.format.size) : null;
    const durationSec = probe.format.duration ? Math.round(Number(probe.format.duration)) : null;
    const tbrKbps = probe.format.bit_rate ? Math.round(Number(probe.format.bit_rate) / 1e3) : null;
    const streamType = videoStream && audioStream ? "combined" : videoStream ? "video_only" : "audio_only";
    const formatId = `direct-${ext}-${height ? `${height}p` : "audio"}`;
    const formatUrlTable = /* @__PURE__ */ new Map();
    formatUrlTable.set(formatId, parsedUrl.toString());
    this.manifestUrlMap.set(analysisId, formatUrlTable);
    const singleFormat = {
      formatId,
      extension: ext,
      container: ext,
      streamType,
      resolution: height ? `${height}p` : "audio only",
      height,
      width,
      fps,
      vcodec: videoStream?.codec_name ?? null,
      acodec: audioStream?.codec_name ?? null,
      filesizeBytes: sizeBytes,
      filesizeApproxBytes: sizeBytes,
      tbrKbps,
      vbrKbps: videoStream?.bit_rate ? Math.round(Number(videoStream.bit_rate) / 1e3) : tbrKbps,
      abrKbps: audioStream?.bit_rate ? Math.round(Number(audioStream.bit_rate) / 1e3) : null,
      formatNote: `Direct ${ext.toUpperCase()} stream`,
      hasVideo: Boolean(videoStream),
      hasAudio: Boolean(audioStream),
      requiresMerge: false,
      protocol: parsedUrl.protocol.replace(":", "")
    };
    return {
      analysisId,
      sourceUrl: url,
      normalizedUrl: parsedUrl.toString(),
      extractorId: "direct-http",
      extractorName: "Direct HTTP/HTTPS Media Extractor (FFprobe)",
      platform: "Direct HTTP Media Server",
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
        `Inspected direct media via FFprobe (${videoStream?.codec_name || "no-video"}/${audioStream?.codec_name || "no-audio"}).`
      ],
      analyzedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async download(analysis, selectedFormat, selectedAudioFormat, request, options) {
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
          const pct = total && total > 0 ? Number((downloaded / total * 100).toFixed(1)) : null;
          options.onProgress({
            state: "downloading",
            progressPercent: pct,
            isIndeterminate: pct === null,
            downloadedBytes: downloaded,
            totalBytes: total,
            speedBytesPerSec: speed,
            etaSeconds: eta,
            stageDescription: `Downloading ${selectedFormat.resolution} stream (${selectedFormat.formatId})...`
          });
        }
      );
      let workingFilePath = primaryTempPath;
      let mergedStreams = false;
      if (selectedFormat.requiresMerge && selectedAudioFormat) {
        const audioUrl = urlTable?.get(selectedAudioFormat.formatId);
        if (!audioUrl) {
          throw new AppError("INVALID_FORMAT_ID" /* INVALID_FORMAT_ID */, "Audio stream URL missing for merge operation.");
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
            const pct = total && total > 0 ? Number((downloaded / total * 100).toFixed(1)) : null;
            options.onProgress({
              state: "downloading",
              progressPercent: pct,
              isIndeterminate: pct === null,
              downloadedBytes: downloaded,
              totalBytes: total,
              speedBytesPerSec: speed,
              etaSeconds: eta,
              stageDescription: `Downloading companion audio stream (${selectedAudioFormat.formatId})...`
            });
          }
        );
        const mergeContainer = request.targetContainer === "mkv" || request.targetContainer === "webm" ? request.targetContainer : "mp4";
        const mergedTempPath = resolveSafeChildPath(options.tempDir, `merged_output.${mergeContainer}`);
        options.onProgress({
          state: "merging",
          progressPercent: 98,
          isIndeterminate: false,
          downloadedBytes: import_node_fs7.default.statSync(primaryTempPath).size + import_node_fs7.default.statSync(audioTempPath).size,
          totalBytes: import_node_fs7.default.statSync(primaryTempPath).size + import_node_fs7.default.statSync(audioTempPath).size,
          speedBytesPerSec: null,
          etaSeconds: 1,
          stageDescription: `Merging ${selectedFormat.resolution} video and audio into ${mergeContainer.toUpperCase()} via FFmpeg...`
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
      let finalExtension = import_node_path6.default.extname(workingFilePath).replace(/^\./, "") || selectedFormat.extension;
      if (request.convertAudioTo === "mp3" || request.convertAudioTo === "m4a") {
        const convertedPath = resolveSafeChildPath(
          options.tempDir,
          `converted_audio.${request.convertAudioTo}`
        );
        options.onProgress({
          state: "converting",
          progressPercent: 99,
          isIndeterminate: false,
          downloadedBytes: import_node_fs7.default.statSync(workingFilePath).size,
          totalBytes: import_node_fs7.default.statSync(workingFilePath).size,
          speedBytesPerSec: null,
          etaSeconds: 1,
          stageDescription: `Converting audio stream to ${request.convertAudioTo.toUpperCase()} via FFmpeg...`
        });
        await this.mediaProcessor.convertToAudioFormat(
          workingFilePath,
          convertedPath,
          request.convertAudioTo
        );
        workingFilePath = convertedPath;
        finalExtension = request.convertAudioTo;
      } else if (!mergedStreams && request.targetContainer !== "original" && (request.targetContainer === "mp4" || request.targetContainer === "mkv" || request.targetContainer === "webm") && request.targetContainer !== finalExtension) {
        const remuxedPath = resolveSafeChildPath(
          options.tempDir,
          `remuxed_output.${request.targetContainer}`
        );
        options.onProgress({
          state: "converting",
          progressPercent: 99,
          isIndeterminate: false,
          downloadedBytes: import_node_fs7.default.statSync(workingFilePath).size,
          totalBytes: import_node_fs7.default.statSync(workingFilePath).size,
          speedBytesPerSec: null,
          etaSeconds: 1,
          stageDescription: `Remuxing stream into ${request.targetContainer.toUpperCase()} container...`
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
      import_node_fs7.default.copyFileSync(workingFilePath, finalFilePath);
      const finalStat = import_node_fs7.default.statSync(finalFilePath);
      return {
        finalFilePath,
        fileSizeBytes: finalStat.size,
        container: finalExtension,
        mergedStreams
      };
    } finally {
      this.activeAbortControllers.delete(options.jobId);
    }
  }
  async cancel(jobId) {
    const controller = this.activeAbortControllers.get(jobId);
    if (!controller) return false;
    controller.abort();
    this.activeAbortControllers.delete(jobId);
    return true;
  }
  async fetchBufferWithRedirectGuard(targetUrl, maxRedirects) {
    const parsed = await validateMediaUrl(targetUrl, this.urlValidationOptions);
    const client = parsed.protocol === "https:" ? import_node_https2.default : import_node_http.default;
    return new Promise((resolve, reject) => {
      const req = client.get(parsed, { timeout: 12e3 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (maxRedirects <= 0) {
            reject(new AppError("NETWORK_FAILURE" /* NETWORK_FAILURE */, "Too many HTTP redirects."));
            return;
          }
          const nextUrl = new URL(res.headers.location, parsed.toString()).toString();
          this.fetchBufferWithRedirectGuard(nextUrl, maxRedirects - 1).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            new AppError(
              res.statusCode === 404 ? "UNAVAILABLE_MEDIA" /* UNAVAILABLE_MEDIA */ : "NETWORK_FAILURE" /* NETWORK_FAILURE */,
              `Server returned HTTP ${res.statusCode}.`
            )
          );
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", (err) => reject(new AppError("NETWORK_FAILURE" /* NETWORK_FAILURE */, void 0, err.message)));
      });
      req.on("error", (err) => reject(new AppError("NETWORK_FAILURE" /* NETWORK_FAILURE */, void 0, err.message)));
    });
  }
  async streamUrlToFile(targetUrl, destFilePath, maxBytes, signal, onTick, redirectsRemaining = 4) {
    if (signal.aborted) {
      throw new AppError("CANCELLED_DOWNLOAD" /* CANCELLED_DOWNLOAD */);
    }
    const parsed = await validateMediaUrl(targetUrl, this.urlValidationOptions);
    const client = parsed.protocol === "https:" ? import_node_https2.default : import_node_http.default;
    return new Promise((resolve, reject) => {
      const req = client.get(parsed, { timeout: 25e3, signal }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsRemaining <= 0) {
            reject(new AppError("NETWORK_FAILURE" /* NETWORK_FAILURE */, "Maximum redirect limit reached."));
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
          ).then(resolve).catch(reject);
          return;
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(
            new AppError(
              res.statusCode === 404 ? "UNAVAILABLE_MEDIA" /* UNAVAILABLE_MEDIA */ : "NETWORK_FAILURE" /* NETWORK_FAILURE */,
              `HTTP transfer failed with status ${res.statusCode}.`
            )
          );
          return;
        }
        const contentLengthHeader = res.headers["content-length"];
        const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : null;
        if (totalBytes && totalBytes > maxBytes) {
          res.destroy();
          reject(
            new AppError(
              "DISK_FULL" /* DISK_FULL */,
              `Media size (${Math.round(totalBytes / (1024 * 1024))} MB) exceeds the configured maximum limit.`
            )
          );
          return;
        }
        const fileStream = import_node_fs7.default.createWriteStream(destFilePath);
        let downloadedBytes = 0;
        const startTime = Date.now();
        res.on("data", (chunk) => {
          downloadedBytes += chunk.length;
          if (downloadedBytes > maxBytes) {
            req.destroy();
            fileStream.destroy();
            reject(new AppError("DISK_FULL" /* DISK_FULL */, "Download exceeded maximum permitted file size."));
            return;
          }
          const elapsedSec = Math.max(0.05, (Date.now() - startTime) / 1e3);
          const speed = Math.round(downloadedBytes / elapsedSec);
          const eta = totalBytes && speed > 0 ? Math.max(0, Math.round((totalBytes - downloadedBytes) / speed)) : null;
          onTick(downloadedBytes, totalBytes, speed, eta);
        });
        res.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close();
          resolve();
        });
        fileStream.on("error", (err) => {
          reject(new AppError("PERMISSION_DENIED" /* PERMISSION_DENIED */, "Failed writing temporary media file.", err.message));
        });
      });
      req.on("error", (err) => {
        if (signal.aborted || err.name === "AbortError") {
          reject(new AppError("CANCELLED_DOWNLOAD" /* CANCELLED_DOWNLOAD */));
          return;
        }
        reject(new AppError("NETWORK_FAILURE" /* NETWORK_FAILURE */, void 0, err.message, true));
      });
    });
  }
};

// src/main/services/hlsDashExtractor.ts
var import_node_child_process2 = require("node:child_process");
var import_node_fs8 = __toESM(require("node:fs"), 1);
var import_node_http2 = __toESM(require("node:http"), 1);
var import_node_https3 = __toESM(require("node:https"), 1);
var import_node_path7 = __toESM(require("node:path"), 1);
function parseHlsMasterPlaylist(playlistText) {
  const lines = playlistText.split(/\r?\n/).map((l) => l.trim());
  const formats = [];
  let variantIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#EXT-X-KEY") && !line.includes("METHOD=NONE")) {
      throw new AppError("DRM_PROTECTED" /* DRM_PROTECTED */, "HLS playlist uses encrypted media segments.");
    }
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      variantIdx++;
      const attrs = line.slice("#EXT-X-STREAM-INF:".length);
      const bwMatch = attrs.match(/BANDWIDTH=(\d+)/i);
      const resMatch = attrs.match(/RESOLUTION=(\d+)x(\d+)/i);
      const fpsMatch = attrs.match(/FRAME-RATE=([\d.]+)/i);
      const codecsMatch = attrs.match(/CODECS="([^"]+)"/i);
      const width = resMatch ? parseInt(resMatch[1], 10) : null;
      const height = resMatch ? parseInt(resMatch[2], 10) : null;
      const tbrKbps = bwMatch ? Math.round(parseInt(bwMatch[1], 10) / 1e3) : null;
      const fps = fpsMatch ? Math.round(parseFloat(fpsMatch[1])) : 30;
      const codecsRaw = codecsMatch ? codecsMatch[1] : "avc1,mp4a";
      const [vcodec, acodec] = codecsRaw.split(",").map((s) => s.trim());
      formats.push({
        formatId: `hls-${height ? `${height}p` : variantIdx}`,
        extension: "mp4",
        container: "mp4",
        streamType: "combined",
        resolution: height ? `${height}p` : "adaptive",
        height,
        width,
        fps,
        vcodec: vcodec || "h264",
        acodec: acodec || "aac",
        filesizeBytes: null,
        filesizeApproxBytes: null,
        tbrKbps,
        vbrKbps: tbrKbps,
        abrKbps: 128,
        formatNote: `HLS Variant (${height ? `${height}p` : "Stream"})`,
        hasVideo: true,
        hasAudio: true,
        requiresMerge: false,
        protocol: "m3u8_native"
      });
    }
  }
  return formats.sort((a, b) => (b.height || 0) - (a.height || 0));
}
var HlsDashExtractor = class {
  constructor(binaryManager, mediaProcessor, urlValidationOptions) {
    this.binaryManager = binaryManager;
    this.mediaProcessor = mediaProcessor;
    this.urlValidationOptions = urlValidationOptions;
    this.activeProcesses = /* @__PURE__ */ new Map();
    this.variantUrlMap = /* @__PURE__ */ new Map();
  }
  canHandle(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      const lower = parsed.pathname.toLowerCase();
      return lower.endsWith(".m3u8") || lower.endsWith(".mpd");
    } catch {
      return false;
    }
  }
  getCapabilities() {
    return {
      id: "hls-dash",
      name: "Authorized HLS / MPEG-DASH Manifest Extractor",
      description: "Parses public HLS (.m3u8) and MPEG-DASH (.mpd) manifests and remuxes streams via FFmpeg.",
      supportedProtocols: ["http", "https"],
      supportsFormatListing: true,
      supportsSeparateStreams: true,
      supportsResume: false,
      supportsLiveStreams: false
    };
  }
  getFormats(analysis) {
    return analysis.formats;
  }
  async analyze(url, _options) {
    const parsedUrl = await validateMediaUrl(url, this.urlValidationOptions);
    const manifestText = await this.fetchText(parsedUrl.toString());
    const analysisId = `anl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const formats = parseHlsMasterPlaylist(manifestText);
    const urlTable = /* @__PURE__ */ new Map();
    const lines = manifestText.split(/\r?\n/).map((l) => l.trim());
    let fIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("#EXT-X-STREAM-INF:")) {
        const nextLine = lines[i + 1];
        if (nextLine && !nextLine.startsWith("#") && formats[fIdx]) {
          urlTable.set(formats[fIdx].formatId, new URL(nextLine, parsedUrl.toString()).toString());
          fIdx++;
        }
      }
    }
    if (formats.length === 0) {
      const fallbackFormat = {
        formatId: "hls-720p",
        extension: "mp4",
        container: "mp4",
        streamType: "combined",
        resolution: "720p",
        height: 720,
        width: 1280,
        fps: 30,
        vcodec: "h264",
        acodec: "aac",
        filesizeBytes: null,
        filesizeApproxBytes: null,
        tbrKbps: 1800,
        vbrKbps: 1650,
        abrKbps: 128,
        formatNote: "HLS Media Stream",
        hasVideo: true,
        hasAudio: true,
        requiresMerge: false,
        protocol: "m3u8_native"
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
      extractorId: "hls-dash",
      extractorName: "Authorized HLS/DASH Manifest Extractor",
      platform: "HLS Adaptive Stream",
      domain: parsedUrl.hostname,
      title: decodeURIComponent(import_node_path7.default.basename(parsedUrl.pathname, import_node_path7.default.extname(parsedUrl.pathname))) || "HLS Stream",
      uploader: parsedUrl.hostname,
      durationSeconds: null,
      thumbnailUrl: null,
      isLive: false,
      formats,
      availableResolutions,
      availableContainers: ["mp4", "mkv"],
      diagnosticMessages: [`Parsed HLS manifest with ${formats.length} variant stream(s).`],
      analyzedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async download(analysis, selectedFormat, _selectedAudioFormat, request, options) {
    const status = await this.binaryManager.verifyAllBinaries();
    if (!status.ffmpeg.available || !status.ffmpeg.resolvedPath) {
      throw new AppError("MISSING_FFMPEG" /* MISSING_FFMPEG */, "FFmpeg is required to assemble HLS/DASH segments.");
    }
    const urlTable = this.variantUrlMap.get(analysis.analysisId);
    const streamUrl = urlTable?.get(selectedFormat.formatId) || analysis.normalizedUrl;
    const targetExt = request.convertAudioTo !== "none" ? request.convertAudioTo : request.targetContainer === "mkv" ? "mkv" : "mp4";
    const tempOutput = resolveSafeChildPath(options.tempDir, `hls_assembled.${targetExt}`);
    options.onProgress({
      state: "downloading",
      progressPercent: null,
      isIndeterminate: true,
      downloadedBytes: 0,
      totalBytes: null,
      speedBytesPerSec: null,
      etaSeconds: null,
      stageDescription: `Downloading and muxing HLS segments (${selectedFormat.resolution}) via FFmpeg...`
    });
    const args = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      streamUrl,
      "-c",
      "copy",
      tempOutput
    ];
    await new Promise((resolve, reject) => {
      const child = (0, import_node_child_process2.spawn)(status.ffmpeg.resolvedPath, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
      this.activeProcesses.set(options.jobId, child);
      let stderr = "";
      child.stderr?.on("data", (c) => {
        stderr += c.toString();
      });
      child.on("error", (err) => {
        this.activeProcesses.delete(options.jobId);
        reject(new AppError("INTERRUPTED_PROCESS" /* INTERRUPTED_PROCESS */, void 0, err.message));
      });
      child.on("close", (code, signal) => {
        this.activeProcesses.delete(options.jobId);
        if (signal === "SIGTERM" || signal === "SIGKILL") {
          reject(new AppError("CANCELLED_DOWNLOAD" /* CANCELLED_DOWNLOAD */));
          return;
        }
        if (code !== 0) {
          reject(new AppError("EXTRACTION_FAILURE" /* EXTRACTION_FAILURE */, "FFmpeg failed assembling HLS stream.", stderr));
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
    import_node_fs8.default.copyFileSync(tempOutput, finalFilePath);
    const stat = import_node_fs8.default.statSync(finalFilePath);
    return {
      finalFilePath,
      fileSizeBytes: stat.size,
      container: targetExt,
      mergedStreams: true
    };
  }
  async cancel(jobId) {
    const proc = this.activeProcesses.get(jobId);
    if (!proc) return false;
    proc.kill("SIGTERM");
    this.activeProcesses.delete(jobId);
    return true;
  }
  fetchText(url) {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? import_node_https3.default : import_node_http2.default;
    return new Promise((resolve, reject) => {
      client.get(parsed, { timeout: 1e4 }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new AppError("UNAVAILABLE_MEDIA" /* UNAVAILABLE_MEDIA */, `Manifest HTTP ${res.statusCode}`));
          return;
        }
        let body = "";
        res.on("data", (c) => body += c.toString());
        res.on("end", () => resolve(body));
      }).on("error", (err) => reject(new AppError("NETWORK_FAILURE" /* NETWORK_FAILURE */, void 0, err.message)));
    });
  }
};

// src/main/services/mediaProcessor.ts
var import_node_child_process3 = require("node:child_process");
var import_node_fs9 = __toESM(require("node:fs"), 1);
var import_node_util2 = require("node:util");
var execFileAsync2 = (0, import_node_util2.promisify)(import_node_child_process3.execFile);
var MediaProcessor = class {
  constructor(binaryManager) {
    this.binaryManager = binaryManager;
  }
  async probeMedia(inputPathOrUrl) {
    const status = await this.binaryManager.verifyAllBinaries();
    if (!status.ffprobe.available || !status.ffprobe.resolvedPath) {
      throw new AppError("MISSING_FFMPEG" /* MISSING_FFMPEG */, "FFprobe binary is unavailable.");
    }
    try {
      const { stdout } = await execFileAsync2(
        status.ffprobe.resolvedPath,
        [
          "-v",
          "quiet",
          "-print_format",
          "json",
          "-show_format",
          "-show_streams",
          inputPathOrUrl
        ],
        {
          timeout: 15e3,
          windowsHide: true
        }
      );
      const parsed = JSON.parse(stdout);
      return {
        streams: parsed.streams || [],
        format: parsed.format || {}
      };
    } catch (err) {
      throw new AppError(
        "EXTRACTION_FAILURE" /* EXTRACTION_FAILURE */,
        "Failed to inspect media stream metadata with FFprobe.",
        err instanceof Error ? err.message : String(err)
      );
    }
  }
  /**
   * Merges a separate video stream and audio stream into a target container using FFmpeg without re-encoding video.
   */
  async mergeVideoAndAudio(videoPath, audioPath, outputPath, targetContainer, onStage, registerProcess) {
    const status = await this.binaryManager.verifyAllBinaries();
    if (!status.ffmpeg.available || !status.ffmpeg.resolvedPath) {
      throw new AppError("MISSING_FFMPEG" /* MISSING_FFMPEG */, "FFmpeg binary is required to merge separate video and audio streams.");
    }
    if (!import_node_fs9.default.existsSync(videoPath) || !import_node_fs9.default.existsSync(audioPath)) {
      throw new AppError("INTERRUPTED_PROCESS" /* INTERRUPTED_PROCESS */, "Input video or audio stream file is missing for merge.");
    }
    onStage?.("Merging video and audio streams with FFmpeg...");
    const audioCodecArgs = targetContainer === "webm" ? ["-c:a", "libopus", "-b:a", "160k"] : ["-c:a", "aac", "-b:a", "192k"];
    const args = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      ...audioCodecArgs,
      "-movflags",
      "+faststart",
      outputPath
    ];
    await this.runFfmpegArgs(status.ffmpeg.resolvedPath, args, registerProcess);
    if (!import_node_fs9.default.existsSync(outputPath) || import_node_fs9.default.statSync(outputPath).size === 0) {
      throw new AppError("EXTRACTION_FAILURE" /* EXTRACTION_FAILURE */, "FFmpeg stream merge produced an empty output file.");
    }
  }
  /**
   * Extracts or converts audio to MP3 or M4A using FFmpeg.
   */
  async convertToAudioFormat(inputPath, outputPath, format, onStage, registerProcess) {
    const status = await this.binaryManager.verifyAllBinaries();
    if (!status.ffmpeg.available || !status.ffmpeg.resolvedPath) {
      throw new AppError("MISSING_FFMPEG" /* MISSING_FFMPEG */, "FFmpeg binary is required for audio conversion.");
    }
    onStage?.(`Converting audio stream to ${format.toUpperCase()}...`);
    const codecArgs = format === "mp3" ? ["-vn", "-c:a", "libmp3lame", "-q:a", "2"] : ["-vn", "-c:a", "aac", "-b:a", "192k"];
    const args = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      ...codecArgs,
      outputPath
    ];
    await this.runFfmpegArgs(status.ffmpeg.resolvedPath, args, registerProcess);
    if (!import_node_fs9.default.existsSync(outputPath) || import_node_fs9.default.statSync(outputPath).size === 0) {
      throw new AppError("UNSUPPORTED_CODEC" /* UNSUPPORTED_CODEC */, `Failed to convert audio to ${format.toUpperCase()}.`);
    }
  }
  /**
   * Remuxes media container without transcoding video when possible, falling back to compatible codec if required.
   */
  async remuxContainer(inputPath, outputPath, targetContainer, onStage, registerProcess) {
    const status = await this.binaryManager.verifyAllBinaries();
    if (!status.ffmpeg.available || !status.ffmpeg.resolvedPath) {
      throw new AppError("MISSING_FFMPEG" /* MISSING_FFMPEG */, "FFmpeg binary is required for container remuxing.");
    }
    onStage?.(`Remuxing stream into ${targetContainer.toUpperCase()} container...`);
    try {
      const copyArgs = [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        "-c",
        "copy",
        outputPath
      ];
      await this.runFfmpegArgs(status.ffmpeg.resolvedPath, copyArgs, registerProcess);
      if (import_node_fs9.default.existsSync(outputPath) && import_node_fs9.default.statSync(outputPath).size > 0) {
        return;
      }
    } catch {
    }
    const transcodeArgs = targetContainer === "webm" ? [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-c:v",
      "libvpx-vp9",
      "-crf",
      "30",
      "-b:v",
      "0",
      "-c:a",
      "libopus",
      outputPath
    ] : [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "22",
      "-c:a",
      "aac",
      outputPath
    ];
    await this.runFfmpegArgs(status.ffmpeg.resolvedPath, transcodeArgs, registerProcess);
  }
  runFfmpegArgs(ffmpegBin, args, registerProcess) {
    return new Promise((resolve, reject) => {
      const child = (0, import_node_child_process3.spawn)(ffmpegBin, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
      registerProcess?.(child);
      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (err) => {
        reject(new AppError("INTERRUPTED_PROCESS" /* INTERRUPTED_PROCESS */, "FFmpeg process error.", err.message));
      });
      child.on("close", (code, signal) => {
        if (signal === "SIGTERM" || signal === "SIGKILL") {
          reject(new AppError("CANCELLED_DOWNLOAD" /* CANCELLED_DOWNLOAD */));
          return;
        }
        if (code !== 0) {
          reject(
            new AppError(
              "UNSUPPORTED_CODEC" /* UNSUPPORTED_CODEC */,
              "FFmpeg could not process or merge the selected streams.",
              stderr
            )
          );
          return;
        }
        resolve();
      });
    });
  }
};

// src/main/services/testMediaGenerator.ts
var import_node_child_process4 = require("node:child_process");
var import_node_fs10 = __toESM(require("node:fs"), 1);
var import_node_path8 = __toESM(require("node:path"), 1);
var import_node_util3 = require("node:util");
var execFileAsync3 = (0, import_node_util3.promisify)(import_node_child_process4.execFile);
var TestMediaGenerator = class {
  constructor(mediaRootDir) {
    this.mediaRootDir = mediaRootDir;
    import_node_fs10.default.mkdirSync(this.mediaRootDir, { recursive: true });
  }
  async ensureTestMediaGenerated(resolvedFfmpegPath) {
    const manifestPath = import_node_path8.default.join(this.mediaRootDir, "observatory_broadcast.media.json");
    if (import_node_fs10.default.existsSync(manifestPath)) {
      return;
    }
    const ffmpegBin = resolvedFfmpegPath || (process.platform === "win32" ? "ffmpeg.exe" : "/usr/bin/ffmpeg");
    if (import_node_path8.default.isAbsolute(ffmpegBin) && !import_node_fs10.default.existsSync(ffmpegBin)) {
      return;
    }
    const v1080Path = import_node_path8.default.join(this.mediaRootDir, "observatory_1080p60_video.mp4");
    await execFileAsync3(ffmpegBin, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1920x1080:rate=60:duration=3",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "26",
      "-pix_fmt",
      "yuv420p",
      v1080Path
    ]);
    const v720Path = import_node_path8.default.join(this.mediaRootDir, "observatory_720p30_combined.mp4");
    await execFileAsync3(ffmpegBin, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1280x720:rate=30:duration=3",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=3",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "27",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      v720Path
    ]);
    const v480Path = import_node_path8.default.join(this.mediaRootDir, "observatory_480p30_combined.mp4");
    await execFileAsync3(ffmpegBin, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=854x480:rate=30:duration=3",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=528:sample_rate=44100:duration=3",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "28",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      v480Path
    ]);
    const v360Path = import_node_path8.default.join(this.mediaRootDir, "observatory_360p30_combined.mp4");
    await execFileAsync3(ffmpegBin, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=30:duration=3",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=528:sample_rate=44100:duration=3",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "30",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      v360Path
    ]);
    const audioM4aPath = import_node_path8.default.join(this.mediaRootDir, "observatory_master_audio.m4a");
    await execFileAsync3(ffmpegBin, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=660:sample_rate=48000:duration=3",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      audioM4aPath
    ]);
    const hlsVariantPath = import_node_path8.default.join(this.mediaRootDir, "hls_720p.m3u8");
    const hlsSegmentPattern = import_node_path8.default.join(this.mediaRootDir, "hls_seg_%02d.ts");
    await execFileAsync3(ffmpegBin, [
      "-y",
      "-i",
      v720Path,
      "-c",
      "copy",
      "-f",
      "hls",
      "-hls_time",
      "1",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      hlsSegmentPattern,
      hlsVariantPath
    ]);
    const hlsMasterPath = import_node_path8.default.join(this.mediaRootDir, "master_stream.m3u8");
    import_node_fs10.default.writeFileSync(
      hlsMasterPath,
      [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        '#EXT-X-STREAM-INF:BANDWIDTH=1850000,RESOLUTION=1280x720,FRAME-RATE=30.000,CODECS="avc1.64001f,mp4a.40.2"',
        "hls_720p.m3u8"
      ].join("\n"),
      "utf-8"
    );
    const posterPath = import_node_path8.default.join(this.mediaRootDir, "observatory_poster.svg");
    import_node_fs10.default.writeFileSync(
      posterPath,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#090d16"/>
            <stop offset="50%" stop-color="#111c2d"/>
            <stop offset="100%" stop-color="#0c1322"/>
          </linearGradient>
        </defs>
        <rect width="1280" height="720" fill="url(#bg)"/>
        <g stroke="#1e293b" stroke-width="1">
          <line x1="0" y1="180" x2="1280" y2="180"/>
          <line x1="0" y1="360" x2="1280" y2="360"/>
          <line x1="0" y1="540" x2="1280" y2="540"/>
          <line x1="320" y1="0" x2="320" y2="720"/>
          <line x1="640" y1="0" x2="640" y2="720"/>
          <line x1="960" y1="0" x2="960" y2="720"/>
        </g>
        <circle cx="640" cy="360" r="140" fill="none" stroke="#0284c7" stroke-width="3" opacity="0.6"/>
        <circle cx="640" cy="360" r="90" fill="none" stroke="#38bdf8" stroke-width="2" opacity="0.85"/>
        <polygon points="615,315 615,405 690,360" fill="#38bdf8"/>
        <text x="64" y="620" fill="#f8fafc" font-family="sans-serif" font-size="34" font-weight="700">Alpine Observatory Reference Broadcast (SMPTE 60fps)</text>
        <text x="64" y="662" fill="#94a3b8" font-family="monospace" font-size="22">H.264 / AAC \xB7 1080p60 DASH + 720p30 + 480p30 + 360p30 + 192kbps M4A</text>
      </svg>`,
      "utf-8"
    );
    const manifest = {
      title: "Alpine Observatory Reference Broadcast (Multi-Stream Master)",
      uploader: "Open Broadcast Lab Archive",
      durationSeconds: 3,
      platform: "Authorized Media Archive",
      thumbnailUrl: "/local-media/observatory_poster.svg",
      streams: [
        {
          formatId: "137-1080p60-video",
          url: "/local-media/observatory_1080p60_video.mp4",
          extension: "mp4",
          container: "mp4",
          streamType: "video_only",
          resolution: "1080p",
          height: 1080,
          width: 1920,
          fps: 60,
          vcodec: "avc1.64002a",
          acodec: null,
          filesizeBytes: import_node_fs10.default.statSync(v1080Path).size,
          tbrKbps: 2450,
          formatNote: "1080p60 High Profile (Video Only - Merges with Audio via FFmpeg)"
        },
        {
          formatId: "22-720p30-combined",
          url: "/local-media/observatory_720p30_combined.mp4",
          extension: "mp4",
          container: "mp4",
          streamType: "combined",
          resolution: "720p",
          height: 720,
          width: 1280,
          fps: 30,
          vcodec: "avc1.64001f",
          acodec: "mp4a.40.2",
          filesizeBytes: import_node_fs10.default.statSync(v720Path).size,
          tbrKbps: 1420,
          formatNote: "720p30 Combined A/V Stream"
        },
        {
          formatId: "18-480p30-combined",
          url: "/local-media/observatory_480p30_combined.mp4",
          extension: "mp4",
          container: "mp4",
          streamType: "combined",
          resolution: "480p",
          height: 480,
          width: 854,
          fps: 30,
          vcodec: "avc1.4d401e",
          acodec: "mp4a.40.2",
          filesizeBytes: import_node_fs10.default.statSync(v480Path).size,
          tbrKbps: 820,
          formatNote: "480p30 Combined A/V Stream"
        },
        {
          formatId: "17-360p30-combined",
          url: "/local-media/observatory_360p30_combined.mp4",
          extension: "mp4",
          container: "mp4",
          streamType: "combined",
          resolution: "360p",
          height: 360,
          width: 640,
          fps: 30,
          vcodec: "avc1.42e01e",
          acodec: "mp4a.40.2",
          filesizeBytes: import_node_fs10.default.statSync(v360Path).size,
          tbrKbps: 460,
          formatNote: "360p30 Combined A/V Stream"
        },
        {
          formatId: "140-m4a-audio",
          url: "/local-media/observatory_master_audio.m4a",
          extension: "m4a",
          container: "m4a",
          streamType: "audio_only",
          resolution: "audio only",
          height: null,
          width: null,
          fps: null,
          vcodec: null,
          acodec: "mp4a.40.2",
          filesizeBytes: import_node_fs10.default.statSync(audioM4aPath).size,
          tbrKbps: 192,
          formatNote: "Master Stereo Audio (192 kbps AAC)"
        }
      ]
    };
    import_node_fs10.default.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  }
  getSampleSources(serverOrigin) {
    return [
      {
        id: "sample-adaptive-master",
        label: "Multi-Resolution Master (1080p60 DASH + 720p + 480p + 360p + M4A)",
        description: "Authorized multi-stream broadcast manifest supporting separate 1080p60 video + AAC audio FFmpeg merging and audio conversion.",
        url: `${serverOrigin}/local-media/observatory_broadcast.media.json`,
        category: "multi_res_dash"
      },
      {
        id: "sample-hls-playlist",
        label: "Authorized HLS Master Playlist (.m3u8)",
        description: "HLS VOD stream with MPEG-TS segments assembled and remuxed to MP4 via FFmpeg.",
        url: `${serverOrigin}/local-media/master_stream.m3u8`,
        category: "hls_stream"
      },
      {
        id: "sample-direct-mp4",
        label: "Direct 720p MP4 Reference Stream",
        description: "Direct HTTP MP4 file inspected via FFprobe with real-time byte transfer progress.",
        url: `${serverOrigin}/local-media/observatory_720p30_combined.mp4`,
        category: "direct_mp4"
      }
    ];
  }
};

// src/main/services/ytDlpExtractor.ts
var import_node_child_process5 = require("node:child_process");
var import_node_fs11 = __toESM(require("node:fs"), 1);
var import_node_path9 = __toESM(require("node:path"), 1);
function parseYtDlpProgressLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("UVDP|")) {
    const parts = trimmed.split("|");
    if (parts.length >= 7) {
      const downloadedRaw = Number(parts[2]);
      const totalExact = Number(parts[3]);
      const totalEst = Number(parts[4]);
      const speedRaw = Number(parts[5]);
      const etaRaw = Number(parts[6]);
      const downloadedBytes = Number.isFinite(downloadedRaw) && downloadedRaw >= 0 ? downloadedRaw : 0;
      const totalBytes = Number.isFinite(totalExact) && totalExact > 0 ? totalExact : Number.isFinite(totalEst) && totalEst > 0 ? totalEst : null;
      const progressPercent = totalBytes && totalBytes > 0 ? Math.min(100, Math.max(0, Number((downloadedBytes / totalBytes * 100).toFixed(1)))) : null;
      return {
        progressPercent,
        isIndeterminate: progressPercent === null,
        downloadedBytes,
        totalBytes,
        speedBytesPerSec: Number.isFinite(speedRaw) && speedRaw > 0 ? speedRaw : null,
        etaSeconds: Number.isFinite(etaRaw) && etaRaw >= 0 ? Math.round(etaRaw) : null
      };
    }
  }
  if (trimmed.startsWith("[download]")) {
    const pctMatch = trimmed.match(/(\d+(?:\.\d+)?)%/);
    const sizeMatch = trimmed.match(/of\s+~?(\d+(?:\.\d+)?)(KiB|MiB|GiB|B)/i);
    const speedMatch = trimmed.match(/at\s+(\d+(?:\.\d+)?)(KiB|MiB|GiB|B)\/s/i);
    const etaMatch = trimmed.match(/ETA\s+(?:(\d+):)?(\d+):(\d+)/);
    if (!pctMatch && !sizeMatch) return null;
    const unitMultiplier = (unit) => {
      switch (unit.toLowerCase()) {
        case "gib":
          return 1024 * 1024 * 1024;
        case "mib":
          return 1024 * 1024;
        case "kib":
          return 1024;
        default:
          return 1;
      }
    };
    const pct = pctMatch ? Math.min(100, Math.max(0, parseFloat(pctMatch[1]))) : null;
    const totalBytes = sizeMatch ? Math.round(parseFloat(sizeMatch[1]) * unitMultiplier(sizeMatch[2])) : null;
    const downloadedBytes = pct !== null && totalBytes !== null ? Math.round(pct / 100 * totalBytes) : 0;
    const speedBytesPerSec = speedMatch ? Math.round(parseFloat(speedMatch[1]) * unitMultiplier(speedMatch[2])) : null;
    const etaSeconds = etaMatch ? (etaMatch[1] ? parseInt(etaMatch[1], 10) * 3600 : 0) + parseInt(etaMatch[2], 10) * 60 + parseInt(etaMatch[3], 10) : null;
    return {
      progressPercent: pct,
      isIndeterminate: pct === null,
      downloadedBytes,
      totalBytes,
      speedBytesPerSec,
      etaSeconds
    };
  }
  return null;
}
function normalizeYtDlpFormats(rawFormats) {
  const normalized = [];
  for (const raw of rawFormats) {
    if (!raw.format_id) continue;
    if (raw.ext === "mhtml" || raw.format_note === "storyboard") continue;
    const vcodec = raw.vcodec && raw.vcodec !== "none" ? raw.vcodec : null;
    const acodec = raw.acodec && raw.acodec !== "none" ? raw.acodec : null;
    const hasVideo = Boolean(vcodec || raw.height && raw.height > 0);
    const hasAudio = Boolean(acodec);
    if (!hasVideo && !hasAudio) continue;
    let streamType = "combined";
    if (hasVideo && !hasAudio) {
      streamType = "video_only";
    } else if (!hasVideo && hasAudio) {
      streamType = "audio_only";
    }
    const height = typeof raw.height === "number" && raw.height > 0 ? raw.height : null;
    const width = typeof raw.width === "number" && raw.width > 0 ? raw.width : null;
    const resolution = streamType === "audio_only" ? "audio only" : height ? `${height}p` : raw.resolution || "unknown";
    normalized.push({
      formatId: String(raw.format_id),
      extension: raw.ext || "mp4",
      container: raw.container || raw.ext || "mp4",
      streamType,
      resolution,
      height,
      width,
      fps: typeof raw.fps === "number" && raw.fps > 0 ? Math.round(raw.fps) : null,
      vcodec,
      acodec,
      filesizeBytes: typeof raw.filesize === "number" && raw.filesize > 0 ? raw.filesize : null,
      filesizeApproxBytes: typeof raw.filesize_approx === "number" && raw.filesize_approx > 0 ? raw.filesize_approx : null,
      tbrKbps: typeof raw.tbr === "number" ? Math.round(raw.tbr) : null,
      vbrKbps: typeof raw.vbr === "number" ? Math.round(raw.vbr) : null,
      abrKbps: typeof raw.abr === "number" ? Math.round(raw.abr) : null,
      formatNote: raw.format_note || (streamType === "video_only" ? "Video stream" : streamType === "audio_only" ? "Audio stream" : "Combined A/V"),
      hasVideo,
      hasAudio,
      requiresMerge: streamType === "video_only",
      protocol: raw.protocol || "https"
    });
  }
  return normalized.sort((a, b) => {
    const hDiff = (b.height || 0) - (a.height || 0);
    if (hDiff !== 0) return hDiff;
    return (b.tbrKbps || 0) - (a.tbrKbps || 0);
  });
}
var YtDlpExtractor = class {
  constructor(binaryManager, mediaProcessor, getSettings) {
    this.binaryManager = binaryManager;
    this.mediaProcessor = mediaProcessor;
    this.getSettings = getSettings;
    this.activeProcesses = /* @__PURE__ */ new Map();
    this.sessionAuthArgs = /* @__PURE__ */ new Map();
  }
  canHandle(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }
  getCapabilities() {
    return {
      id: "yt-dlp",
      name: "yt-dlp Universal Extractor",
      description: "Extracts public media streams, adaptive DASH/HLS formats, and metadata across supported websites.",
      supportedProtocols: ["http", "https"],
      supportsFormatListing: true,
      supportsSeparateStreams: true,
      supportsResume: true,
      supportsLiveStreams: false
    };
  }
  getFormats(analysis) {
    return analysis.formats;
  }
  getInitialCookieArgs(settings) {
    if (!settings) return ["--no-cookies"];
    if (settings.cookiesFilePath && import_node_fs11.default.existsSync(settings.cookiesFilePath)) {
      return ["--cookies", settings.cookiesFilePath];
    }
    if (settings.cookiesFromBrowser && settings.cookiesFromBrowser !== "auto" && settings.cookiesFromBrowser !== "none") {
      return ["--cookies-from-browser", settings.cookiesFromBrowser];
    }
    return ["--no-cookies"];
  }
  getNetworkAndSiteArgs(url, settings) {
    const args = [];
    if (settings?.proxyUrl && settings.proxyUrl.trim()) {
      args.push("--proxy", settings.proxyUrl.trim());
    }
    if (settings?.geoBypassCountry && settings.geoBypassCountry !== "none") {
      const countryCode = settings.geoBypassCountry === "auto" ? "US" : settings.geoBypassCountry.toUpperCase();
      args.push("--xff", countryCode);
    }
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host.includes("bilibili.com") || host.includes("b23.tv")) {
        args.push(
          "--add-header",
          "Referer:https://www.bilibili.com/",
          "--user-agent",
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        );
      }
    } catch {
    }
    return args;
  }
  runYtDlpAnalyzeAttempt(ytDlpBin, url, extraAuthArgs, timeoutMs) {
    const settings = this.getSettings?.();
    const networkArgs = this.getNetworkAndSiteArgs(url, settings);
    const args = [
      "--dump-single-json",
      "--no-playlist",
      "--no-warnings",
      "--no-check-certificates",
      "--geo-bypass",
      "--js-runtimes",
      "node",
      "--extractor-args",
      "youtube:player_client=default,mweb,tv_simply,android_vr",
      "--socket-timeout",
      "15",
      ...networkArgs,
      ...extraAuthArgs,
      "--",
      url
    ];
    return new Promise((resolve, reject) => {
      const child = (0, import_node_child_process5.spawn)(ytDlpBin, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
      let outBuf = "";
      let errBuf = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new AppError("NETWORK_FAILURE" /* NETWORK_FAILURE */, "Extractor analysis timed out.", errBuf, true));
      }, timeoutMs);
      child.stdout?.on("data", (chunk) => {
        outBuf += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        errBuf += chunk.toString();
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(
          new AppError(
            "EXTRACTION_FAILURE" /* EXTRACTION_FAILURE */,
            `Failed to launch yt-dlp process: ${err.message}`,
            err.message
          )
        );
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          const combinedErr = errBuf || outBuf || `yt-dlp exited with code ${code}`;
          const errObj = classifyStderrError(combinedErr);
          errObj.rawStderr = combinedErr;
          reject(errObj);
          return;
        }
        resolve({ stdout: outBuf, stderr: errBuf });
      });
    });
  }
  async analyze(url, options) {
    const binStatus = await this.binaryManager.verifyAllBinaries();
    if (!binStatus.ytDlp.available || !binStatus.ytDlp.resolvedPath) {
      throw new AppError(
        "PACKAGING_DEPENDENCY_ERROR" /* PACKAGING_DEPENDENCY_ERROR */,
        "yt-dlp binary is not available in resources/binaries or system PATH."
      );
    }
    const settings = this.getSettings?.();
    const timeoutMs = options?.timeoutMs ?? 3e4;
    let winningAuthArgs = this.getInitialCookieArgs(settings);
    let authDiagnosticNote = null;
    let result = null;
    try {
      result = await this.runYtDlpAnalyzeAttempt(
        binStatus.ytDlp.resolvedPath,
        url,
        winningAuthArgs,
        timeoutMs
      );
    } catch (firstErr) {
      const rawStderr = firstErr?.rawStderr || (firstErr instanceof AppError ? firstErr.technicalDetail || firstErr.message : String(firstErr));
      const lower = rawStderr.toLowerCase();
      const isBotOrSignInChallenge = lower.includes("not a bot") || lower.includes("sign in") || lower.includes("cookies-from-browser") || lower.includes("login_required");
      if (isBotOrSignInChallenge && (!settings || settings.cookiesFromBrowser !== "none")) {
        const candidateBrowsers = settings?.cookiesFromBrowser && settings.cookiesFromBrowser !== "auto" ? [settings.cookiesFromBrowser] : ["firefox", "edge", "chrome", "brave"];
        let chromiumLockedCookieDb = false;
        for (const browser of candidateBrowsers) {
          try {
            const browserArgs = ["--cookies-from-browser", browser];
            result = await this.runYtDlpAnalyzeAttempt(
              binStatus.ytDlp.resolvedPath,
              url,
              browserArgs,
              2e4
            );
            winningAuthArgs = browserArgs;
            authDiagnosticNote = `Verified via local ${browser} session profile.`;
            break;
          } catch (retryErr) {
            const retryStderr = (retryErr?.rawStderr || "").toLowerCase();
            if (retryStderr.includes("could not copy") || retryStderr.includes("cookie database") || retryStderr.includes("dpapi") || retryStderr.includes("permission denied")) {
              chromiumLockedCookieDb = true;
            }
          }
        }
        if (!result) {
          if (chromiumLockedCookieDb) {
            throw new AppError(
              "AUTHENTICATION_REQUIRED" /* AUTHENTICATION_REQUIRED */,
              `YouTube requested bot verification ("Sign in to confirm you're not a bot"), and your open Edge/Chrome browser locked its cookie database on Windows. Close Edge/Chrome completely and click Analyze URL again, use Firefox, or select an exported cookies.txt file in Settings.`,
              rawStderr,
              true
            );
          }
          throw new AppError(
            "AUTHENTICATION_REQUIRED" /* AUTHENTICATION_REQUIRED */,
            `YouTube requested bot verification ("Sign in to confirm you're not a bot"). To resolve this on Windows: sign in to YouTube in Firefox/Edge/Chrome (close Edge/Chrome before analyzing so its cookie DB is unlocked), or select an exported cookies.txt file in Settings.`,
            rawStderr,
            true
          );
        }
      } else {
        const isNetworkTimeoutOrRefused = lower.includes("timed out") || lower.includes("connection reset") || lower.includes("unreachable") || lower.includes("getaddrinfo") || lower.includes("ssl") || lower.includes("451") || lower.includes("geo");
        if (isNetworkTimeoutOrRefused && (!settings?.proxyUrl || !settings.proxyUrl.trim())) {
          throw new AppError(
            "NETWORK_FAILURE" /* NETWORK_FAILURE */,
            'Could not reach the source website (it may be regionally blocked in your country/ISP, such as Bilibili in Pakistan). Open "Unblock / Proxy" on the Home bar or in Settings to configure an HTTP/SOCKS5 proxy and Geo-Bypass country.',
            rawStderr,
            true
          );
        }
        throw firstErr;
      }
    }
    const { stdout, stderr } = result;
    let parsed;
    try {
      const jsonStart = stdout.indexOf("{");
      const jsonEnd = stdout.lastIndexOf("}");
      const jsonSlice = jsonStart !== -1 && jsonEnd > jsonStart ? stdout.slice(jsonStart, jsonEnd + 1) : stdout;
      parsed = JSON.parse(jsonSlice);
    } catch {
      throw classifyStderrError(stderr || "Extractor returned non-JSON output.");
    }
    const rawFormats = Array.isArray(parsed.formats) ? parsed.formats : [
      {
        format_id: String(parsed.format_id || "default"),
        ext: String(parsed.ext || "mp4"),
        vcodec: String(parsed.vcodec || "h264"),
        acodec: String(parsed.acodec || "aac"),
        height: typeof parsed.height === "number" ? parsed.height : null,
        width: typeof parsed.width === "number" ? parsed.width : null,
        fps: typeof parsed.fps === "number" ? parsed.fps : null,
        filesize: typeof parsed.filesize === "number" ? parsed.filesize : null
      }
    ];
    const formats = normalizeYtDlpFormats(rawFormats);
    if (formats.length === 0) {
      throw new AppError(
        "UNAVAILABLE_MEDIA" /* UNAVAILABLE_MEDIA */,
        "No downloadable media formats were returned by the source."
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
      `Extractor "${typeof parsed.extractor_key === "string" ? parsed.extractor_key : "generic"}" returned ${formats.length} stream format(s).`
    ];
    if (authDiagnosticNote) {
      diagnosticMessages[0] += ` (${authDiagnosticNote})`;
    }
    return {
      analysisId,
      sourceUrl: url,
      normalizedUrl: typeof parsed.webpage_url === "string" ? parsed.webpage_url : url,
      extractorId: "yt-dlp",
      extractorName: typeof parsed.extractor_key === "string" ? `yt-dlp (${parsed.extractor_key})` : "yt-dlp",
      platform: typeof parsed.extractor_key === "string" ? parsed.extractor_key : parsedUrl.hostname,
      domain: parsedUrl.hostname,
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "Untitled Video",
      uploader: typeof parsed.uploader === "string" ? parsed.uploader : null,
      durationSeconds: typeof parsed.duration === "number" ? Math.round(parsed.duration) : null,
      thumbnailUrl: typeof parsed.thumbnail === "string" ? parsed.thumbnail : null,
      isLive: Boolean(parsed.is_live),
      formats,
      availableResolutions,
      availableContainers,
      diagnosticMessages,
      analyzedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async download(analysis, selectedFormat, selectedAudioFormat, request, options) {
    const binStatus = await this.binaryManager.verifyAllBinaries();
    if (!binStatus.ytDlp.available || !binStatus.ytDlp.resolvedPath) {
      throw new AppError("PACKAGING_DEPENDENCY_ERROR" /* PACKAGING_DEPENDENCY_ERROR */, "yt-dlp binary is unavailable.");
    }
    const formatExpr = selectedFormat.requiresMerge && selectedAudioFormat ? `${selectedFormat.formatId}+${selectedAudioFormat.formatId}` : selectedFormat.formatId;
    const tempTemplate = resolveSafeChildPath(options.tempDir, "stream_%(id)s.%(ext)s");
    const maxFileSizeArg = `${Math.max(
      10,
      Math.floor(options.maxFileSizeBytes / (1024 * 1024))
    )}M`;
    const settings = this.getSettings?.();
    const authArgs = this.sessionAuthArgs.get(analysis.analysisId) || this.getInitialCookieArgs(settings);
    const networkArgs = this.getNetworkAndSiteArgs(analysis.sourceUrl, settings);
    const args = [
      "--no-playlist",
      "--newline",
      "--no-check-certificates",
      "--geo-bypass",
      "--js-runtimes",
      "node",
      "--extractor-args",
      "youtube:player_client=default,mweb,tv_simply,android_vr",
      ...networkArgs,
      ...authArgs,
      "--max-filesize",
      maxFileSizeArg,
      "--progress-template",
      "download:UVDP|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s",
      "-f",
      formatExpr,
      "-o",
      tempTemplate
    ];
    if (binStatus.ffmpeg.available && binStatus.ffmpeg.resolvedPath) {
      args.push("--ffmpeg-location", binStatus.ffmpeg.resolvedPath);
    }
    const desiredContainer = request.convertAudioTo !== "none" ? request.convertAudioTo : request.targetContainer === "original" ? selectedFormat.extension : request.targetContainer;
    if (selectedFormat.requiresMerge && (desiredContainer === "mp4" || desiredContainer === "mkv" || desiredContainer === "webm")) {
      args.push("--merge-output-format", desiredContainer);
    }
    args.push("--", analysis.sourceUrl);
    await new Promise((resolve, reject) => {
      const child = (0, import_node_child_process5.spawn)(binStatus.ytDlp.resolvedPath, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
      this.activeProcesses.set(options.jobId, child);
      let stderr = "";
      child.stdout?.on("data", (chunk) => {
        const lines = chunk.toString().split(/\r?\n/);
        for (const line of lines) {
          const tick = parseYtDlpProgressLine(line);
          if (tick) {
            options.onProgress({
              state: "downloading",
              progressPercent: tick.progressPercent,
              isIndeterminate: tick.isIndeterminate,
              downloadedBytes: tick.downloadedBytes,
              totalBytes: tick.totalBytes,
              speedBytesPerSec: tick.speedBytesPerSec,
              etaSeconds: tick.etaSeconds,
              stageDescription: "Downloading media stream via yt-dlp..."
            });
          } else if (line.includes("[Merger]")) {
            options.onProgress({
              state: "merging",
              progressPercent: 99,
              isIndeterminate: false,
              downloadedBytes: 0,
              totalBytes: null,
              speedBytesPerSec: null,
              etaSeconds: 1,
              stageDescription: "Merging video and audio streams with FFmpeg..."
            });
          }
        }
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (err) => {
        this.activeProcesses.delete(options.jobId);
        reject(new AppError("INTERRUPTED_PROCESS" /* INTERRUPTED_PROCESS */, void 0, err.message));
      });
      child.on("close", (code, signal) => {
        this.activeProcesses.delete(options.jobId);
        if (signal === "SIGTERM" || signal === "SIGKILL") {
          reject(new AppError("CANCELLED_DOWNLOAD" /* CANCELLED_DOWNLOAD */));
          return;
        }
        if (code !== 0) {
          reject(classifyStderrError(stderr || `yt-dlp exited with code ${code}`));
          return;
        }
        resolve();
      });
    });
    const files = import_node_fs11.default.readdirSync(options.tempDir).filter((f) => !f.endsWith(".part") && !f.endsWith(".ytdl"));
    if (files.length === 0) {
      throw new AppError(
        "INTERRUPTED_PROCESS" /* INTERRUPTED_PROCESS */,
        "yt-dlp finished but no output file was found."
      );
    }
    let currentTempFile = import_node_path9.default.join(options.tempDir, files[0]);
    let finalExt = import_node_path9.default.extname(currentTempFile).replace(/^\./, "") || desiredContainer;
    if (request.convertAudioTo === "mp3" || request.convertAudioTo === "m4a") {
      options.onProgress({
        state: "converting",
        progressPercent: 99,
        isIndeterminate: false,
        downloadedBytes: import_node_fs11.default.statSync(currentTempFile).size,
        totalBytes: import_node_fs11.default.statSync(currentTempFile).size,
        speedBytesPerSec: null,
        etaSeconds: 1,
        stageDescription: `Converting audio to ${request.convertAudioTo.toUpperCase()} via FFmpeg...`
      });
      const convertedTemp = resolveSafeChildPath(
        options.tempDir,
        `converted.${request.convertAudioTo}`
      );
      await this.mediaProcessor.convertToAudioFormat(
        currentTempFile,
        convertedTemp,
        request.convertAudioTo,
        void 0,
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
    import_node_fs11.default.copyFileSync(currentTempFile, finalFilePath);
    const stat = import_node_fs11.default.statSync(finalFilePath);
    return {
      finalFilePath,
      fileSizeBytes: stat.size,
      container: finalExt,
      mergedStreams: Boolean(selectedFormat.requiresMerge && selectedAudioFormat)
    };
  }
  async cancel(jobId) {
    const proc = this.activeProcesses.get(jobId);
    if (!proc) return false;
    try {
      proc.kill("SIGTERM");
      setTimeout(() => {
        try {
          if (!proc.killed) proc.kill("SIGKILL");
        } catch {
        }
      }, 1500);
      this.activeProcesses.delete(jobId);
      return true;
    } catch {
      return false;
    }
  }
};

// src/main/services/appContainer.ts
var AppBackendContainer = class {
  constructor(options) {
    this.options = options;
    this.embeddedServer = null;
    const baseUserDir = options?.dataDir || import_node_path10.default.join(process.cwd(), ".uvd-data");
    this.dataDir = baseUserDir;
    this.downloadsDir = options?.downloadsDir || import_node_path10.default.join(baseUserDir, "Downloads");
    this.tempDir = options?.tempDir || import_node_path10.default.join(import_node_os.default.tmpdir(), "universal-video-downloader-temp");
    this.mediaRootDir = import_node_path10.default.join(baseUserDir, "test-media");
    this.localMediaPort = options?.localTestServerPort ?? 3e3;
    const dbPath = import_node_path10.default.join(this.dataDir, "uvd_metadata.sqlite");
    this.sqlite = new SqliteDatabase(dbPath);
    this.repositories = new StorageRepositories(this.sqlite, this.downloadsDir);
    const currentSettings = this.repositories.getSettings();
    this.filesystemManager = new FilesystemManager(
      currentSettings.defaultDownloadDir || this.downloadsDir,
      this.tempDir
    );
    this.binaryManager = new BinaryManager();
    this.mediaProcessor = new MediaProcessor(this.binaryManager);
    this.urlValidationOptions = {
      allowAuthorizedLocalTestServerPort: this.localMediaPort,
      resolveDns: true
    };
    this.extractorEngine = new ExtractorEngine(this.urlValidationOptions);
    this.extractorEngine.registerExtractor(
      new HlsDashExtractor(this.binaryManager, this.mediaProcessor, this.urlValidationOptions)
    );
    this.extractorEngine.registerExtractor(
      new DirectHttpExtractor(this.mediaProcessor, this.urlValidationOptions)
    );
    this.extractorEngine.registerExtractor(
      new YtDlpExtractor(
        this.binaryManager,
        this.mediaProcessor,
        () => this.repositories.getSettings()
      )
    );
    this.jobManager = new JobManager(
      this.extractorEngine,
      this.filesystemManager,
      this.repositories,
      this.binaryManager
    );
    this.testMediaGenerator = new TestMediaGenerator(this.mediaRootDir);
  }
  async initialize() {
    const binReport = await this.binaryManager.verifyAllBinaries();
    await this.testMediaGenerator.ensureTestMediaGenerated(binReport.ffmpeg.resolvedPath);
    if (this.options?.startEmbeddedMediaServer) {
      await this.startEmbeddedLocalMediaServer();
    }
  }
  getLocalMediaOrigin() {
    return `http://127.0.0.1:${this.localMediaPort}`;
  }
  async startEmbeddedLocalMediaServer() {
    if (this.embeddedServer) return;
    const server = import_node_http3.default.createServer((req, res) => {
      if (!req.url || !req.url.startsWith("/local-media/")) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const relFile = import_node_path10.default.basename(req.url.slice("/local-media/".length).split("?")[0]);
      const fullPath = import_node_path10.default.join(this.mediaRootDir, relFile);
      if (!import_node_fs12.default.existsSync(fullPath) || !import_node_fs12.default.statSync(fullPath).isFile()) {
        res.writeHead(404);
        res.end("Media file not found");
        return;
      }
      const stat = import_node_fs12.default.statSync(fullPath);
      res.writeHead(200, {
        "Content-Length": stat.size,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      });
      import_node_fs12.default.createReadStream(fullPath).pipe(res);
    });
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) {
          this.localMediaPort = addr.port;
          this.urlValidationOptions.allowAuthorizedLocalTestServerPort = addr.port;
        }
        this.embeddedServer = server;
        resolve();
      });
    });
  }
  shutdown() {
    if (this.embeddedServer) {
      this.embeddedServer.close();
      this.embeddedServer = null;
    }
    const settings = this.repositories.getSettings();
    if (settings.tempFileCleanupPolicy === "on_exit") {
      for (const job of this.jobManager.getAllJobs()) {
        this.filesystemManager.cleanupJobTempDir(job.jobId);
      }
    }
    this.sqlite.close();
  }
};

// src/main/windows/mainWindow.ts
var import_electron2 = require("electron");
var import_node_path11 = __toESM(require("node:path"), 1);

// src/main/security/csp.ts
var CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https: http://127.0.0.1:* http://localhost:*",
  "media-src 'self' blob: http://127.0.0.1:* http://localhost:*",
  "connect-src 'self' http://127.0.0.1:* http://localhost:*",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'self'"
].join("; ");
function isAllowedNavigationUrl(targetUrl, allowedOrigin) {
  try {
    const parsed = new URL(targetUrl);
    return parsed.origin === allowedOrigin;
  } catch {
    return false;
  }
}

// src/main/windows/mainWindow.ts
function createMainWindow(preloadPath, rendererUrlOrFile) {
  import_electron2.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [CONTENT_SECURITY_POLICY]
      }
    });
  });
  const mainWindow2 = new import_electron2.BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    frame: false,
    autoHideMenuBar: true,
    title: "Universal Video Downloader",
    backgroundColor: "#020617",
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false
    }
  });
  mainWindow2.setMenuBarVisibility(false);
  mainWindow2.once("ready-to-show", () => {
    mainWindow2.show();
  });
  const allowedOrigin = rendererUrlOrFile.startsWith("http") ? new URL(rendererUrlOrFile).origin : "file://";
  mainWindow2.webContents.on("will-navigate", (event, navigationUrl) => {
    if (!navigationUrl.startsWith("file://") && !isAllowedNavigationUrl(navigationUrl, allowedOrigin)) {
      event.preventDefault();
    }
  });
  mainWindow2.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
  if (rendererUrlOrFile.startsWith("http://") || rendererUrlOrFile.startsWith("https://")) {
    void mainWindow2.loadURL(rendererUrlOrFile);
  } else {
    void mainWindow2.loadFile(import_node_path11.default.resolve(rendererUrlOrFile));
  }
  return mainWindow2;
}

// src/main/index.ts
var mainWindow = null;
var backendContainer = null;
async function bootstrapElectronApp() {
  await import_electron3.app.whenReady();
  import_electron3.Menu.setApplicationMenu(null);
  const userDataDir = import_electron3.app.getPath("userData");
  const downloadsDir = import_node_path12.default.join(import_electron3.app.getPath("downloads"), "UniversalVideoDownloader");
  const tempDir = import_node_path12.default.join(import_electron3.app.getPath("temp"), "UniversalVideoDownloader");
  backendContainer = new AppBackendContainer({
    dataDir: userDataDir,
    downloadsDir,
    tempDir,
    startEmbeddedMediaServer: true
  });
  await backendContainer.initialize();
  registerElectronIpcHandlers(backendContainer, () => mainWindow);
  const preloadPath = import_node_path12.default.join(__dirname, "../preload/index.js");
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const rendererTarget = devServerUrl || import_node_path12.default.join(__dirname, "../../dist/index.html");
  mainWindow = createMainWindow(preloadPath, rendererTarget);
  import_electron3.app.on("activate", () => {
    if (import_electron3.BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow(preloadPath, rendererTarget);
    }
  });
}
import_electron3.app.on("window-all-closed", () => {
  backendContainer?.shutdown();
  if (process.platform !== "darwin") {
    import_electron3.app.quit();
  }
});
void bootstrapElectronApp();
