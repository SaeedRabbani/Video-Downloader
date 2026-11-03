import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  Square,
  FolderOpen,
  Play,
  Pause,
  PauseCircle,
  Download,
  Loader2,
  Clock,
  Film,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';
import { DownloadJob } from '../../shared/types';
import { formatBytes, formatEta, formatSpeed } from '../utils/formatters';

interface DownloadCardProps {
  job: DownloadJob;
  onPause?: (jobId: string) => void;
  onResume?: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onRetry: (jobId: string) => void;
  onRemove?: (jobId: string) => void;
  onOpenFile: (filePath: string) => void;
  onPreviewFile: (job: DownloadJob) => void;
  onOpenFolder: (filePath: string) => void;
  onShowToast?: (text: string, type?: 'info' | 'error' | 'success') => void;
}

export const DownloadCard: React.FC<DownloadCardProps> = ({
  job,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
  onOpenFile,
  onPreviewFile,
  onOpenFolder,
  onShowToast,
}) => {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const isActive =
    job.state === 'queued' ||
    job.state === 'analyzing' ||
    job.state === 'downloading' ||
    job.state === 'merging' ||
    job.state === 'converting' ||
    job.state === 'pausing' ||
    job.state === 'cancelling';

  const isPaused = job.state === 'paused';
  const canPause =
    (job.state === 'downloading' || job.state === 'queued' || job.state === 'analyzing') &&
    Boolean(onPause);
  const canResume = job.state === 'paused' && Boolean(onResume);
  const canRetry = job.state === 'failed' || job.state === 'cancelled';

  const linkToCopy = job.directDownloadUrl || job.url;

  const handleCopyDownloadLink = async () => {
    try {
      await navigator.clipboard.writeText(linkToCopy);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      onShowToast?.('Download link copied to clipboard.', 'success');
    } catch {
      onShowToast?.('Failed to copy download link.', 'error');
    }
  };

  const getStateLabel = () => {
    switch (job.state) {
      case 'queued':
        return 'Queued';
      case 'analyzing':
        return 'Analyzing';
      case 'downloading':
        return 'Downloading';
      case 'pausing':
        return 'Pausing...';
      case 'paused':
        return 'Paused';
      case 'merging':
        return 'Merging Streams (FFmpeg)';
      case 'converting':
        return 'Converting Media (FFmpeg)';
      case 'completed':
        return 'Completed';
      case 'cancelling':
        return 'Cancelling';
      case 'cancelled':
        return 'Cancelled';
      case 'failed':
        return 'Failed';
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 transition-colors dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Thumbnail */}
        <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-950 dark:border-slate-800">
          {job.thumbnailUrl && !thumbFailed ? (
            <img
              src={job.thumbnailUrl}
              alt={job.title}
              referrerPolicy="no-referrer"
              onError={() => setThumbFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-900 text-slate-400">
              <Film className="h-6 w-6 text-sky-400" />
            </div>
          )}
        </div>

        {/* Main Progress & Telemetry Content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {job.title}
            </h4>

            {/* Status Indicator (paired with icon + explicit text label) */}
            <div className="flex items-center gap-1.5 text-xs font-medium">
              {job.state === 'completed' && (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{getStateLabel()}</span>
                </span>
              )}
              {(job.state === 'failed' || job.state === 'cancelled') && (
                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                  <XCircle className="h-3.5 w-3.5" />
                  <span>{getStateLabel()}</span>
                </span>
              )}
              {isPaused && (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <PauseCircle className="h-3.5 w-3.5" />
                  <span>{getStateLabel()}</span>
                </span>
              )}
              {isActive && (
                <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400">
                  {job.state === 'queued' ? (
                    <Clock className="h-3.5 w-3.5" />
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>{getStateLabel()}</span>
                </span>
              )}
            </div>
          </div>

          {/* Unboxed Metadata Line */}
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <span>Format: {job.selectedFormatId}</span>
            <span aria-hidden="true">·</span>
            <span>Quality: {job.selectedResolution}</span>
            <span aria-hidden="true">·</span>
            <span className="uppercase">{job.selectedContainer}</span>
            <span aria-hidden="true">·</span>
            <span>
              {formatBytes(job.downloadedBytes)}
              {job.totalBytes ? ` / ${formatBytes(job.totalBytes)}` : ''}
            </span>
            {isActive && job.speedBytesPerSec && (
              <>
                <span aria-hidden="true">·</span>
                <span>{formatSpeed(job.speedBytesPerSec)}</span>
              </>
            )}
            {isActive && job.etaSeconds !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span>{formatEta(job.etaSeconds)}</span>
              </>
            )}
          </div>

          {/* Progress Bar */}
          <div className="mt-2.5 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              {job.isIndeterminate && isActive ? (
                <div className="h-full w-1/3 animate-pulse rounded-full bg-sky-500" />
              ) : (
                <div
                  className={`h-full rounded-full transition-transform duration-150 origin-left ${
                    job.state === 'completed'
                      ? 'bg-emerald-500'
                      : job.state === 'failed' || job.state === 'cancelled'
                      ? 'bg-red-500'
                      : isPaused || job.state === 'pausing'
                      ? 'bg-amber-500'
                      : 'bg-sky-500'
                  }`}
                  style={{
                    transform: `scaleX(${Math.max(0, Math.min(100, job.progressPercent ?? 0)) / 100})`,
                  }}
                />
              )}
            </div>
            <span className="w-12 text-right font-mono text-xs font-medium text-slate-700 dark:text-slate-300 tabular-nums">
              {job.isIndeterminate && isActive
                ? 'LIVE'
                : `${Math.round(job.progressPercent ?? 0)}%`}
            </span>
          </div>

          {/* Stage / Error Message */}
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span
              className={
                job.userErrorMessage
                  ? 'text-red-600 dark:text-red-400'
                  : isPaused
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-500 dark:text-slate-400'
              }
            >
              {job.userErrorMessage || job.stageDescription}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canPause && (
            <button
              type="button"
              onClick={() => onPause?.(job.jobId)}
              title="Pause download and preserve partial stream"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 whitespace-nowrap shrink-0 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
            >
              <Pause className="h-3.5 w-3.5" />
              <span>Pause</span>
            </button>
          )}

          {canResume && (
            <button
              type="button"
              onClick={() => onResume?.(job.jobId)}
              title="Resume download from saved progress"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Resume</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleCopyDownloadLink()}
            title="Copy download link to clipboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {copiedLink ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Link</span>
              </>
            )}
          </button>

          {(isActive || isPaused) && job.state !== 'cancelling' && (
            <button
              type="button"
              onClick={() => onCancel(job.jobId)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-red-50 hover:text-red-600 hover:border-red-300 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            >
              <Square className="h-3.5 w-3.5" />
              <span>Cancel</span>
            </button>
          )}

          {canRetry && (
            <button
              type="button"
              onClick={() => onRetry(job.jobId)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-500 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </button>
          )}

          {job.state === 'completed' && job.outputFilePath && (
            <>
              <button
                type="button"
                onClick={() => onPreviewFile(job)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-500 whitespace-nowrap shrink-0"
              >
                <Play className="h-3.5 w-3.5" />
                <span>Inspect / Play</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenFile(job.outputFilePath!)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Open File</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenFolder(job.outputFilePath!)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                title={job.outputFilePath}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span>Folder</span>
              </button>
            </>
          )}

          {!isActive && onRemove && (
            <button
              type="button"
              onClick={() => onRemove(job.jobId)}
              title="Remove entry from list"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:border-red-800 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
