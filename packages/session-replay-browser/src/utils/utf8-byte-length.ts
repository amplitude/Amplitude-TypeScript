/**
 * UTF-8 byte length of `str`, matching `TextEncoder` / `Blob([str]).size`.
 *
 * Unpaired surrogates encode as U+FFFD (3 bytes), the same replacement the
 * platform encoder uses. The loop is allocation-free: `new Blob([str]).size`
 * copies the string, which showed up on the per-event capture path.
 *
 * A UTF-16 code unit is at most 3 UTF-8 bytes (a surrogate pair is 4 bytes
 * across 2 code units). Callers that only need a threshold can skip this
 * scan when `str.length * 3 <= maxBytes`.
 */
export function utf8ByteLength(str: string): number {
  const len = str.length;
  let i = 0;
  // rrweb payloads are overwhelmingly ASCII JSON. Bail out before the
  // multi-byte branches so the common path is a single predictable compare.
  for (; i < len; i++) {
    if (str.charCodeAt(i) > 0x7f) break;
  }
  if (i === len) return len;

  let bytes = i;
  for (; i < len; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x7f) {
      bytes++;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate — check for a valid low surrogate before consuming the pair.
      const next = i + 1 < len ? str.charCodeAt(i + 1) : NaN;
      if (next >= 0xdc00 && next <= 0xdfff) {
        // Valid surrogate pair → encodes a code point above U+FFFF (4 UTF-8 bytes).
        bytes += 4;
        i++;
      } else {
        // Orphaned high surrogate — treated as a replacement character (3 UTF-8 bytes).
        bytes += 3;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // Orphaned low surrogate — treated as a replacement character (3 UTF-8 bytes).
      bytes += 3;
    } else {
      // Other BMP character (U+0800–U+FFFF, excluding surrogates): 3 UTF-8 bytes.
      bytes += 3;
    }
  }
  return bytes;
}

/** Sum of UTF-8 byte lengths. Equivalent to `new Blob(parts).size` for an array of strings. */
export function utf8ByteLengthOf(parts: readonly string[]): number {
  let total = 0;
  for (let i = 0; i < parts.length; i++) {
    total += utf8ByteLength(parts[i]);
  }
  return total;
}

/**
 * Byte length when `str` exceeds `maxBytes`, otherwise `undefined`.
 * Skips the scan entirely when the string cannot reach the cap: every UTF-16
 * code unit is at most 3 UTF-8 bytes, and at least 1.
 */
export function utf8ByteLengthIfOver(str: string, maxBytes: number): number | undefined {
  if (str.length * 3 <= maxBytes) return undefined;
  const bytes = utf8ByteLength(str);
  return bytes > maxBytes ? bytes : undefined;
}

/**
 * Longest prefix of `str` whose UTF-8 byte length is `<= maxBytes`.
 * Does not split a surrogate pair: a 4-byte character that does not fit is
 * left out entirely rather than emitting a lone high surrogate.
 */
export function truncateUtf8(str: string, maxBytes: number): { value: string; truncated: boolean } {
  if (maxBytes < 0) maxBytes = 0;
  const len = str.length;
  let bytes = 0;
  let i = 0;
  for (; i < len; i++) {
    const code = str.charCodeAt(i);
    let width = 1;
    let units = 1;
    if (code <= 0x7f) {
      width = 1;
    } else if (code <= 0x7ff) {
      width = 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < len ? str.charCodeAt(i + 1) : NaN;
      if (next >= 0xdc00 && next <= 0xdfff) {
        width = 4;
        units = 2;
      } else {
        width = 3;
      }
    } else {
      width = 3;
    }
    if (bytes + width > maxBytes) break;
    bytes += width;
    if (units === 2) i++;
  }
  if (i >= len) return { value: str, truncated: false };
  return { value: str.slice(0, i), truncated: true };
}
