require('fake-indexeddb/auto');
const { IDBFactory } = require('fake-indexeddb');
const structuredClone = require('@ungap/structured-clone');
const { TextEncoder, TextDecoder } = require('util');

global.structuredClone = structuredClone.default;
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.beforeEach(() => {
  global.indexedDB = new IDBFactory();
});
