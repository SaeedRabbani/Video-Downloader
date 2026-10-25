import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { AppError, ErrorCode } from '../../shared/errors/taxonomy';
import { IPC_CHANNELS } from '../../shared/events/channels';
import { validatePartialSettings } from '../../shared/schemas/validation';
import { BulkQueueRequest, FormatSelectionRequest } from '../../shared/types';
import { AppBackendContainer } from '../services/appContainer';
import { validateIpcSender } from './senderValidation';

export function registerElectronIpcHandlers(
  container: AppBackendContainer,
  getMainWindow: () => BrowserWindow | null
): void {
  const handleSecure = <TArgs extends unknown[], TResult>(
    channel: string,
    handler: (...args: TArgs) => Promise<TResult> | TResult
  ) => {
    ipcMain.handle(channel, async (event, ...args) => {
      validateIpcSender(event, channel);
      try {
        return await handler(...(args as TArgs));
      } catch (err) {
        const appErr =
          err instanceof AppError
            ? err
            : new AppError(
                ErrorCode.EXTRACTION_FAILURE,
                err instanceof Error ? err.message : undefined,
                err instanceof Error ? err.stack : String(err)
              );
        container.repositories.logDiagnostic({
          level: 'error',
          category: `ipc:${channel}`,
          code: appErr.code,
          message: appErr.userMessage,
          redactedContext: appErr.technicalDetail || null,
        });
        throw new Error(appErr.userMessage);
      }
    });
  };

  handleSecure(IPC_CHANNELS.ANALYZE_URL, async (url: string) => {
    return await container.extractorEngine.analyzeUrl(url);
  });

  handleSecure(IPC_CHANNELS.START_DOWNLOAD, async (request: FormatSelectionRequest) => {
    return container.jobManager.enqueueDownload(request);
  });

  handleSecure(IPC_CHANNELS.BULK_ENQUEUE, async (request: BulkQueueRequest) => {
    return await container.jobManager.bulkEnqueueUrls(request);
  });

  handleSecure(IPC_CHANNELS.CANCEL_JOB, async (jobId: string) => {
    return await container.jobManager.cancelJob(jobId);
  });

  handleSecure(IPC_CHANNELS.RETRY_JOB, async (jobId: string) => {
    return await container.jobManager.retryJob(jobId);
  });

  handleSecure(IPC_CHANNELS.REMOVE_JOB, async (jobId: string) => {
    return await container.jobManager.removeJob(jobId);
  });

  handleSecure(IPC_CHANNELS.GET_JOBS, async () => {
    return container.jobManager.getAllJobs();
  });

  handleSecure(IPC_CHANNELS.GET_HISTORY, async () => {
    return container.repositories.getHistory();
  });

  handleSecure(IPC_CHANNELS.REMOVE_HISTORY_ITEM, async (historyId: string) => {
    return container.repositories.removeHistoryItem(historyId);
  });

  handleSecure(
    IPC_CHANNELS.DELETE_DOWNLOADED_FILE,
    async (payload: { historyId: string; confirmed: boolean }) => {
      if (!payload?.confirmed) {
        throw new AppError(
          ErrorCode.PERMISSION_DENIED,
          'Explicit user confirmation is required before deleting downloaded media.'
        );
      }
      const item = container.repositories.getHistoryItemById(payload.historyId);
      if (!item) {
        throw new AppError(ErrorCode.UNAVAILABLE_MEDIA, 'History record not found.');
      }
      if (item.filePath && fs.existsSync(item.filePath)) {
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

  handleSecure(IPC_CHANNELS.OPEN_FILE, async (filePath: string) => {
    if (!container.filesystemManager.isAuthorizedFilePath(filePath)) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'Refusing to open file outside authorized download folders.');
    }
    if (!fs.existsSync(filePath)) {
      throw new AppError(ErrorCode.UNAVAILABLE_MEDIA, 'File no longer exists at the recorded location.');
    }
    const errMsg = await shell.openPath(path.resolve(filePath));
    if (errMsg) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, `Could not open file: ${errMsg}`);
    }
    return { opened: true };
  });

  handleSecure(IPC_CHANNELS.OPEN_FOLDER, async (filePathOrDir: string) => {
    const resolved = path.resolve(filePathOrDir);
    if (
      !container.filesystemManager.isAuthorizedFilePath(resolved) &&
      resolved !== path.resolve(container.repositories.getSettings().defaultDownloadDir)
    ) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'Unauthorized directory path.');
    }
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      shell.showItemInFolder(resolved);
    } else {
      await shell.openPath(path.dirname(resolved));
    }
    return { opened: true };
  });

  handleSecure(IPC_CHANNELS.SELECT_DIRECTORY, async () => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Default Download Folder',
      properties: ['openDirectory', 'createDirectory'],
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
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Netscape cookies.txt File',
      properties: ['openFile'],
      filters: [
        { name: 'Cookies Text File', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const chosenFile = path.resolve(result.filePaths[0]);
    container.repositories.updateSettings({ cookiesFilePath: chosenFile });
    return chosenFile;
  });

  handleSecure(IPC_CHANNELS.GET_AVAILABLE_DIRECTORIES, async () => {
    const current = container.repositories.getSettings().defaultDownloadDir;
    const dirs = new Set<string>([current, container.downloadsDir]);
    return Array.from(dirs).filter(Boolean);
  });

  handleSecure(IPC_CHANNELS.GET_SETTINGS, async () => {
    return container.repositories.getSettings();
  });

  handleSecure(IPC_CHANNELS.UPDATE_SETTINGS, async (partial: Record<string, unknown>) => {
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

  container.jobManager.on('job-progress', (evt) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.JOB_PROGRESS_EVENT, evt);
    }
  });
}
