import { EventEmitter } from 'node:events';
import { AppError, ErrorCode, USER_ERROR_MESSAGES } from '../../shared/errors/taxonomy';
import {
  validateBulkQueueInput,
  validateFormatSelectionInput,
} from '../../shared/schemas/validation';
import {
  BulkQueueItemResult,
  BulkQueueRequest,
  BulkQueueResult,
  DownloadJob,
  DownloadProgressEvent,
  FormatSelectionRequest,
  JobState,
} from '../../shared/types';
import { FilesystemManager } from '../filesystem/filesystemManager';
import { BinaryManager } from '../services/binaryManager';
import { ExtractorEngine, selectVerifiedFormats } from '../services/extractorEngine';
import { StorageRepositories } from '../storage/repositories';
import { assertValidStateTransition, canTransitionJobState, isTerminalJobState } from './stateMachine';

export class JobManager extends EventEmitter {
  private readonly jobs = new Map<string, DownloadJob>();
  private readonly jobRequests = new Map<string, FormatSelectionRequest>();
  private readonly completedJobIds = new Set<string>();
  private activeCount = 0;

  constructor(
    private readonly extractorEngine: ExtractorEngine,
    private readonly filesystemManager: FilesystemManager,
    private readonly repositories: StorageRepositories,
    private readonly binaryManager: BinaryManager
  ) {
    super();
    this.recoverPersistedJobsOnStartup();
  }

  /**
   * Restores persisted jobs from SQLite on application startup.
   * Any job that was left in an active state when the application closed is transitioned to 'failed'
   * with an INTERRUPTED_PROCESS code and its temporary directory is cleaned up.
   */
  private recoverPersistedJobsOnStartup(): void {
    const persisted = this.repositories.loadPersistedJobs();
    for (const job of persisted) {
      if (job.state === 'paused' || job.state === 'pausing') {
        job.state = 'paused';
        job.speedBytesPerSec = null;
        job.etaSeconds = null;
        job.stageDescription = 'Download paused — click Resume to continue';
        job.updatedAt = new Date().toISOString();
        this.repositories.saveJobSnapshot(job);
      } else if (!isTerminalJobState(job.state)) {
        job.state = 'failed';
        job.errorCode = ErrorCode.INTERRUPTED_PROCESS;
        job.userErrorMessage =
          'Application restarted while this transfer was in progress. Click Retry to restart the download.';
        job.stageDescription = 'Interrupted by application restart';
        job.updatedAt = new Date().toISOString();
        this.filesystemManager.cleanupJobTempDir(job.jobId);
        this.repositories.saveJobSnapshot(job);
      } else if (job.state === 'completed') {
        this.completedJobIds.add(job.jobId);
      }
      this.jobs.set(job.jobId, job);
    }
  }

