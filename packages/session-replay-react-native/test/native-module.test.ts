describe('NativeSessionReplay module resolution', () => {
  it('throws a descriptive linking error on first use when the native module is unavailable', () => {
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { select: () => '' },
        TurboModuleRegistry: { get: () => null },
      }));

      // eslint-disable-next-line @typescript-eslint/no-var-requires -- isolateModules needs a fresh require
      const { NativeSessionReplay } = require('../src/native-module') as typeof import('../src/native-module');

      expect(() => NativeSessionReplay.setCustomSessionId('test-id')).toThrow("doesn't seem to be linked");
    });
  });

  it('resolves the native module through the codegen spec when it is linked', () => {
    const setCustomSessionId = jest.fn().mockResolvedValue(undefined);

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { select: () => '' },
        TurboModuleRegistry: { get: () => ({ setCustomSessionId }) },
      }));

      // eslint-disable-next-line @typescript-eslint/no-var-requires -- isolateModules needs a fresh require
      const { NativeSessionReplay } = require('../src/native-module') as typeof import('../src/native-module');

      void NativeSessionReplay.setCustomSessionId('test-id');
      expect(setCustomSessionId).toHaveBeenCalledWith('test-id');
    });
  });
});
