import React, { useMemo, useState } from 'react';
import { DownloadJob } from '../../shared/types';
import { DownloadCard } from '../components/DownloadCard';

interface DownloadsPageProps {
  jobs: DownloadJob[];
  maxConcurrent: number;
  onCancelJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
  onRemoveJob: (jobId: string) => void;
  onOpenFile: (filePath: string) => void;
  onPreviewFile: (job: DownloadJob) => void;
  onOpenFolder: (filePath: string) => void;
}

type JobFilter = 'all' | 'active' | 'completed' | 'failed';

export const DownloadsPage: React.FC<DownloadsPageProps> = ({
  jobs,
  maxConcurrent,
  onCancelJob,
  onRetryJob,
  onRemoveJob,
  onOpenFile,
  onPreviewFile,
  onOpenFolder,
}) => {
  const [filter, setFilter] = useState<JobFilter>('all');

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (filter === 'all') return true;
      if (filter === 'completed') return j.state === 'completed';
      if (filter === 'failed') return j.state === 'failed' || j.state === 'cancelled';
      return (
        j.state === 'queued' ||
        j.state === 'analyzing' ||
        j.state === 'downloading' ||
        j.state === 'merging' ||
        j.state === 'converting' ||
        j.state === 'cancelling'
      );
    });
  }, [jobs, filter]);

  const counts = useMemo(() => {
    const active = jobs.filter(
      (j) =>
        j.state === 'queued' ||
        j.state === 'analyzing' ||
        j.state === 'downloading' ||
        j.state === 'merging' ||
        j.state === 'converting' ||
        j.state === 'cancelling'
    ).length;
    const completed = jobs.filter((j) => j.state === 'completed').length;
    const failed = jobs.filter((j) => j.state === 'failed' || j.state === 'cancelled').length;
    return { all: jobs.length, active, completed, failed };
  }, [jobs]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Download Manager
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Queue Concurrency Limit: {maxConcurrent} simultaneous transfers · Active: {counts.active} · Downloaded: {counts.completed}
          </p>
        </div>

        {/* Interactive Segmented Filter Bar */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1 dark:bg-slate-900">
          {(
            [
              { id: 'all', label: `All (${counts.all})` },
              { id: 'active', label: `Active (${counts.active})` },
              { id: 'completed', label: `Downloaded (${counts.completed})` },
              { id: 'failed', label: `Failed / Cancelled (${counts.failed})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                filter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {filteredJobs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              No download jobs match the selected filter
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Queued, active, and downloaded files appear here with real-time progress telemetry.
            </p>
          </div>
        ) : (
          filteredJobs.map((job) => (
            <DownloadCard
              key={job.jobId}
              job={job}
              onCancel={onCancelJob}
              onRetry={onRetryJob}
              onRemove={onRemoveJob}
              onOpenFile={onOpenFile}
              onPreviewFile={onPreviewFile}
              onOpenFolder={onOpenFolder}
            />
          ))
        )}
      </div>
    </div>
  );
};
