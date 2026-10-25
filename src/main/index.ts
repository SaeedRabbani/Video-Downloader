import { app, BrowserWindow, Menu } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { registerElectronIpcHandlers } from './ipc/handlers';
import { AppBackendContainer } from './services/appContainer';
import { createMainWindow } from './windows/mainWindow';

let mainWindow: BrowserWindow | null = null;
let backendContainer: AppBackendContainer | null = null;

function resolvePreloadScriptPath(): string {
  const cjsCandidate = path.join(__dirname, '../preload/index.cjs');
  if (fs.existsSync(cjsCandidate)) {
    return cjsCandidate;
  }
  return path.join(__dirname, '../preload/index.js');
}

function resolveRendererHtmlPath(): string {
  const relativeDist = path.join(__dirname, '../../dist/index.html');
  if (fs.existsSync(relativeDist)) {
    return relativeDist;
  }
  return path.join(app.getAppPath(), 'dist/index.html');
}

async function bootstrapElectronApp(): Promise<void> {
  await app.whenReady();
  Menu.setApplicationMenu(null);

  const userDataDir = app.getPath('userData');
  const downloadsDir = path.join(app.getPath('downloads'), 'UniversalVideoDownloader');
  const tempDir = path.join(app.getPath('temp'), 'UniversalVideoDownloader');

  backendContainer = new AppBackendContainer({
    dataDir: userDataDir,
    downloadsDir,
    tempDir,
    startEmbeddedMediaServer: true,
  });

  // Register IPC handlers immediately so the renderer never encounters missing channels
  registerElectronIpcHandlers(backendContainer, () => mainWindow);

  try {
    await backendContainer.initialize();
  } catch (err) {
    console.error('Non-fatal backend container initialization warning:', err);
  }

  const preloadPath = resolvePreloadScriptPath();
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const rendererTarget = devServerUrl || resolveRendererHtmlPath();

  mainWindow = createMainWindow(preloadPath, rendererTarget);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow(preloadPath, rendererTarget);
    }
  });
}

app.on('window-all-closed', () => {
  backendContainer?.shutdown();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

void bootstrapElectronApp();
