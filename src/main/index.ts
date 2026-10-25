import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import { registerElectronIpcHandlers } from './ipc/handlers';
import { AppBackendContainer } from './services/appContainer';
import { createMainWindow } from './windows/mainWindow';

let mainWindow: BrowserWindow | null = null;
let backendContainer: AppBackendContainer | null = null;

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

  await backendContainer.initialize();

  registerElectronIpcHandlers(backendContainer, () => mainWindow);

  const preloadPath = path.join(__dirname, '../preload/index.js');
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const rendererTarget = devServerUrl || path.join(__dirname, '../../dist/index.html');

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
