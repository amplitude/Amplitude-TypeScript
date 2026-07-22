export const EVENT_TYPE_VALUES = {
  Press: 'Press',
  LongPress: 'LongPress',
  ValueChange: 'ValueChange',
  ChangeText: 'ChangeText',
  SubmitEditing: 'SubmitEditing',
} as const;

export type EVENT_TYPE = (typeof EVENT_TYPE_VALUES)[keyof typeof EVENT_TYPE_VALUES];

export type AmpCaptureProperties = {
  action?: string;
  accessibilityLabel?: string;
  component?: string;
  element?: string;
  testID?: string;
  event: EVENT_TYPE;
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
  return (...args: Args) => {
    if (!isAmpCapturing) {
      // only call "callbacks" if not nested inside another ampCapture
      try {
        isAmpCapturing = true;
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
