export const EVENT_TYPE_VALUES = {
  Press: 'Press',
  LongPress: 'LongPress',
  Change: 'Change',
} as const;

export type EVENT_TYPE = (typeof EVENT_TYPE_VALUES)[keyof typeof EVENT_TYPE_VALUES];

export type AmpCaptureProperties = {
  accessibilityLabel?: string;
  testID?: string;
  event: EVENT_TYPE;
};

const callbacks: ((properties: AmpCaptureProperties) => void)[] = [];

export function subscribe(callback: (properties: AmpCaptureProperties) => void) {
  callbacks.push(callback);
  return () => {
    callbacks.splice(callbacks.indexOf(callback), 1);
  };
}

export function ampCapture<Args extends unknown[], Return>(
  func: (...args: Args) => Return,
  properties: AmpCaptureProperties,
): (...args: Args) => Return {
  return (...args: Args) => {
    try {
      callbacks.forEach((callback) => callback(properties));
    } catch (error) {
      // swallow errors
    }
    return func(...args);
  };
}
