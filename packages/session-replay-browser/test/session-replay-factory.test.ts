import * as RemoteConfigFetch from '@amplitude/analytics-remote-config';
import { SessionReplay } from '../src/session-replay';
import { getLogConfig } from '../src/session-replay-factory';

describe('session replay factory', () => {
  let getRemoteConfigMock: jest.Mock;
  beforeEach(() => {
    getRemoteConfigMock = jest.fn();
    jest.spyOn(RemoteConfigFetch, 'createRemoteConfigFetch').mockResolvedValue({
      getRemoteConfig: getRemoteConfigMock,
    });
  });
  describe('getLogConfig', () => {
    test('return the log config if config defined on session replay', async () => {
      const sessionReplay = new SessionReplay();
      sessionReplay.init('apiKey', {});
      expect(Object.keys(getLogConfig(sessionReplay)())).toEqual(['logger', 'logLevel']);
    });
    test('return the log config if no config defined on session replay', async () => {
      const sessionReplay = new SessionReplay();
      expect(Object.keys(getLogConfig(sessionReplay)())).toEqual(['logger', 'logLevel']);
    });
  });
});
