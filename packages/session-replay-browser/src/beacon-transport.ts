import { getGlobalScope, ILogger } from '@amplitude/analytics-core';
import { SessionReplayJoinedConfig, SessionReplaySendEventsHandler } from './config/types';
import { SessionReplayDestinationSessionMetadata } from './typings/session-replay';
import { getServerUrl } from './helpers';

type BeaconSendFn<T> = (pageUrl: string, payload: T) => boolean;

/**
 * For very small payloads it's preferable to use the [Beacon API](https://developer.mozilla.org/en-US/docs/Web/API/Beacon_API).
 * While it doesn't provide 100% guarantees on sends, it greatly helps with overall reliability and page load performance. As
 * the Beacon API has a potential to fail due to size constraints we want to fall back to XHR if need be. This is mostly to
 * be used with 'pagehide' or 'beforeunload' events.
 *
 * Note there are only 3 CORS safelisted Content-Types you can send:
 *
 * - application/x-www-form-urlencoded
 * - multipart/form-data
 * - text/plain
 *
 * If we do not send one of these, some browsers like Chrome may not send this at all. Also we incur the overhead of a preflight
 * request. In our case we will add no additional content-type header. If you are trying to ping a server that requires this
 * header, you may want to use the regular fetch API or a different mechanism.
 */
export class BeaconTransport<T> {
  private sendBeacon: BeaconSendFn<T>;
  private sendXhr: BeaconSendFn<T>;
  private readonly basePageUrl: string;
  private readonly context: Omit<SessionReplayDestinationSessionMetadata, 'deviceId'>;
  private readonly apiKey: string;
  // Optional custom transport. When set, interaction beacons go through it (a keepalive fetch
  // that can carry custom auth) instead of navigator.sendBeacon/XHR, which cannot set headers.
  private readonly handleSendEvents?: SessionReplaySendEventsHandler;
  private readonly loggerProvider?: ILogger;

  constructor(context: Omit<SessionReplayDestinationSessionMetadata, 'deviceId'>, config: SessionReplayJoinedConfig) {
    const globalScope = getGlobalScope();
    if (globalScope && globalScope.navigator && typeof globalScope.navigator.sendBeacon === 'function') {
      this.sendBeacon = (pageUrl, payload) => {
        try {
          if (globalScope.navigator.sendBeacon(pageUrl, JSON.stringify(payload))) {
            return true;
          }
        } catch (e) {
          // not logging error, since it would be hard to view and just adds overhead.
        }
        return false;
      };
    } else {
      this.sendBeacon = () => false;
    }

    this.sendXhr = (pageUrl, payload) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', pageUrl, true);
      xhr.setRequestHeader('Accept', '*/*');
      xhr.send(JSON.stringify(payload));
      return true;
    };

    this.basePageUrl = getServerUrl(config.serverZone, config.trackServerUrl);
    this.apiKey = config.apiKey;
    this.context = context;
    this.handleSendEvents = config.handleSendEvents;
    this.loggerProvider = config.loggerProvider;
  }

  send(deviceId: string, payload: T) {
    const { sessionId, type } = this.context;

    // Custom-transport path: navigator.sendBeacon/XHR cannot attach custom headers, so an
    // interaction beacon would otherwise leave unauthenticated and be rejected by an
    // authenticating proxy. When handleSendEvents is set, route the beacon through it instead —
    // a keepalive fetch (survives page unload) that carries the customer's auth. Mirrors the
    // replay page-exit path: api_key goes in the Authorization header, not the URL.
    if (this.handleSendEvents) {
      const params = new URLSearchParams({
        device_id: deviceId,
        session_id: String(sessionId),
        type: String(type),
      });
      const url = `${this.basePageUrl}?${params.toString()}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: '*/*',
        Authorization: `Bearer ${this.apiKey}`,
      };
      try {
        void this.handleSendEvents({
          url,
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch((e) => {
          this.loggerProvider?.warn('Custom transport failed to send session replay interaction beacon:', e);
        });
      } catch (e) {
        this.loggerProvider?.warn('Custom transport threw while sending session replay interaction beacon:', e);
      }
      return;
    }

    const urlParams = new URLSearchParams({
      device_id: deviceId,
      session_id: String(sessionId),
      type: String(type),
      api_key: this.apiKey,
    });

    const pageUrl = `${this.basePageUrl}?${urlParams.toString()}`;

    // ideally send using the beacon API, but there is a chance it may fail, possibly due to a payload
    // size limit. in this case, try best effort to send using xhr.
    this.sendBeacon(pageUrl, payload) || this.sendXhr(pageUrl, payload);
  }
}
