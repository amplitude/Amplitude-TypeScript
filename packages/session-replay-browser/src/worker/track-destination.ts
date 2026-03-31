/* eslint-disable no-restricted-globals */

import { KB_SIZE, MAX_URL_LENGTH, RETRY_TIMEOUT_MS } from '../constants';
import { MAX_RETRIES_EXCEEDED_MESSAGE, UNEXPECTED_ERROR_MESSAGE, UNEXPECTED_NETWORK_ERROR_MESSAGE } from '../messages';
import { gzipJson } from '../utils/gzip';
import { getServerUrl } from '../utils/server-url';

interface SendContext {
  apiKey: string;
  deviceId: string;
  sessionId: number | string;
  events: string[]; // original event strings, used for size calculation only
  eventType: string;
  flushMaxRetries: number;
  sampleRate: number;
  serverZone?: string;
  trackServerUrl?: string;
  version?: { type: string; version: string };
  currentUrl: string;
  sdkVersion: string;
}

async function doFetch(
  payloadJson: string,
  context: SendContext,
): Promise<{ shouldRetry: boolean; success: boolean; message: string }> {
  try {
    const gzipped = 'CompressionStream' in self ? await gzipJson(payloadJson, self) : null;
    const sessionReplayLibrary = `${context.version?.type ?? 'standalone'}/${
      context.version?.version ?? context.sdkVersion
    }`;
    const urlParams = new URLSearchParams({
      device_id: context.deviceId,
      session_id: `${context.sessionId}`,
      type: context.eventType,
    });
    const serverUrl = `${getServerUrl(context.serverZone, context.trackServerUrl)}?${urlParams.toString()}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: '*/*',
      Authorization: `Bearer ${context.apiKey}`,
      'X-Client-Version': context.sdkVersion,
      'X-Client-Library': sessionReplayLibrary,
      'X-Client-Url': context.currentUrl.substring(0, MAX_URL_LENGTH),
      'X-Client-Sample-Rate': `${context.sampleRate}`,
      'X-Sampling-Hash-Alg': 'xxhash32',
      ...(gzipped ? { 'Content-Encoding': 'gzip' } : {}),
    };
    const res = await fetch(serverUrl, { method: 'POST', headers, body: (gzipped ?? payloadJson) as BodyInit });
    if (res === null) {
      return { shouldRetry: false, success: false, message: UNEXPECTED_ERROR_MESSAGE };
    }
    if (res.status >= 200 && res.status < 300) {
      const sizeKB = Math.round(new Blob(context.events).size / KB_SIZE);
      return {
        shouldRetry: false,
        success: true,
        message: `Session replay event batch tracked successfully for session id ${context.sessionId}, size of events: ${sizeKB} KB`,
      };
    }
    if (res.status >= 500) {
      return { shouldRetry: true, success: false, message: `HTTP ${res.status}` };
    }
    return { shouldRetry: false, success: false, message: UNEXPECTED_NETWORK_ERROR_MESSAGE };
  } catch (e) {
    return { shouldRetry: false, success: false, message: String(e) };
  }
}

async function sendWithRetry(id: string, payloadJson: string, context: SendContext, useRetry: boolean): Promise<void> {
  // Start at 1 to match the main-thread's addToQueue behaviour, which increments
  // attempts to 1 before the first send. This ensures the same total number of
  // attempts and the same per-retry delay as the main-thread path.
  let attempt = 1;
  for (;;) {
    const result = await doFetch(payloadJson, context);
    if (result.success) {
      postMessage({ type: 'log', id, message: result.message });
      postMessage({ type: 'complete', id });
      return;
    }
    if (useRetry && result.shouldRetry && attempt < context.flushMaxRetries) {
      await new Promise<void>((resolve) => setTimeout(resolve, Math.random() * attempt * RETRY_TIMEOUT_MS));
      attempt++;
      continue;
    }
    const msg = attempt >= context.flushMaxRetries ? MAX_RETRIES_EXCEEDED_MESSAGE : result.message;
    postMessage({ type: 'warn', id, message: msg });
    postMessage({ type: 'complete', id });
    return;
  }
}

onmessage = async (e: MessageEvent) => {
  const { type, id, payload, context, useRetry } = e.data as {
    type: string;
    id: string;
    payload: { version: number; events: unknown[] };
    context: SendContext;
    useRetry: boolean;
  };
  if (type === 'send') {
    const payloadJson = JSON.stringify(payload);
    await sendWithRetry(id, payloadJson, context, useRetry);
  }
};

// exported for testing
export const trackDestinationOnMessage = onmessage;
