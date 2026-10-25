import React, { useEffect, useState } from 'react';
import {
  FolderOpen,
  FileText,
  RefreshCw,
  Copy,
  Trash2,
  Save,
} from 'lucide-react';
import {
  AppSettings,
  BrowserCookieSource,
  ContainerFormat,
  DiagnosticEntry,
  QualityPreset,
} from '../../shared/types';
import { ipcClient } from '../services/ipcClient';
import { formatTimestamp } from '../utils/formatters';

interface SettingsPageProps {
  settings: AppSettings | null;
  availableDirs: string[];
  diagnostics: DiagnosticEntry[];
  onUpdateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  onLoadDiagnostics: () => Promise<DiagnosticEntry[]>;
  onClearDiagnostics: () => Promise<void>;
  onShowToast: (text: string, type?: 'info' | 'error' | 'success') => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  availableDirs,
  diagnostics,
  onUpdateSettings,
  onLoadDiagnostics,
  onClearDiagnostics,
  onShowToast,
}) => {
  const [formState, setFormState] = useState<AppSettings | null>(settings);
  const [updateCheckInfo, setUpdateCheckInfo] = useState<string | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormState(settings);
    }
  }, [settings]);

  useEffect(() => {
    void onLoadDiagnostics();
  }, [onLoadDiagnostics]);

  if (!formState) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Loading configuration from SQLite...
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateSettings(formState);
  };

  const handleNativeFolderPick = async () => {
    const chosen = await ipcClient.selectDirectory();
    if (chosen) {
      setFormState((prev) => (prev ? { ...prev, defaultDownloadDir: chosen } : prev));
      await onUpdateSettings({ defaultDownloadDir: chosen });
    }
  };

  const handleNativeCookiesFilePick = async () => {
    const chosen = await ipcClient.selectCookiesFile();
    if (chosen) {
      setFormState((prev) => (prev ? { ...prev, cookiesFilePath: chosen } : prev));
      await onUpdateSettings({ cookiesFilePath: chosen });
    }
  };

  const handleCheckExtractorUpdates = async () => {
    setIsCheckingUpdate(true);
    try {
      const res = await ipcClient.checkExtractorUpdates();
      setUpdateCheckInfo(res.statusMessage);
      onShowToast(res.statusMessage, 'info');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleCopyDiagnostics = async () => {
    const fresh = await onLoadDiagnostics();
    const redactedPayload = {
      exportedAt: new Date().toISOString(),
      application: 'Universal Video Downloader — Windows Desktop Edition',
      settingsSummary: {
        defaultResolution: formState.defaultResolution,
        defaultOutputFormat: formState.defaultOutputFormat,
        maxConcurrentDownloads: formState.maxConcurrentDownloads,
        maxDownloadSizeMB: formState.maxDownloadSizeMB,
        tempFileCleanupPolicy: formState.tempFileCleanupPolicy,
        cookiesFromBrowser: formState.cookiesFromBrowser,
        hasCookiesFilePath: Boolean(formState.cookiesFilePath),
      },
      diagnosticEvents: fresh.map((d) => ({
        timestamp: d.timestamp,
        level: d.level,
        category: d.category,
        code: d.code,
        message: d.message,
        redactedContext: d.redactedContext,
      })),
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(redactedPayload, null, 2));
      onShowToast('Redacted diagnostic report copied to clipboard (no secrets or personal paths included).', 'success');
    } catch {
      onShowToast('Could not copy to clipboard automatically.', 'error');
    }
  };

  return (
    <div className="h-full min-h-0 space-y-6 overflow-y-auto pr-1">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Application Settings & Diagnostics
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          All preferences are validated and stored in parameterized SQLite tables.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
      >
        {/* Directory Selection */}
        <div>
          <label
            htmlFor="download-dir-select"
            className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
          >
            Default Download Directory
          </label>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Downloaded media files are saved to this user-writable folder and never inside the application installation folder.
          </p>
          <div className="mt-2 flex flex-col gap-2.5 sm:flex-row">
            <select
              id="download-dir-select"
              value={formState.defaultDownloadDir}
              onChange={(e) =>
                setFormState({ ...formState, defaultDownloadDir: e.target.value })
              }
              className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {!availableDirs.includes(formState.defaultDownloadDir) && (
                <option value={formState.defaultDownloadDir}>
                  {formState.defaultDownloadDir}
                </option>
              )}
              {availableDirs.map((dir) => (
                <option key={dir} value={dir}>
                  {dir}
                </option>
              ))}
            </select>

            {ipcClient.isElectronNative() && (
              <button
                type="button"
                onClick={handleNativeFolderPick}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FolderOpen className="h-4 w-4" />
                <span>Browse Native Folder...</span>
              </button>
            )}
          </div>
        </div>

        {/* YouTube / Platform Bot-Verification & Cookie Settings */}
        <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
          <h2 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Platform Bot-Verification & Cookie Session Mode
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            When YouTube triggers anti-bot verification (&ldquo;Sign in to confirm you&apos;re not a bot&rdquo;), yt-dlp can use local browser cookies or an exported Netscape <code className="font-mono">cookies.txt</code> file. Note: On Windows, Edge/Chrome lock their cookie database while open; Firefox works while open, or you can specify a <code className="font-mono">cookies.txt</code> file.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="cookies-browser-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Browser Cookie Fallback
              </label>
              <select
                id="cookies-browser-select"
                value={formState.cookiesFromBrowser || 'auto'}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    cookiesFromBrowser: e.target.value as BrowserCookieSource,
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="auto">Auto-Retry on Bot Challenge (Firefox → Edge → Chrome → Brave)</option>
                <option value="firefox">Always Use Mozilla Firefox Cookies</option>
                <option value="edge">Always Use Microsoft Edge Cookies</option>
                <option value="chrome">Always Use Google Chrome Cookies</option>
                <option value="brave">Always Use Brave Browser Cookies</option>
                <option value="none">Disabled (Never Read Browser Cookies)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="cookies-file-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Custom Netscape cookies.txt File (Optional — Works While Browser Is Open)
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="cookies-file-input"
                  type="text"
                  placeholder="C:\Users\You\Downloads\cookies.txt"
                  value={formState.cookiesFilePath || ''}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      cookiesFilePath: e.target.value,
                    })
                  }
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                {ipcClient.isElectronNative() && (
                  <button
                    type="button"
                    onClick={handleNativeCookiesFilePick}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Browse...</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Blocked Websites / Regional Bypass & Proxy Settings */}
        <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
          <h2 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Blocked Websites & Regional Bypass (Proxy / X-Forwarded-For)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            If a platform such as Bilibili is regionally blocked by your ISP (e.g., in Pakistan), configure an HTTP/HTTPS/SOCKS5 proxy URL and a Geo-Bypass country code for <code className="font-mono">yt-dlp</code>.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="proxy-url-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Outbound Proxy URL (HTTP / HTTPS / SOCKS5)
              </label>
              <input
                id="proxy-url-input"
                type="text"
                placeholder="socks5://127.0.0.1:1080 or http://127.0.0.1:7890"
                value={formState.proxyUrl || ''}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    proxyUrl: e.target.value,
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="geo-bypass-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Geo-Bypass Country Header (--xff)
              </label>
              <select
                id="geo-bypass-select"
                value={formState.geoBypassCountry || 'auto'}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    geoBypassCountry: e.target.value,
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="auto">Auto Geo-Bypass (US)</option>
                <option value="SG">Singapore (SG — Recommended for Asia)</option>
                <option value="HK">Hong Kong (HK — Recommended for Bilibili)</option>
                <option value="CN">China Mainland (CN — Bilibili Domestic)</option>
                <option value="GB">United Kingdom (GB)</option>
                <option value="JP">Japan (JP)</option>
                <option value="none">Disabled</option>
              </select>
            </div>
          </div>
        </div>

        {/* Grid of Preferences */}
        <div className="grid grid-cols-1 gap-5 border-t border-slate-200 pt-5 sm:grid-cols-2 lg:grid-cols-3 dark:border-slate-800">
          <div>
            <label
              htmlFor="default-res-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Default Resolution Preference
            </label>
            <select
              id="default-res-select"
              value={formState.defaultResolution}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  defaultResolution: e.target.value as QualityPreset,
                })
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="best">Best available quality</option>
              <option value="highest_resolution">Highest resolution</option>
              <option value="2160p">2160p (4K)</option>
              <option value="1440p">1440p (QHD)</option>
              <option value="1080p">1080p (Full HD)</option>
              <option value="720p">720p (HD)</option>
              <option value="480p">480p</option>
              <option value="360p">360p</option>
              <option value="audio_only">Audio only</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="default-container-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Default Output Container
            </label>
            <select
              id="default-container-select"
              value={formState.defaultOutputFormat}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  defaultOutputFormat: e.target.value as ContainerFormat,
                })
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="mp4">MP4</option>
              <option value="mkv">MKV</option>
              <option value="webm">WebM</option>
              <option value="original">Original Container</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="audio-pref-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Default Audio Conversion
            </label>
            <select
              id="audio-pref-select"
              value={formState.audioConversionPreference}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  audioConversionPreference: e.target.value as 'none' | 'mp3' | 'm4a',
                })
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="none">None (Keep Original Stream)</option>
              <option value="mp3">Convert Audio to MP3</option>
              <option value="m4a">Convert Audio to M4A</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="max-concurrent-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Max Simultaneous Downloads (1–8)
            </label>
            <input
              id="max-concurrent-input"
              type="number"
              min={1}
              max={8}
              value={formState.maxConcurrentDownloads}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  maxConcurrentDownloads: Number(e.target.value),
                })
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="max-size-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Maximum Permitted Download Size (MB)
            </label>
            <input
              id="max-size-input"
              type="number"
              min={50}
              max={50000}
              step={50}
              value={formState.maxDownloadSizeMB}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  maxDownloadSizeMB: Number(e.target.value),
                })
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="cleanup-policy-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Temporary File Cleanup Policy
            </label>
            <select
              id="cleanup-policy-select"
              value={formState.tempFileCleanupPolicy}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  tempFileCleanupPolicy: e.target.value as AppSettings['tempFileCleanupPolicy'],
                })
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="immediate">Immediate (Clean up right after job ends)</option>
              <option value="on_exit">On Application Exit</option>
              <option value="keep_for_debug">Keep for Troubleshooting</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="theme-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Interface Theme
            </label>
            <select
              id="theme-select"
              value={formState.theme}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  theme: e.target.value as 'dark' | 'light',
                })
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="dark">Dark Slate Theme</option>
              <option value="light">Light Studio Theme</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCheckExtractorUpdates}
              disabled={isCheckingUpdate}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
              <span>Verify Extractor Version</span>
            </button>
            {updateCheckInfo && (
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {updateCheckInfo}
              </span>
            )}
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-sky-500 whitespace-nowrap shrink-0"
          >
            <Save className="h-4 w-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </form>

      {/* Redacted Diagnostic Log Viewer */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Diagnostic Event Log (Redacted)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tokens, credentials, and sensitive query parameters are automatically stripped before logging.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopyDiagnostics}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-sky-500 whitespace-nowrap shrink-0"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>Copy Diagnostics</span>
            </button>
            <button
              type="button"
              onClick={onClearDiagnostics}
              disabled={diagnostics.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear Logs</span>
            </button>
          </div>
        </div>

        <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs dark:border-slate-800 dark:bg-slate-950">
          {diagnostics.length === 0 ? (
            <p className="py-6 text-center text-slate-500">No diagnostic events recorded.</p>
          ) : (
            <div className="space-y-2">
              {diagnostics.map((d) => (
                <div
                  key={d.id}
                  className="border-b border-slate-200/70 pb-2 last:border-none last:pb-0 dark:border-slate-800/70"
                >
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>{formatTimestamp(d.timestamp)}</span>
                    <span>·</span>
                    <span
                      className={
                        d.level === 'error'
                          ? 'font-semibold text-red-600 dark:text-red-400'
                          : 'text-sky-600 dark:text-sky-400'
                      }
                    >
                      {d.level.toUpperCase()}
                    </span>
                    <span>·</span>
                    <span>{d.category}</span>
                    {d.code && (
                      <>
                        <span>·</span>
                        <span>{d.code}</span>
                      </>
                    )}
                  </div>
                  <p className="mt-0.5 text-slate-800 dark:text-slate-200">{d.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
