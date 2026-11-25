import { Payload } from './payload';
import { Response as AnalyticsResponse } from './response';

export interface Transport {
  send(serverUrl: string, payload: Payload, enableRequestBodyCompression?: boolean): Promise<AnalyticsResponse | null>;
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

/** A fully serialized HTTP request, including SDK headers and fetch options. */
export interface HttpRequest extends RequestInit {
  url: string;
}

/**
 * Sends one HTTP request attempt. The SDK owns response parsing and retries.
 * Implementations may modify or reroute requests and must preserve abort signals and
 * keepalive behavior where supported. Reject on network errors; return HTTP error responses.
 */
export interface HttpClient {
  send(request: HttpRequest): Promise<Response>;
}
