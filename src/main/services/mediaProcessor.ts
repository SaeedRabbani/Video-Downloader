import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';
import { AppError, ErrorCode } from '../../shared/errors/taxonomy';
import { BinaryManager } from './binaryManager';

const execFileAsync = promisify(execFile);

export interface FfprobeStreamInfo {
  index: number;
  codec_type?: 'video' | 'audio' | 'subtitle';
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  bit_rate?: string;
}

export interface FfprobeFormatInfo {
  filename?: string;
  nb_streams?: number;
  format_name?: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
  tags?: Record<string, string>;
}

export interface FfprobeResult {
  streams: FfprobeStreamInfo[];
  format: FfprobeFormatInfo;
}

export class MediaProcessor {
  constructor(private readonly binaryManager: BinaryManager) {}

  public async probeMedia(inputPathOrUrl: string): Promise<FfprobeResult> {
    const status = await this.binaryManager.verifyAllBinaries();
    if (!status.ffprobe.available || !status.ffprobe.resolvedPath) {
      throw new AppError(ErrorCode.MISSING_FFMPEG, 'FFprobe binary is unavailable.');
    }

    try {
      const { stdout } = await execFileAsync(
        status.ffprobe.resolvedPath,
        [
          '-v',
          'quiet',
          '-print_format',
          'json',
          '-show_format',
          '-show_streams',
          inputPathOrUrl,
        ],
        {
          timeout: 15000,
          windowsHide: true,
        }
      );

      const parsed = JSON.parse(stdout) as FfprobeResult;
      return {
        streams: parsed.streams || [],
        format: parsed.format || {},
      };
    } catch (err) {
      throw new AppError(
        ErrorCode.EXTRACTION_FAILURE,
        'Failed to inspect media stream metadata with FFprobe.',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  /**
   * Merges a separate video stream and audio stream into a target container using FFmpeg without re-encoding video.
   */
  public async mergeVideoAndAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    targetContainer: 'mp4' | 'mkv' | 'webm',
    onStage?: (msg: string) => void,
    registerProcess?: (proc: ReturnType<typeof spawn>) => void
  ): Promise<void> {
    const status = await this.binaryManager.verifyAllBinaries();
    if (!status.ffmpeg.available || !status.ffmpeg.resolvedPath) {
      throw new AppError(ErrorCode.MISSING_FFMPEG, 'FFmpeg binary is required to merge separate video and audio streams.');
    }

    if (!fs.existsSync(videoPath) || !fs.existsSync(audioPath)) {
      throw new AppError(ErrorCode.INTERRUPTED_PROCESS, 'Input video or audio stream file is missing for merge.');
    }

    onStage?.('Merging video and audio streams with FFmpeg...');

    const audioCodecArgs =
      targetContainer === 'webm'
        ? ['-c:a', 'libopus', '-b:a', '160k']
        : ['-c:a', 'aac', '-b:a', '192k'];

    const args = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      videoPath,
      '-i',
      audioPath,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      ...audioCodecArgs,
      '-movflags',
      '+faststart',
      outputPath,
    ];

    await this.runFfmpegArgs(status.ffmpeg.resolvedPath, args, registerProcess);

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new AppError(ErrorCode.EXTRACTION_FAILURE, 'FFmpeg stream merge produced an empty output file.');
    }
  }

  /**
   * Extracts or converts audio to MP3 or M4A using FFmpeg.
   */
  public async convertToAudioFormat(
    inputPath: string,
    outputPath: string,
    format: 'mp3' | 'm4a',
    onStage?: (msg: string) => void,
    registerProcess?: (proc: ReturnType<typeof spawn>) => void
  ): Promise<void> {
    const status = await this.binaryManager.verifyAllBinaries();
    if (!status.ffmpeg.available || !status.ffmpeg.resolvedPath) {
      throw new AppError(ErrorCode.MISSING_FFMPEG, 'FFmpeg binary is required for audio conversion.');
    }

    onStage?.(`Converting audio stream to ${format.toUpperCase()}...`);

    const codecArgs =
      format === 'mp3'
        ? ['-vn', '-c:a', 'libmp3lame', '-q:a', '2']
        : ['-vn', '-c:a', 'aac', '-b:a', '192k'];

    const args = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      ...codecArgs,
      outputPath,
    ];

    await this.runFfmpegArgs(status.ffmpeg.resolvedPath, args, registerProcess);

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new AppError(ErrorCode.UNSUPPORTED_CODEC, `Failed to convert audio to ${format.toUpperCase()}.`);
    }
  }

  /**
   * Remuxes media container without transcoding video when possible, falling back to compatible codec if required.
   */
  public async remuxContainer(
    inputPath: string,
    outputPath: string,
    targetContainer: 'mp4' | 'mkv' | 'webm',
    onStage?: (msg: string) => void,
    registerProcess?: (proc: ReturnType<typeof spawn>) => void
  ): Promise<void> {
    const status = await this.binaryManager.verifyAllBinaries();
    if (!status.ffmpeg.available || !status.ffmpeg.resolvedPath) {
      throw new AppError(ErrorCode.MISSING_FFMPEG, 'FFmpeg binary is required for container remuxing.');
    }

    onStage?.(`Remuxing stream into ${targetContainer.toUpperCase()} container...`);

    // First attempt lossless stream copy
    try {
      const copyArgs = [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-c',
        'copy',
        outputPath,
      ];
      await this.runFfmpegArgs(status.ffmpeg.resolvedPath, copyArgs, registerProcess);
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        return;
      }
    } catch {
      // If container does not support stream copy (e.g. H264 into WebM), transcode with compatible codec
    }

    const transcodeArgs =
      targetContainer === 'webm'
        ? [
            '-y',
            '-hide_banner',
            '-loglevel',
            'error',
            '-i',
            inputPath,
            '-c:v',
            'libvpx-vp9',
            '-crf',
            '30',
            '-b:v',
            '0',
            '-c:a',
            'libopus',
            outputPath,
          ]
        : [
            '-y',
            '-hide_banner',
            '-loglevel',
            'error',
            '-i',
            inputPath,
            '-c:v',
            'libx264',
            '-preset',
            'fast',
            '-crf',
            '22',
            '-c:a',
            'aac',
            outputPath,
          ];

    await this.runFfmpegArgs(status.ffmpeg.resolvedPath, transcodeArgs, registerProcess);
  }

  private runFfmpegArgs(
    ffmpegBin: string,
    args: string[],
    registerProcess?: (proc: ReturnType<typeof spawn>) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(ffmpegBin, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      registerProcess?.(child);

      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        reject(new AppError(ErrorCode.INTERRUPTED_PROCESS, 'FFmpeg process error.', err.message));
      });

      child.on('close', (code, signal) => {
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          reject(new AppError(ErrorCode.CANCELLED_DOWNLOAD));
          return;
        }
        if (code !== 0) {
          reject(
            new AppError(
              ErrorCode.UNSUPPORTED_CODEC,
              'FFmpeg could not process or merge the selected streams.',
              stderr
            )
          );
          return;
        }
        resolve();
      });
    });
  }
}
