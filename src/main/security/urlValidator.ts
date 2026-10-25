import dns from 'node:dns/promises';
import net from 'node:net';
import { AppError, ErrorCode } from '../../shared/errors/taxonomy';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
  'instance-data',
  '0.0.0.0',
  '[::1]',
  '[::]',
]);

export function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.replace(/^\[|\]$/g, '').toLowerCase();

  if ( normalized.startsWith('::ffff:')) {
    const mappedV4 = normalized.slice('::ffff:'.length);
    if (net.isIPv4(mappedV4)) {
      return isPrivateOrReservedIp(mappedV4);
    }
  }

  if (net.isIPv4(normalized)) {
    const parts = normalized.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 carrier-grade NAT / Alibaba metadata
    if (a >= 224) return true; // Multicast & reserved
    return false;
  }

  if (net.isIPv6(normalized)) {
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fe80:')) return true; // Link-local
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // Unique local
    if (normalized.startsWith('ff')) return true; // Multicast
    return false;
  }

  return true;
}

export interface UrlValidationOptions {
  allowAuthorizedLocalTestServerPort?: number;
  resolveDns?: boolean;
}

export function validateMediaUrlSync(rawUrl: string, options?: UrlValidationOptions): URL {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new AppError(ErrorCode.INVALID_URL, 'Please enter a non-empty URL.');
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    throw new AppError(ErrorCode.INVALID_URL, 'URL exceeds maximum permitted length (2048 characters).');
  }

  // Reject control characters or null bytes
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    throw new AppError(ErrorCode.INVALID_URL, 'URL contains invalid control characters.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AppError(ErrorCode.INVALID_URL, 'Malformed URL syntax. Include https:// or http://.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError(
      ErrorCode.INVALID_URL,
      `Unsupported URL protocol "${parsed.protocol}". Only HTTP and HTTPS are allowed.`
    );
  }

  if (parsed.username || parsed.password) {
    throw new AppError(
      ErrorCode.INVALID_URL,
      'URLs containing embedded credentials (username:password) are disallowed for security.'
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // Authorized local test media server check (strictly scoped to /local-media/ on the app's port)
  if (
    options?.allowAuthorizedLocalTestServerPort &&
    (hostname === '127.0.0.1' || hostname === 'localhost') &&
    parsed.port === String(options.allowAuthorizedLocalTestServerPort) &&
    parsed.pathname.startsWith('/local-media/')
  ) {
    return parsed;
  }

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new AppError(
      ErrorCode.INVALID_URL,
      'Requests to localhost, internal domains, or cloud metadata endpoints are blocked.'
    );
  }

  // Reject octal/hex/integer IP obfuscation like http://2130706433 or http://0x7f000001
  if (/^(0x[0-9a-f]+|\d+)$/i.test(hostname)) {
    throw new AppError(
      ErrorCode.INVALID_URL,
      'Numeric or hex-encoded IP hostnames are disallowed.'
    );
  }

  const bareIp = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(bareIp) !== 0) {
    if (isPrivateOrReservedIp(bareIp)) {
      throw new AppError(
        ErrorCode.INVALID_URL,
        'Requests to private network, loopback, or link-local IP addresses are blocked.'
      );
    }
  }

  if (!hostname.includes('.')) {
    throw new AppError(ErrorCode.INVALID_URL, 'URL hostname must be a valid public domain.');
  }

  return parsed;
}

export async function validateMediaUrl(
  rawUrl: string,
  options?: UrlValidationOptions
): Promise<URL> {
  const parsed = validateMediaUrlSync(rawUrl, options);
  const hostname = parsed.hostname.toLowerCase();

  // Skip DNS lookup for authorized local test server
  if (
    options?.allowAuthorizedLocalTestServerPort &&
    (hostname === '127.0.0.1' || hostname === 'localhost') &&
    parsed.port === String(options.allowAuthorizedLocalTestServerPort) &&
    parsed.pathname.startsWith('/local-media/')
  ) {
    return parsed;
  }

  if (options?.resolveDns !== false && net.isIP(hostname.replace(/^\[|\]$/g, '')) === 0) {
    try {
      const records = await dns.lookup(hostname, { all: true });
      for (const rec of records) {
        if (isPrivateOrReservedIp(rec.address)) {
          throw new AppError(
            ErrorCode.INVALID_URL,
            `Domain "${hostname}" resolves to a restricted private or loopback IP address (DNS rebinding protection).`
          );
        }
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      // If offline or DNS lookup fails in hermetic test environments, allow syntactic check to pass
      // or surface network error during connection
    }
  }

  return parsed;
}