  public getAllJobs(): DownloadJob[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getJob(jobId: string): DownloadJob | null {
    return this.jobs.get(jobId) || null;
  }

  public enqueueDownload(rawRequest: FormatSelectionRequest): DownloadJob {
    const request = validateFormatSelectionInput(rawRequest);
    const analysis = this.extractorEngine.getStoredAnalysis(request.analysisId);
    const { primaryFormat, companionAudioFormat } = selectVerifiedFormats(analysis, request);
    const extractor = this.extractorEngine.getExtractorById(analysis.extractorId);
    const capabilities = extractor.getCapabilities();

    const now = new Date().toISOString();
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const targetContainer =
      request.convertAudioTo !== 'none'
        ? request.convertAudioTo
        : request.targetContainer === 'original'
        ? primaryFormat.extension
        : request.targetContainer;

    const totalEst =
      (primaryFormat.filesizeBytes || primaryFormat.filesizeApproxBytes || 0) +
      (companionAudioFormat?.filesizeBytes || companionAudioFormat?.filesizeApproxBytes || 0);

    const job: DownloadJob = {
      jobId,
      analysisId: analysis.analysisId,
      url: analysis.sourceUrl,
      directDownloadUrl: primaryFormat.downloadUrl || analysis.normalizedUrl || analysis.sourceUrl,
      title: analysis.title,
      thumbnailUrl: analysis.thumbnailUrl,
      platform: analysis.platform,
      extractorId: analysis.extractorId,
      selectedFormatId: primaryFormat.formatId,
      selectedAudioFormatId: companionAudioFormat?.formatId || null,
      selectedResolution: primaryFormat.resolution,
      selectedContainer: targetContainer,
      requiresMerge: Boolean(primaryFormat.requiresMerge && companionAudioFormat),
      convertAudioTo: request.convertAudioTo,
      state: 'queued',
      progressPercent: 0,
      isIndeterminate: false,
      downloadedBytes: 0,
      totalBytes: totalEst > 0 ? totalEst : null,
      speedBytesPerSec: null,
      etaSeconds: null,
      stageDescription: 'Queued for download',
      outputFilePath: null,
      tempFilePaths: [],
      supportsResume: capabilities.supportsResume,
      errorCode: null,
      userErrorMessage: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    this.jobs.set(jobId, job);
    this.jobRequests.set(jobId, request);
    this.repositories.saveJobSnapshot(job);

    this.repositories.logDiagnostic({
      level: 'info',
      category: 'job-queue',
      code: null,
      message: `Enqueued job ${jobId} for "${job.title}" (${job.selectedResolution} / ${job.selectedContainer})`,
      redactedContext: job.url,
    });

    this.emitProgress(job);
    this.processQueue();
    return job;
  }

  public async bulkEnqueueUrls(rawRequest: BulkQueueRequest): Promise<BulkQueueResult> {
    const validated = validateBulkQueueInput(rawRequest);
    const results: BulkQueueItemResult[] = [];
    let queuedCount = 0;
    let failedCount = 0;

    for (const url of validated.urls) {
      try {
        const analysis = await this.extractorEngine.analyzeUrl(url);
        let chosenPreset = validated.qualityPreset;

        // If user requested a specific resolution height in bulk mode (e.g. 1080p)
        // and this specific video only has e.g. 720p, fall back to 'best' so bulk queue succeeds
        if (
          chosenPreset !== 'best' &&
          chosenPreset !== 'highest_resolution' &&
          chosenPreset !== 'audio_only' &&
          !analysis.availableResolutions.includes(chosenPreset)
        ) {
          chosenPreset = 'best';
        }

        const { primaryFormat, companionAudioFormat } = selectVerifiedFormats(analysis, {
          analysisId: analysis.analysisId,
          url: analysis.sourceUrl,
          formatId: 'auto',
          qualityPreset: chosenPreset,
          targetContainer: validated.targetContainer,
          convertAudioTo: validated.convertAudioTo,
          preserveOriginal: validated.targetContainer === 'original' && validated.convertAudioTo === 'none',
        });

        const job = this.enqueueDownload({
          analysisId: analysis.analysisId,
          url: analysis.sourceUrl,
          formatId: primaryFormat.formatId,
          audioFormatId: companionAudioFormat?.formatId || null,
          qualityPreset: chosenPreset,
          targetContainer: validated.targetContainer,
          convertAudioTo: validated.convertAudioTo,
          preserveOriginal: validated.targetContainer === 'original' && validated.convertAudioTo === 'none',
        });

        queuedCount++;
        results.push({ url, ok: true, job });
      } catch (err) {
        failedCount++;
        const msg =
          err instanceof AppError
            ? err.userMessage
            : err instanceof Error
            ? err.message
            : 'Failed to analyze or queue URL.';
        results.push({ url, ok: false, error: msg });
      }
    }

    return {
      total: validated.urls.length,
      queuedCount,
      failedCount,
      results,
    };
  }

  public async pauseJob(jobId: string): Promise<DownloadJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new AppError(ErrorCode.INVALID_FORMAT_ID, `Job "${jobId}" not found.`);
    }

    if (job.state === 'paused' || job.state === 'pausing') {
      return job;
    }

    if (job.state === 'queued') {
      this.transitionState(job, 'paused', 'Download paused — click Resume to continue');
      job.speedBytesPerSec = null;
      job.etaSeconds = null;
      job.errorCode = null;
      job.userErrorMessage = null;
      this.repositories.saveJobSnapshot(job);
      this.emitProgress(job);
      return job;
    }

    if (job.state !== 'downloading' && job.state !== 'analyzing') {
      throw new AppError(
        ErrorCode.INVALID_FORMAT_ID,
        'Only active or queued downloads can be paused.'
      );
    }

    this.transitionState(job, 'pausing', 'Pausing download and preserving partial data...');
    this.emitProgress(job);

    try {
      const extractor = this.extractorEngine.getExtractorById(job.extractorId);
      await extractor.cancel(jobId);
    } catch {
      // Ignore process stop error
    }

    if (canTransitionJobState(job.state, 'paused')) {
      this.transitionState(job, 'paused', 'Download paused — click Resume to continue');
    }
    job.speedBytesPerSec = null;
    job.etaSeconds = null;
    job.errorCode = null;
    job.userErrorMessage = null;
    this.repositories.saveJobSnapshot(job);
    this.emitProgress(job);

    return job;
  }

