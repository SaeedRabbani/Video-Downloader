import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Shield,
  Terminal,
  Scale,
} from 'lucide-react';
import { BinaryStatusReport } from '../../shared/types';

interface AboutPageProps {
  binaryStatus: BinaryStatusReport | null;
}

export const AboutPage: React.FC<AboutPageProps> = ({ binaryStatus }) => {
  const binaries = binaryStatus
    ? [binaryStatus.ytDlp, binaryStatus.ffmpeg, binaryStatus.ffprobe]
    : [];

  return (
    <div className="h-full min-h-0 space-y-6 overflow-y-auto pr-1">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          About Universal Video Downloader — Windows Desktop Edition
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Version 1.0.0 (x64 Windows Desktop Architecture) · Electron + React + TypeScript + SQLite + FFmpeg + yt-dlp
        </p>
      </div>

      {/* Runtime Binary Verification Status */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-sky-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Verified Media Processing & Extraction Binaries
          </h2>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Checked at application startup via safe argument arrays without shell interpolation.
        </p>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Binary</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Detected Version</th>
                <th className="px-4 py-2.5 font-medium">Resolved Path</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono dark:divide-slate-800">
              {binaries.map((bin) => (
                <tr key={bin.name}>
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                    {bin.name}
                  </td>
                  <td className="px-4 py-3 font-sans">
                    {bin.available ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Ready</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                        <XCircle className="h-3.5 w-3.5" />
                        <span>Missing</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {bin.version || bin.error || 'Unavailable'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {bin.resolvedPath || 'Not found'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Security & Architecture Guarantees */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-sky-500" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Electron & Process Security Posture
            </h2>
          </div>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            <li>
              1. <strong>Renderer Isolation</strong>: Configured with <code className="font-mono">contextIsolation: true</code>, <code className="font-mono">nodeIntegration: false</code>, <code className="font-mono">sandbox: true</code>, and strict Content Security Policy headers.
            </li>
            <li>
              2. <strong>Zero Shell Interpolation</strong>: Child processes (<code className="font-mono">yt-dlp</code>, <code className="font-mono">ffmpeg</code>, <code className="font-mono">ffprobe</code>) are invoked exclusively via <code className="font-mono">spawn</code>/<code className="font-mono">execFile</code> with typed argument arrays and <code className="font-mono">shell: false</code>.
            </li>
            <li>
              3. <strong>SSRF & Network Protection</strong>: Blocks private IPv4/IPv6 ranges, loopback addresses, cloud metadata endpoints (<code className="font-mono">169.254.169.254</code>), and DNS rebinding on every HTTP redirect hop.
            </li>
            <li>
              4. <strong>Windows Filesystem Hardening</strong>: Sanitizes reserved device names (<code className="font-mono">CON</code>, <code className="font-mono">NUL</code>, <code className="font-mono">COM1</code>–<code className="font-mono">LPT9</code>), strips forbidden characters, prevents path traversal, and verifies disk space prior to transfer.
            </li>
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-sky-500" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Third-Party Notices & Known Limitations
            </h2>
          </div>
          <div className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            <p>
              <strong>Supported Scope & Limitations</strong>: Extraction depends on source availability, public access permissions, and third-party platform changes. DRM-encrypted streams (Widevine, PlayReady, FairPlay), subscription paywalls, and authenticated private videos are not supported.
            </p>
            <p>
              <strong>FFmpeg & FFprobe</strong>: Licensed under the GNU Lesser General Public License (LGPL) v2.1+ / GPL v2+ depending on build configuration. FFmpeg is a trademark of Fabrice Bellard.
            </p>
            <p>
              <strong>yt-dlp</strong>: Released into the public domain under The Unlicense.
            </p>
            <p>
              <strong>Electron, React & SQLite</strong>: Distributed under the MIT License and Public Domain respectively. Full license texts are bundled in <code className="font-mono">resources/licenses/THIRD_PARTY_NOTICES.md</code>.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};
