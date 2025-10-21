require('fake-indexeddb/auto');
const { IDBFactory } = require('fake-indexeddb');
const structuredClone = require('@ungap/structured-clone');

global.structuredClone = structuredClone.default;
global.beforeEach(() => {
  global.indexedDB = new IDBFactory();
});
