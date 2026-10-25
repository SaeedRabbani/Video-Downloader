import React, { useMemo, useState } from 'react';
import {
  Search,
  Trash2,
  FolderOpen,
  Play,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { HistoryRecord } from '../../shared/types';
import { ConfirmModal } from '../components/ConfirmModal';
import { formatBytes, formatTimestamp } from '../utils/formatters';

interface HistoryPageProps {
  history: HistoryRecord[];
  onOpenFile: (filePath: string) => void;
  onPreviewRecord: (record: HistoryRecord) => void;
  onOpenFolder: (filePath: string) => void;
  onRemoveHistoryItem: (historyId: string) => Promise<void>;
  onDeleteDownloadedFile: (historyId: string) => Promise<void>;
  onClearHistory: () => Promise<void>;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  history,
  onOpenFile,
  onPreviewRecord,
  onOpenFolder,
  onRemoveHistoryItem,
  onDeleteDownloadedFile,
  onClearHistory,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [fileDeleteTarget, setFileDeleteTarget] = useState<HistoryRecord | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.platform.toLowerCase().includes(q) ||
        item.resolution.toLowerCase().includes(q) ||
        item.filePath.toLowerCase().includes(q)
    );
  }, [history, searchQuery]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Download History
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Persisted in local SQLite database. Clearing history preserves your downloaded media files on disk.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter history..."
              aria-label="Filter download history"
              className="rounded-lg border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <button
            type="button"
            onClick={() => setConfirmClearOpen(true)}
            disabled={history.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear History List</span>
          </button>
        </div>
      </div>

      {/* History Data Table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {filteredHistory.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-12 text-center">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              No history entries found
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Completed downloads are automatically recorded here with file verification status.
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Title & Local Path</th>
                  <th className="px-4 py-3 font-medium">Format / Resolution</th>
                  <th className="px-4 py-3 text-right font-medium">File Size</th>
                  <th className="px-4 py-3 font-medium">Completed</th>
                  <th className="px-4 py-3 font-medium">Disk Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredHistory.map((item) => (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="max-w-xs px-4 py-3">
                      <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                        {item.title}
                      </p>
                      <p
                        className="mt-0.5 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400"
                        title={item.filePath}
                      >
                        {item.filePath}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                      {item.resolution} · {item.selectedFormat}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                      {formatBytes(item.fileSizeBytes)}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {formatTimestamp(item.completedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {item.status === 'completed' && item.fileExists ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Verified on Disk</span>
                        </span>
                      ) : item.status === 'deleted' ? (
                        <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          <XCircle className="h-3.5 w-3.5" />
                          <span>File Deleted</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>File Moved / Missing</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.fileExists && (
                          <>
                            <button
                              type="button"
                              onClick={() => onPreviewRecord(item)}
                              className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500 whitespace-nowrap shrink-0"
                            >
                              <Play className="h-3 w-3" />
                              <span>Play</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenFile(item.filePath)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              <Download className="h-3 w-3" />
                              <span>Open</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenFolder(item.filePath)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              title="Show in Folder"
                            >
                              <FolderOpen className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setFileDeleteTarget(item)}
                              className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 whitespace-nowrap shrink-0 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Delete File</span>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => void onRemoveHistoryItem(item.id)}
                          className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap shrink-0 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          Remove Entry
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Explicit Confirmation Modal for Deleting Downloaded File */}
      <ConfirmModal
        isOpen={Boolean(fileDeleteTarget)}
        title="Delete Downloaded Media File?"
        description="This action permanently deletes the media file from your local storage directory. The history entry will be marked as deleted."
        filePath={fileDeleteTarget?.filePath}
        confirmLabel="Permanently Delete File"
        isDanger={true}
        onCancel={() => setFileDeleteTarget(null)}
        onConfirm={() => {
          if (fileDeleteTarget) {
            void onDeleteDownloadedFile(fileDeleteTarget.id);
            setFileDeleteTarget(null);
          }
        }}
      />

      {/* Explicit Confirmation Modal for Clearing History without deleting files */}
      <ConfirmModal
        isOpen={confirmClearOpen}
        title="Clear Download History List?"
        description="This removes all records from the history table in SQLite. Your downloaded video and audio files on disk will NOT be deleted."
        confirmLabel="Clear History Records"
        isDanger={false}
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          void onClearHistory();
          setConfirmClearOpen(false);
        }}
      />
    </div>
  );
};
