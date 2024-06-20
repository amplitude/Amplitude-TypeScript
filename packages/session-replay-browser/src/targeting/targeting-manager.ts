import { TargetingParameters, evaluateTargeting as evaluateTargetingPackage } from '@amplitude/targeting';
import { SessionReplayJoinedConfig } from 'src/config/types';
import { targetingIDBStore } from './targeting-idb-store';

export const evaluateTargetingAndStore = async ({
  sessionId,
  config,
  targetingParams,
}: {
  sessionId: number;
  config: SessionReplayJoinedConfig;
  targetingParams?: Pick<TargetingParameters, 'event' | 'userProperties'>;
}) => {
  await targetingIDBStore.clearStoreOfOldSessions({
    loggerProvider: config.loggerProvider,
    apiKey: config.apiKey,
    currentSessionId: sessionId,
  });

  const idbTargetingMatch = await targetingIDBStore.getTargetingMatchForSession({
    loggerProvider: config.loggerProvider,
    apiKey: config.apiKey,
    sessionId: sessionId,
  });
  if (idbTargetingMatch === true) {
    return true;
  }

  // If the targeting config is undefined or an empty object,
  // assume the response was valid but no conditions were set,
  // so all users match targeting
  let sessionTargetingMatch = true;
  try {
    if (config.targetingConfig && Object.keys(config.targetingConfig).length) {
      const targetingResult = await evaluateTargetingPackage({
        ...targetingParams,
        flag: config.targetingConfig,
        sessionId: sessionId,
        apiKey: config.apiKey,
        loggerProvider: config.loggerProvider,
      });
      sessionTargetingMatch = targetingResult.sr_targeting_config.key === 'on';
    }
    void targetingIDBStore.storeTargetingMatchForSession({
      loggerProvider: config.loggerProvider,
      apiKey: config.apiKey,
      sessionId: sessionId,
      targetingMatch: sessionTargetingMatch,
    });
  } catch (err: unknown) {
    const knownError = err as Error;
    config.loggerProvider.warn(knownError.message);
  }
  return sessionTargetingMatch;
};
