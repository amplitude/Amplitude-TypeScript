/** Device viewport modes supported by the background-capture CDN script. */
export type BackgroundCaptureDeviceMode = 'desktop' | 'tablet' | 'mobile';

/** Payload for the `initialize-background-capture` cross-window action. */
export type InitializeBackgroundCaptureData = {
  deviceMode?: BackgroundCaptureDeviceMode;
};

const BACKGROUND_CAPTURE_DEVICE_MODES: readonly BackgroundCaptureDeviceMode[] = ['desktop', 'tablet', 'mobile'];

export const parseBackgroundCaptureDeviceMode = (value: unknown): BackgroundCaptureDeviceMode | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  return (BACKGROUND_CAPTURE_DEVICE_MODES as readonly string[]).includes(value)
    ? (value as BackgroundCaptureDeviceMode)
    : undefined;
};
