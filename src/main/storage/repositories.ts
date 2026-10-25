import fs from 'node:fs';
import { redactSensitiveData } from '../../shared/errors/taxonomy';
import {
  AppSettings,
  DiagnosticEntry,
  DownloadJob,
  HistoryRecord,
} from '../../shared/types';
import { SqliteDatabase } from './database';

export class StorageRepositories {
  private readonly defaultSettings: AppSettings;

  constructor(
    private readonly sqlite: SqliteDatabase,
    defaultDownloadDir: string
  ) {
    this.defaultSettings = {
      defaultDownloadDir,
      defaultResolution: 'best',
      defaultOutputFormat: 'mp4',
      maxConcurrentDownloads: 2,
      maxDownloadSizeMB: 4096,
      tempFileCleanupPolicy: 'immediate',
      theme: 'dark',
      audioConversionPreference: 'none',
      extractorAutoUpdateCheck: true,
      enablePlatformExtractors: true,
      overwriteExistingFiles: false,
      cookiesFromBrowser: 'auto',
      cookiesFilePath: '',
      proxyUrl: '',
      geoBypassCountry: 'auto',
    };
  }

  public getSettings(): AppSettings {
    const rows = this.sqlite.db
      .prepare('SELECT key, value_json FROM settings')
      .all() as Array<{ key: string; value_json: string }>;

    const merged: Record<string, unknown> = { ...this.defaultSettings };
    for (const row of rows) {
      try {
        merged[row.key] = JSON.parse(row.value_json);
      } catch {
        // Ignore corrupted setting value
      }
    }
    return merged as unknown as AppSettings;
  }

  public updateSettings(partial: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const updated: AppSettings = { ...current, ...partial };
    const now = new Date().toISOString();

    const upsert = this.sqlite.db.prepare(`
      INSERT INTO settings (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `);

    this.sqlite.db.exec('BEGIN TRANSACTION');
    try {
      for (const [key, val] of Object.entries(updated)) {
        upsert.run(key, JSON.stringify(val), now);
      }
      this.sqlite.db.exec('COMMIT');
    } catch (err) {
      this.sqlite.db.exec('ROLLBACK');
      throw err;
    }

    return updated;
  }

  public addHistoryRecord(record: Omit<HistoryRecord, 'fileExists'>): HistoryRecord {
    const stmt = this.sqlite.db.prepare(`
      INSERT INTO download_history (
        id, job_id, title, source_url, platform, selected_format,
        resolution, file_path, file_size_bytes, completed_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        file_path = excluded.file_path,
        file_size_bytes = excluded.file_size_bytes,
        completed_at = excluded.completed_at,
        status = excluded.status
    `);

    stmt.run(
      record.id,
      record.jobId,
      record.title,
      redactSensitiveData(record.sourceUrl),
      record.platform,
      record.selectedFormat,
      record.resolution,
      record.filePath,
      record.fileSizeBytes,
      record.completedAt,
      record.status
    );

    const fileExists = Boolean(record.filePath && fs.existsSync(record.filePath));
    return {
      ...record,
      fileExists,
      status: record.status === 'deleted' ? 'deleted' : fileExists ? 'completed' : 'missing_file',
    };
  }

  public getHistory(): HistoryRecord[] {
    const rows = this.sqlite.db
      .prepare(`
        SELECT
          id, job_id, title, source_url, platform, selected_format,
          resolution, file_path, file_size_bytes, completed_at, status
        FROM download_history
        ORDER BY completed_at DESC
        LIMIT 500
      `)
      .all() as Array<{
      id: string;
      job_id: string;
      title: string;
      source_url: string;
      platform: string;
      selected_format: string;
      resolution: string;
      file_path: string;
      file_size_bytes: number;
      completed_at: string;
      status: 'completed' | 'missing_file' | 'deleted';
    }>;

    return rows.map((r) => {
      const exists = Boolean(r.file_path && fs.existsSync(r.file_path));
      const computedStatus: HistoryRecord['status'] =
        r.status === 'deleted' ? 'deleted' : exists ? 'completed' : 'missing_file';
      return {
        id: r.id,
        jobId: r.job_id,
        title: r.title,
        sourceUrl: r.source_url,
        platform: r.platform,
        selectedFormat: r.selected_format,
        resolution: r.resolution,
        filePath: r.file_path,
        fileSizeBytes: Number(r.file_size_bytes),
        completedAt: r.completed_at,
        status: computedStatus,
        fileExists: exists,
      };
    });
  }

