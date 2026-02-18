/* istanbul ignore file */
/* eslint-disable no-restricted-globals */
import type { BaseWindowMessenger } from './base-window-messenger';
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
 * @param messenger - The messenger to enable background capture on
 * @param options.scriptUrl - Override the background capture script URL (optional)
 */
export function enableBackgroundCapture(messenger: BaseWindowMessenger, options?: { scriptUrl?: string }): void {
  // Check the brand on the messenger object itself — works across bundle boundaries
  const branded = messenger as unknown as Record<string, unknown>;
  if (branded[BG_CAPTURE_BRAND] === true) {
    return;
  }
  branded[BG_CAPTURE_BRAND] = true;

  const scriptUrl = options?.scriptUrl ?? AMPLITUDE_BACKGROUND_CAPTURE_SCRIPT_URL;
  let backgroundCaptureInstance: any = null;

  const onBackgroundCapture = (type: string, backgroundCaptureData: { [key: string]: string | number | null }) => {
    if (type === 'background-capture-complete') {
      messenger.logger?.debug?.('Background capture complete');
      messenger.notify({ action: 'background-capture-complete', data: backgroundCaptureData });
    }
  };

  messenger.registerActionHandler('initialize-background-capture', () => {
    messenger.logger?.debug?.('Initializing background capture (external script)');
    const resolvedUrl = new URL(scriptUrl, messenger.endpoint).toString();

    messenger
      .loadScriptOnce(resolvedUrl)
      .then(() => {
        messenger.logger?.debug?.('Background capture script loaded (external)');
        // eslint-disable-next-line
        backgroundCaptureInstance = (window as any)?.amplitudeBackgroundCapture?.({
          messenger,
          onBackgroundCapture,
        });
        messenger.notify({ action: 'background-capture-loaded' });
      })
      .catch(() => {
        messenger.logger?.warn('Failed to initialize background capture');
      });
  });

  messenger.registerActionHandler('close-background-capture', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    backgroundCaptureInstance?.close?.();
    backgroundCaptureInstance = null;
  });
}
