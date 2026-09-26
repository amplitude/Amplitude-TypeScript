export type AmpCaptureProperties = {
  action?: string;
  accessibilityLabel?: string;
  component?: string;
  element?: string;
  testID?: string;
  _elementUniqueId?: string;
};

const callbacks: ((properties: AmpCaptureProperties) => void)[] = [];

export function subscribe(callback: (properties: AmpCaptureProperties) => void) {
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
  const elementUniqueId = Math.random().toString(36).substring(2, 15);
  return (...args: Args) => {
    if (!isAmpCapturing) {
      // only call "callbacks" if not nested inside another ampCapture
      try {
        isAmpCapturing = true;
        properties._elementUniqueId = elementUniqueId;
        try {
          callbacks.forEach((callback) => callback(properties));
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
