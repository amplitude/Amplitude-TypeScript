import { SESSION_REPLAY_EU_URL, SESSION_REPLAY_SERVER_URL, SESSION_REPLAY_STAGING_URL } from '../constants';

export function getServerUrl(serverZone?: string, trackServerUrl?: string): string {
  if (trackServerUrl) return trackServerUrl;
  if (serverZone === 'STAGING') return SESSION_REPLAY_STAGING_URL;
  if (serverZone === 'EU') return SESSION_REPLAY_EU_URL;
  return SESSION_REPLAY_SERVER_URL;
}
