require('fake-indexeddb/auto');
const { IDBFactory } = require('fake-indexeddb');
const structuredClone = require('@ungap/structured-clone');
const nodeFetch = require('node-fetch');

global.structuredClone = structuredClone.default;
global.beforeEach(() => {
  indexedDB = new IDBFactory();
});
global.Request = nodeFetch.Request;
global.Response = nodeFetch.Response;
global.fetch = nodeFetch;
