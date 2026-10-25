export enum ErrorCode {
  INVALID_URL = 'INVALID_URL',
  UNSUPPORTED_WEBSITE = 'UNSUPPORTED_WEBSITE',
  UNAVAILABLE_MEDIA = 'UNAVAILABLE_MEDIA',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  DRM_PROTECTED = 'DRM_PROTECTED',
  NETWORK_FAILURE = 'NETWORK_FAILURE',
  SOURCE_RATE_LIMITED = 'SOURCE_RATE_LIMITED',
  EXTRACTION_FAILURE = 'EXTRACTION_FAILURE',
  MISSING_FFMPEG = 'MISSING_FFMPEG',
  INVALID_FORMAT_ID = 'INVALID_FORMAT_ID',
  UNSUPPORTED_CODEC = 'UNSUPPORTED_CODEC',
  DISK_FULL = 'DISK_FULL',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  FILE_COLLISION = 'FILE_COLLISION',
  CANCELLED_DOWNLOAD = 'CANCELLED_DOWNLOAD',
  INTERRUPTED_PROCESS = 'INTERRUPTED_PROCESS',
  PACKAGING_DEPENDENCY_ERROR = 'PACKAGING_DEPENDENCY_ERROR',
}

export const USER_ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.INVALID_URL]:
    'The provided URL is not a valid or safe HTTP/HTTPS media address. Private network, localhost, and non-HTTP schemes are blocked.',
  [ErrorCode.UNSUPPORTED_WEBSITE]:
    'This website or URL format is not supported by any active extractor module.',
  [ErrorCode.UNAVAILABLE_MEDIA]:
    'The requested media could not be found, has been removed, or is not publicly accessible.',
  [ErrorCode.AUTHENTICATION_REQUIRED]:
    'This media requires account authentication, cookie verification, or a paid subscription. Universal Video Downloader does not bypass login walls or collect session cookies.',
  [ErrorCode.DRM_PROTECTED]:
    'This stream is encrypted with Digital Rights Management (DRM). Protected content cannot be extracted or downloaded.',
  [ErrorCode.NETWORK_FAILURE]:
    'A network connection error or timeout occurred while reaching the media server. Please check your connection and try again.',
  [ErrorCode.SOURCE_RATE_LIMITED]:
    'The remote server rate-limited the request (HTTP 429). Wait a few moments before retrying.',
  [ErrorCode.EXTRACTION_FAILURE]:
    'The media extractor could not parse stream metadata from the source page.',
  [ErrorCode.MISSING_FFMPEG]:
    'FFmpeg or FFprobe is missing or inaccessible. Stream merging and format conversion require a verified FFmpeg binary.',
  [ErrorCode.INVALID_FORMAT_ID]:
    'The requested format ID does not match the verified analysis result for this media source. Please re-analyze the URL.',
  [ErrorCode.UNSUPPORTED_CODEC]:
    'The selected stream uses a codec incompatible with the requested container format.',
  [ErrorCode.DISK_FULL]:
    'Insufficient disk space in the destination directory or the file exceeds the configured maximum download size limit.',
  [ErrorCode.PERMISSION_DENIED]:
    'Write permission was denied for the selected download folder. Choose a user-writable directory.',
  [ErrorCode.FILE_COLLISION]:
    'A file with the same name already exists and automatic overwrite is disabled.',
  [ErrorCode.CANCELLED_DOWNLOAD]:
    'The download job was cancelled by the user and temporary files were cleaned up.',
  [ErrorCode.INTERRUPTED_PROCESS]:
    'The background extraction or media-processing process terminated unexpectedly.',
  [ErrorCode.PACKAGING_DEPENDENCY_ERROR]:
    'A required runtime dependency binary could not be initialized.',
};

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly userMessage: string;
  public readonly technicalDetail?: string;
  public readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    customUserMessage?: string,
    technicalDetail?: string,
    retryable = false
  ) {
    const userMessage = customUserMessage || USER_ERROR_MESSAGES[code];
    super(userMessage);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    this.technicalDetail = technicalDetail ? redactSensitiveData(technicalDetail) : undefined;
    this.retryable = retryable;
  }

  public toSafeJSON() {
    return {
      code: this.code,
      userMessage: this.userMessage,
      retryable: this.retryable,
    };
  }
}

