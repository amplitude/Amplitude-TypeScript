import { RemoteConfigFetch } from '@amplitude/analytics-remote-config';
import { SessionReplayRemoteConfig } from '../../../src/config/types';
import { RemoteConfigMetric } from '@amplitude/analytics-remote-config/lib/esm/types';

let _namespaceConfig: SessionReplayRemoteConfig = {
  sr_sampling_config: {
    capture_enabled: true,
    sample_rate: 100,
  },
};

let _shouldThrowError = false;

class AnalyticsRemoteConfigMock implements RemoteConfigFetch<SessionReplayRemoteConfig> {
  metrics: RemoteConfigMetric = {
    fetchTimeAPISuccess: 0,
    fetchTimeAPIFail: 0,
  };
  getRemoteConfig: <K extends keyof SessionReplayRemoteConfig>(
    configNamespace: string,
    key: K,
    sessionId?: number | string,
  ) => Promise<SessionReplayRemoteConfig[K] | undefined> = (_, key) => {
    if (_shouldThrowError) {
      throw new Error('test error');
    }
    return Promise.resolve(_namespaceConfig[key]);
  };
  getRemoteNamespaceConfig: (
    configNamespace: string,
    sessionId?: number | string,
  ) => Promise<SessionReplayRemoteConfig | undefined> = () => {
    if (_shouldThrowError) {
      throw new Error('test error');
    }
    return Promise.resolve(_namespaceConfig);
  };
}

const analyticsRemoteConfigMock = new AnalyticsRemoteConfigMock();

export const __setNamespaceConfig = (namespaceConfig: SessionReplayRemoteConfig) => {
  _namespaceConfig = namespaceConfig;
};

export const __setShouldThrowError = (shouldThrowError: boolean) => {
  _shouldThrowError = shouldThrowError;
};

export const createRemoteConfigFetch = async () => {
  return Promise.resolve(analyticsRemoteConfigMock);
};
export const metrics = analyticsRemoteConfigMock.metrics;
export const getRemoteConfig = analyticsRemoteConfigMock.getRemoteConfig;
export const getRemoteNamespaceConfig = analyticsRemoteConfigMock.getRemoteNamespaceConfig;
