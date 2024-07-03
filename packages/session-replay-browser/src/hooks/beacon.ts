import { getGlobalScope } from '@amplitude/analytics-client-common';
import { SessionReplayJoinedConfig } from '../config/types';
import { SessionReplayDestinationSessionMetadata } from '../typings/session-replay';
import { getServerUrl } from '../helpers';

type BeaconSendFn<T> = (pageUrl: string, payload: T, contentType: 'application/json') => boolean;

export class BeaconTransport<T> {
  private sendBeacon: BeaconSendFn<T>;
  private sendXhr: BeaconSendFn<T>;
  private readonly basePageUrl: string;
  private readonly context: Omit<SessionReplayDestinationSessionMetadata, 'deviceId'>;
  private static readonly contentType = 'application/json';

  constructor(context: Omit<SessionReplayDestinationSessionMetadata, 'deviceId'>, config: SessionReplayJoinedConfig) {
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
          if (globalScope.navigator.sendBeacon(pageUrl, blobData)) {
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

    this.sendXhr = (pageUrl, payload, contentType) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', pageUrl, true);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.setRequestHeader('Accept', '*/*');
      xhr.send(JSON.stringify(payload));
      return true;
    };

    this.basePageUrl = getServerUrl(config.serverZone);
    this.context = context;
  }

  send(deviceId: string, payload: T) {
    const { sessionId, type } = this.context;
    const urlParams = new URLSearchParams({
      device_id: deviceId,
      session_id: String(sessionId),
      type: String(type),
    });

    const pageUrl = `${this.basePageUrl}?${urlParams.toString()}`;

    // ideally send using the beacon API, but there is a chance it may fail, possibly due to a payload
    // size limit. in this case, try best effort to send using xhr.
    this.sendBeacon(pageUrl, payload, BeaconTransport.contentType) ||
      this.sendXhr(pageUrl, payload, BeaconTransport.contentType);
  }
}
