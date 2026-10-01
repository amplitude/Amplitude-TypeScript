export type AmpCaptureProperties = {
  action?: string;
  accessibilityLabel?: string;
  component?: string;
  element?: string;
  testID?: string;
};

export type AmpCaptureCoordinates = {
  x: number;
  y: number;
};

type AmpCaptureCallback = (properties: AmpCaptureProperties, coordinates?: AmpCaptureCoordinates) => void;

const callbacks: AmpCaptureCallback[] = [];

export function subscribe(callback: AmpCaptureCallback) {
  callbacks.push(callback);
  return () => {
    const index = callbacks.indexOf(callback);
    if (index >= 0) {
      callbacks.splice(index, 1);
    }
  };
}

let isAmpCapturing = false;

export function ampCapture<Args extends unknown[], Return>(
  func: (...args: Args) => Return,
  properties: AmpCaptureProperties,
): (...args: Args) => Return {
  if (typeof func !== 'function') {
    return func;
  }
  return (...args: Args) => {
    if (!isAmpCapturing) {
      // only call "callbacks" if not nested inside another ampCapture
      try {
        isAmpCapturing = true;
        const event = args[0] as { nativeEvent?: { pageX?: unknown; pageY?: unknown } } | undefined;
        const { pageX, pageY } = event?.nativeEvent ?? {};
        const coordinates = typeof pageX === 'number' && typeof pageY === 'number' ? { x: pageX, y: pageY } : undefined;
        try {
          callbacks.forEach((callback) => (coordinates ? callback(properties, coordinates) : callback(properties)));
        } catch (error) {
          // swallow errors
        }
        return func(...args);
      } finally {
        isAmpCapturing = false;
      }
    } else {
      return func(...args);
    }
  };
}
