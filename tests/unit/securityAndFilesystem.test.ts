import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getCollisionSafeFilePath,
  resolveSafeChildPath,
  sanitizeFilename,
} from '../../src/main/filesystem/pathSanitizer';
import { validateIpcSender } from '../../src/main/ipc/senderValidation';
import { isPrivateOrReservedIp, validateMediaUrlSync } from '../../src/main/security/urlValidator';
import { BinaryManager } from '../../src/main/services/binaryManager';
import { IPC_CHANNELS } from '../../src/shared/events/channels';

describe('URL Validation & SSRF / Unsafe Destination Rejection', () => {
  it('accepts valid public HTTPS and HTTP media URLs', () => {
    const parsed = validateMediaUrlSync('https://media.example.com/videos/sample.mp4');
    expect(parsed.hostname).toBe('media.example.com');
    expect(parsed.protocol).toBe('https:');
  });

  it('rejects non-HTTP schemes (file://, javascript:, ftp:, data:)', () => {
    expect(() => validateMediaUrlSync('file:///C:/Windows/System32/cmd.exe')).toThrow();
    expect(() => validateMediaUrlSync('javascript:alert(1)')).toThrow();
    expect(() => validateMediaUrlSync('ftp://files.example.com/video.mp4')).toThrow();
  });

  it('rejects localhost, loopback, private networks, and cloud metadata endpoints', () => {
    expect(() => validateMediaUrlSync('http://localhost:8080/secret')).toThrow();
    expect(() => validateMediaUrlSync('http://127.0.0.1/admin')).toThrow();
    expect(() => validateMediaUrlSync('http://169.254.169.254/latest/meta-data/')).toThrow();
    expect(() => validateMediaUrlSync('http://metadata.google.internal/computeMetadata/v1/')).toThrow();
    expect(() => validateMediaUrlSync('http://10.0.0.5/internal.mp4')).toThrow();
    expect(() => validateMediaUrlSync('http://192.168.1.100/stream.m3u8')).toThrow();
    expect(() => validateMediaUrlSync('http://172.16.5.4/video.mp4')).toThrow();
    expect(() => validateMediaUrlSync('http://[::1]:3000/video.mp4')).toThrow();
  });

  it('rejects URLs with embedded credentials', () => {
    expect(() =>
      validateMediaUrlSync('https://admin:secretpassword@example.com/video.mp4')
    ).toThrow();
  });

  it('accurately identifies private and reserved IPv4/IPv6 addresses', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('10.24.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false);
  });
});

describe('Windows Filename Sanitization & Path Traversal Protection', () => {
  it('strips forbidden Windows characters and control bytes', () => {
    const dirty = 'My:Video*Title?"<>|Test/Stream\\Clip\x00';
    const clean = sanitizeFilename(dirty);
    expect(clean).not.toMatch(/[<>:"/\\|?*\x00]/);
    expect(clean).toBe('My_Video_Title_____Test_Stream_Clip');
  });

  it('prefixes Windows reserved device names (CON, PRN, AUX, NUL, COM1, LPT1)', () => {
    expect(sanitizeFilename('CON')).toBe('_CON');
    expect(sanitizeFilename('nul.mp4')).toBe('_nul.mp4');
    expect(sanitizeFilename('COM1')).toBe('_COM1');
    expect(sanitizeFilename('LPT9')).toBe('_LPT9');
  });

  it('strips trailing dots and spaces prohibited on Windows NTFS', () => {
    expect(sanitizeFilename('Lecture Recording...   ')).toBe('Lecture Recording');
  });

  it('prevents path traversal outside base download directory', () => {
    const baseDir = path.resolve('/tmp/uvd-safe-downloads');
    const safePath = resolveSafeChildPath(baseDir, '../../etc/passwd');
    expect(safePath).toBe(path.join(baseDir, 'passwd'));
  });

  it('allocates collision-safe filenames', () => {
    const baseDir = path.resolve('/tmp/uvd-nonexistent-dir');
    const candidate = getCollisionSafeFilePath(baseDir, 'Sample Video', 'mp4');
    expect(candidate).toBe(path.join(baseDir, 'Sample Video.mp4'));
  });
});

describe('IPC Sender Validation & Packaged Resource Resolution', () => {
  it('accepts top-level authorized sender frames on allowlisted channels', () => {
    const valid = validateIpcSender(
      {
        senderFrame: {
          url: 'http://localhost:3000/index.html',
          parent: null,
        },
      },
      IPC_CHANNELS.ANALYZE_URL
    );
    expect(valid).toBe(true);
  });

  it('rejects unknown IPC channels and untrusted sender origins or subframes', () => {
    expect(() =>
      validateIpcSender(
        { senderFrame: { url: 'http://localhost:3000/' } },
        'uvd:arbitrary-shell-exec'
      )
    ).toThrow();

    expect(() =>
      validateIpcSender(
        { senderFrame: { url: 'https://malicious.example.com/' } },
        IPC_CHANNELS.ANALYZE_URL
      )
    ).toThrow();

    expect(() =>
      validateIpcSender(
        { senderFrame: { url: 'http://localhost:3000/', parent: {} } },
        IPC_CHANNELS.ANALYZE_URL
      )
    ).toThrow();
  });

  it('resolves packaged and workspace binary candidate paths deterministically', async () => {
    const manager = new BinaryManager(path.resolve(process.cwd(), 'resources', 'binaries'));
    const candidates = manager.resolveBinaryCandidatePaths('yt-dlp');
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].bundled).toBe(true);

    const status = await manager.verifyAllBinaries(true);
    expect(status.ffmpeg.available).toBe(true);
    expect(status.ffprobe.available).toBe(true);
    expect(status.ytDlp.available).toBe(true);
  });
});
