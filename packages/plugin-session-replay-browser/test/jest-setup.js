require('fake-indexeddb/auto');
const { IDBFactory } = require('fake-indexeddb');
const structuredClone = require('@ungap/structured-clone');
const nodeFetch = require('node-fetch');

// Prefer Node's native structuredClone (browser-equivalent: handles deep & circular object graphs,
// e.g. fake-indexeddb cloning diagnostics/SR records). The @ungap polyfill overflows on such
// graphs, so only use it as a fallback when native isn't available.
global.structuredClone = typeof global.structuredClone === 'function' ? global.structuredClone : structuredClone.default;
global.beforeEach(() => {
  indexedDB = new IDBFactory();
});
global.Request = nodeFetch.Request;
global.Response = nodeFetch.Response;
global.fetch = nodeFetch;
