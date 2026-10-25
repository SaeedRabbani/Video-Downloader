import fs from 'node:fs';
import path from 'node:path';
import { AppError, ErrorCode } from '../../shared/errors/taxonomy';

const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

/**
 * Sanitizes an untrusted media title into a safe Windows/cross-platform filename stem.
 */
export function sanitizeFilename(rawName: string, fallback = 'video_download'): string {
  if (!rawName || typeof rawName !== 'string') {
    return fallback;
  }

  // Strip control characters first, then Windows forbidden characters <>:"/\|?*
  let cleaned = rawName
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  // Windows forbids trailing or leading dots and spaces
  cleaned = cleaned.replace(/[. ]+$/g, '').replace(/^[. ]+/g, '');
  cleaned = cleaned.replace(/\.\.+/g, '_');

  if (!cleaned) {
    cleaned = fallback;
  }

  // Check Windows reserved device names (with or without extension)
  const stemUpper = cleaned.split('.')[0].toUpperCase();
  if (WINDOWS_RESERVED_NAMES.has(stemUpper)) {
    cleaned = `_${cleaned}`;
  }

  // Limit length to 140 chars so full path stays well below Windows MAX_PATH (260)
  if (cleaned.length > 140) {
    cleaned = cleaned.slice(0, 140).replace(/[. ]+$/g, '');
  }

  return cleaned || fallback;
}

/**
 * Safely resolves a target file inside baseDir and guarantees no path traversal occurs.
 */
export function resolveSafeChildPath(baseDir: string, fileName: string): string {
  const resolvedBase = path.resolve(baseDir);
  const sanitizedFile = path.basename(fileName);
  const resolvedTarget = path.resolve(resolvedBase, sanitizedFile);

  const relative = path.relative(resolvedBase, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new AppError(
      ErrorCode.PERMISSION_DENIED,
      'Path traversal attempt detected and blocked.'
    );
  }

  return resolvedTarget;
}

/**
 * Returns a collision-resistant file path inside baseDir.
 */
export function getCollisionSafeFilePath(
  baseDir: string,
  rawTitle: string,
  extension: string,
  overwrite = false
): string {
  const cleanExt = extension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'mp4';
  const stem = sanitizeFilename(rawTitle);
  const initialCandidate = resolveSafeChildPath(baseDir, `${stem}.${cleanExt}`);

  if (overwrite || !fs.existsSync(initialCandidate)) {
    return initialCandidate;
  }

  for (let counter = 1; counter <= 999; counter++) {
    const candidate = resolveSafeChildPath(baseDir, `${stem} (${counter}).${cleanExt}`);
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new AppError(
    ErrorCode.FILE_COLLISION,
    'Unable to allocate a unique filename in the destination directory.'
  );
}
