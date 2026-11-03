import React, { useMemo, useState } from 'react';
import {
  Search,
  ClipboardPaste,
  X,
  Loader2,
  AlertCircle,
  ArrowRight,
  Film,
  Layers,
  GlobeLock,
  Check,
  Play,
} from 'lucide-react';
import {
  AppSettings,
  BulkQueueRequest,
  BulkQueueResult,
  ContainerFormat,
  DownloadJob,
  FormatSelectionRequest,
  MediaAnalysisResult,
  QualityPreset,
  SampleTestSource,
} from '../../shared/types';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { DownloadCard } from '../components/DownloadCard';

interface HomePageProps {
  urlInput: string;
  onUrlChange: (val: string) => void;
  isAnalyzing: boolean;
  isBulkQueuing: boolean;
  analysisError: string | null;
  onClearError: () => void;
  currentAnalysis: MediaAnalysisResult | null;
  onClearAnalysis: () => void;
  onAnalyze: (targetUrl?: string) => Promise<MediaAnalysisResult | null>;
  onStartDownload: (req: FormatSelectionRequest) => Promise<unknown>;
  onBulkEnqueue: (req: BulkQueueRequest) => Promise<BulkQueueResult | null>;
  onUpdateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  jobs: DownloadJob[];
  settings: AppSettings | null;
  sampleSources: SampleTestSource[];
  onPauseJob: (jobId: string) => void;
  onResumeJob: (jobId: string) => void;
  onCancelJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
  onOpenFile: (filePath: string) => void;
  onPreviewFile: (job: DownloadJob) => void;
  onOpenFolder: (filePath: string) => void;
  onNavigateDownloads: () => void;
  onShowToast?: (text: string, type?: 'info' | 'error' | 'success') => void;
}

export function extractValidUrlsFromText(rawText: string): string[] {
  const tokens = rawText
    .split(/[\r\n\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    try {
      const parsed = new URL(token);
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        !seen.has(parsed.toString())
      ) {
        seen.add(parsed.toString());
        valid.push(parsed.toString());
      }
    } catch {
      // Ignore non-URL token
    }
  }
  return valid;
}

