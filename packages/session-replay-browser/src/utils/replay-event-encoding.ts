import type { eventWithTime } from '@amplitude/rrweb-types';
import { deflateJson } from './gzip';

/** rrweb-packer marker; ingestion unpack scripts expect this on zlib-compressed events. */
export const RRWEB_PACK_MARKER = 'v1';

export function serializeReplayEvent(event: eventWithTime & { delay?: number }): string {
  const { type, timestamp, delay, data } = event;
  return delay != null ? JSON.stringify({ type, timestamp, delay, data }) : JSON.stringify({ type, timestamp, data });
}

/** JSON payload compressed with zlib (CompressionStream deflate) before latin1 + JSON.stringify wrap. */
function serializeReplayEventForZlib(event: eventWithTime & { delay?: number }): string {
  const { type, timestamp, delay, data } = event;
  return delay != null
    ? JSON.stringify({ type, timestamp, delay, data, v: RRWEB_PACK_MARKER })
    : JSON.stringify({ type, timestamp, data, v: RRWEB_PACK_MARKER });
}

function uint8ArrayToLatin1(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
}

/**
 * Encodes an rrweb event for storage in the replay events manager.
 * Default: zlib-compress (CompressionStream `deflate` = zlib wrapper) then
 * `JSON.stringify(latin1Bytes)` — same wire shape as legacy `JSON.stringify(pack(event))`.
 * Legacy opt-in: plain key-ordered JSON string.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function encodeReplayEventForStorage(
  event: eventWithTime,
  options: { compress?: boolean; scope?: any },
): Promise<string> {
  if (!options.compress) {
    return serializeReplayEvent(event);
  }
  if (options.scope == null || !('CompressionStream' in options.scope)) {
    return serializeReplayEvent(event);
  }
  const json = serializeReplayEventForZlib(event);
  const zlibBytes = await deflateJson(json, options.scope);
  if (!zlibBytes) {
    return serializeReplayEvent(event);
  }
  return JSON.stringify(uint8ArrayToLatin1(zlibBytes));
}
