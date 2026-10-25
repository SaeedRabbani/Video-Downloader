import express, { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { AppBackendContainer } from './src/main/services/appContainer';
import { AppError, ErrorCode } from './src/shared/errors/taxonomy';
import { validatePartialSettings } from './src/shared/schemas/validation';
import {
  BulkQueueRequest,
  DownloadProgressEvent,
  FormatSelectionRequest,
} from './src/shared/types';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  const container = new AppBackendContainer({
    localTestServerPort: PORT,
  });
  await container.initialize();

  // Serve authorized local test media streams (SMPTE 1080p60 DASH, 720p, 480p, 360p, M4A, HLS .m3u8)
  app.use(
    '/local-media',
    express.static(container.mediaRootDir, {
      setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-store');
      },
    })
  );

  // Serve verified downloaded media files for in-app playback / inspection when user clicks "Open File"
  app.get('/api/files/stream', (req: Request, res: Response) => {
    const filePath = typeof req.query.path === 'string' ? req.query.path : '';
    if (!filePath || !container.filesystemManager.isAuthorizedFilePath(filePath)) {
      res.status(403).json({ error: 'Unauthorized file path.' });
      return;
    }
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File no longer exists on disk.' });
      return;
    }
    const downloadFlag = req.query.download === '1';
    if (downloadFlag) {
      res.download(filePath, path.basename(filePath));
      return;
    }
    res.sendFile(path.resolve(filePath));
  });

  // Server-Sent Events (SSE) for real-time job progress synchronization
  const sseClients = new Set<Response>();
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  container.jobManager.on('job-progress', (evt: DownloadProgressEvent) => {
    const payload = `data: ${JSON.stringify(evt)}\n\n`;
    for (const client of sseClients) {
      client.write(payload);
    }
  });

  // Helper wrapper for structured error responses
  const wrapRoute =
    (fn: (req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const data = await fn(req, res);
        res.json({ ok: true, data });
      } catch (err) {
        const appErr =
          err instanceof AppError
            ? err
            : new AppError(
                ErrorCode.EXTRACTION_FAILURE,
                undefined,
                err instanceof Error ? err.message : String(err)
              );

        container.repositories.logDiagnostic({
          level: 'error',
          category: 'api',
          code: appErr.code,
          message: appErr.userMessage,
          redactedContext: appErr.technicalDetail || null,
        });

        res.status(400).json({
          ok: false,
          error: appErr.toSafeJSON(),
        });
      }
    };

  app.post(
    '/api/analyze',
    wrapRoute(async (req) => {
      const url = typeof req.body?.url === 'string' ? req.body.url : '';
      return await container.extractorEngine.analyzeUrl(url);
    })
  );

  app.post(
    '/api/downloads/start',
    wrapRoute(async (req) => {
      return container.jobManager.enqueueDownload(req.body as FormatSelectionRequest);
    })
  );

  app.post(
    '/api/downloads/bulk',
    wrapRoute(async (req) => {
      return await container.jobManager.bulkEnqueueUrls(req.body as BulkQueueRequest);
    })
  );

  app.post(
    '/api/downloads/cancel',
    wrapRoute(async (req) => {
      const jobId = typeof req.body?.jobId === 'string' ? req.body.jobId : '';
      return await container.jobManager.cancelJob(jobId);
    })
  );

  app.post(
    '/api/downloads/retry',
    wrapRoute(async (req) => {
      const jobId = typeof req.body?.jobId === 'string' ? req.body.jobId : '';
      return await container.jobManager.retryJob(jobId);
    })
  );

  app.post(
    '/api/downloads/remove',
    wrapRoute(async (req) => {
      const jobId = typeof req.body?.jobId === 'string' ? req.body.jobId : '';
      return await container.jobManager.removeJob(jobId);
    })
  );

  app.get(
    '/api/downloads',
    wrapRoute(async () => {
      return container.jobManager.getAllJobs();
    })
  );

  app.get(
    '/api/history',
    wrapRoute(async () => {
      return container.repositories.getHistory();
    })
  );

  app.post(
    '/api/history/remove',
    wrapRoute(async (req) => {
      const historyId = typeof req.body?.historyId === 'string' ? req.body.historyId : '';
      return container.repositories.removeHistoryItem(historyId);
    })
  );

  app.post(
    '/api/history/delete-file',
    wrapRoute(async (req) => {
      const historyId = typeof req.body?.historyId === 'string' ? req.body.historyId : '';
      const confirmed = Boolean(req.body?.confirmed);
      if (!confirmed) {
        throw new AppError(
          ErrorCode.PERMISSION_DENIED,
          'Explicit confirmation is required before deleting downloaded media.'
        );
      }
      const item = container.repositories.getHistoryItemById(historyId);
      if (!item) {
        throw new AppError(ErrorCode.UNAVAILABLE_MEDIA, 'History record not found.');
      }
      if (item.filePath && fs.existsSync(item.filePath)) {
        container.filesystemManager.deleteAuthorizedFile(item.filePath);
      }
      container.repositories.markHistoryFileDeleted(historyId);
      return { deleted: true, historyId };
    })
  );

  app.post(
    '/api/history/clear',
    wrapRoute(async () => {
      container.repositories.clearHistory();
      return { cleared: true };
    })
  );

  app.get(
    '/api/settings',
    wrapRoute(async () => {
      return container.repositories.getSettings();
    })
  );

  app.post(
    '/api/settings',
    wrapRoute(async (req) => {
      const validated = validatePartialSettings(req.body);
      if (validated.defaultDownloadDir) {
        validated.defaultDownloadDir = container.filesystemManager.authorizeDirectory(
          validated.defaultDownloadDir
        );
      }
      return container.repositories.updateSettings(validated);
    })
  );

  app.get(
    '/api/settings/directories',
    wrapRoute(async () => {
      const base = container.dataDir;
      const presets = [
        path.join(base, 'Downloads'),
        path.join(base, 'Downloads', 'Video_Masters'),
        path.join(base, 'Downloads', 'Audio_Exports'),
        path.join(base, 'Downloads', 'Archive_4K'),
      ];
      for (const dir of presets) {
        container.filesystemManager.authorizeDirectory(dir);
      }
      return presets;
    })
  );

  app.get(
    '/api/binaries/status',
    wrapRoute(async () => {
      return await container.binaryManager.verifyAllBinaries(true);
    })
  );

  app.post(
    '/api/binaries/check-updates',
    wrapRoute(async () => {
      return await container.binaryManager.checkExtractorUpdateStatus();
    })
  );

  app.get(
    '/api/diagnostics',
    wrapRoute(async () => {
      return container.repositories.getDiagnostics();
    })
  );

  app.post(
    '/api/diagnostics/clear',
    wrapRoute(async () => {
      container.repositories.clearDiagnostics();
      return { cleared: true };
    })
  );

  app.get(
    '/api/samples',
    wrapRoute(async () => {
      return container.testMediaGenerator.getSampleSources(`http://127.0.0.1:${PORT}`);
    })
  );

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Universal Video Downloader backend active on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
