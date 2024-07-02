import { getGlobalScope } from '@amplitude/analytics-client-common';
import { SessionReplayJoinedConfig } from '../config/types';
import { SessionReplayDestinationSessionMetadata } from '../typings/session-replay';
import { getServerUrl } from '../helpers';

type BeaconSendFn<T> = (pageUrl: string, payload: T, contentType: 'application/json') => boolean;

export class BeaconTransport<T> {
  private sendBeacon: BeaconSendFn<T>;
  private sendXhr: BeaconSendFn<T>;
  private readonly pageUrl: string;
  private static readonly contentType = 'application/json';

  constructor(context: SessionReplayDestinationSessionMetadata, config: SessionReplayJoinedConfig) {
    const globalScope = getGlobalScope();
    if (
      globalScope &&
      globalScope.navigator &&
      typeof globalScope.navigator.sendBeacon === 'function' &&
      typeof globalScope.Blob === 'function'
    ) {
      this.sendBeacon = (pageUrl, payload, contentType) => {
        const blobData = new globalScope.Blob([JSON.stringify(payload)], {
          type: contentType,
        });

        try {
          return globalScope.navigator.sendBeacon(pageUrl, blobData);
        } catch (e) {
          // not logging error, since it would be hard to view and just adds overhead.
        }
        return false;
      };
    } else {
      this.sendBeacon = () => false;
    }

    if (typeof XMLHttpRequest === 'undefined') {
      this.sendXhr = () => false;
    } else {
      this.sendXhr = (pageUrl, payload, contentType) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', pageUrl, true);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.setRequestHeader('Accept', '*/*');
        xhr.send(JSON.stringify(payload));
        return true;
      };
    }

    const pageUrl = getServerUrl(config.serverZone);
    const { deviceId, sessionId, type } = context;
    if (deviceId) {
      const urlParams = new URLSearchParams({
        device_id: deviceId,
        session_id: String(sessionId),
        type: String(type),
      });

      void urlParams;

      this.pageUrl = `${pageUrl}?${urlParams.toString()}`;
      // this.pageUrl = pageUrl;
    } else {
      this.pageUrl = pageUrl;
    }
  }

  send(payload: T) {
    // ideally send using the beacon API, but there is a chance it may fail, possibly due to a payload
    // size limit. in this case, try best effort to send using xhr.
    this.sendBeacon(this.pageUrl, payload, BeaconTransport.contentType) ||
      this.sendXhr(this.pageUrl, payload, BeaconTransport.contentType);
  }
}