/**
 * Redacts query tokens, signatures, session IDs, and credentials from URLs and log lines.
 */
export function redactSensitiveData(input: string): string {
  if (!input) return '';
  return input
    .replace(
      /([?&](?:token|sig|signature|key|auth|secret|password|session|hdnts|Policy|Key-Pair-Id)=)[^&\s"']+/gi,
      '$1[REDACTED]'
    )
    .replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)([^/@\s]+@)/gi, '$1[REDACTED]@');
}

/**
 * Extracts a clean, single-line human-readable summary from yt-dlp or FFmpeg stderr.
 */
function extractCleanReasonFromStderr(stderr: string): string | null {
  if (!stderr) return null;
  const lines = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('Deprecated Feature:'));

  const errorLine = lines.find((l) => l.toUpperCase().startsWith('ERROR:'));
  const rawReason = errorLine ? errorLine.replace(/^ERROR:\s*(\[[^\]]+\]\s*[^:]+:\s*)?/i, '') : lines[lines.length - 1];
  if (!rawReason) return null;
  const cleaned = redactSensitiveData(rawReason).slice(0, 240);
  return cleaned || null;
}

export function classifyStderrError(stderr: string): AppError {
  const lower = stderr.toLowerCase();
  const specificReason = extractCleanReasonFromStderr(stderr);

  if (lower.includes('drm') || lower.includes('widevine') || lower.includes('playready') || lower.includes('encrypted')) {
    return new AppError(ErrorCode.DRM_PROTECTED, undefined, stderr, false);
  }
  if (
    lower.includes('not a bot') ||
    lower.includes('sign in') ||
    lower.includes('login required') ||
    lower.includes('members-only') ||
    lower.includes('private video') ||
    lower.includes('cookies-from-browser') ||
    lower.includes('401') ||
    lower.includes('403 forbidden')
  ) {
    return new AppError(
      ErrorCode.AUTHENTICATION_REQUIRED,
      specificReason
        ? `Source requires authentication or bot verification (${specificReason}). Universal Video Downloader does not harvest browser cookies or bypass login walls.`
        : undefined,
      stderr,
      false
    );
  }
  if (lower.includes('429') || lower.includes('too many requests') || lower.includes('rate limit')) {
    return new AppError(ErrorCode.SOURCE_RATE_LIMITED, undefined, stderr, true);
  }
  if (lower.includes('unsupported url') || lower.includes('no suitable extractor')) {
    return new AppError(
      ErrorCode.UNSUPPORTED_WEBSITE,
      specificReason
        ? `Unsupported URL or webpage (${specificReason}). Paste a direct video link or a supported public media URL.`
        : undefined,
      stderr,
      false
    );
  }
  if (lower.includes('404') || lower.includes('not found') || lower.includes('video unavailable') || lower.includes('incomplete youtube id')) {
    return new AppError(
      ErrorCode.UNAVAILABLE_MEDIA,
      specificReason ? `Media unavailable: ${specificReason}` : undefined,
      stderr,
      false
    );
  }
  if (lower.includes('no space left') || lower.includes('enospc') || lower.includes('file is larger than max-filesize')) {
    return new AppError(ErrorCode.DISK_FULL, undefined, stderr, false);
  }
  if (lower.includes('eacces') || lower.includes('eperm') || lower.includes('permission denied')) {
    return new AppError(ErrorCode.PERMISSION_DENIED, undefined, stderr, false);
  }
  if (
    lower.includes('timed out') ||
    lower.includes('connection refused') ||
    lower.includes('enotfound') ||
    lower.includes('network is unreachable') ||
    lower.includes('unable to download webpage')
  ) {
    return new AppError(
      ErrorCode.NETWORK_FAILURE,
      specificReason ? `Network error while contacting source: ${specificReason}` : undefined,
      stderr,
      true
    );
  }

  return new AppError(
    ErrorCode.EXTRACTION_FAILURE,
    specificReason
      ? `The media extractor could not parse stream metadata: ${specificReason}`
      : undefined,
    stderr,
    true
  );
}
