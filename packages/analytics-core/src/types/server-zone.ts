/**
 * @deprecated use ServerZoneType instead
 */
export enum ServerZone {
  US = 'US',
  EU = 'EU',
  /**
   * Add for session-replay-browser migration from analytics-type v1.x.
   */
  STAGING = 'STAGING',
}

export type ServerZoneType = 'US' | 'EU';
