import React, { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { DownloadJob, HistoryRecord } from '../../shared/types';
import { MediaPreviewModal } from '../components/ConfirmModal';
import { Sidebar } from '../components/Sidebar';
import { TopBar } from '../components/TopBar';
import { useDownloaderState } from '../hooks/useDownloaderState';
import { AboutPage } from '../pages/AboutPage';
import { DownloadsPage } from '../pages/DownloadsPage';
import { HistoryPage } from '../pages/HistoryPage';
import { HomePage } from '../pages/HomePage';
import { SettingsPage } from '../pages/SettingsPage';
import { ipcClient } from '../services/ipcClient';

export function DesktopApp() {
  const state = useDownloaderState();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [previewTarget, setPreviewTarget] = useState<{
    title: string;
    filePath: string;
    resolution: string;
    fileSizeBytes: number;
  } | null>(null);

  const activeJobCount = useMemo(
    () =>
      state.jobs.filter(
        (j) =>
          j.state === 'queued' ||
          j.state === 'analyzing' ||
          j.state === 'downloading' ||
          j.state === 'pausing' ||
          j.state === 'paused' ||
          j.state === 'merging' ||
          j.state === 'converting' ||
          j.state === 'cancelling'
      ).length,
    [state.jobs]
  );

  const handleOpenFile = async (filePath: string) => {
    try {
      await ipcClient.openFile(filePath);
    } catch (err) {
      state.showToast(err instanceof Error ? err.message : 'Could not open file.', 'error');
    }
  };

  const handleOpenFolder = async (filePath: string) => {
    try {
      await ipcClient.openFolder(filePath);
      state.showToast(`Verified local path: ${filePath}`, 'info');
    } catch (err) {
      state.showToast(err instanceof Error ? err.message : 'Could not open folder.', 'error');
    }
  };

  const handlePreviewJob = (job: DownloadJob) => {
    if (!job.outputFilePath) return;
    setPreviewTarget({
      title: job.title,
      filePath: job.outputFilePath,
      resolution: job.selectedResolution,
      fileSizeBytes: job.totalBytes || job.downloadedBytes || 0,
    });
  };

  const handlePreviewHistoryRecord = (record: HistoryRecord) => {
    setPreviewTarget({
      title: record.title,
      filePath: record.filePath,
      resolution: record.resolution,
      fileSizeBytes: record.fileSizeBytes,
    });
  };

  const handleToggleTheme = () => {
    const nextTheme = state.settings?.theme === 'light' ? 'dark' : 'light';
    void state.updateSettings({ theme: nextTheme });
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <TopBar
        activeSection={state.activeSection}
        onSelectSection={state.setActiveSection}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* Dependency Health Banner if any required binary is missing */}
      {state.binaryStatus && !state.binaryStatus.allReady && (
        <div
          role="alert"
          className="flex shrink-0 items-center justify-between gap-4 border-b border-amber-300 bg-amber-50 px-6 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-200"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              One or more media binaries (yt-dlp, FFmpeg, or FFprobe) were not detected. Stream merging and conversion require verified binaries.
            </span>
          </div>
          <button
            type="button"
            onClick={() => state.setActiveSection('about')}
            className="font-semibold underline whitespace-nowrap shrink-0"
          >
            View Binary Status
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          activeSection={state.activeSection}
          onSelectSection={state.setActiveSection}
          activeJobCount={activeJobCount}
          historyCount={state.history.length}
          theme={state.settings?.theme || 'dark'}
          onToggleTheme={handleToggleTheme}
          binaryStatus={state.binaryStatus}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4 lg:p-5">
          <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col overflow-hidden">
            {state.activeSection === 'home' && (
              <HomePage
                urlInput={state.urlInput}
                onUrlChange={state.setUrlInput}
                isAnalyzing={state.isAnalyzing}
                isBulkQueuing={state.isBulkQueuing}
                analysisError={state.analysisError}
                onClearError={() => state.setAnalysisError(null)}
                currentAnalysis={state.currentAnalysis}
                onClearAnalysis={() => state.setCurrentAnalysis(null)}
                onAnalyze={state.analyzeUrl}
                onStartDownload={state.startDownload}
                onBulkEnqueue={state.bulkEnqueue}
                onUpdateSettings={state.updateSettings}
                jobs={state.jobs}
                settings={state.settings}
                sampleSources={state.sampleSources}
                onPauseJob={state.pauseJob}
                onResumeJob={state.resumeJob}
                onCancelJob={state.cancelJob}
                onRetryJob={state.retryJob}
                onOpenFile={handleOpenFile}
                onPreviewFile={handlePreviewJob}
                onOpenFolder={handleOpenFolder}
                onNavigateDownloads={() => state.setActiveSection('downloads')}
                onShowToast={state.showToast}
              />
            )}

            {state.activeSection === 'downloads' && (
              <DownloadsPage
                jobs={state.jobs}
                maxConcurrent={state.settings?.maxConcurrentDownloads || 2}
                onPauseJob={state.pauseJob}
                onResumeJob={state.resumeJob}
                onCancelJob={state.cancelJob}
                onRetryJob={state.retryJob}
                onRemoveJob={state.removeJob}
                onOpenFile={handleOpenFile}
                onPreviewFile={handlePreviewJob}
                onOpenFolder={handleOpenFolder}
                onShowToast={state.showToast}
              />
            )}

            {state.activeSection === 'history' && (
              <HistoryPage
                history={state.history}
                onOpenFile={handleOpenFile}
                onPreviewRecord={handlePreviewHistoryRecord}
                onOpenFolder={handleOpenFolder}
                onRemoveHistoryItem={state.removeHistoryItem}
                onDeleteDownloadedFile={state.deleteDownloadedFile}
                onClearHistory={state.clearHistory}
              />
            )}

            {state.activeSection === 'settings' && (
              <SettingsPage
                settings={state.settings}
                availableDirs={state.availableDirs}
                diagnostics={state.diagnostics}
                onUpdateSettings={state.updateSettings}
                onLoadDiagnostics={state.loadDiagnostics}
                onClearDiagnostics={state.clearDiagnostics}
                onShowToast={state.showToast}
              />
            )}

            {state.activeSection === 'about' && (
              <AboutPage binaryStatus={state.binaryStatus} />
            )}
          </div>
        </main>
      </div>

      {/* Non-intrusive Toast Notification */}
      {state.toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed right-6 bottom-6 z-40 rounded-lg border px-4 py-3 text-xs font-medium shadow-lg transition-opacity ${
            state.toastMessage.type === 'error'
              ? 'border-red-300 bg-red-950 text-red-100'
              : state.toastMessage.type === 'success'
              ? 'border-emerald-700 bg-slate-900 text-emerald-200'
              : 'border-slate-700 bg-slate-900 text-slate-100'
          }`}
        >
          {state.toastMessage.text}
        </div>
      )}

      {/* In-App Media Inspector / Player Modal */}
      <MediaPreviewModal
        isOpen={Boolean(previewTarget)}
        title={previewTarget?.title || ''}
        filePath={previewTarget?.filePath || null}
        resolution={previewTarget?.resolution || ''}
        fileSizeBytes={previewTarget?.fileSizeBytes || 0}
        onClose={() => setPreviewTarget(null)}
        onSaveFile={handleOpenFile}
      />
    </div>
  );
}
