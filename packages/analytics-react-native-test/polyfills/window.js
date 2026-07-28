/**
 * Hermes throws ReferenceError on bare `window` unless it exists on the global
 * object. RN's setUpGlobals normally does this via InitializeCore; under
 * react-native-harness that can run too late (or not at all) relative to
 * DebuggingOverlayRegistry. Keep this polyfill first in getPolyfills.
 */
if (typeof globalThis !== 'undefined') {
  if (globalThis.window === undefined) {
    globalThis.window = globalThis;
  }
  if (globalThis.self === undefined) {
    globalThis.self = globalThis;
  }
}
