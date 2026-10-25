import { AppError, ErrorCode } from '../../shared/errors/taxonomy';
import { ALLOWED_INVOKE_CHANNELS } from '../../shared/events/channels';

export interface IpcSenderFrameLike {
  url?: string;
  parent?: unknown | null;
}

export interface IpcMainInvokeEventLike {
  senderFrame?: IpcSenderFrameLike | null;
}

/**
 * Validates that an IPC invocation comes from the top-level main application window frame
 * and targets an allowlisted IPC channel.
 */
export function validateIpcSender(
  event: IpcMainInvokeEventLike,
  channel: string,
  allowedOrigins: string[] = ['file://', 'http://localhost:3000', 'http://127.0.0.1:3000']
): boolean {
  if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
    throw new AppError(
      ErrorCode.PERMISSION_DENIED,
      `Blocked unauthorized IPC channel "${channel}".`
    );
  }

  const frame = event?.senderFrame;
  if (!frame || typeof frame.url !== 'string' || !frame.url) {
    throw new AppError(ErrorCode.PERMISSION_DENIED, 'Missing IPC sender frame identity.');
  }

  // Reject subframes / iframes inside the Electron window
  if (frame.parent !== undefined && frame.parent !== null) {
    throw new AppError(ErrorCode.PERMISSION_DENIED, 'Subframe IPC calls are forbidden.');
  }

  const frameUrl = frame.url;
  if (frameUrl.startsWith('file://')) {
    return true;
  }

  try {
    const parsed = new URL(frameUrl);
    if (allowedOrigins.includes(parsed.origin)) {
      return true;
    }
  } catch {
    // Fall through to error
  }

  throw new AppError(
    ErrorCode.PERMISSION_DENIED,
    `Untrusted IPC sender origin: "${frameUrl}".`
  );
}
