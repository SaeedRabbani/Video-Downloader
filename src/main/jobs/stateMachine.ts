import { JobState } from '../../shared/types';

const ALLOWED_TRANSITIONS: Record<JobState, Set<JobState>> = {
  queued: new Set(['analyzing', 'downloading', 'pausing', 'paused', 'cancelling', 'cancelled', 'failed']),
  analyzing: new Set(['downloading', 'pausing', 'paused', 'cancelling', 'cancelled', 'failed']),
  downloading: new Set([
    'downloading',
    'pausing',
    'paused',
    'merging',
    'converting',
    'completed',
    'cancelling',
    'cancelled',
    'failed',
  ]),
  merging: new Set(['merging', 'converting', 'completed', 'cancelling', 'cancelled', 'failed']),
  converting: new Set(['converting', 'completed', 'cancelling', 'cancelled', 'failed']),
  pausing: new Set(['paused', 'cancelling', 'cancelled', 'failed']),
  paused: new Set(['queued', 'downloading', 'cancelling', 'cancelled', 'failed']),
  cancelling: new Set(['cancelled', 'failed']),
  completed: new Set([]), // Terminal unless explicitly retried via resetForRetry
  failed: new Set(['queued']), // Retry transitions failed -> queued
  cancelled: new Set(['queued']), // Retry transitions cancelled -> queued
};

export function canTransitionJobState(from: JobState, to: JobState): boolean {
  if (from === to && (from === 'downloading' || from === 'merging' || from === 'converting')) {
    return true;
  }
  return ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
}

export function assertValidStateTransition(from: JobState, to: JobState): void {
  if (!canTransitionJobState(from, to)) {
    throw new Error(`Invalid job state transition: "${from}" -> "${to}"`);
  }
}

export function isTerminalJobState(state: JobState): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled';
}
