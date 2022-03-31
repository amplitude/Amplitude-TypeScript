import { Payload } from './payload';
import { Response } from './response';

export interface Transport {
  send(serverUrl: string, payload: Payload): Promise<Response | null>;
}

export enum TransportType {
  XHR = 'xhr',
  SendBeacon = 'beacon',
  Fetch = 'fetch',
}
