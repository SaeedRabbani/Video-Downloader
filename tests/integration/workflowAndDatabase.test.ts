import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppBackendContainer } from '../../src/main/services/appContainer';
import { DownloadJob } from '../../src/shared/types';

describe('End-to-End Vertical Slice: Analyze -> Select Format -> Download & Merge -> SQLite History -> Cancel & Cleanup', () => {
  let tempWorkspace: string;
  let container: AppBackendContainer;
  let server: http.Server;
  let serverPort: number;

  beforeAll(async () => {
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'uvd-integration-test-'));

    // Start an ephemeral HTTP server to serve the generated test media
    const app = express();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    serverPort = typeof addr === 'object' && addr ? addr.port : 31999;

    container = new AppBackendContainer({
      dataDir: path.join(tempWorkspace, 'data'),
      downloadsDir: path.join(tempWorkspace, 'downloads'),
      tempDir: path.join(tempWorkspace, 'temp'),
      localTestServerPort: serverPort,
    });

    await container.initialize();
    app.use('/local-media', express.static(container.mediaRootDir));
  }, 30000);

  afterAll(async () => {
    container?.shutdown();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (tempWorkspace && fs.existsSync(tempWorkspace)) {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    }
  });

  it('persists user settings and redacts tokens in diagnostic logs', () => {
    const updated = container.repositories.updateSettings({
      maxConcurrentDownloads: 4,
      defaultResolution: '1080p',
    });
    expect(updated.maxConcurrentDownloads).toBe(4);
    expect(updated.defaultResolution).toBe('1080p');

    const diag = container.repositories.logDiagnostic({
      level: 'warn',
      category: 'security-test',
      code: 'AUTH_CHECK',
      message: 'Failed fetching https://example.com/stream.m3u8?token=super_secret_token_123&id=5',
      redactedContext: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    });
    expect(diag.message).toContain('token=[REDACTED]');
    expect(diag.message).not.toContain('super_secret_token_123');
    expect(diag.redactedContext).toContain('Bearer [REDACTED]');
  });

  it('executes full workflow: Analyze URL -> Select 1080p60 Video + Audio Merge -> Download via FFmpeg -> Verify Saved File & SQLite History', async () => {
    const manifestUrl = `http://127.0.0.1:${serverPort}/local-media/observatory_broadcast.media.json`;

    // Step 1: Analyze URL
    const analysis = await container.extractorEngine.analyzeUrl(manifestUrl);
    expect(analysis.title).toContain('Alpine Observatory Reference Broadcast');
    expect(analysis.availableResolutions).toEqual(['1080p', '720p', '480p', '360p']);
    expect(analysis.formats.length).toBe(5);

    // Step 2: Select 1080p60 video-only stream (requires FFmpeg merge with 140-m4a-audio)
    const completionPromise = new Promise<DownloadJob>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Download timed out')), 20000);
      container.jobManager.on('job-progress', (_evt, job: DownloadJob) => {
        if (job.state === 'completed') {
          clearTimeout(timeout);
          resolve(job);
        } else if (job.state === 'failed') {
          clearTimeout(timeout);
          reject(new Error(job.userErrorMessage || 'Job failed'));
        }
      });
    });

    const queuedJob = container.jobManager.enqueueDownload({
      analysisId: analysis.analysisId,
      url: manifestUrl,
      formatId: '137-1080p60-video',
      audioFormatId: '140-m4a-audio',
      qualityPreset: '1080p',
      targetContainer: 'mp4',
      convertAudioTo: 'none',
      preserveOriginal: false,
    });

    expect(queuedJob.requiresMerge).toBe(true);

    const completedJob = await completionPromise;
    expect(completedJob.state).toBe('completed');
    expect(completedJob.outputFilePath).toBeTruthy();
    expect(fs.existsSync(completedJob.outputFilePath!)).toBe(true);
    expect(fs.statSync(completedJob.outputFilePath!).size).toBeGreaterThan(10000);

    // Verify merged file contains both video and audio streams via FFprobe
    const probe = await container.mediaProcessor.probeMedia(completedJob.outputFilePath!);
    const hasVideo = probe.streams.some((s) => s.codec_type === 'video');
    const hasAudio = probe.streams.some((s) => s.codec_type === 'audio');
    expect(hasVideo).toBe(true);
    expect(hasAudio).toBe(true);

    // Verify SQLite history persistence
    const history = container.repositories.getHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].filePath).toBe(completedJob.outputFilePath);
    expect(history[0].fileExists).toBe(true);

    // Verify removeJob removes completed entry from Downloads job list and SQLite persisted_jobs
    const removeRes = await container.jobManager.removeJob(completedJob.jobId);
    expect(removeRes.removed).toBe(true);
    expect(container.jobManager.getJob(completedJob.jobId)).toBeNull();
  }, 25000);

  it('queues multiple URLs at once via bulkEnqueueUrls', async () => {
    const samples = container.testMediaGenerator.getSampleSources(
      `http://127.0.0.1:${serverPort}`
    );
    const urlsToQueue = samples.slice(0, 2).map((s) => s.url);

    const bulkRes = await container.jobManager.bulkEnqueueUrls({
      urls: urlsToQueue,
      qualityPreset: '720p',
      targetContainer: 'mp4',
      convertAudioTo: 'none',
    });

    expect(bulkRes.total).toBe(2);
    expect(bulkRes.queuedCount).toBe(2);
    expect(bulkRes.failedCount).toBe(0);
    expect(bulkRes.results.every((r) => r.ok && r.job)).toBe(true);

    for (const item of bulkRes.results) {
      if (item.job) {
        await container.jobManager.removeJob(item.job.jobId);
      }
    }
  }, 25000);
});
