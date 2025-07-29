import { AnalyticsIdentity } from '../plugin';

/**
 * Generic analytics client interface adaptable to any analytics provider (e.g., Segment, Amplitude) with configurable identity type.
 *
 * Note: This interface is intended for client-side use only (e.g., browser SDK, React Native SDK).
 * It is not designed for use with the Node.js SDK.
 */
export interface AnalyticsClient<Identity extends AnalyticsIdentity = AnalyticsIdentity> {
  /**
   * Returns the current identity.
   *
   * ```typescript
   * const identity = getIdentity();
   * ```
   */
  getIdentity(): Identity;

  /**
   * Returns the current session identifier.
   *
   * ```typescript
   * const sessionId = getSessionId();
   * ```
   */
  getSessionId(): number | undefined;

  /**
   * Returns the current optOut config value.
   *
   * ```typescript
   * const optOut = getOptOut();
   * ```
   */
  getOptOut(): boolean | undefined;

  /**
   * Tracks an event with the specified type and optional properties.
   *
   * @param eventType - The type/name of the event to track
   * @param eventProperties - Optional properties to attach to the event
   */
  track(eventType: string, eventProperties?: Record<string, any>): void;
}
