import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { isPrivateOrReservedIp } from './urlValidator';

interface DohCacheEntry {
  ips: string[];
  expiresAt: number;
}

const dohCache = new Map<string, DohCacheEntry>();
const DOH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface DohJsonResponse {
  Status?: number;
  Answer?: Array<{
    name?: string;
    type?: number;
    TTL?: number;
    data?: string;
  }>;
}

function queryDohEndpoint(urlStr: string, timeoutMs: number): Promise<string[]> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ips: string[]) => {
      if (!settled) {
        settled = true;
        resolve(ips);
      }
    };

    const req = https.get(
      urlStr,
      {
        headers: {
          Accept: 'application/dns-json',
          'User-Agent': 'UniversalVideoDownloader/1.0',
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          finish([]);
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          if (body.length < 65536) {
            body += chunk;
          }
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body) as DohJsonResponse;
            if (!Array.isArray(parsed.Answer)) {
              finish([]);
              return;
            }
            const ips = parsed.Answer.filter(
              (ans) => (ans.type === 1 || ans.type === 28) && typeof ans.data === 'string'
            )
              .map((ans) => ans.data!.trim())
              .filter((ip) => net.isIP(ip) !== 0);
            finish(ips);
          } catch {
            finish([]);
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      finish([]);
    });

    req.on('error', () => {
      finish([]);
    });
  });
}

/**
 * Resolves a domain name using encrypted DNS-over-HTTPS (Cloudflare 1.1.1.1 and Google 8.8.8.8)
 * directly by IP address so ISP UDP port 53 DNS poisoning/sinkholing cannot intercept it.
 */
export async function resolveHostViaDoh(hostname: string, timeoutMs = 4000): Promise<string[]> {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!normalized || net.isIP(normalized) !== 0) {
    return normalized ? [normalized] : [];
  }

  const cached = dohCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ips;
  }

  const encoded = encodeURIComponent(normalized);
  const endpoints = [
    `https://1.1.1.1/dns-query?name=${encoded}&type=A`,
    `https://8.8.8.8/resolve?name=${encoded}&type=A`,
  ];

  for (const endpoint of endpoints) {
    const ips = await queryDohEndpoint(endpoint, timeoutMs);
    const publicIps = ips.filter((ip) => !isPrivateOrReservedIp(ip));
    if (publicIps.length > 0) {
      dohCache.set(normalized, {
        ips: publicIps,
        expiresAt: Date.now() + DOH_CACHE_TTL_MS,
      });
      return publicIps;
    }
    if (ips.length > 0) {
      // Returned only private/reserved IPs from authoritative public DNS
      return ips;
    }
  }

  return [];
}

/**
 * Resolves a hostname to a safe public IP address.
 * Uses OS DNS first if it returns a clean public IP (unless forceDoh is set),
 * and falls back to DNS-over-HTTPS when OS DNS returns a poisoned private/loopback IP or fails.
 */
export async function resolveCleanPublicIp(
  hostname: string,
  forceDoh = false
): Promise<string | null> {
  const cleanHost = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIP(cleanHost) !== 0) {
    return isPrivateOrReservedIp(cleanHost) ? null : cleanHost;
  }

  const isFrequentlyPoisonedDomain =
    cleanHost.includes('bilibili.tv') ||
    cleanHost.includes('bilibili.com') ||
    cleanHost.includes('b23.tv') ||
    cleanHost.includes('bilivideo.com') ||
    cleanHost.includes('bstarstatic.com') ||
    cleanHost.includes('hdslb.com');

  if (!forceDoh && !isFrequentlyPoisonedDomain) {
    try {
      const records = await dns.lookup(cleanHost, { all: true });
      const validPublic = records.find((r) => !isPrivateOrReservedIp(r.address));
      const hasPoisoned = records.some((r) => isPrivateOrReservedIp(r.address));
      if (validPublic && !hasPoisoned) {
        return validPublic.address;
      }
    } catch {
      // Fall through to DoH
    }
  }

  const dohIps = await resolveHostViaDoh(cleanHost);
  const publicDohIp = dohIps.find((ip) => !isPrivateOrReservedIp(ip));
  return publicDohIp || null;
}

/**
 * Lightweight local loopback HTTP/HTTPS CONNECT proxy that resolves domains via DNS-over-HTTPS
 * whenever ISP DNS is poisoned/sinkholed (e.g., returning 127.0.0.1 or 10.x.x.x for bilibili.tv).
 */
export class LocalDohProxyServer {
  private server: http.Server | null = null;
  private proxyUrl: string | null = null;
  private startingPromise: Promise<string | null> | null = null;

  public async ensureStarted(): Promise<string | null> {
    if (this.proxyUrl) return this.proxyUrl;
    if (this.startingPromise) return this.startingPromise;

    this.startingPromise = new Promise<string | null>((resolve) => {
      const srv = http.createServer(async (req, res) => {
        try {
          if (!req.url) {
            res.writeHead(400);
            res.end('Bad Request');
            return;
          }
          const parsed = new URL(req.url);
          const port = parsed.port ? Number(parsed.port) : 80;
          const targetIp = await resolveCleanPublicIp(parsed.hostname);
          if (!targetIp) {
            res.writeHead(502);
            res.end(`DoH proxy could not resolve a safe public IP for ${parsed.hostname}`);
            return;
          }

          const proxyReq = http.request(
            {
              host: targetIp,
              port,
              method: req.method,
              path: parsed.pathname + parsed.search,
              headers: {
                ...req.headers,
                host: parsed.host,
              },
            },
            (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
              proxyRes.pipe(res);
            }
          );

          proxyReq.on('error', () => {
            if (!res.headersSent) {
              res.writeHead(502);
            }
            res.end();
          });

          req.pipe(proxyReq);
        } catch {
          if (!res.headersSent) {
            res.writeHead(502);
          }
          res.end();
        }
      });

      srv.on('connect', async (req, clientSocket, head) => {
        try {
          const rawAuthority = req.url || '';
          const lastColon = rawAuthority.lastIndexOf(':');
          const host =
            lastColon > 0 ? rawAuthority.slice(0, lastColon) : rawAuthority;
          const port =
            lastColon > 0 ? Number(rawAuthority.slice(lastColon + 1)) || 443 : 443;

          const targetIp = await resolveCleanPublicIp(host);
          if (!targetIp) {
            clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            clientSocket.destroy();
            return;
          }

          const serverSocket = net.connect(port, targetIp, () => {
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            if (head && head.length > 0) {
              serverSocket.write(head);
            }
            serverSocket.pipe(clientSocket);
            clientSocket.pipe(serverSocket);
          });

          serverSocket.setTimeout(25000, () => {
            serverSocket.destroy();
            clientSocket.destroy();
          });

          serverSocket.on('error', () => {
            clientSocket.destroy();
          });

          clientSocket.on('error', () => {
            serverSocket.destroy();
          });
        } catch {
          clientSocket.destroy();
        }
      });

      srv.on('error', () => {
        this.startingPromise = null;
        resolve(null);
      });

      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        if (addr && typeof addr === 'object') {
          this.server = srv;
          this.proxyUrl = `http://127.0.0.1:${addr.port}`;
          resolve(this.proxyUrl);
        } else {
          resolve(null);
        }
      });
    });

    return this.startingPromise;
  }
}

export const sharedLocalDohProxy = new LocalDohProxyServer();
