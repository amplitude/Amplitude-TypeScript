require('fake-indexeddb/auto');
const { IDBFactory } = require('fake-indexeddb');
const structuredClone = require('@ungap/structured-clone');
const { TextEncoder, TextDecoder } = require('util');

global.structuredClone = structuredClone.default;
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// jsdom 20 does not implement crypto.randomUUID — polyfill with Node's implementation.
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: { ...globalThis.crypto, randomUUID: () => require('crypto').randomUUID() },
    writable: true,
  });
}

global.beforeEach(() => {
  global.indexedDB = new IDBFactory();
});
