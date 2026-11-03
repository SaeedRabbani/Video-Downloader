import { app, BrowserWindow, session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_SECURITY_POLICY, isAllowedNavigationUrl } from '../security/csp';
import { APP_BRANDING } from '../../shared/branding';

function resolveWindowIconPath(): string | undefined {
  const appPath = app.getAppPath();
  const candidates = [
    path.join(appPath, 'dist', 'icon.ico'),
    path.join(appPath, 'dist', 'icon.png'),
    path.join(appPath, 'public', 'icon.ico'),
    path.join(appPath, 'public', 'icon.png'),
    path.resolve(process.cwd(), 'public', 'icon.ico'),
    path.resolve(process.cwd(), 'public', 'icon.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function createMainWindow(preloadPath: string, rendererUrlOrFile: string): BrowserWindow {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
      },
    });
  });

  const iconPath = resolveWindowIconPath();

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    frame: false,
    autoHideMenuBar: true,
    title: APP_BRANDING.appName,
    ...(iconPath ? { icon: iconPath } : {}),
    backgroundColor: '#020617',
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const allowedOrigin = rendererUrlOrFile.startsWith('http')
    ? new URL(rendererUrlOrFile).origin
    : 'file://';

  // Block untrusted navigation
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!navigationUrl.startsWith('file://') && !isAllowedNavigationUrl(navigationUrl, allowedOrigin)) {
      event.preventDefault();
    }
  });

  // Deny all popup/new window requests
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  if (rendererUrlOrFile.startsWith('http://') || rendererUrlOrFile.startsWith('https://')) {
    void mainWindow.loadURL(rendererUrlOrFile);
  } else {
    void mainWindow.loadFile(path.resolve(rendererUrlOrFile));
  }

  return mainWindow;
}
