require('fake-indexeddb/auto');
const { IDBFactory } = require('fake-indexeddb');
const structuredClone = require('@ungap/structured-clone');

global.structuredClone = structuredClone.default;
global.beforeEach(() => {
  indexedDB = new IDBFactory();
});