export const HomePage: React.FC<HomePageProps> = ({
  urlInput,
  onUrlChange,
  isAnalyzing,
  isBulkQueuing,
  analysisError,
  onClearError,
  currentAnalysis,
  onClearAnalysis,
  onAnalyze,
  onStartDownload,
  onBulkEnqueue,
  onUpdateSettings,
  jobs,
  settings,
  sampleSources,
  onPauseJob,
  onResumeJob,
  onCancelJob,
  onRetryJob,
  onOpenFile,
  onPreviewFile,
  onOpenFolder,
  onNavigateDownloads,
  onShowToast,
}) => {
  const [inputMode, setInputMode] = useState<'single' | 'bulk'>('single');
  const [workspaceTab, setWorkspaceTab] = useState<'analysis' | 'queue'>('analysis');
  const [bulkText, setBulkText] = useState<string>('');
  const [bulkQuality, setBulkQuality] = useState<QualityPreset>(
    settings?.defaultResolution || 'best'
  );
  const [bulkContainer, setBulkContainer] = useState<ContainerFormat>(
    settings?.defaultOutputFormat || 'mp4'
  );
  const [bulkAudioConvert, setBulkAudioConvert] = useState<'none' | 'mp3' | 'm4a'>(
    settings?.audioConversionPreference || 'none'
  );
  const [bulkSummary, setBulkSummary] = useState<BulkQueueResult | null>(null);
  const [localValidationMsg, setLocalValidationMsg] = useState<string | null>(null);

  // Blocked Websites / Regional Proxy drawer state
  const [showUnblockBar, setShowUnblockBar] = useState<boolean>(false);
  const [proxyDraft, setProxyDraft] = useState<string>(settings?.proxyUrl || '');
  const [geoCountryDraft, setGeoCountryDraft] = useState<string>(
    settings?.geoBypassCountry || 'auto'
  );

  // Filter ONLY currently active/paused/downloading jobs (never show completed/downloaded files here)
  const activeDownloadingJobs = useMemo(() => {
    return jobs.filter(
      (j) =>
        j.state === 'queued' ||
        j.state === 'analyzing' ||
        j.state === 'downloading' ||
        j.state === 'pausing' ||
        j.state === 'paused' ||
        j.state === 'merging' ||
        j.state === 'converting' ||
        j.state === 'cancelling'
    );
  }, [jobs]);

  const parsedBulkUrls = useMemo(() => extractValidUrlsFromText(bulkText), [bulkText]);

  const validateAndSubmitSingle = async (customUrl?: string) => {
    const candidate = (customUrl ?? urlInput).trim();
    setLocalValidationMsg(null);
    setBulkSummary(null);
    onClearError();

    if (!candidate) {
      setLocalValidationMsg('Enter an HTTP or HTTPS video URL to analyze.');
      return;
    }

    // If user pasted multiple URLs into single input, switch to bulk mode automatically
    const detectedMulti = extractValidUrlsFromText(candidate);
    if (detectedMulti.length > 1) {
      setInputMode('bulk');
      setBulkText(detectedMulti.join('\n'));
      return;
    }

    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setLocalValidationMsg('Only http:// and https:// URLs are permitted.');
        return;
      }
    } catch {
      setLocalValidationMsg('Invalid URL format. Include https:// or http:// at the beginning.');
      return;
    }

    const res = await onAnalyze(candidate);
    if (res) {
      setWorkspaceTab('analysis');
    }
  };

  const handleBulkSubmit = async () => {
    setLocalValidationMsg(null);
    setBulkSummary(null);
    onClearError();

    if (parsedBulkUrls.length === 0) {
      setLocalValidationMsg(
        'Paste one or more valid http:// or https:// video URLs (one per line or space-separated).'
      );
      return;
    }

    const res = await onBulkEnqueue({
      urls: parsedBulkUrls,
      qualityPreset: bulkQuality,
      targetContainer: bulkContainer,
      convertAudioTo: bulkAudioConvert,
    });

    if (res) {
      setBulkSummary(res);
      if (res.failedCount === 0) {
        setBulkText('');
      }
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) return;
      const trimmed = text.trim();
      const urls = extractValidUrlsFromText(trimmed);

      if (inputMode === 'bulk' || urls.length > 1) {
        setInputMode('bulk');
        setBulkText((prev) => (prev.trim() ? `${prev.trim()}\n${trimmed}` : trimmed));
      } else {
        onUrlChange(trimmed);
      }
      setLocalValidationMsg(null);
    } catch {
      setLocalValidationMsg('Clipboard read permission was denied. Use Ctrl+V in the input field.');
    }
  };

  const handleClearInput = () => {
    if (inputMode === 'bulk') {
      setBulkText('');
      setBulkSummary(null);
    } else {
      onUrlChange('');
      onClearAnalysis();
    }
    setLocalValidationMsg(null);
    onClearError();
  };

  const handleKeyDownSingle = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isAnalyzing) {
      e.preventDefault();
      void validateAndSubmitSingle();
    }
  };

  const handleSaveUnblockConfig = async () => {
    await onUpdateSettings({
      proxyUrl: proxyDraft.trim(),
      geoBypassCountry: geoCountryDraft,
    });
    setShowUnblockBar(false);
  };

  const hasActiveProxyOrGeo = Boolean(
    (settings?.proxyUrl && settings.proxyUrl.trim()) ||
      (settings?.geoBypassCountry &&
        settings.geoBypassCountry !== 'auto' &&
        settings.geoBypassCountry !== 'none')
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      {/* Top Link Bar (Single URL / Bulk URLs + Blocked Website Proxy Option) */}
      <section
        aria-label="Media URL Input and Bulk Queue"
        className="shrink-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Mode Switcher: Single URL vs Bulk Paste URLs */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => {
                setInputMode('single');
                setLocalValidationMsg(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                inputMode === 'single'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Search className="h-3.5 w-3.5" />
              <span>Single URL</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInputMode('bulk');
                setLocalValidationMsg(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                inputMode === 'bulk'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Bulk Paste URLs</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Sample Buttons */}
            {sampleSources.length > 0 && inputMode === 'single' && (
              <div className="hidden items-center gap-1.5 xl:flex">
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                  Test Streams:
                </span>
                {sampleSources.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => {
                      onUrlChange(sample.url);
                      void validateAndSubmitSingle(sample.url);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:border-sky-500 hover:text-sky-600 whitespace-nowrap shrink-0 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:text-sky-400"
                  >
                    <Film className="h-3 w-3 text-sky-500" />
                    <span>{sample.label.split('(')[0].trim()}</span>
                  </button>
                ))}
              </div>
            )}

            {sampleSources.length > 0 && inputMode === 'bulk' && (
              <button
                type="button"
                onClick={() => {
                  setBulkText(sampleSources.map((s) => s.url).join('\n'));
                  setLocalValidationMsg(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:border-sky-500 hover:text-sky-600 whitespace-nowrap dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
              >
                <Film className="h-3 w-3 text-sky-500" />
                <span>Load Sample URL List ({sampleSources.length})</span>
              </button>
            )}

            {/* Blocked Websites / Proxy & Regional Bypass Toggle */}
            <button
              type="button"
              onClick={() => {
                setProxyDraft(settings?.proxyUrl || '');
                setGeoCountryDraft(settings?.geoBypassCountry || 'auto');
                setShowUnblockBar((prev) => !prev);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                hasActiveProxyOrGeo || showUnblockBar
                  ? 'border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-500/70 dark:bg-sky-950/50 dark:text-sky-300'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'
              }`}
            >
              <GlobeLock className="h-3.5 w-3.5 text-sky-500" />
              <span>
                {hasActiveProxyOrGeo
                  ? `Unblock Active (${settings?.proxyUrl ? 'Proxy' : settings?.geoBypassCountry})`
                  : 'Unblock / Proxy (Bilibili & Blocked Sites)'}
              </span>
            </button>
          </div>
        </div>

        {/* Collapsible Unblock / Regional Proxy Configuration Bar */}
        {showUnblockBar && (
          <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/50 p-3 dark:border-sky-900/50 dark:bg-slate-950">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex-1">
                <label
                  htmlFor="home-proxy-input"
                  className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                >
                  HTTP / SOCKS5 Proxy for Blocked Websites (e.g., Bilibili in Pakistan)
                </label>
                <input
                  id="home-proxy-input"
                  type="text"
                  value={proxyDraft}
                  onChange={(e) => setProxyDraft(e.target.value)}
                  placeholder="socks5://127.0.0.1:1080 or http://127.0.0.1:7890 (leave empty for direct)"
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="w-full lg:w-56">
                <label
                  htmlFor="home-geo-select"
                  className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                >
                  Geo-Bypass Region (X-Forwarded-For)
                </label>
                <select
                  id="home-geo-select"
                  value={geoCountryDraft}
                  onChange={(e) => setGeoCountryDraft(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="auto">Auto Geo-Bypass (US)</option>
                  <option value="SG">Singapore (SG — Fast Asia)</option>
                  <option value="HK">Hong Kong (HK — Bilibili/Asia)</option>
                  <option value="CN">China Mainland (CN — Bilibili)</option>
                  <option value="GB">United Kingdom (GB)</option>
                  <option value="JP">Japan (JP)</option>
                  <option value="none">Disabled</option>
                </select>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleSaveUnblockConfig()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Save Unblock Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowUnblockBar(false)}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mode 1: Single URL Input Bar */}
        {inputMode === 'single' ? (
          <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="url"
                value={urlInput}
                onChange={(e) => {
                  onUrlChange(e.target.value);
                  if (localValidationMsg) setLocalValidationMsg(null);
                }}
                onKeyDown={handleKeyDownSingle}
                placeholder="Paste a video URL (YouTube, Bilibili, Vimeo, direct MP4/M3U8) or switch to Bulk Paste..."
                aria-label="Video URL Input"
                className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pr-10 pl-10 font-mono text-xs text-slate-900 caret-sky-500 placeholder:font-sans placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:text-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-500 dark:focus:bg-slate-900 dark:focus:text-slate-100"
              />
              {urlInput && (
                <button
                  type="button"
                  onClick={handleClearInput}
                  title="Clear URL"
                  aria-label="Clear URL input"
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
                <span>Paste</span>
              </button>

              <button
                type="button"
                onClick={handleClearInput}
                disabled={!urlInput && !currentAnalysis}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <span>Clear</span>
              </button>

              <button
                type="button"
                onClick={() => void validateAndSubmitSingle()}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-sky-500 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <span>Analyze URL</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Mode 2: Bulk URL Paste & Queue */
          <div className="mt-3 space-y-2.5">
            <div className="relative">
              <textarea
                rows={3}
                value={bulkText}
                onChange={(e) => {
                  setBulkText(e.target.value);
                  if (localValidationMsg) setLocalValidationMsg(null);
                }}
                placeholder={
                  'Paste multiple video URLs here (one URL per line or separated by spaces)...\nhttps://example.com/video-1.mp4\nhttps://www.bilibili.com/video/BV...'
                }
                aria-label="Bulk Video URLs Input"
                className="w-full resize-none rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-900 caret-sky-500 placeholder:font-sans placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:text-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-500 dark:focus:bg-slate-900 dark:focus:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {parsedBulkUrls.length} valid URL{parsedBulkUrls.length === 1 ? '' : 's'} detected
                </span>

                <select
                  aria-label="Bulk Quality Preset"
                  value={bulkQuality}
                  onChange={(e) => setBulkQuality(e.target.value as QualityPreset)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="best">Quality: Best Available</option>
                  <option value="2160p">Quality: 2160p (4K)</option>
                  <option value="1440p">Quality: 1440p (QHD)</option>
                  <option value="1080p">Quality: 1080p (Full HD)</option>
                  <option value="720p">Quality: 720p (HD)</option>
                  <option value="480p">Quality: 480p</option>
                  <option value="360p">Quality: 360p</option>
                  <option value="audio_only">Quality: Audio Only</option>
                </select>

                <select
                  aria-label="Bulk Output Container"
                  value={bulkContainer}
                  onChange={(e) => setBulkContainer(e.target.value as ContainerFormat)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="mp4">Container: MP4</option>
                  <option value="mkv">Container: MKV</option>
                  <option value="webm">Container: WebM</option>
                  <option value="original">Container: Original</option>
                </select>

                <select
                  aria-label="Bulk Audio Conversion"
                  value={bulkAudioConvert}
                  onChange={(e) =>
                    setBulkAudioConvert(e.target.value as 'none' | 'mp3' | 'm4a')
                  }
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="none">Audio: Keep Original</option>
                  <option value="mp3">Audio: Convert to MP3</option>
                  <option value="m4a">Audio: Convert to M4A</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  <span>Paste List</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearInput}
                  disabled={!bulkText}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <span>Clear</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleBulkSubmit()}
                  disabled={isBulkQueuing || parsedBulkUrls.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500 disabled:opacity-50 whitespace-nowrap"
                >
                  {isBulkQueuing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Analyzing & Queuing ({parsedBulkUrls.length})...</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      <span>Queue All Downloads ({parsedBulkUrls.length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {bulkSummary && bulkSummary.failedCount > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="font-semibold">
                  Queued {bulkSummary.queuedCount} of {bulkSummary.total} URLs. {bulkSummary.failedCount} failed:
                </p>
                <ul className="mt-1 max-h-20 list-disc space-y-0.5 overflow-y-auto pl-4 font-mono text-[11px]">
                  {bulkSummary.results
                    .filter((r) => !r.ok)
                    .map((r) => (
                      <li key={r.url}>
                        {r.url} — {r.error}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Validation or Extraction Error Alert */}
        {(localValidationMsg || analysisError) && (
          <div
            role="alert"
            className="mt-2.5 flex items-center justify-between gap-2.5 rounded-lg border border-red-300 bg-red-50/80 px-3 py-2 text-xs text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="truncate font-medium">{localValidationMsg || analysisError}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setLocalValidationMsg(null);
                onClearError();
              }}
              className="shrink-0 rounded p-0.5 hover:bg-red-200/40 dark:hover:bg-red-900/40"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </section>

      {/* Main Workspace Area Below Link Bar */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        {/* Format Selector when a single URL has been analyzed and analysis tab is active */}
        {currentAnalysis && workspaceTab === 'analysis' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <AnalysisPanel
              analysis={currentAnalysis}
              settings={settings}
              onStartDownload={async (req) => {
                await onStartDownload(req);
                setWorkspaceTab('queue');
              }}
              onCloseAnalysis={() => {
                if (activeDownloadingJobs.length > 0) {
                  setWorkspaceTab('queue');
                } else {
                  onClearAnalysis();
                }
              }}
              onShowToast={onShowToast}
            />
          </div>
        ) : (
          /* Row of Current Downloading Files Only (Completed / Downloaded files are excluded) */
          <section
            aria-label="Current Downloading Files"
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Current Downloading Files
                </h2>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  ({activeDownloadingJobs.length} active)
                </span>
              </div>

              <div className="flex items-center gap-3">
                {currentAnalysis && (
                  <button
                    type="button"
                    onClick={() => setWorkspaceTab('analysis')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/60 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 whitespace-nowrap shrink-0 dark:bg-sky-950/50 dark:text-sky-300"
                  >
                    <Film className="h-3.5 w-3.5" />
                    <span>
                      Return to Format Selector ({currentAnalysis.formats.length} formats)
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onNavigateDownloads}
                  className="text-xs font-medium text-sky-600 hover:underline whitespace-nowrap shrink-0 dark:text-sky-400"
                >
                  Open Downloads Tab ({jobs.length})
                </button>
              </div>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {activeDownloadingJobs.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    No files are currently downloading
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Paste a single URL or switch to Bulk Paste URLs above to start downloading. Completed files move automatically to the Downloads tab.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {activeDownloadingJobs.map((job) => (
                    <DownloadCard
                      key={job.jobId}
                      job={job}
                      onPause={onPauseJob}
                      onResume={onResumeJob}
                      onCancel={onCancelJob}
                      onRetry={onRetryJob}
                      onOpenFile={onOpenFile}
                      onPreviewFile={onPreviewFile}
                      onOpenFolder={onOpenFolder}
                      onShowToast={onShowToast}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
