import { SessionReplayOptions } from '@amplitude/session-replay-browser';
import { AnalyticsBrowser } from '@segment/analytics-next';

export interface PluginOptions {
  segmentInstance: AnalyticsBrowser;
  amplitudeApiKey: string;
  sessionReplayOptions?: SessionReplayOptions;
  enableWrapperDebug?: boolean;
}

export type AmplitudeIntegrationData = {
  // https://github.com/segmentio/analytics-next/blob/3f15dfae034d101fb1847bc7228c0354b414d68a/packages/browser-integration-tests/src/index.test.ts#L64-L66
  session_id: number;
};