  public async resumeJob(jobId: string): Promise<DownloadJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new AppError(ErrorCode.INVALID_FORMAT_ID, `Job "${jobId}" not found.`);
    }

    if (job.state !== 'paused') {
      throw new AppError(ErrorCode.INVALID_FORMAT_ID, 'Only paused downloads can be resumed.');
    }

    // Re-analyze if the analysis cache expired
    try {
      this.extractorEngine.getStoredAnalysis(job.analysisId);
    } catch {
      const freshAnalysis = await this.extractorEngine.analyzeUrl(job.url);
      job.analysisId = freshAnalysis.analysisId;
      const savedReq = this.jobRequests.get(jobId);
      if (savedReq) {
        savedReq.analysisId = freshAnalysis.analysisId;
      }
    }

    if (!this.jobRequests.has(jobId)) {
      this.jobRequests.set(jobId, {
        analysisId: job.analysisId,
        url: job.url,
        formatId: job.selectedFormatId,
        audioFormatId: job.selectedAudioFormatId,
        qualityPreset: 'best',
        targetContainer: (job.selectedContainer as FormatSelectionRequest['targetContainer']) || 'mp4',
        convertAudioTo: job.convertAudioTo,
        preserveOriginal: true,
      });
    }

    this.completedJobIds.delete(jobId);
    this.transitionState(job, 'queued', 'Queued to resume download...');
    job.speedBytesPerSec = null;
    job.etaSeconds = null;
    job.errorCode = null;
    job.userErrorMessage = null;
    this.repositories.saveJobSnapshot(job);
    this.emitProgress(job);
    this.processQueue();

    return job;
  }

  public async removeJob(jobId: string): Promise<{ removed: boolean; jobId: string }> {
    const job = this.jobs.get(jobId);
    if (!job) {
      this.repositories.removePersistedJob(jobId);
      return { removed: false, jobId };
    }

    if (!isTerminalJobState(job.state) && job.state !== 'paused') {
      await this.cancelJob(jobId);
    }

    this.filesystemManager.cleanupJobTempDir(jobId);
    this.jobs.delete(jobId);
    this.jobRequests.delete(jobId);
    this.completedJobIds.delete(jobId);
    this.repositories.removePersistedJob(jobId);

    return { removed: true, jobId };
  }

  public async cancelJob(jobId: string): Promise<DownloadJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new AppError(ErrorCode.INVALID_FORMAT_ID, `Job "${jobId}" not found.`);
    }

    if (isTerminalJobState(job.state)) {
      return job;
    }

    if (job.state === 'queued' || job.state === 'paused') {
      this.transitionState(
        job,
        'cancelled',
        job.state === 'paused' ? 'Cancelled while paused' : 'Cancelled while in queue'
      );
      job.errorCode = ErrorCode.CANCELLED_DOWNLOAD;
      job.userErrorMessage = USER_ERROR_MESSAGES[ErrorCode.CANCELLED_DOWNLOAD];
      this.filesystemManager.cleanupJobTempDir(jobId);
      this.repositories.saveJobSnapshot(job);
      this.emitProgress(job);
      return job;
    }

    this.transitionState(job, 'cancelling', 'Stopping process and cleaning temporary files...');
    this.emitProgress(job);

    try {
      const extractor = this.extractorEngine.getExtractorById(job.extractorId);
      await extractor.cancel(jobId);
    } catch {
      // Ignore extractor cancel error
    }

    if (canTransitionJobState(job.state, 'cancelled')) {
      this.transitionState(job, 'cancelled', 'Download cancelled');
    }
    job.errorCode = ErrorCode.CANCELLED_DOWNLOAD;
    job.userErrorMessage = USER_ERROR_MESSAGES[ErrorCode.CANCELLED_DOWNLOAD];
    this.filesystemManager.cleanupJobTempDir(jobId);
    this.repositories.saveJobSnapshot(job);
    this.emitProgress(job);

    return job;
  }

  public async retryJob(jobId: string): Promise<DownloadJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new AppError(ErrorCode.INVALID_FORMAT_ID, `Job "${jobId}" not found.`);
    }

    if (job.state !== 'failed' && job.state !== 'cancelled') {
      throw new AppError(ErrorCode.INVALID_FORMAT_ID, 'Only failed or cancelled jobs can be retried.');
    }

    // Re-analyze if the analysis cache expired
    try {
      this.extractorEngine.getStoredAnalysis(job.analysisId);
    } catch {
      const freshAnalysis = await this.extractorEngine.analyzeUrl(job.url);
      job.analysisId = freshAnalysis.analysisId;
      const savedReq = this.jobRequests.get(jobId);
      if (savedReq) {
        savedReq.analysisId = freshAnalysis.analysisId;
      }
    }

    if (!this.jobRequests.has(jobId)) {
      this.jobRequests.set(jobId, {
        analysisId: job.analysisId,
        url: job.url,
        formatId: job.selectedFormatId,
        audioFormatId: job.selectedAudioFormatId,
        qualityPreset: 'best',
        targetContainer: (job.selectedContainer as FormatSelectionRequest['targetContainer']) || 'mp4',
        convertAudioTo: job.convertAudioTo,
        preserveOriginal: true,
      });
    }

    this.completedJobIds.delete(jobId);
    this.transitionState(job, 'queued', 'Re-queued for retry');
    job.progressPercent = 0;
    job.downloadedBytes = 0;
    job.speedBytesPerSec = null;
    job.etaSeconds = null;
    job.errorCode = null;
    job.userErrorMessage = null;
    this.repositories.saveJobSnapshot(job);
    this.emitProgress(job);
    this.processQueue();

    return job;
  }

  private processQueue(): void {
    let maxConcurrent = 2;
    try {
      const settings = this.repositories.getSettings();
      maxConcurrent = Math.max(1, settings.maxConcurrentDownloads || 2);
    } catch {
      return;
    }

    if (this.activeCount >= maxConcurrent) {
      return;
    }

    const queuedJobs = Array.from(this.jobs.values())
      .filter((j) => j.state === 'queued')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    for (const nextJob of queuedJobs) {
      if (this.activeCount >= maxConcurrent) break;
      this.activeCount++;
      this.executeJob(nextJob).finally(() => {
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.processQueue();
      });
    }
  }

  private async executeJob(job: DownloadJob): Promise<void> {
    const settings = this.repositories.getSettings();
    const outputDir = this.filesystemManager.authorizeDirectory(settings.defaultDownloadDir);
    const tempDir = this.filesystemManager.createJobTempDir(job.jobId);
    job.tempFilePaths = [tempDir];

    try {
      const maxBytes = (settings.maxDownloadSizeMB || 4096) * 1024 * 1024;
      this.filesystemManager.verifyDiskSpace(outputDir, job.totalBytes || 32 * 1024 * 1024);

      this.transitionState(
        job,
        'downloading',
        job.downloadedBytes > 0
          ? 'Resuming media stream transfer...'
          : 'Initializing media stream transfer...'
      );
      this.emitProgress(job);

      const analysis = this.extractorEngine.getStoredAnalysis(job.analysisId);
      const req = this.jobRequests.get(job.jobId) || {
        analysisId: job.analysisId,
        url: job.url,
        formatId: job.selectedFormatId,
        audioFormatId: job.selectedAudioFormatId,
        qualityPreset: 'best',
        targetContainer: (job.selectedContainer as FormatSelectionRequest['targetContainer']) || 'mp4',
        convertAudioTo: job.convertAudioTo,
        preserveOriginal: true,
      };

      const { primaryFormat, companionAudioFormat } = selectVerifiedFormats(analysis, req);
      const extractor = this.extractorEngine.getExtractorById(analysis.extractorId);
      const binReport = await this.binaryManager.verifyAllBinaries();

      const result = await extractor.download(
        analysis,
        primaryFormat,
        companionAudioFormat,
        req,
        {
          jobId: job.jobId,
          outputDir,
          tempDir,
          maxFileSizeBytes: maxBytes,
          ffmpegPath: binReport.ffmpeg.resolvedPath,
          onProgress: (tick) => {
            if (
              job.state === 'cancelling' ||
              job.state === 'cancelled' ||
              job.state === 'pausing' ||
              job.state === 'paused'
            ) {
              return;
            }
            if (tick.state !== job.state && canTransitionJobState(job.state, tick.state)) {
              this.transitionState(job, tick.state, tick.stageDescription);
            } else {
              job.stageDescription = tick.stageDescription;
            }
            job.progressPercent = tick.progressPercent;
            job.isIndeterminate = tick.isIndeterminate;
            job.downloadedBytes = tick.downloadedBytes;
            job.totalBytes = tick.totalBytes ?? job.totalBytes;
            job.speedBytesPerSec = tick.speedBytesPerSec;
            job.etaSeconds = tick.etaSeconds;
            job.updatedAt = new Date().toISOString();
            this.emitProgress(job);
          },
        }
      );

      if (
        (job.state as string) === 'pausing' ||
        (job.state as string) === 'paused' ||
        (job.state as string) === 'cancelling' ||
        (job.state as string) === 'cancelled'
      ) {
        return;
      }

      // Guard against duplicate completion events
      if (this.completedJobIds.has(job.jobId)) {
        return;
      }
      this.completedJobIds.add(job.jobId);

      this.transitionState(job, 'completed', 'Download and verification complete');
      job.progressPercent = 100;
      job.isIndeterminate = false;
      job.downloadedBytes = result.fileSizeBytes;
      job.totalBytes = result.fileSizeBytes;
      job.speedBytesPerSec = null;
      job.etaSeconds = 0;
      job.outputFilePath = result.finalFilePath;
      job.completedAt = new Date().toISOString();

      this.repositories.saveJobSnapshot(job);
      this.repositories.addHistoryRecord({
        id: `hist_${job.jobId}`,
        jobId: job.jobId,
        title: job.title,
        sourceUrl: job.url,
        platform: job.platform,
        selectedFormat: `${job.selectedFormatId} (${result.container.toUpperCase()})`,
        resolution: job.selectedResolution,
        filePath: result.finalFilePath,
        fileSizeBytes: result.fileSizeBytes,
        completedAt: job.completedAt,
        status: 'completed',
      });

      this.repositories.logDiagnostic({
        level: 'info',
        category: 'download-complete',
        code: null,
        message: `Completed job ${job.jobId} -> ${result.finalFilePath} (${result.fileSizeBytes} bytes)`,
        redactedContext: null,
      });

      this.emitProgress(job);
    } catch (err) {
      if ((job.state as string) === 'pausing' || (job.state as string) === 'paused') {
        if (canTransitionJobState(job.state, 'paused')) {
          this.transitionState(job, 'paused', 'Download paused — click Resume to continue');
        }
        job.speedBytesPerSec = null;
        job.etaSeconds = null;
        job.errorCode = null;
        job.userErrorMessage = null;
      } else if (
        (job.state as string) === 'cancelled' ||
        (job.state as string) === 'cancelling' ||
        (err instanceof AppError && err.code === ErrorCode.CANCELLED_DOWNLOAD)
      ) {
        if (canTransitionJobState(job.state, 'cancelled')) {
          this.transitionState(job, 'cancelled', 'Cancelled by user');
        }
        job.errorCode = ErrorCode.CANCELLED_DOWNLOAD;
        job.userErrorMessage = USER_ERROR_MESSAGES[ErrorCode.CANCELLED_DOWNLOAD];
      } else {
        const appErr =
          err instanceof AppError
            ? err
            : new AppError(
                ErrorCode.EXTRACTION_FAILURE,
                undefined,
                err instanceof Error ? err.message : String(err)
              );

        if (canTransitionJobState(job.state, 'failed')) {
          this.transitionState(job, 'failed', 'Download failed');
        }
        job.errorCode = appErr.code;
        job.userErrorMessage = appErr.userMessage;

        try {
          if (this.jobs.has(job.jobId)) {
            this.repositories.logDiagnostic({
              level: 'error',
              category: 'download-failed',
              code: appErr.code,
              message: appErr.userMessage,
              redactedContext: appErr.technicalDetail || null,
            });
          }
        } catch {
          // Ignore if DB closed on shutdown
        }
      }

      if (this.jobs.has(job.jobId)) {
        try {
          this.repositories.saveJobSnapshot(job);
        } catch {
          // Ignore if DB closed on shutdown
        }
        this.emitProgress(job);
      }
    } finally {
      if (
        settings.tempFileCleanupPolicy === 'immediate' &&
        (job.state as string) !== 'paused' &&
        (job.state as string) !== 'pausing'
      ) {
        this.filesystemManager.cleanupJobTempDir(job.jobId);
      }
    }
  }

  private transitionState(job: DownloadJob, nextState: JobState, stageDescription: string): void {
    assertValidStateTransition(job.state, nextState);
    job.state = nextState;
    job.stageDescription = stageDescription;
    job.updatedAt = new Date().toISOString();
  }

  private emitProgress(job: DownloadJob): void {
    const evt: DownloadProgressEvent = {
      jobId: job.jobId,
      state: job.state,
      progressPercent: job.progressPercent,
      isIndeterminate: job.isIndeterminate,
      downloadedBytes: job.downloadedBytes,
      totalBytes: job.totalBytes,
      speedBytesPerSec: job.speedBytesPerSec,
      etaSeconds: job.etaSeconds,
      stageDescription: job.stageDescription,
      outputFilePath: job.outputFilePath,
      errorCode: job.errorCode,
      userErrorMessage: job.userErrorMessage,
    };
    this.emit('job-progress', evt, job);
  }
}
