import { runQueuedFunctions } from '../src/utils/snippet-helper';

describe('lite CDN bootstrap', () => {
  const globalScope = globalThis as unknown as { amplitude?: Record<string, any> };
  let api: { init: jest.Mock; track: jest.Mock };
  let namedClient: { init: jest.Mock; track: jest.Mock };
  let createInstance: jest.Mock;
  let registerSdkLoaderMetadata: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    api = { init: jest.fn(), track: jest.fn() };
    namedClient = { init: jest.fn(), track: jest.fn() };
    createInstance = jest.fn(() => namedClient);
    registerSdkLoaderMetadata = jest.fn();
    jest.doMock('../src/index-lite', () => api);
    jest.doMock('../src/browser-client-lite-factory', () => ({ createInstance }));
    jest.doMock('../src/utils/snippet-helper', () => ({ runQueuedFunctions }));
    jest.doMock('@amplitude/analytics-core', () => ({
      getGlobalScope: () => globalScope,
      registerSdkLoaderMetadata,
    }));
  });

  afterEach(() => {
    delete globalScope.amplitude;
    jest.dontMock('../src/index-lite');
    jest.dontMock('../src/browser-client-lite-factory');
    jest.dontMock('../src/utils/snippet-helper');
    jest.dontMock('@amplitude/analytics-core');
  });

  test('merges into the snippet stub and replays queued init and track calls', () => {
    const stub = {
      invoked: true,
      _q: [
        { name: 'init', args: ['default-api-key'] },
        { name: 'track', args: ['Default event'] },
      ],
      _iq: {
        named: {
          _q: [
            { name: 'init', args: ['named-api-key'] },
            { name: 'track', args: ['Named event'] },
          ],
        },
      },
    };
    const namedStub = stub._iq.named;
    globalScope.amplitude = stub;
    jest.requireActual('../src/snippet-index-lite');

    expect(globalScope.amplitude).toBe(stub);
    expect(api.init).toHaveBeenCalledWith('default-api-key');
    expect(api.track).toHaveBeenCalledWith('Default event');
    expect(api.init.mock.invocationCallOrder[0]).toBeLessThan(api.track.mock.invocationCallOrder[0]);
    expect(namedClient.init).toHaveBeenCalledWith('named-api-key');
    expect(namedClient.track).toHaveBeenCalledWith('Named event');
    expect(namedClient.init.mock.invocationCallOrder[0]).toBeLessThan(namedClient.track.mock.invocationCallOrder[0]);
    expect(stub._q).toEqual([]);
    expect(namedStub._q).toEqual([]);
    expect(stub._iq.named).toMatchObject(namedClient);
    expect(globalScope.amplitude?._iq.named).toBe(namedClient);
  });

  test('registers the lite CDN script URL as loader metadata', () => {
    const script = document.createElement('script');
    script.src = 'https://cdn.amplitude.com/libs/analytics-browser-lite-2.49.1-min.js.gz';
    jest.spyOn(document, 'currentScript', 'get').mockReturnValue(script);
    jest.requireActual('../src/snippet-index-lite');

    expect(registerSdkLoaderMetadata).toHaveBeenCalledWith({ scriptUrl: script.src });
    expect(globalScope.amplitude?.init).toBe(api.init);
    expect(globalScope.amplitude?.createInstance()).toBe(namedClient);
    expect(createInstance).toHaveBeenCalledTimes(1);
  });
});
