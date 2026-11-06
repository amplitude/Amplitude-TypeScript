const mockCallbacks: Array<() => void> = [];

jest.mock('react-native', () => ({
  NativeEventEmitter: jest.fn(() => ({
    addListener: (_event: string, callback: () => void) => {
      mockCallbacks.push(callback);
      return { remove: jest.fn() };
    },
  })),
}));
jest.mock('../src/native-module', () => ({ PluginSessionReplayReactNative: {} }));

import { addUiChangeListener } from '../src/session-replay';

describe('UI subscription lifecycle', () => {
  beforeEach(() => {
    mockCallbacks.length = 0;
  });

  it('rejects a callback queued for a removed subscription after resubscribing', () => {
    const first = jest.fn();
    const removeFirst = addUiChangeListener(first);
    const oldCallback = mockCallbacks[0];
    removeFirst();
    const second = jest.fn();
    const removeSecond = addUiChangeListener(second);
    try {
      oldCallback();
      expect(first).not.toHaveBeenCalled();
      expect(second).not.toHaveBeenCalled();
      mockCallbacks[1]();
      expect(second).toHaveBeenCalledTimes(1);
    } finally {
      removeSecond();
    }
  });

  it('rejects callbacks queued before the last listener unsubscribed', () => {
    const listener = jest.fn();
    const remove = addUiChangeListener(listener);
    const queued = mockCallbacks[0];
    remove();
    queued();
    expect(listener).not.toHaveBeenCalled();
  });
});
