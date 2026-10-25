import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Film,
  Music,
  Info,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import {
  AppSettings,
  ContainerFormat,
  FormatSelectionRequest,
  MediaAnalysisResult,
  MediaFormat,
  QualityPreset,
} from '../../shared/types';
import { formatBytes, formatDuration } from '../utils/formatters';

interface AnalysisPanelProps {
  analysis: MediaAnalysisResult;
  settings: AppSettings | null;
  onStartDownload: (request: FormatSelectionRequest) => Promise<unknown>;
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

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  analysis,
  settings,
  onStartDownload,
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
  const [imgFailed, setImgFailed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const supportedPresets = useMemo(() => {
    const hasVideo = analysis.formats.some((f) => f.hasVideo);
    const hasAudio = analysis.formats.some((f) => f.hasAudio || f.streamType === 'audio_only');
    const heights = new Set(
      analysis.formats.filter((f) => f.height !== null).map((f) => f.height as number)
    );

    return PRESET_DEFINITIONS.filter((preset) => {
      if (preset.id === 'best' || preset.id === 'highest_resolution') return hasVideo || hasAudio;
      if (preset.id === 'audio_only') return hasAudio;
      if (preset.height) return heights.has(preset.height);
      return false;
    });
  }, [analysis]);

  const audioOnlyFormats = useMemo(
    () =>
      analysis.formats
        .filter((f) => f.streamType === 'audio_only')
        .sort((a, b) => (b.abrKbps || b.tbrKbps || 0) - (a.abrKbps || a.tbrKbps || 0)),
    [analysis.formats]
  );

  useEffect(() => {
    setImgFailed(false);
    if (audioOnlyFormats.length > 0 && !selectedAudioFormatId) {
      setSelectedAudioFormatId(audioOnlyFormats[0].formatId);
    }

    const findMatchingFormat = (preset: QualityPreset): MediaFormat | undefined => {
      if (preset === 'audio_only') {
        return audioOnlyFormats[0] || analysis.formats.find((f) => f.hasAudio);
      }
      const presetObj = PRESET_DEFINITIONS.find((p) => p.id === preset);
      if (presetObj?.height) {
        return analysis.formats.find((f) => f.height === presetObj.height && f.hasVideo);
      }
      return analysis.formats.find((f) => f.hasVideo) || analysis.formats[0];
    };

    const match = findMatchingFormat(selectedPreset) || analysis.formats[0];
    if (match) {
      setSelectedFormatId(match.formatId);
    }
  }, [analysis, selectedPreset, audioOnlyFormats, selectedAudioFormatId]);

  const activeFormat = useMemo(
    () =>
      analysis.formats.find((f) => f.formatId === selectedFormatId) || analysis.formats[0],
    [analysis.formats, selectedFormatId]
  );

  const companionAudioFormat = useMemo(() => {
    if (!activeFormat?.requiresMerge) return null;
    return (
      audioOnlyFormats.find((f) => f.formatId === selectedAudioFormatId) ||
      audioOnlyFormats[0] ||
      null
    );
  }, [activeFormat, audioOnlyFormats, selectedAudioFormatId]);

  const handlePresetClick = (preset: QualityPreset) => {
    setSelectedPreset(preset);
    if (preset === 'audio_only' && convertAudioTo === 'none') {
      setTargetContainer('m4a');
    } else if (preset !== 'audio_only' && (targetContainer === 'mp3' || targetContainer === 'm4a')) {
      setTargetContainer('mp4');
      setConvertAudioTo('none');
    }
  };

  const handleFormatRowClick = (format: MediaFormat) => {
    setSelectedFormatId(format.formatId);
    if (format.streamType === 'audio_only') {
      setSelectedPreset('audio_only');
    } else if (format.height) {
      const matchingPreset = PRESET_DEFINITIONS.find((p) => p.height === format.height);
      setSelectedPreset(matchingPreset ? matchingPreset.id : 'best');
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

  return (
    <section
      aria-label="Analyzed Media Metadata and Format Selection"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Compact Header Metadata Row */}
      <div className="flex shrink-0 items-center gap-4 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-950 dark:border-slate-800">
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
              <Film className="h-6 w-6 text-sky-400" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>{analysis.domain}</span>
            <span>·</span>
            <span>{analysis.extractorName}</span>
            <span>·</span>
            <span className="font-mono tabular-nums">
              Duration: {formatDuration(analysis.durationSeconds)}
            </span>
          </div>
          <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {analysis.title}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {analysis.diagnosticMessages[0]} · Resolutions:{' '}
              {analysis.availableResolutions.join(', ') || 'Audio'}
            </span>
          </div>
        </div>
      </div>

      {/* Compact Preset & Container Controls */}
      <div className="mt-3 shrink-0 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Quality Preset:
          </span>
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
            {supportedPresets.map((preset) => {
              const isActive = selectedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetClick(preset.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
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
              <option value="mp4">MP4 (H.264/AAC)</option>
              <option value="mkv">MKV (Matroska)</option>
              <option value="webm">WebM (VP9/Opus)</option>
              <option value="original">Original Container</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="audio-convert-select"
              className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
            >
              FFmpeg Audio Conversion
            </label>
            <select
              id="audio-convert-select"
              value={convertAudioTo}
              onChange={(e) => setConvertAudioTo(e.target.value as 'none' | 'mp3' | 'm4a')}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="none">None (Keep Video/Audio)</option>
              <option value="mp3">Convert to MP3</option>
              <option value="m4a">Convert to M4A</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="companion-audio-select"
              className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
            >
              Companion Audio (Merge)
            </label>
            <select
              id="companion-audio-select"
              value={selectedAudioFormatId}
              onChange={(e) => setSelectedAudioFormatId(e.target.value)}
              disabled={!activeFormat?.requiresMerge || audioOnlyFormats.length === 0}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {audioOnlyFormats.length === 0 ? (
                <option value="">Pre-muxed Stream</option>
              ) : (
                audioOnlyFormats.map((af) => (
                  <option key={af.formatId} value={af.formatId}>
                    {af.formatId} ({af.extension.toUpperCase()} · {af.tbrKbps || 128}k)
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Internally Scrollable Stream Format Table */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Format ID</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Resolution</th>
              <th className="px-3 py-2 font-medium">Codecs</th>
              <th className="px-3 py-2 text-right font-medium">FPS</th>
              <th className="px-3 py-2 text-right font-medium">Est. Size</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {analysis.formats.map((fmt) => {
              const isSelected = fmt.formatId === activeFormat?.formatId;
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
                          ? 'A/V'
                          : fmt.streamType === 'video_only'
                          ? 'Video (+Merge)'
                          : 'Audio'}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono font-medium text-slate-900 dark:text-slate-200 tabular-nums">
                    {fmt.resolution}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                    {[fmt.vcodec || '—', fmt.acodec || (fmt.requiresMerge ? '+aac' : '—')].join('/')}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                    {fmt.fps ? `${fmt.fps}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                    {formatBytes(fmt.filesizeBytes ?? fmt.filesizeApproxBytes)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pinned Action Footer */}
      <div className="mt-3 flex shrink-0 items-center justify-between gap-4 border-t border-slate-200 pt-3 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums truncate">
          <Info className="h-3.5 w-3.5 shrink-0 text-sky-500" />
          <span className="truncate">
            {activeFormat?.formatId} · {activeFormat?.resolution} ·{' '}
            {estimatedTotalBytes > 0 ? formatBytes(estimatedTotalBytes) : 'Live stream size'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleDownloadSubmit}
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
                    : activeFormat?.resolution || 'Stream'
                }`}
          </span>
        </button>
      </div>
    </section>
  );
};
