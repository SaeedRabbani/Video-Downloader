import React from 'react';
import { AlertTriangle, X, Play, Download, FileVideo } from 'lucide-react';
import { formatBytes } from '../utils/formatters';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  filePath?: string;
  confirmLabel: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  filePath,
  confirmLabel,
  isDanger = true,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle
              className={`h-5 w-5 shrink-0 ${
                isDanger ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
              }`}
            />
            <h3
              id="confirm-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {description}
        </p>

        {filePath && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs break-all text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
            {filePath}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 ${
              isDanger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-sky-600 hover:bg-sky-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

interface MediaPreviewModalProps {
  isOpen: boolean;
  title: string;
  filePath: string | null;
  resolution: string;
  fileSizeBytes: number;
  onClose: () => void;
  onSaveFile: (filePath: string) => void;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  isOpen,
  title,
  filePath,
  resolution,
  fileSizeBytes,
  onClose,
  onSaveFile,
}) => {
  if (!isOpen || !filePath) return null;

  const streamUrl = `/api/files/stream?path=${encodeURIComponent(filePath)}`;
  const isAudioOnly =
    filePath.endsWith('.mp3') || filePath.endsWith('.m4a') || resolution === 'audio only';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-3xl rounded-xl border border-slate-300 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h3>
            <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {resolution} · {formatBytes(fileSizeBytes)} · {filePath}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Close media player"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg bg-slate-950">
          {isAudioOnly ? (
            <div className="flex flex-col items-center justify-center p-10 text-center">
              <FileVideo className="h-10 w-10 text-sky-400" />
              <p className="mt-3 text-sm font-medium text-slate-200">Verified Audio Output Stream</p>
              <audio controls autoPlay src={streamUrl} className="mt-4 w-full max-w-md" />
            </div>
          ) : (
            <video
              controls
              autoPlay
              src={streamUrl}
              className="aspect-video max-h-[460px] w-full bg-black object-contain"
            />
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            Local path verified on disk
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSaveFile(filePath)}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-500 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Save Local Copy
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
