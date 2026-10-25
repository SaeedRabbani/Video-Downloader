import { execFile } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { promisify } from 'node:util';
import { BinaryInfo, BinaryStatusReport } from '../../shared/types';

const execFileAsync = promisify(execFile);

export class BinaryManager {
  private cachedReport: BinaryStatusReport | null = null;
  private readonly resourceDirs: string[];

  constructor(customResourceDir?: string) {
    const dirs: string[] = [];
    if (customResourceDir) {
      dirs.push(customResourceDir);
    }
    const procWithResources = process as NodeJS.Process & { resourcesPath?: string };
    if (procWithResources.resourcesPath) {
      dirs.push(path.join(procWithResources.resourcesPath, 'binaries'));
      dirs.push(procWithResources.resourcesPath);
    }
    dirs.push(path.resolve(process.cwd(), 'resources', 'binaries'));
    this.resourceDirs = dirs;
  }

  public resolveBinaryCandidatePaths(
    name: 'yt-dlp' | 'ffmpeg' | 'ffprobe'
  ): Array<{ path: string; bundled: boolean }> {
    const isWin = process.platform === 'win32';
    // On Windows, strictly resolve .exe files so extensionless Linux scripts in resources/binaries are never executed
    const exeName = isWin ? `${name}.exe` : name;
    const candidates: Array<{ path: string; bundled: boolean }> = [];

    for (const dir of this.resourceDirs) {
      candidates.push({ path: path.join(dir, exeName), bundled: true });
    }

    if (!isWin) {
      candidates.push({ path: `/usr/bin/${name}`, bundled: false });
      candidates.push({ path: `/usr/local/bin/${name}`, bundled: false });
    }
    candidates.push({ path: exeName, bundled: false });

    return candidates;
  }

  public async probeBinary(name: 'yt-dlp' | 'ffmpeg' | 'ffprobe'): Promise<BinaryInfo> {
    const candidates = this.resolveBinaryCandidatePaths(name);
    const versionArgs = name === 'yt-dlp' ? ['--version'] : ['-version'];

    for (const candidate of candidates) {
      if (path.isAbsolute(candidate.path) && !fs.existsSync(candidate.path)) {
        continue;
      }
      if (process.platform !== 'win32' && candidate.bundled && fs.existsSync(candidate.path)) {
        try {
          fs.chmodSync(candidate.path, 0o755);
        } catch {
          // Ignore chmod errors on read-only mounts
        }
      }
      try {
        const { stdout } = await execFileAsync(candidate.path, versionArgs, {
          timeout: 10000,
          windowsHide: true,
        });
        const lines = stdout
          .trim()
          .split(/\r?\n/)
          .filter((l) => !l.startsWith('Deprecated Feature:'));
        const firstLine = lines[0] || 'available';
        return {
          name,
          available: true,
          version: firstLine.slice(0, 120),
          resolvedPath: candidate.path,
          bundled: candidate.bundled,
          error: null,
        };
      } catch {
        // Try next candidate
      }
    }

    // If yt-dlp is missing (e.g. on first run on Windows where only Linux yt-dlp was present),
    // attempt to download the official standalone yt-dlp binary for the current OS.
    if (name === 'yt-dlp') {
      const downloadedPath = await this.tryBootstrapYtDlpBinary();
      if (downloadedPath) {
        try {
          const { stdout } = await execFileAsync(downloadedPath, ['--version'], {
            timeout: 10000,
            windowsHide: true,
          });
          return {
            name: 'yt-dlp',
            available: true,
            version: stdout.trim().split(/\r?\n/)[0] || 'available',
            resolvedPath: downloadedPath,
            bundled: true,
            error: null,
          };
        } catch {
          // Fall through
        }
      }
    }

    return {
      name,
      available: false,
      version: null,
      resolvedPath: null,
      bundled: false,
      error: `Required binary "${name}" was not found in resources/binaries or system PATH.`,
    };
  }

  private async tryBootstrapYtDlpBinary(): Promise<string | null> {
    try {
      const targetDir = this.resourceDirs[this.resourceDirs.length - 1];
      fs.mkdirSync(targetDir, { recursive: true });
      const isWin = process.platform === 'win32';
      const fileName = isWin ? 'yt-dlp.exe' : 'yt-dlp';
      const destPath = path.join(targetDir, fileName);
      if (fs.existsSync(destPath)) return destPath;

      const releaseUrl = isWin
        ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
        : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

      await this.downloadFileWithRedirects(releaseUrl, destPath, 5);
      if (!isWin) {
        fs.chmodSync(destPath, 0o755);
      }
      return destPath;
    } catch {
      return null;
    }
  }

  private downloadFileWithRedirects(url: string, destPath: string, maxRedirects: number): Promise<void> {
    return new Promise((resolve, reject) => {
      https
        .get(url, { timeout: 20000 }, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            if (maxRedirects <= 0) {
              reject(new Error('Too many redirects'));
              return;
            }
            this.downloadFileWithRedirects(res.headers.location, destPath, maxRedirects - 1)
              .then(resolve)
              .catch(reject);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          const out = fs.createWriteStream(destPath);
          res.pipe(out);
          out.on('finish', () => {
            out.close();
            resolve();
          });
          out.on('error', reject);
        })
        .on('error', reject);
    });
  }

  public async verifyAllBinaries(forceRefresh = false): Promise<BinaryStatusReport> {
    if (this.cachedReport && !forceRefresh) {
      return this.cachedReport;
    }

    const [ytDlp, ffmpeg, ffprobe] = await Promise.all([
      this.probeBinary('yt-dlp'),
      this.probeBinary('ffmpeg'),
      this.probeBinary('ffprobe'),
    ]);

    this.cachedReport = {
      allReady: ytDlp.available && ffmpeg.available && ffprobe.available,
      ytDlp,
      ffmpeg,
      ffprobe,
      checkedAt: new Date().toISOString(),
    };

    return this.cachedReport;
  }

  public async checkExtractorUpdateStatus(): Promise<{
    currentVersion: string | null;
    statusMessage: string;
    upToDate: boolean;
  }> {
    const report = await this.verifyAllBinaries(true);
    if (!report.ytDlp.available || !report.ytDlp.resolvedPath) {
      return {
        currentVersion: null,
        statusMessage: 'yt-dlp binary is not available.',
        upToDate: false,
      };
    }

    return {
      currentVersion: report.ytDlp.version,
      statusMessage: `Extractor binary verified (${report.ytDlp.version} at ${report.ytDlp.resolvedPath}).`,
      upToDate: true,
    };
  }
}
