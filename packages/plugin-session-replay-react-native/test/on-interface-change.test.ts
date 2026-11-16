import { onInterfaceChange, SessionReplayPlugin } from '../src/session-replay';
import { addInterfaceSignalListener, getInterfaceSignalState } from '../src/native-module';
jest.mock('../src/native-module', () => ({
  addInterfaceSignalListener: jest.fn(),
  getInterfaceSignalState: jest.fn(),
}));

describe('onInterfaceChange', () => {
  it('subscribes before initialization and exposes live state reads and cleanup', async () => {
    const remove = jest.fn();
    const listener = jest.fn();
    jest.mocked(addInterfaceSignalListener).mockImplementation((callback) => {
      callback({ interfaceChanged: true, identityChanged: false, isProviding: true, timestamp: 123 });
      return { remove };
    });
    jest
      .mocked(getInterfaceSignalState)
      .mockResolvedValueOnce({ isProviding: true, sessionId: '123', deviceId: 'device' })
      .mockResolvedValueOnce(null);
    const subscription = onInterfaceChange(listener);
    expect(listener).toHaveBeenCalledWith({
      interfaceChanged: true,
      identityChanged: false,
      isProviding: true,
      timestamp: 123,
    });
    await expect(subscription.getState()).resolves.toEqual({ isProviding: true, sessionId: '123', deviceId: 'device' });
    await expect(subscription.getState()).resolves.toBeNull();
    subscription.remove();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('also exposes the same subscription API on the plugin class without constructing it', () => {
    const remove = jest.fn();
    jest.mocked(addInterfaceSignalListener).mockReturnValue({ remove });
    const subscription = SessionReplayPlugin.onInterfaceChange(jest.fn());
    subscription.remove();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
