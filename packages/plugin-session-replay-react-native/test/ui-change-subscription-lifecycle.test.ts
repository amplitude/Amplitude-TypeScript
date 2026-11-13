const mockCallbacks: Array<(event?: { timestamp?: number }) => void> = [];

jest.mock('react-native', () => ({
  NativeEventEmitter: jest.fn(() => ({
    addListener: (_event: string, callback: (event?: { timestamp?: number }) => void) => {
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
  it('preserves native timestamps instead of substituting JavaScript receipt time', () => {
    const listener = jest.fn();
    const remove = addUiChangeListener(listener);
    try {
      const timestamp = Date.now() - 5000.25;
      mockCallbacks[0]({ timestamp });
      expect(listener).toHaveBeenCalledWith(timestamp);
    } finally {
      remove();
    }
  });

  it.each([undefined, {}, { timestamp: NaN }, { timestamp: Infinity }])(
    'uses receipt time for an older or invalid native payload: %j',
    (event) => {
      const listener = jest.fn();
      const remove = addUiChangeListener(listener);
      const now = jest.spyOn(Date, 'now').mockReturnValue(123456);
      try {
        mockCallbacks[0](event);
        expect(listener).toHaveBeenCalledWith(123456);
      } finally {
        now.mockRestore();
        remove();
      }
    },
  );
});
