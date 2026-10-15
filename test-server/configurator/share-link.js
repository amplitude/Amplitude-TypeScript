// The form state round-trips through a single query parameter, so a bookmarked URL reopens the same
// configuration.
//
// Two things keep that parameter short enough to survive being pasted around. Only the values that
// differ from the defaults travel in the link, and what's left is deflated and base64url encoded.
// Pruning also means a link made today still opens with current defaults for everything it doesn't
// mention.
const STATE_PARAM = 'config';

// Raw deflate rather than gzip: same algorithm without the header and checksum, which are dead weight
// for a string that a corrupt URL already fails loudly on.
const COMPRESSION_FORMAT = 'deflate-raw';

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Every value in the state is already JSON — strings, booleans, and the arrays and objects the field
// schemas build — so comparing serializations stands in for a deep equality check.
function isEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Returns undefined for anything matching its default, which callers drop.
function pruneToChanges(value, defaultValue) {
  if (isPlainObject(value) && isPlainObject(defaultValue)) {
    const changed = Object.entries(value)
      .map(([key, nested]) => [key, pruneToChanges(nested, defaultValue[key])])
      .filter(([, nested]) => nested !== undefined);
    return changed.length > 0 ? Object.fromEntries(changed) : undefined;
  }
  return isEqual(value, defaultValue) ? undefined : value;
}

// The schema owns the shape of the state, so only keys the defaults know about are taken from the
// link; anything else is a leftover from an older version of the form.
function mergeOverDefaults(defaults, saved) {
  if (!isPlainObject(defaults) || !isPlainObject(saved)) {
    return saved === undefined ? defaults : saved;
  }
  return Object.fromEntries(
    Object.entries(defaults).map(([key, defaultValue]) => [key, mergeOverDefaults(defaultValue, saved[key])]),
  );
}

// Response() handles the UTF-8 encoding in both directions, so the only manual step is moving between
// the compressed bytes and text a URL can carry.
async function deflate(text) {
  const compressed = new Response(text).body.pipeThrough(new CompressionStream(COMPRESSION_FORMAT));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

async function inflate(bytes) {
  const decompressed = new Response(bytes).body.pipeThrough(new DecompressionStream(COMPRESSION_FORMAT));
  return new Response(decompressed).text();
}

// base64url, so the parameter survives a URL untouched: no +, / or = to be percent-encoded or eaten
// by a form decoder.
function toBase64Url(bytes) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

// Sync, so a page opened without a saved link can render its defaults immediately rather than waiting
// on a decode that has nothing to do.
export function hasSavedState(search = window.location.search) {
  return new URLSearchParams(search).get(STATE_PARAM) !== null;
}

export async function encodeStateToUrl(state, defaults, href = window.location.href) {
  const changes = pruneToChanges(state, defaults);
  const url = new URL(href);
  if (changes === undefined) {
    url.searchParams.delete(STATE_PARAM);
  } else {
    url.searchParams.set(STATE_PARAM, toBase64Url(await deflate(JSON.stringify(changes))));
  }
  return url.toString();
}

export async function decodeStateFromUrl(defaults, search = window.location.search) {
  const saved = new URLSearchParams(search).get(STATE_PARAM);
  if (!saved) {
    return defaults;
  }
  try {
    return mergeOverDefaults(defaults, JSON.parse(await inflate(fromBase64Url(saved))));
  } catch (error) {
    // A truncated or hand-edited link shouldn't leave the page blank.
    console.warn(`Ignoring unreadable ?${STATE_PARAM} parameter`, error);
    return defaults;
  }
}
