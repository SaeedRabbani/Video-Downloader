import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Film,
  Music,
  Info,
  CheckCircle2,
  Layers,
  Copy,
  Check,
  SlidersHorizontal,
  X,
  RotateCcw,
} from 'lucide-react';
import {
  AppSettings,
  ContainerFormat,
  FormatSelectionRequest,
  MediaAnalysisResult,
  MediaFormat,
  MediaStreamType,
  QualityPreset,
} from '../../shared/types';
import { formatBytes, formatDuration } from '../utils/formatters';

interface AnalysisPanelProps {
  analysis: MediaAnalysisResult;
  settings: AppSettings | null;
  onStartDownload: (request: FormatSelectionRequest) => Promise<unknown>;
  onCloseAnalysis?: () => void;
  onShowToast?: (text: string, type?: 'info' | 'error' | 'success') => void;
}

const PRESET_DEFINITIONS: Array<{
  id: QualityPreset;
  label: string;
  height?: number;
}> = [
  { id: 'best', label: 'Best' },
  { id: 'highest_resolution', label: 'Max Res' },
  { id: '2160p', label: '2160p', height: 2160 },
  { id: '1440p', label: '1440p', height: 1440 },
  { id: '1080p', label: '1080p', height: 1080 },
  { id: '720p', label: '720p', height: 720 },
  { id: '480p', label: '480p', height: 480 },
  { id: '360p', label: '360p', height: 360 },
  { id: 'audio_only', label: 'Audio Only' },
];

export function getVideoCodecFamily(vcodec: string | null): string {
  if (!vcodec || vcodec === 'none') return 'None';
  const lower = vcodec.toLowerCase();
  if (lower.startsWith('av01') || lower.includes('av1')) return 'AV1';
  if (lower.startsWith('vp09') || lower.startsWith('vp9')) return 'VP9';
  if (lower.startsWith('vp08') || lower.startsWith('vp8')) return 'VP8';
  if (
    lower.startsWith('hev1') ||
    lower.startsWith('hvc1') ||
    lower.includes('hevc') ||
    lower.includes('h265')
  ) {
    return 'HEVC (H.265)';
  }
  if (lower.startsWith('avc1') || lower.includes('h264')) return 'H.264 (AVC)';
  return vcodec.split('.')[0].toUpperCase();
}

