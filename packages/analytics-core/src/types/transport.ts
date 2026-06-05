import { Payload } from './payload';
import { Response } from './response';

export interface Transport {
  send(serverUrl: string, payload: Payload, enableRequestBodyCompression?: boolean): Promise<Response | null>;
}

export type TransportType = 'xhr' | 'beacon' | 'fetch';

export interface TransportOptions {
  type?: TransportType;
  headers?: Record<string, string>;
  // Whether the fetch transport sets `keepalive` so uploads survive page navigation.
  // Enabled unless explicitly set to false. Has no effect on the xhr/beacon transports.
  enableKeepalive?: boolean;
  // Referrer policy to use for fetch transport requests.
  // Has no effect on xhr/beacon transports.
  referrerPolicy?: ReferrerPolicy;
}

export type TransportTypeOrOptions = TransportType | TransportOptions;
