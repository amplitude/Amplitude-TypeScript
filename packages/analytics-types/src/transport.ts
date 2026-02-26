import { Payload } from './payload';
import { Response } from './response';

export interface Transport {
  send(serverUrl: string, payload: Payload): Promise<Response | null>;
}

export type TransportType = 'xhr' | 'beacon' | 'fetch';
