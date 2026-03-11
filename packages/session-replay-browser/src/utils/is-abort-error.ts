import { ILogger } from '@amplitude/analytics-core';

/**
 * IndexedDB can surface transient AbortErrors (internal cancellations,
 * cleanup) that are not actionable by customers. We downgrade these from
 * warn → debug to avoid triggering Sentry alerts in customer projects.
 * Duck-types on name rather than instanceof DOMException because the idb
 * wrapper library and test environments may surface plain Error objects.
 */
const isAbortError = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError';

/**
 * Logs an IDB error at the appropriate level: debug for transient
 * AbortErrors (to avoid customer Sentry noise), warn for everything else.
 */
export const logIdbError = (logger: ILogger, message: string, error?: unknown) => {
  if (isAbortError(error)) {
    logger.debug(message);
  } else {
    logger.warn(message);
  }
};
