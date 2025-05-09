import * as sessionReplay from '@amplitude/session-replay-browser';
import { Analytics, Context, Plugin, User } from '@segment/analytics-next';

import { DEBUG_LOG_PREFIX, PLUGIN_NAME, PLUGIN_TYPE } from './constants';
import { getSessionId, setSessionId, updateSessionIdAndAddProperties } from './helpers';
import { PluginOptions } from './typings/wrapper';
import { VERSION } from './version';

export const createSegmentActionsPlugin = async ({
  amplitudeApiKey,
  sessionReplayOptions,
  segmentInstance,
  enableWrapperDebug = false,
}: PluginOptions): Promise<void> => {
  let initPromise: Promise<void>;
  let isInitialized = false;
  let deviceId: string | undefined = sessionReplayOptions?.deviceId;

  const _plugin: Plugin = {
    name: PLUGIN_NAME,
    type: PLUGIN_TYPE,
    version: VERSION,

    isLoaded: (): boolean => isInitialized,

    load: async (_ctx: Context, ajs: Analytics): Promise<void> => {
      // If the deviceId is not provided via the plugin parameters,
      // default to use the anonymousId from the user
      if (!deviceId) {
        const user: User = ajs.user();
        deviceId = user.anonymousId() || undefined;
      }

      const sessionId: number | undefined = getSessionId();

      // Initialize the session replay plugin
      enableWrapperDebug &&
        console.log(
          `${DEBUG_LOG_PREFIX} initializing session replay with sessionId=${sessionId ?? 'undefined'} and deviceId=${
            deviceId ?? 'undefined'
          }`,
        );

      initPromise = sessionReplay.init(amplitudeApiKey, {
        ...sessionReplayOptions,
        sessionId,
        deviceId: deviceId || undefined,
        version: { type: 'segment', version: VERSION },
      }).promise;

      await initPromise;
      isInitialized = true;
    },

    track: async (ctx: Context): Promise<Context> => {
      await initPromise;
      return await updateSessionIdAndAddProperties(ctx, deviceId);
    },

    page: async (ctx: Context): Promise<Context> => {
      await initPromise;
      return await updateSessionIdAndAddProperties(ctx, deviceId);
    },

    identify: async (ctx: Context): Promise<Context> => {
      await initPromise;

      const sessionId: number | undefined = getSessionId();

      if (sessionId) {
        enableWrapperDebug &&
          console.log(
            `${DEBUG_LOG_PREFIX} calling setSessionId() with sessionId=${sessionId} and deviceId=${
              deviceId ?? 'undefined'
            }`,
          );
        await setSessionId(sessionId, deviceId);
      }

      return ctx;
    },
  };

  await segmentInstance.register(_plugin);
};
