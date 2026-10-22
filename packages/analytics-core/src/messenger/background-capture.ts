/* eslint-disable no-restricted-globals */
import { getGlobalScope } from '../global-scope';
import type { BaseWindowMessenger } from './base-window-messenger';
import {
  BackgroundCaptureSession,
  clearBackgroundCaptureSession,
  uploadBackgroundCapture,
} from './background-capture-session';
import { parseBackgroundCaptureDeviceMode } from './background-capture-types';
import { AMPLITUDE_BACKGROUND_CAPTURE_SCRIPT_URL } from './constants';

/**
 * Brand key set on the messenger instance to track whether background capture
 * has been enabled.
 */
const BG_CAPTURE_BRAND = '__AMPLITUDE_BACKGROUND_CAPTURE__' as const;

/**
 * Enable background capture on a messenger instance.
 * Plugins can call this on a shared messenger instance.
 * The first call registers the handlers; subsequent calls are no-ops.
 *
 * When a capture session is passed (see getBackgroundCaptureSession), the
 * captured snapshot is also uploaded to the session's pre-signed URL, and
 * capture starts on its own if the page has no window.opener to send
 * `initialize-background-capture` (e.g. the page's COOP header severed it).
 *
 * @param messenger - The messenger to enable background capture on
 * @param options.scriptUrl - Override the background capture script URL (optional)
 * @param options.captureSession - Capture session from the page URL (optional)
 */
export function enableBackgroundCapture(
  messenger: BaseWindowMessenger,
  options?: { scriptUrl?: string; captureSession?: BackgroundCaptureSession | null },
): void {
  // Check the brand on the messenger object itself — works across bundle boundaries
  const branded = messenger as unknown as Record<string, unknown>;
  if (branded[BG_CAPTURE_BRAND] === true) {
    return;
  }
  branded[BG_CAPTURE_BRAND] = true;

  const scriptUrl = options?.scriptUrl ?? AMPLITUDE_BACKGROUND_CAPTURE_SCRIPT_URL;
  const captureSession = options?.captureSession ?? null;
  let backgroundCaptureInstance: any = null;

  const onBackgroundCapture = (type: string, backgroundCaptureData: { [key: string]: string | number | null }) => {
    if (type === 'background-capture-complete') {
      messenger.logger?.debug?.('Background capture complete');
      messenger.notify({ action: 'background-capture-complete', data: backgroundCaptureData });

      // A failed capture reports `error`; skip the upload so the user can retry.
      if (captureSession && backgroundCaptureData && !backgroundCaptureData.error) {
        uploadBackgroundCapture(captureSession, backgroundCaptureData)
          .then(() => {
            messenger.logger?.debug?.('Background capture uploaded');
            clearBackgroundCaptureSession();
          })
          .catch(() => {
            messenger.logger?.warn('Failed to upload background capture');
          });
      }
    }
  };

  const initializeBackgroundCapture = (data: unknown) => {
    messenger.logger?.debug?.('Initializing background capture (external script)');
    const resolvedUrl = new URL(scriptUrl, messenger.endpoint).toString();

    const initialDeviceMode =
      data && typeof data === 'object'
        ? parseBackgroundCaptureDeviceMode((data as { deviceMode?: unknown }).deviceMode)
        : undefined;

    messenger
      .loadScriptOnce(resolvedUrl)
      .then(() => {
        messenger.logger?.debug?.('Background capture script loaded (external)');
        // eslint-disable-next-line
        backgroundCaptureInstance = /* istanbul ignore next -- window is always defined in browser */ (
          window as any
        )?.amplitudeBackgroundCapture?.({
          messenger,
          onBackgroundCapture,
          ...(initialDeviceMode !== undefined ? { initialDeviceMode } : {}),
        });
        messenger.notify({ action: 'background-capture-loaded' });
      })
      .catch(() => {
        messenger.logger?.warn('Failed to initialize background capture');
      });
  };

  messenger.registerActionHandler('initialize-background-capture', initializeBackgroundCapture);

  messenger.registerActionHandler('close-background-capture', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    backgroundCaptureInstance?.close?.();
    backgroundCaptureInstance = null;
  });

  // With an opener, the Amplitude app sends initialize-background-capture as
  // before. Without one, nothing would, so start capture from the session.
  if (captureSession && !getGlobalScope()?.opener) {
    initializeBackgroundCapture(captureSession.deviceMode ? { deviceMode: captureSession.deviceMode } : undefined);
  }
}
