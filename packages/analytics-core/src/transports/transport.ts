import { Payload } from '../types/payload';
import { Response } from '../types/response';

export interface Transport {
  send(serverUrl: string, payload: Payload): Promise<Response | null>;
}

export type TransportType = 'xhr' | 'beacon' | 'fetch';
