describe('optional Replay UI adapters', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@amplitude/plugin-session-replay-react-native');
    jest.dontMock('@amplitude/session-replay-react-native');
  });

  const observe = () => {
    const { observeReplayUiChanges } =
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../../src/utils/replay-ui-changes') as typeof import('../../src/utils/replay-ui-changes');
    const listener = jest.fn();
    const onError = jest.fn();
    return { listener, onError, subscription: observeReplayUiChanges(listener, onError) };
  };

  it('works with neither optional peer installed', () => {
    jest.doMock('@amplitude/plugin-session-replay-react-native', () => {
      throw new Error('not installed');
    });
    jest.doMock('@amplitude/session-replay-react-native', () => {
      throw new Error('not installed');
    });
    const { subscription } = observe();
    expect(subscription.sources).toHaveLength(0);
    expect(() => subscription.remove()).not.toThrow();
  });

  it('ignores older peers missing either new function', () => {
    const addListener = jest.fn();
    jest.doMock('@amplitude/plugin-session-replay-react-native', () => ({ addUiChangeListener: addListener }));
    jest.doMock('@amplitude/session-replay-react-native', () => ({ isRecording: () => Promise.resolve(true) }));
    const { subscription } = observe();
    expect(subscription.sources).toHaveLength(0);
    expect(addListener).not.toHaveBeenCalled();
    subscription.remove();
  });

  it('guards removed subscriptions and still cleans up the second peer if the first cleanup throws', async () => {
    let emit: () => void = () => undefined;
    const unsubscribeSecond = jest.fn();
    jest.doMock('@amplitude/plugin-session-replay-react-native', () => ({
      isRecording: () => Promise.resolve(true),
      addUiChangeListener: (listener: () => void) => {
        emit = listener;
        return () => {
          throw new Error('cleanup failed');
        };
      },
    }));
    jest.doMock('@amplitude/session-replay-react-native', () => ({
      isRecording: () => Promise.resolve(true),
      addUiChangeListener: () => unsubscribeSecond,
    }));
    const { subscription, listener, onError } = observe();
    expect(subscription.sources).toHaveLength(2);
    emit();
    expect(listener).toHaveBeenCalledTimes(1);
    subscription.remove();
    subscription.remove();
    emit();
    expect(listener).toHaveBeenCalledTimes(1);
    await expect(subscription.sources[0].isRecording()).resolves.toBe(false);
    expect(unsubscribeSecond).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