  public getHistoryItemById(id: string): HistoryRecord | null {
    const row = this.sqlite.db
      .prepare('SELECT * FROM download_history WHERE id = ?')
      .get(id) as
      | {
          id: string;
          job_id: string;
          title: string;
          source_url: string;
          platform: string;
          selected_format: string;
          resolution: string;
          file_path: string;
          file_size_bytes: number;
          completed_at: string;
          status: 'completed' | 'missing_file' | 'deleted';
        }
      | undefined;

    if (!row) return null;
    const exists = Boolean(row.file_path && fs.existsSync(row.file_path));
    return {
      id: row.id,
      jobId: row.job_id,
      title: row.title,
      sourceUrl: row.source_url,
      platform: row.platform,
      selectedFormat: row.selected_format,
      resolution: row.resolution,
      filePath: row.file_path,
      fileSizeBytes: Number(row.file_size_bytes),
      completedAt: row.completed_at,
      status: row.status === 'deleted' ? 'deleted' : exists ? 'completed' : 'missing_file',
      fileExists: exists,
    };
  }

  public markHistoryFileDeleted(id: string): void {
    this.sqlite.db
      .prepare("UPDATE download_history SET status = 'deleted' WHERE id = ?")
      .run(id);
  }

  public removeHistoryItem(id: string): boolean {
    const res = this.sqlite.db
      .prepare('DELETE FROM download_history WHERE id = ?')
      .run(id);
    return Number(res.changes) > 0;
  }

  public clearHistory(): void {
    this.sqlite.db.prepare('DELETE FROM download_history').run();
  }

  public saveJobSnapshot(job: DownloadJob): void {
    const stmt = this.sqlite.db.prepare(`
      INSERT INTO persisted_jobs (job_id, payload_json, state, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        payload_json = excluded.payload_json,
        state = excluded.state,
        updated_at = excluded.updated_at
    `);
    stmt.run(job.jobId, JSON.stringify(job), job.state, job.updatedAt);
  }

  public removePersistedJob(jobId: string): boolean {
    const res = this.sqlite.db
      .prepare('DELETE FROM persisted_jobs WHERE job_id = ?')
      .run(jobId);
    return Number(res.changes) > 0;
  }

  public loadPersistedJobs(): DownloadJob[] {
    const rows = this.sqlite.db
      .prepare('SELECT payload_json FROM persisted_jobs ORDER BY updated_at DESC LIMIT 100')
      .all() as Array<{ payload_json: string }>;

    const jobs: DownloadJob[] = [];
    for (const r of rows) {
      try {
        jobs.push(JSON.parse(r.payload_json) as DownloadJob);
      } catch {
        // Ignore invalid snapshot
      }
    }
    return jobs;
  }

  public logDiagnostic(entry: Omit<DiagnosticEntry, 'id' | 'timestamp'>): DiagnosticEntry {
    const fullEntry: DiagnosticEntry = {
      id: `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      level: entry.level,
      category: entry.category,
      code: entry.code,
      message: redactSensitiveData(entry.message),
      redactedContext: entry.redactedContext ? redactSensitiveData(entry.redactedContext) : null,
    };

    const insert = this.sqlite.db.prepare(`
      INSERT INTO diagnostics_log (id, timestamp, level, category, code, message, redacted_context)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      fullEntry.id,
      fullEntry.timestamp,
      fullEntry.level,
      fullEntry.category,
      fullEntry.code,
      fullEntry.message,
      fullEntry.redactedContext
    );

    // Rotation limit: keep latest 300 entries
    this.sqlite.db.exec(`
      DELETE FROM diagnostics_log
      WHERE id NOT IN (
        SELECT id FROM diagnostics_log ORDER BY timestamp DESC LIMIT 300
      )
    `);

    return fullEntry;
  }

  public getDiagnostics(): DiagnosticEntry[] {
    const rows = this.sqlite.db
      .prepare(`
        SELECT id, timestamp, level, category, code, message, redacted_context
        FROM diagnostics_log
        ORDER BY timestamp DESC
        LIMIT 200
      `)
      .all() as Array<{
      id: string;
      timestamp: string;
      level: 'info' | 'warn' | 'error';
      category: string;
      code: string | null;
      message: string;
      redacted_context: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      level: r.level,
      category: r.category,
      code: r.code,
      message: r.message,
      redactedContext: r.redacted_context,
    }));
  }

  public clearDiagnostics(): void {
    this.sqlite.db.prepare('DELETE FROM diagnostics_log').run();
  }
}
