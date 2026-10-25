import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { FilesystemManager } from '../filesystem/filesystemManager';
import { JobManager } from '../jobs/jobManager';
import { UrlValidationOptions } from '../security/urlValidator';
import { SqliteDatabase } from '../storage/database';
import { StorageRepositories } from '../storage/repositories';
import { BinaryManager } from './binaryManager';
import { DirectHttpExtractor } from './directHttpExtractor';
import { ExtractorEngine } from './extractorEngine';
import { HlsDashExtractor } from './hlsDashExtractor';
import { MediaProcessor } from './mediaProcessor';
import { TestMediaGenerator } from './testMediaGenerator';
import { YtDlpExtractor } from './ytDlpExtractor';

export interface AppBackendContainerOptions {
  dataDir?: string;
  downloadsDir?: string;
  tempDir?: string;
  localTestServerPort?: number;
  startEmbeddedMediaServer?: boolean;
}

export class AppBackendContainer {
  public readonly dataDir: string;
  public readonly downloadsDir: string;
  public readonly tempDir: string;
  public readonly mediaRootDir: string;
  public readonly sqlite: SqliteDatabase;
  public readonly repositories: StorageRepositories;
  public readonly filesystemManager: FilesystemManager;
  public readonly binaryManager: BinaryManager;
  public readonly mediaProcessor: MediaProcessor;
  public readonly extractorEngine: ExtractorEngine;
  public readonly jobManager: JobManager;
  public readonly testMediaGenerator: TestMediaGenerator;
  public readonly urlValidationOptions: UrlValidationOptions;
  private embeddedServer: http.Server | null = null;
  private localMediaPort: number;

  constructor(private readonly options?: AppBackendContainerOptions) {
    const baseUserDir = options?.dataDir || path.join(process.cwd(), '.uvd-data');

    this.dataDir = baseUserDir;
    this.downloadsDir = options?.downloadsDir || path.join(baseUserDir, 'Downloads');
    this.tempDir = options?.tempDir || path.join(os.tmpdir(), 'universal-video-downloader-temp');
    this.mediaRootDir = path.join(baseUserDir, 'test-media');
    this.localMediaPort = options?.localTestServerPort ?? 3000;

    const dbPath = path.join(this.dataDir, 'uvd_metadata.sqlite');
    this.sqlite = new SqliteDatabase(dbPath);
    this.repositories = new StorageRepositories(this.sqlite, this.downloadsDir);

    const currentSettings = this.repositories.getSettings();
    this.filesystemManager = new FilesystemManager(
      currentSettings.defaultDownloadDir || this.downloadsDir,
      this.tempDir
    );

    this.binaryManager = new BinaryManager();
    this.mediaProcessor = new MediaProcessor(this.binaryManager);

    this.urlValidationOptions = {
      allowAuthorizedLocalTestServerPort: this.localMediaPort,
      resolveDns: true,
    };

    this.extractorEngine = new ExtractorEngine(this.urlValidationOptions);
    this.extractorEngine.registerExtractor(
      new HlsDashExtractor(this.binaryManager, this.mediaProcessor, this.urlValidationOptions)
    );
    this.extractorEngine.registerExtractor(
      new DirectHttpExtractor(this.mediaProcessor, this.urlValidationOptions)
    );
    this.extractorEngine.registerExtractor(
      new YtDlpExtractor(this.binaryManager, this.mediaProcessor, () =>
        this.repositories.getSettings()
      )
    );

    this.jobManager = new JobManager(
      this.extractorEngine,
      this.filesystemManager,
      this.repositories,
      this.binaryManager
    );

    this.testMediaGenerator = new TestMediaGenerator(this.mediaRootDir);
  }

  public async initialize(): Promise<void> {
    const binReport = await this.binaryManager.verifyAllBinaries();
    await this.testMediaGenerator.ensureTestMediaGenerated(binReport.ffmpeg.resolvedPath);

    if (this.options?.startEmbeddedMediaServer) {
      await this.startEmbeddedLocalMediaServer();
    }
  }

  public getLocalMediaOrigin(): string {
    return `http://127.0.0.1:${this.localMediaPort}`;
  }

  private async startEmbeddedLocalMediaServer(): Promise<void> {
    if (this.embeddedServer) return;
    const server = http.createServer((req, res) => {
      if (!req.url || !req.url.startsWith('/local-media/')) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const relFile = path.basename(req.url.slice('/local-media/'.length).split('?')[0]);
      const fullPath = path.join(this.mediaRootDir, relFile);
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        res.writeHead(404);
        res.end('Media file not found');
        return;
      }
      const stat = fs.statSync(fullPath);
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(fullPath).pipe(res);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr) {
          this.localMediaPort = addr.port;
          this.urlValidationOptions.allowAuthorizedLocalTestServerPort = addr.port;
        }
        this.embeddedServer = server;
        resolve();
      });
    });
  }

  public shutdown(): void {
    if (this.embeddedServer) {
      this.embeddedServer.close();
      this.embeddedServer = null;
    }
    const settings = this.repositories.getSettings();
    if (settings.tempFileCleanupPolicy === 'on_exit') {
      for (const job of this.jobManager.getAllJobs()) {
        this.filesystemManager.cleanupJobTempDir(job.jobId);
      }
    }
    this.sqlite.close();
  }
}
