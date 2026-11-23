import type { TargetingParameters } from '@amplitude/targeting';
import { TargetingConfig } from '../config/types';
import { Logger } from '@amplitude/analytics-types';
import { SessionReplayTargetingInput } from '../typings/session-replay';
import { targetingIDBStore } from './targeting-idb-store';

export interface TargetingEvaluationResult {
  targetingMatch: boolean;
  targetingConditionName?: string;
  targetingConditionId?: string;
}

export const evaluateTargetingAndStore = async ({
  sessionId,
  targetingConfig,
  loggerProvider,
  apiKey,
  targetingParams,
  urlChange = false,
}: {
  sessionId: string | number;
  targetingConfig: TargetingConfig;
  loggerProvider: Logger;
  apiKey: string;
  targetingParams?: SessionReplayTargetingInput;
  urlChange?: boolean;
}): Promise<TargetingEvaluationResult> => {
  await targetingIDBStore.clearStoreOfOldSessions({
    loggerProvider: loggerProvider,
    apiKey: apiKey,
    currentSessionId: sessionId,
  });

  const storedTargetingDetails = await targetingIDBStore.getTargetingDetailsForSession({
    loggerProvider: loggerProvider,
    apiKey: apiKey,
    sessionId: sessionId,
  });
  // Skip IDB cache when re-evaluating with a new page (e.g. URL change); otherwise we'd never
  // re-evaluate and would keep returning true after navigating to a non-matching page.
  if (storedTargetingDetails?.targetingMatch === true && !urlChange) {
    return {
      targetingMatch: true,
      ...(storedTargetingDetails.targetingConditionName !== undefined
        ? { targetingConditionName: storedTargetingDetails.targetingConditionName }
        : {}),
      ...(storedTargetingDetails.targetingConditionId !== undefined
        ? { targetingConditionId: storedTargetingDetails.targetingConditionId }
        : {}),
    };
  }

  // If the targeting config is undefined or an empty object,
  // assume the response was valid but no conditions were set,
  // so all users match targeting
  let sessionTargetingMatch = true;
  let targetingConditionName: string | undefined;
  let targetingConditionId: string | undefined;
  try {
    // Dynamic import of the targeting package
    const { evaluateTargeting: evaluateTargetingPackage } = await import('@amplitude/targeting');

    const params: TargetingParameters = {
      ...targetingParams,
      flag: targetingConfig,
      sessionId: typeof sessionId === 'string' ? parseInt(sessionId, 10) : sessionId,
      apiKey: apiKey,
      loggerProvider: loggerProvider,
    };
    const targetingResult = await evaluateTargetingPackage(params);
    if (targetingResult && targetingResult.sr_targeting_config) {
      const variant = targetingResult.sr_targeting_config;
      sessionTargetingMatch = variant.key === 'on';
      targetingConditionName =
        typeof variant.metadata?.segmentName === 'string' ? variant.metadata.segmentName : undefined;
      targetingConditionId = typeof variant.metadata?.segmentId === 'string' ? variant.metadata.segmentId : undefined;
    }

    void targetingIDBStore.storeTargetingMatchForSession({
      loggerProvider: loggerProvider,
      apiKey: apiKey,
      sessionId: sessionId,
      targetingMatch: sessionTargetingMatch,
      ...(targetingConditionName !== undefined ? { targetingConditionName } : {}),
      ...(targetingConditionId !== undefined ? { targetingConditionId } : {}),
    });
  } catch (err: unknown) {
    const knownError = err as Error;
    loggerProvider.warn(knownError.message);
  }
  return {
    targetingMatch: sessionTargetingMatch,
    ...(targetingConditionName !== undefined ? { targetingConditionName } : {}),
    ...(targetingConditionId !== undefined ? { targetingConditionId } : {}),
  };
};
