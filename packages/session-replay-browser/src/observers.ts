import { getGlobalScope } from '@amplitude/analytics-core';

export type ResponseBodyStatus = 'captured' | 'truncated' | 'skipped_binary' | 'error';

export interface NetworkRequestEvent {
  timestamp: number;
  type: 'fetch';
  method: string;
  url: string;
  status?: number;
  duration?: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  responseBodyStatus?: ResponseBodyStatus;
  error?: {
    name: string;
    message: string;
  };
}

export type NetworkEventCallback = (event: NetworkRequestEvent) => void;

export interface NetworkBodyConfig {
  request?: boolean;
  response?: boolean;
  maxBodySizeBytes?: number;
}

export interface NetworkConfig {
  enabled: boolean;
  body?: NetworkBodyConfig;
}

const DEFAULT_MAX_BODY_SIZE_BYTES = 10240; // 10KB

const BINARY_CONTENT_TYPE_PREFIXES = ['image/', 'audio/', 'video/', 'application/octet-stream', 'font/'];

function isBinaryContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return BINARY_CONTENT_TYPE_PREFIXES.some((prefix) => contentType.toLowerCase().startsWith(prefix));
}

function serializeRequestBody(body: BodyInit | null | undefined): string | undefined {
  if (body === null || body === undefined) return undefined;
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof FormData) {
    const parts: string[] = [];
    body.forEach((value, key) => {
      parts.push(`${key}=${typeof value === 'string' ? value : '[File]'}`);
    });
    return parts.join('&');
  }
  // Blob, ArrayBuffer, ArrayBufferView, ReadableStream — skip
  return undefined;
}

export class NetworkObservers {
  private fetchObserver: (() => void) | null = null;
  private eventCallback?: NetworkEventCallback;
  private networkConfig?: NetworkConfig;

  start(eventCallback: NetworkEventCallback, networkConfig?: NetworkConfig) {
    this.eventCallback = eventCallback;
    this.networkConfig = networkConfig;
    this.observeFetch();
  }

  stop() {
    this.fetchObserver?.();
    this.fetchObserver = null;
    this.eventCallback = undefined;
    this.networkConfig = undefined;
  }

  protected notifyEvent(event: NetworkRequestEvent) {
    this.eventCallback?.(event);
  }

  private observeFetch() {
    const globalScope = getGlobalScope();
    if (!globalScope) return;

    const originalFetch = globalScope.fetch;
    if (!originalFetch) return;

    globalScope.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const startTime = Date.now();
      const requestEvent: NetworkRequestEvent = {
        timestamp: startTime,
        type: 'fetch',
        method: init?.method || 'GET', // Fetch API defaulted to GET when no method is provided
        url: input.toString(),
        requestHeaders: init?.headers as Record<string, string>,
      };

      // Capture request body if configured
      const bodyConfig = this.networkConfig?.body;
      if (bodyConfig?.request) {
        const serialized = serializeRequestBody(init?.body);
        if (serialized !== undefined) {
          const maxBytes = bodyConfig.maxBodySizeBytes ?? DEFAULT_MAX_BODY_SIZE_BYTES;
          requestEvent.requestBody = serialized.length > maxBytes ? serialized.slice(0, maxBytes) : serialized;
        }
      }

      try {
        const response = await originalFetch(input, init);
        const endTime = Date.now();

        requestEvent.status = response.status;
        requestEvent.duration = endTime - startTime;

        // Convert Headers
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        requestEvent.responseHeaders = headers;

        if (bodyConfig?.response) {
          const contentType = headers['content-type'] || null;
          if (isBinaryContentType(contentType)) {
            requestEvent.responseBodyStatus = 'skipped_binary';
            this.notifyEvent(requestEvent);
          } else {
            const cloned = response.clone();
            // Read body without blocking the response return to the caller
            cloned.text().then(
              (text) => {
                const maxBytes = bodyConfig.maxBodySizeBytes ?? DEFAULT_MAX_BODY_SIZE_BYTES;
                if (text.length > maxBytes) {
                  requestEvent.responseBody = text.slice(0, maxBytes);
                  requestEvent.responseBodyStatus = 'truncated';
                } else {
                  requestEvent.responseBody = text;
                  requestEvent.responseBodyStatus = 'captured';
                }
                this.notifyEvent(requestEvent);
              },
              () => {
                requestEvent.responseBodyStatus = 'error';
                this.notifyEvent(requestEvent);
              },
            );
          }
        } else {
          this.notifyEvent(requestEvent);
        }

        return response;
      } catch (error) {
        const endTime = Date.now();
        requestEvent.duration = endTime - startTime;

        // Capture error information
        const typedError = error as Error;
        requestEvent.error = {
          name: typedError.name || 'UnknownError',
          message: typedError.message || 'An unknown error occurred',
        };

        this.notifyEvent(requestEvent);
        throw error;
      }
    };

    this.fetchObserver = () => {
      globalScope.fetch = originalFetch;
    };
  }
}
