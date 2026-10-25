import fs from 'node:fs';
import path from 'node:path';
import { AppError, ErrorCode } from '../../shared/errors/taxonomy';
import { resolveSafeChildPath } from './pathSanitizer';

export class FilesystemManager {
  private readonly authorizedBaseDirs = new Set<string>();

  constructor(initialDownloadDir: string, private readonly tempRootDir: string) {
    this.ensureDirectoryExists(initialDownloadDir);
    this.ensureDirectoryExists(tempRootDir);
    this.authorizeDirectory(initialDownloadDir);
  }

  public authorizeDirectory(dirPath: string): string {
    const resolved = path.resolve(dirPath);
    // Prevent selecting root filesystem or application binary folder
    if (resolved === path.parse(resolved).root) {
      throw new AppError(
        ErrorCode.PERMISSION_DENIED,
        'Cannot use the filesystem root directory directly as a download folder.'
      );
    }
    this.ensureDirectoryExists(resolved);
    this.authorizedBaseDirs.add(resolved);
    return resolved;
  }

  public ensureDirectoryExists(dirPath: string): void {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      fs.accessSync(dirPath, fs.constants.W_OK);
    } catch (err) {
      throw new AppError(
        ErrorCode.PERMISSION_DENIED,
        `Directory "${dirPath}" is not writable or could not be created.`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  public verifyDiskSpace(dirPath: string, requiredBytes: number): void {
    try {
      const stats = fs.statfsSync(dirPath);
      const availableBytes = Number(stats.bavail) * Number(stats.bsize);
      // Require at least requiredBytes + 32MB safety margin
      if (availableBytes > 0 && availableBytes < requiredBytes + 32 * 1024 * 1024) {
        throw new AppError(
          ErrorCode.DISK_FULL,
          `Insufficient free disk space (${Math.round(availableBytes / (1024 * 1024))} MB available).`
        );
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Ignore if statfsSync is unsupported on virtual filesystems
    }
  }

  public createJobTempDir(jobId: string): string {
    const safeJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, '');
    const jobTemp = resolveSafeChildPath(this.tempRootDir, `job_${safeJobId}`);
    fs.mkdirSync(jobTemp, { recursive: true });
    return jobTemp;
  }

  public cleanupJobTempDir(jobId: string): void {
    try {
      const safeJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, '');
      const jobTemp = resolveSafeChildPath(this.tempRootDir, `job_${safeJobId}`);
      if (fs.existsSync(jobTemp)) {
        fs.rmSync(jobTemp, { recursive: true, force: true });
      }
    } catch {
      // Best-effort cleanup
    }
  }

  public atomicFinalizeFile(tempFilePath: string, finalFilePath: string): number {
    if (!fs.existsSync(tempFilePath)) {
      throw new AppError(
        ErrorCode.INTERRUPTED_PROCESS,
        'Temporary output file was not produced by the downloader.'
      );
    }
    const parentDir = path.dirname(finalFilePath);
    this.ensureDirectoryExists(parentDir);

    try {
      fs.renameSync(tempFilePath, finalFilePath);
    } catch {
      // Cross-device fallback: copy then unlink
      fs.copyFileSync(tempFilePath, finalFilePath);
      fs.unlinkSync(tempFilePath);
    }

    const stat = fs.statSync(finalFilePath);
    return stat.size;
  }

  public isAuthorizedFilePath(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    for (const baseDir of this.authorizedBaseDirs) {
      const rel = path.relative(baseDir, resolved);
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
        return true;
      }
    }
    return false;
  }

  public deleteAuthorizedFile(filePath: string): boolean {
    if (!this.isAuthorizedFilePath(filePath)) {
      throw new AppError(
        ErrorCode.PERMISSION_DENIED,
        'Refusing to delete a file outside the authorized download directories.'
      );
    }
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }
}
