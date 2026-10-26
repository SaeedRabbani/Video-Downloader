import { AppError, ErrorCode } from '../../shared/errors/taxonomy';
import {
  ExtractorCapabilities,
  ExtractorContract,
  FormatSelectionRequest,
  MediaAnalysisResult,
  MediaFormat,
  QualityPreset,
} from '../../shared/types';
import { UrlValidationOptions, validateMediaUrl } from '../security/urlValidator';

const PRESET_HEIGHT_MAP: Partial<Record<QualityPreset, number>> = {
  '2160p': 2160,
  '1440p': 1440,
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
  '360p': 360,
};

/**
 * Selects the exact format (and companion audio format if separate video+audio streams are used)
 * from the verified analysis result without silently substituting a substantially lower quality.
 */
export function selectVerifiedFormats(
  analysis: MediaAnalysisResult,
  request: FormatSelectionRequest
): { primaryFormat: MediaFormat; companionAudioFormat: MediaFormat | null } {
  const { formats } = analysis;
  if (!formats || formats.length === 0) {
    throw new AppError(ErrorCode.UNAVAILABLE_MEDIA, 'Analysis contains no selectable formats.');
  }

  // 1. If an explicit formatId was provided, verify it exists in the analysis
  if (request.formatId && request.formatId !== 'auto') {
    const exact = formats.find((f) => f.formatId === request.formatId);
    if (!exact) {
      throw new AppError(
        ErrorCode.INVALID_FORMAT_ID,
        `Requested format ID "${request.formatId}" does not exist in the analysis result for "${analysis.title}".`
      );
    }

    let companionAudio: MediaFormat | null = null;
    if (exact.requiresMerge) {
      if (request.audioFormatId) {
        companionAudio = formats.find((f) => f.formatId === request.audioFormatId && f.hasAudio) || null;
        if (!companionAudio) {
          throw new AppError(
            ErrorCode.INVALID_FORMAT_ID,
            `Requested companion audio format ID "${request.audioFormatId}" is invalid.`
          );
        }
      } else {
        companionAudio =
          formats
            .filter((f) => f.streamType === 'audio_only')
            .sort((a, b) => (b.abrKbps || b.tbrKbps || 0) - (a.abrKbps || a.tbrKbps || 0))[0] ||
          formats.find((f) => f.hasAudio) ||
          null;
      }
    }

    return { primaryFormat: exact, companionAudioFormat: companionAudio };
  }

  // 2. Preset-based selection
  if (request.qualityPreset === 'audio_only') {
    const audioFormats = formats
      .filter((f) => f.streamType === 'audio_only' || f.hasAudio)
      .sort((a, b) => {
        if (a.streamType === 'audio_only' && b.streamType !== 'audio_only') return -1;
        if (b.streamType === 'audio_only' && a.streamType !== 'audio_only') return 1;
        return (b.abrKbps || b.tbrKbps || 0) - (a.abrKbps || a.tbrKbps || 0);
      });

    if (audioFormats.length === 0) {
      throw new AppError(ErrorCode.INVALID_FORMAT_ID, 'No audio stream is available for this source.');
    }
    return { primaryFormat: audioFormats[0], companionAudioFormat: null };
  }

  const targetHeight = PRESET_HEIGHT_MAP[request.qualityPreset];
  const videoFormats = formats.filter((f) => f.hasVideo);
  if (videoFormats.length === 0) {
    throw new AppError(ErrorCode.INVALID_FORMAT_ID, 'No video streams are available for this source.');
  }

  const sortedVideoFormats = [...videoFormats].sort((a, b) => {
    const hDiff = (b.height || 0) - (a.height || 0);
    if (hDiff !== 0) return hDiff;
    const aMissingPot = (a.formatNote || '').toUpperCase().includes('MISSING POT') ? 1 : 0;
    const bMissingPot = (b.formatNote || '').toUpperCase().includes('MISSING POT') ? 1 : 0;
    if (aMissingPot !== bMissingPot) return aMissingPot - bMissingPot;
    const fpsDiff = (b.fps || 0) - (a.fps || 0);
    if (fpsDiff !== 0) return fpsDiff;
    return (b.tbrKbps || 0) - (a.tbrKbps || 0);
  });

  let chosenVideo: MediaFormat | undefined;

  if (targetHeight) {
    // Do not silently substitute a different resolution if a specific height was requested
    chosenVideo = sortedVideoFormats.find((f) => f.height === targetHeight);
    if (!chosenVideo) {
      throw new AppError(
        ErrorCode.INVALID_FORMAT_ID,
        `Requested resolution ${request.qualityPreset} is not available from this source. Available: ${analysis.availableResolutions.join(', ') || 'none'}.`
      );
    }
  } else {
    // 'best' or 'highest_resolution'
    chosenVideo = sortedVideoFormats[0];
  }

  let companionAudio: MediaFormat | null = null;
  if (chosenVideo.requiresMerge) {
    companionAudio =
      formats
        .filter((f) => f.streamType === 'audio_only')
        .sort((a, b) => (b.abrKbps || b.tbrKbps || 0) - (a.abrKbps || a.tbrKbps || 0))[0] || null;
  }

  return { primaryFormat: chosenVideo, companionAudioFormat: companionAudio };
}

export class ExtractorEngine {
  private readonly extractors: ExtractorContract[] = [];
  private readonly analysisCache = new Map<string, MediaAnalysisResult>();

  constructor(private readonly urlValidationOptions?: UrlValidationOptions) {}

  public registerExtractor(extractor: ExtractorContract): void {
    this.extractors.push(extractor);
  }

  public getCapabilitiesList(): ExtractorCapabilities[] {
    return this.extractors.map((e) => e.getCapabilities());
  }

  public resolveExtractorForUrl(url: string): ExtractorContract {
    for (const extractor of this.extractors) {
      if (extractor.canHandle(url)) {
        return extractor;
      }
    }
    throw new AppError(ErrorCode.UNSUPPORTED_WEBSITE);
  }

  public async analyzeUrl(url: string): Promise<MediaAnalysisResult> {
    const validatedUrl = await validateMediaUrl(url, this.urlValidationOptions);
    const extractor = this.resolveExtractorForUrl(validatedUrl.toString());
    const result = await extractor.analyze(validatedUrl.toString());
    this.analysisCache.set(result.analysisId, result);
    // Keep cache bounded to 100 entries
    if (this.analysisCache.size > 100) {
      const oldestKey = this.analysisCache.keys().next().value;
      if (oldestKey) this.analysisCache.delete(oldestKey);
    }
    return result;
  }

  public getStoredAnalysis(analysisId: string): MediaAnalysisResult {
    const cached = this.analysisCache.get(analysisId);
    if (!cached) {
      throw new AppError(
        ErrorCode.INVALID_FORMAT_ID,
        'Analysis session expired or was not found. Please analyze the URL again.'
      );
    }
    return cached;
  }

  public getExtractorById(extractorId: string): ExtractorContract {
    const found = this.extractors.find((e) => e.getCapabilities().id === extractorId);
    if (!found) {
      throw new AppError(ErrorCode.UNSUPPORTED_WEBSITE, `Extractor "${extractorId}" is not registered.`);
    }
    return found;
  }
}
