import type { TargetingParameters } from '@amplitude/targeting';
import { TargetingConfig } from '../config/types';
import { Logger } from '@amplitude/analytics-types';
import { IDiagnosticsClient } from '@amplitude/analytics-core';
import { SessionReplayTargetingInput } from '../typings/session-replay';
import { targetingIDBStore } from './targeting-idb-store';
import { SrDiagnostic } from '../diagnostics';

export const evaluateTargetingAndStore = async ({
  sessionId,
  targetingConfig,
  loggerProvider,
  apiKey,
  targetingParams,
  urlChange = false,
  diagnosticsClient,
  deviceId,
}: {
  sessionId: string | number;
  targetingConfig: TargetingConfig;
  loggerProvider: Logger;
  apiKey: string;
  targetingParams?: SessionReplayTargetingInput;
  urlChange?: boolean;
  diagnosticsClient?: IDiagnosticsClient;
  deviceId?: string;
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

  // Skip IDB cache when re-evaluating with a new page (e.g. URL change); otherwise we'd never
  // re-evaluate and would keep returning true after navigating to a non-matching page.
  if (idbTargetingMatch === true && !urlChange) {
    return true;
  }

  // If the targeting config is undefined or an empty object,
  // assume the response was valid but no conditions were set,
  // so all users match targeting
  let sessionTargetingMatch = true;
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
      sessionTargetingMatch = targetingResult.sr_targeting_config.key === 'on';
    }

    void targetingIDBStore.storeTargetingMatchForSession({
      loggerProvider: loggerProvider,
      apiKey: apiKey,
      sessionId: sessionId,
      targetingMatch: sessionTargetingMatch,
    });
  } catch (err: unknown) {
    const knownError = err as Error;
    // Q3 "is the TRC failing?": the targeting engine threw — record it so the team sees TRC
    // errors in DataDog (this exception is otherwise swallowed). Best-effort, never re-throws.
    try {
      diagnosticsClient?.increment(SrDiagnostic.evalError);
      diagnosticsClient?.recordEvent(SrDiagnostic.evalError, {
        sessionId,
        deviceId,
        srId: deviceId != null && sessionId != null ? `${deviceId}/${sessionId}` : undefined,
        pageUrl: targetingParams?.page?.url,
        message: knownError.message,
      });
    } catch {
      // diagnostics is best-effort
    }
    loggerProvider.warn(knownError.message);
  }
  return sessionTargetingMatch;
};
