import { TargetingParameters, evaluateTargeting as evaluateTargetingPackage } from '@amplitude/targeting';
import { TargetingConfig } from '../config/types';
import { Logger } from '@amplitude/analytics-types';
import { targetingIDBStore } from './targeting-idb-store';

export const evaluateTargetingAndStore = async ({
  sessionId,
  targetingConfig,
  loggerProvider,
  apiKey,
  targetingParams,
}: {
  sessionId: number;
  targetingConfig: TargetingConfig;
  loggerProvider: Logger;
  apiKey: string;
  targetingParams?: Pick<TargetingParameters, 'event' | 'userProperties'>;
}) => {
  await targetingIDBStore.clearStoreOfOldSessions({
    loggerProvider: loggerProvider,
    apiKey: apiKey,
    currentSessionId: sessionId,
  });

  const idbTargetingMatch = await targetingIDBStore.getTargetingMatchForSession({
    loggerProvider: loggerProvider,
    apiKey: apiKey,
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
    const targetingResult = await evaluateTargetingPackage({
      ...targetingParams,
      flag: targetingConfig,
      sessionId: sessionId,
      apiKey: apiKey,
      loggerProvider: loggerProvider,
    });

    sessionTargetingMatch = targetingResult.sr_targeting_config.key === 'on';

    void targetingIDBStore.storeTargetingMatchForSession({
      loggerProvider: loggerProvider,
      apiKey: apiKey,
      sessionId: sessionId,
      targetingMatch: sessionTargetingMatch,
    });
  } catch (err: unknown) {
    const knownError = err as Error;
    loggerProvider.warn(knownError.message);
  }
  return sessionTargetingMatch;
};
