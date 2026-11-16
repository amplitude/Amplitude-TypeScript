jest.unmock('react-native');

const nativeAddListenerMock = jest.fn();
const nativeRemoveListenersMock = jest.fn();

jest.mock('../src/native-module', () => ({
  NativeSessionReplay: {
    addListener: nativeAddListenerMock,
    removeListeners: nativeRemoveListenersMock,
  },
}));

import { DeviceEventEmitter } from 'react-native';
import { addUiChangeListener } from '../src/session-replay';

const uiChangeEvent = 'amplitudeSessionReplayReactNativeUiChange';

describe('UI change listeners', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shares one native subscription and removes listeners independently', () => {
    const first = jest.fn();
    const second = jest.fn();
    const unsubscribeFirst = addUiChangeListener(first);
    const unsubscribeSecond = addUiChangeListener(second);
    expect(nativeAddListenerMock).toHaveBeenCalledTimes(1);
    expect(nativeAddListenerMock).toHaveBeenCalledWith(uiChangeEvent);

    DeviceEventEmitter.emit(uiChangeEvent);
    DeviceEventEmitter.emit(uiChangeEvent);
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);

    unsubscribeFirst();
    unsubscribeFirst();
    expect(nativeRemoveListenersMock).not.toHaveBeenCalled();
    DeviceEventEmitter.emit(uiChangeEvent);
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(3);

    unsubscribeSecond();
    expect(nativeRemoveListenersMock).toHaveBeenCalledTimes(1);
    DeviceEventEmitter.emit(uiChangeEvent);
    expect(second).toHaveBeenCalledTimes(3);
  });

  it('allows independent registrations of the same callback and resubscribing after cleanup', () => {
    const listener = jest.fn();
    const unsubscribeFirst = addUiChangeListener(listener);
    const unsubscribeSecond = addUiChangeListener(listener);
    unsubscribeFirst();
    DeviceEventEmitter.emit(uiChangeEvent);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribeSecond();

    const unsubscribeThird = addUiChangeListener(listener);
    unsubscribeFirst();
    DeviceEventEmitter.emit(uiChangeEvent);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(nativeAddListenerMock).toHaveBeenCalledTimes(2);
    unsubscribeThird();
  });

  it('ignores UI changes from the separate plugin-session-replay-react-native module', () => {
    const listener = jest.fn();
    const unsubscribe = addUiChangeListener(listener);
    DeviceEventEmitter.emit('amplitudeSessionReplayUiChange');
    expect(listener).not.toHaveBeenCalled();
    DeviceEventEmitter.emit(uiChangeEvent);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