export function getAudioCodecFamily(acodec: string | null): string {
  if (!acodec || acodec === 'none') return 'None';
  const lower = acodec.toLowerCase();
  if (lower.startsWith('mp4a') || lower.includes('aac')) return 'AAC';
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('vorbis')) return 'Vorbis';
  if (lower.includes('mp3')) return 'MP3';
  if (lower.includes('flac')) return 'FLAC';
  if (lower.includes('ec-3') || lower.includes('ac-3')) return 'Dolby AC-3';
  return acodec.split('.')[0].toUpperCase();
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  analysis,
  settings,
  onStartDownload,
  onCloseAnalysis,
  onShowToast,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<QualityPreset>(
    settings?.defaultResolution || 'best'
  );
  const [selectedFormatId, setSelectedFormatId] = useState<string>('');
  const [selectedAudioFormatId, setSelectedAudioFormatId] = useState<string>('');
  const [targetContainer, setTargetContainer] = useState<ContainerFormat>(
    settings?.defaultOutputFormat || 'mp4'
  );
  const [convertAudioTo, setConvertAudioTo] = useState<'none' | 'mp3' | 'm4a'>(
    settings?.audioConversionPreference || 'none'
  );

  // Interactive yt-dlp format filters (Stream Mode, Resolution, Codec)
  const [streamFilter, setStreamFilter] = useState<'all' | MediaStreamType>('all');
  const [resolutionFilter, setResolutionFilter] = useState<string>('all');
  const [codecFilter, setCodecFilter] = useState<string>('all');

  const [imgFailed, setImgFailed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copiedFormatId, setCopiedFormatId] = useState<string | null>(null);
  const [copiedMainLink, setCopiedMainLink] = useState<boolean>(false);

  const audioOnlyFormats = useMemo(
    () =>
      analysis.formats
        .filter((f) => f.streamType === 'audio_only')
        .sort((a, b) => (b.abrKbps || b.tbrKbps || 0) - (a.abrKbps || a.tbrKbps || 0)),
    [analysis.formats]
  );

  // All unique resolutions present across yt-dlp formats (sorted highest to lowest)
  const allAvailableResolutionOptions = useMemo(() => {
    const heights = Array.from(
      new Set(
        analysis.formats
          .filter((f) => f.height !== null && f.height > 0)
          .map((f) => f.height as number)
      )
    ).sort((a, b) => b - a);

    const options = heights.map((h) => `${h}p`);
    if (analysis.formats.some((f) => f.streamType === 'audio_only')) {
      options.push('audio only');
    }
    return options;
  }, [analysis.formats]);

  // All unique video & audio codec families present across yt-dlp formats
  const availableCodecFamilies = useMemo(() => {
    const families = new Set<string>();
    for (const fmt of analysis.formats) {
      if (fmt.vcodec) {
        families.add(getVideoCodecFamily(fmt.vcodec));
      }
      if (fmt.streamType === 'audio_only' && fmt.acodec) {
        families.add(getAudioCodecFamily(fmt.acodec));
      }
    }
    return Array.from(families);
  }, [analysis.formats]);

  const streamCounts = useMemo(() => {
    let combined = 0;
    let videoOnly = 0;
    let audioOnly = 0;
    for (const f of analysis.formats) {
      if (f.streamType === 'combined') combined++;
      else if (f.streamType === 'video_only') videoOnly++;
      else if (f.streamType === 'audio_only') audioOnly++;
    }
    return {
      all: analysis.formats.length,
      combined,
      video_only: videoOnly,
      audio_only: audioOnly,
    };
  }, [analysis.formats]);

  // Initialize default selection when analysis changes
  useEffect(() => {
    setImgFailed(false);
    setStreamFilter('all');
    setResolutionFilter('all');
    setCodecFilter('all');

    if (audioOnlyFormats.length > 0) {
      setSelectedAudioFormatId(audioOnlyFormats[0].formatId);
    } else {
      setSelectedAudioFormatId('');
    }

    const defaultPreset = settings?.defaultResolution || 'best';
    setSelectedPreset(defaultPreset);

    const findBestForPreset = (preset: QualityPreset): MediaFormat | undefined => {
      if (preset === 'audio_only') {
        return audioOnlyFormats[0] || analysis.formats.find((f) => f.hasAudio);
      }
      const presetObj = PRESET_DEFINITIONS.find((p) => p.id === preset);
      if (presetObj?.height) {
        return (
          analysis.formats.find((f) => f.height === presetObj.height && f.hasVideo) ||
          analysis.formats.find((f) => f.hasVideo)
        );
      }
      return analysis.formats.find((f) => f.hasVideo) || analysis.formats[0];
    };

    const initialFormat = findBestForPreset(defaultPreset) || analysis.formats[0];
    if (initialFormat) {
      setSelectedFormatId(initialFormat.formatId);
    }
  }, [analysis, audioOnlyFormats, settings?.defaultResolution]);

  // Filtered formats for table view
  const filteredFormats = useMemo(() => {
    return analysis.formats.filter((fmt) => {
      if (streamFilter !== 'all' && fmt.streamType !== streamFilter) {
        return false;
      }
      if (resolutionFilter !== 'all' && fmt.resolution !== resolutionFilter) {
        return false;
      }
      if (codecFilter !== 'all') {
        const vFam = fmt.vcodec ? getVideoCodecFamily(fmt.vcodec) : '';
        const aFam = fmt.acodec ? getAudioCodecFamily(fmt.acodec) : '';
        if (vFam !== codecFilter && aFam !== codecFilter) {
          return false;
        }
      }
      return true;
    });
  }, [analysis.formats, streamFilter, resolutionFilter, codecFilter]);

  const activeFormat = useMemo(
    () =>
      analysis.formats.find((f) => f.formatId === selectedFormatId) ||
      filteredFormats[0] ||
      analysis.formats[0],
    [analysis.formats, filteredFormats, selectedFormatId]
  );

  const companionAudioFormat = useMemo(() => {
    if (!activeFormat?.requiresMerge) return null;
    return (
      audioOnlyFormats.find((f) => f.formatId === selectedAudioFormatId) ||
      audioOnlyFormats[0] ||
      null
    );
  }, [activeFormat, audioOnlyFormats, selectedAudioFormatId]);

  const syncPresetFromFormat = (fmt: MediaFormat) => {
    if (fmt.streamType === 'audio_only') {
      setSelectedPreset('audio_only');
    } else if (fmt.height) {
      const matchingPreset = PRESET_DEFINITIONS.find((p) => p.height === fmt.height);
      setSelectedPreset(matchingPreset ? matchingPreset.id : 'best');
    } else {
      setSelectedPreset('best');
    }
  };

  const handleResolutionSelect = (resValue: string) => {
    setResolutionFilter(resValue);
    if (resValue === 'all') return;

    if (resValue === 'audio only') {
      setStreamFilter('audio_only');
      setSelectedPreset('audio_only');
      const bestAudio =
        audioOnlyFormats.find(
          (f) => codecFilter === 'all' || getAudioCodecFamily(f.acodec) === codecFilter
        ) || audioOnlyFormats[0];
      if (bestAudio) {
        setSelectedFormatId(bestAudio.formatId);
      }
      return;
    }

    if (streamFilter === 'audio_only') {
      setStreamFilter('all');
    }

    const candidates = analysis.formats.filter(
      (f) =>
        f.resolution === resValue &&
        (codecFilter === 'all' || getVideoCodecFamily(f.vcodec) === codecFilter)
    );
    const chosen =
      candidates[0] || analysis.formats.find((f) => f.resolution === resValue);
    if (chosen) {
      setSelectedFormatId(chosen.formatId);
      syncPresetFromFormat(chosen);
    }
  };

  const handleCodecSelect = (codecValue: string) => {
    setCodecFilter(codecValue);
    if (codecValue === 'all') return;

    const candidates = analysis.formats.filter((f) => {
      const matchesResolution =
        resolutionFilter === 'all' || f.resolution === resolutionFilter;
      const matchesStream = streamFilter === 'all' || f.streamType === streamFilter;
      const matchesCodec =
        getVideoCodecFamily(f.vcodec) === codecValue ||
        getAudioCodecFamily(f.acodec) === codecValue;
      return matchesResolution && matchesStream && matchesCodec;
    });

    const fallbackCandidates = analysis.formats.filter(
      (f) =>
        getVideoCodecFamily(f.vcodec) === codecValue ||
        getAudioCodecFamily(f.acodec) === codecValue
    );

    const chosen = candidates[0] || fallbackCandidates[0];
    if (chosen) {
      setSelectedFormatId(chosen.formatId);
      syncPresetFromFormat(chosen);
    }
  };

  const handleStreamFilterSelect = (mode: 'all' | MediaStreamType) => {
    setStreamFilter(mode);
    if (mode === 'audio_only') {
      setResolutionFilter('all');
      const bestAudio = audioOnlyFormats[0];
      if (bestAudio) {
        setSelectedFormatId(bestAudio.formatId);
        setSelectedPreset('audio_only');
      }
    } else if (mode !== 'all') {
      const firstMatch = analysis.formats.find(
        (f) =>
          f.streamType === mode &&
          (resolutionFilter === 'all' || f.resolution === resolutionFilter) &&
          (codecFilter === 'all' || getVideoCodecFamily(f.vcodec) === codecFilter)
      );
      if (firstMatch) {
        setSelectedFormatId(firstMatch.formatId);
        syncPresetFromFormat(firstMatch);
      }
    }
  };

  const handleFormatRowClick = (format: MediaFormat) => {
    setSelectedFormatId(format.formatId);
    syncPresetFromFormat(format);
    if (format.streamType === 'audio_only' && convertAudioTo === 'none') {
      setTargetContainer(
        format.extension === 'mp3' || format.extension === 'm4a'
          ? (format.extension as ContainerFormat)
          : 'm4a'
      );
    } else if (
      format.streamType !== 'audio_only' &&
      (targetContainer === 'mp3' || targetContainer === 'm4a')
    ) {
      setTargetContainer('mp4');
      setConvertAudioTo('none');
    }
  };

  const handleResetFilters = () => {
    setStreamFilter('all');
    setResolutionFilter('all');
    setCodecFilter('all');
  };

  const copyUrlToClipboard = async (urlToCopy: string, formatIdForBadge?: string) => {
    try {
      await navigator.clipboard.writeText(urlToCopy);
      if (formatIdForBadge) {
        setCopiedFormatId(formatIdForBadge);
        setTimeout(() => {
          setCopiedFormatId((prev) => (prev === formatIdForBadge ? null : prev));
        }, 2000);
      } else {
        setCopiedMainLink(true);
        setTimeout(() => setCopiedMainLink(false), 2000);
      }
      onShowToast?.('Download link copied to clipboard.', 'success');
    } catch {
      onShowToast?.('Could not copy link automatically.', 'error');
    }
  };

  const handleDownloadSubmit = async () => {
    if (!activeFormat || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onStartDownload({
        analysisId: analysis.analysisId,
        url: analysis.sourceUrl,
        formatId: activeFormat.formatId,
        audioFormatId: companionAudioFormat?.formatId || null,
        qualityPreset: selectedPreset,
        targetContainer,
        convertAudioTo,
        preserveOriginal: convertAudioTo === 'none' && targetContainer === 'original',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const estimatedTotalBytes =
    (activeFormat?.filesizeBytes || activeFormat?.filesizeApproxBytes || 0) +
    (companionAudioFormat?.filesizeBytes || companionAudioFormat?.filesizeApproxBytes || 0);

  const activeDirectLink =
    activeFormat?.downloadUrl || analysis.normalizedUrl || analysis.sourceUrl;

  const hasActiveFilters =
    streamFilter !== 'all' || resolutionFilter !== 'all' || codecFilter !== 'all';

  return (
    <section
      aria-label="Analyzed Media Metadata and Format Selection"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Compact Header Metadata Row */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-950 dark:border-slate-800">
            {analysis.thumbnailUrl && !imgFailed ? (
              <img
                src={analysis.thumbnailUrl}
                alt={analysis.title}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-slate-900">
                <Film className="h-5 w-5 text-sky-400" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span>{analysis.domain}</span>
              <span>·</span>
              <span>{analysis.extractorName}</span>
              {analysis.uploader && (
                <>
                  <span>·</span>
                  <span className="truncate">{analysis.uploader}</span>
                </>
              )}
              <span>·</span>
              <span className="font-mono tabular-nums">
                Duration: {formatDuration(analysis.durationSeconds)}
              </span>
            </div>
            <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {analysis.title}
            </h2>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {analysis.formats.length} yt-dlp formats available · Resolutions:{' '}
                {analysis.availableResolutions.join(', ') || 'Audio'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void copyUrlToClipboard(activeDirectLink)}
            title="Copy direct stream download link for the selected format"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {copiedMainLink ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">Copied Link!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-sky-500" />
                <span>Copy Download Link</span>
              </>
            )}
          </button>

          {onCloseAnalysis && (
            <button
              type="button"
              onClick={onCloseAnalysis}
              title="Close format analysis and view active download queue"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" />
              <span>Close</span>
            </button>
          )}
        </div>
      </div>

      {/* Resolution, Codec, Stream Type & Output Container Controls */}
      <div className="mt-3 shrink-0 space-y-2.5">
        {/* Row 1: Stream Type Tabs + Resolution Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Stream Mode Filter */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
            {(
              [
                { id: 'all', label: `All Formats (${streamCounts.all})` },
                { id: 'combined', label: `Combined A/V (${streamCounts.combined})` },
                { id: 'video_only', label: `Adaptive Video (${streamCounts.video_only})` },
                { id: 'audio_only', label: `Audio Only (${streamCounts.audio_only})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleStreamFilterSelect(tab.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  streamFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Interactive Resolution Selector */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
            <span className="px-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Resolution:
            </span>
            <button
              type="button"
              onClick={() => handleResolutionSelect('all')}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                resolutionFilter === 'all'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              All
            </button>
            {allAvailableResolutionOptions.map((res) => {
              const isSelectedRes =
                resolutionFilter === res ||
                (resolutionFilter === 'all' && activeFormat?.resolution === res);
              return (
                <button
                  key={res}
                  type="button"
                  onClick={() => handleResolutionSelect(res)}
                  className={`rounded-md px-2 py-1 font-mono text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    resolutionFilter === res
                      ? 'bg-sky-600 text-white'
                      : isSelectedRes
                      ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {res === 'audio only' ? 'Audio' : res}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Preferred Codec Selector + Output Container + Audio Merge/Conversion */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label
              htmlFor="codec-select"
              className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
            >
              Preferred Codec (yt-dlp)
            </label>
            <select
              id="codec-select"
              value={codecFilter}
              onChange={(e) => handleCodecSelect(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="all">All Codecs ({availableCodecFamilies.join(', ') || 'Auto'})</option>
              {availableCodecFamilies.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="container-select"
              className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
            >
              Output Container
            </label>
            <select
              id="container-select"
              value={targetContainer}
              onChange={(e) => setTargetContainer(e.target.value as ContainerFormat)}
              disabled={convertAudioTo !== 'none'}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="mp4">MP4 (Standard Container)</option>
              <option value="mkv">MKV (Matroska Multi-Codec)</option>
              <option value="webm">WebM (VP9 / AV1 / Opus)</option>
              <option value="original">Original Stream Container</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="companion-audio-select"
              className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
            >
              Companion Audio Stream (Merge)
            </label>
            <select
              id="companion-audio-select"
              value={selectedAudioFormatId}
              onChange={(e) => setSelectedAudioFormatId(e.target.value)}
              disabled={!activeFormat?.requiresMerge || audioOnlyFormats.length === 0}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {audioOnlyFormats.length === 0 ? (
                <option value="">Pre-muxed / Auto Best Audio</option>
              ) : (
                audioOnlyFormats.map((af) => (
                  <option key={af.formatId} value={af.formatId}>
                    #{af.formatId} · {getAudioCodecFamily(af.acodec)} ({af.extension.toUpperCase()} ·{' '}
                    {af.abrKbps || af.tbrKbps || 128}k)
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label
              htmlFor="audio-convert-select"
              className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
            >
              FFmpeg Audio Extraction
            </label>
            <select
              id="audio-convert-select"
              value={convertAudioTo}
              onChange={(e) => setConvertAudioTo(e.target.value as 'none' | 'mp3' | 'm4a')}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="none">None (Keep Video/Audio)</option>
              <option value="mp3">Extract & Convert to MP3</option>
              <option value="m4a">Extract & Convert to M4A</option>
            </select>
          </div>
        </div>
      </div>

      {/* Internally Scrollable Full yt-dlp Format Table */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Format ID</th>
              <th className="px-3 py-2 font-medium">Stream Type</th>
              <th className="px-3 py-2 font-medium">Resolution</th>
              <th className="px-3 py-2 font-medium">Video Codec</th>
              <th className="px-3 py-2 font-medium">Audio Codec</th>
              <th className="px-3 py-2 text-right font-medium">FPS / Bitrate</th>
              <th className="px-3 py-2 text-right font-medium">Est. Size</th>
              <th className="px-3 py-2 text-right font-medium">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredFormats.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <span>No formats match the current resolution/codec filter combination.</span>
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Show All {analysis.formats.length} Formats</span>
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filteredFormats.map((fmt) => {
                const isSelected = fmt.formatId === activeFormat?.formatId;
                const videoCodecLabel = fmt.vcodec ? getVideoCodecFamily(fmt.vcodec) : '—';
                const audioCodecLabel = fmt.acodec
                  ? getAudioCodecFamily(fmt.acodec)
                  : fmt.requiresMerge
                  ? `+ Merge #${companionAudioFormat?.formatId || 'Audio'}`
                  : '—';
                const rowLink = fmt.downloadUrl || analysis.normalizedUrl || analysis.sourceUrl;
                const isRowCopied = copiedFormatId === fmt.formatId;

                return (
                  <tr
                    key={fmt.formatId}
                    onClick={() => handleFormatRowClick(fmt)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-sky-50/90 dark:bg-sky-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <td className="px-3 py-2 font-mono font-medium text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="selectedFormatId"
                          checked={isSelected}
                          onChange={() => handleFormatRowClick(fmt)}
                          aria-label={`Select format ${fmt.formatId}`}
                          className="h-3.5 w-3.5 accent-sky-600"
                        />
                        <span>{fmt.formatId}</span>
                        <span className="text-[11px] uppercase text-slate-400 dark:text-slate-500">
                          {fmt.extension}
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1">
                        {fmt.streamType === 'audio_only' ? (
                          <Music className="h-3 w-3 text-amber-500" />
                        ) : fmt.streamType === 'video_only' ? (
                          <Layers className="h-3 w-3 text-sky-500" />
                        ) : (
                          <Film className="h-3 w-3 text-emerald-500" />
                        )}
                        <span>
                          {fmt.streamType === 'combined'
                            ? 'A/V Combined'
                            : fmt.streamType === 'video_only'
                            ? 'Video (+Merge)'
                            : 'Audio Only'}
                        </span>
                      </span>
                    </td>

                    <td className="px-3 py-2 font-mono font-medium text-slate-900 dark:text-slate-200 tabular-nums">
                      {fmt.resolution}
                      {fmt.width && fmt.height ? (
                        <span className="ml-1.5 text-[11px] font-normal text-slate-400 dark:text-slate-500">
                          ({fmt.width}×{fmt.height})
                        </span>
                      ) : null}
                    </td>

                    <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">
                      {fmt.vcodec ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold">{videoCodecLabel}</span>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            ({fmt.vcodec})
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                      {fmt.acodec ? (
                        <span>
                          {audioCodecLabel} ({fmt.acodec})
                        </span>
                      ) : (
                        <span className="text-sky-600 dark:text-sky-400">{audioCodecLabel}</span>
                      )}
                    </td>

                    <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                      {[
                        fmt.fps ? `${fmt.fps}fps` : null,
                        fmt.tbrKbps ? `${fmt.tbrKbps}k` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>

                    <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                      {formatBytes(fmt.filesizeBytes ?? fmt.filesizeApproxBytes)}
                    </td>

                    <td
                      className="px-3 py-2 text-right"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => void copyUrlToClipboard(rowLink, fmt.formatId)}
                        title="Copy direct stream URL for this format"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-sky-500 hover:text-sky-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:text-sky-400"
                      >
                        {isRowCopied ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-500" />
                            <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pinned Action Footer */}
      <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2 font-mono text-xs text-slate-600 dark:text-slate-400 tabular-nums">
          <Info className="h-3.5 w-3.5 shrink-0 text-sky-500" />
          <span className="truncate">
            Selected: #{activeFormat?.formatId} · {activeFormat?.resolution}
            {activeFormat?.vcodec ? ` · ${getVideoCodecFamily(activeFormat.vcodec)}` : ''}
            {activeFormat?.requiresMerge && companionAudioFormat
              ? ` + #${companionAudioFormat.formatId} (${getAudioCodecFamily(companionAudioFormat.acodec)})`
              : activeFormat?.acodec
              ? ` · ${getAudioCodecFamily(activeFormat.acodec)}`
              : ''}{' '}
            · {estimatedTotalBytes > 0 ? formatBytes(estimatedTotalBytes) : 'Stream size on transfer'}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="ml-2 inline-flex items-center gap-1 font-sans text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
            >
              <SlidersHorizontal className="h-3 w-3" />
              <span>
                Showing {filteredFormats.length}/{analysis.formats.length} (Reset)
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void copyUrlToClipboard(activeDirectLink)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {copiedMainLink ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Link</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => void handleDownloadSubmit()}
            disabled={!activeFormat || isSubmitting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span>
              {isSubmitting
                ? 'Queueing...'
                : `Download ${
                    convertAudioTo !== 'none'
                      ? convertAudioTo.toUpperCase()
                      : `${activeFormat?.resolution || 'Stream'}${
                          activeFormat?.vcodec ? ` (${getVideoCodecFamily(activeFormat.vcodec)})` : ''
                        }`
                  }`}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
};
