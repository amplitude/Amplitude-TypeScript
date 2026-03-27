// Pure JS xxHash32 implementation based on the official specification:
// https://github.com/Cyan4973/xxHash/blob/dev/doc/xxhash_spec.md
const PRIME32_1 = 0x9e3779b1;
const PRIME32_2 = 0x85ebca77;
const PRIME32_3 = 0xc2b2ae3d;
const PRIME32_4 = 0x27d4eb2f;
const PRIME32_5 = 0x165667b1;

function rotl32(x: number, r: number): number {
  return ((x << r) | (x >>> (32 - r))) >>> 0;
}

function round(acc: number, input: number): number {
  acc = (acc + Math.imul(input, PRIME32_2)) >>> 0;
  acc = rotl32(acc, 13);
  acc = Math.imul(acc, PRIME32_1) >>> 0;
  return acc;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function toUTF8Bytes(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        c = ((c - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

export function xxHash32(input: string, seed = 0): number {
  const bytes = toUTF8Bytes(input);
  const len = bytes.length;
  let h32: number;
  let offset = 0;

  if (len >= 16) {
    let v1 = (seed + PRIME32_1 + PRIME32_2) >>> 0;
    let v2 = (seed + PRIME32_2) >>> 0;
    let v3 = seed >>> 0;
    let v4 = (seed - PRIME32_1) >>> 0;

    while (offset <= len - 16) {
      v1 = round(v1, readU32(bytes, offset));
      offset += 4;
      v2 = round(v2, readU32(bytes, offset));
      offset += 4;
      v3 = round(v3, readU32(bytes, offset));
      offset += 4;
      v4 = round(v4, readU32(bytes, offset));
      offset += 4;
    }

    h32 = (rotl32(v1, 1) + rotl32(v2, 7) + rotl32(v3, 12) + rotl32(v4, 18)) >>> 0;
  } else {
    h32 = (seed + PRIME32_5) >>> 0;
  }

  h32 = (h32 + len) >>> 0;

  while (offset <= len - 4) {
    h32 = (h32 + Math.imul(readU32(bytes, offset), PRIME32_3)) >>> 0;
    h32 = Math.imul(rotl32(h32, 17), PRIME32_4) >>> 0;
    offset += 4;
  }

  while (offset < len) {
    h32 = (h32 + Math.imul(bytes[offset], PRIME32_5)) >>> 0;
    h32 = Math.imul(rotl32(h32, 11), PRIME32_1) >>> 0;
    offset++;
  }

  h32 ^= h32 >>> 15;
  h32 = Math.imul(h32, PRIME32_2) >>> 0;
  h32 ^= h32 >>> 13;
  h32 = Math.imul(h32, PRIME32_3) >>> 0;
  h32 ^= h32 >>> 16;

  return h32 >>> 0;
}

export function isSessionInSample(sessionId: string | number, sampleRate: number): boolean {
  const hash = xxHash32(sessionId.toString());
  const mod = hash % 1_000_000;
  return mod / 1_000_000 < sampleRate;
}
