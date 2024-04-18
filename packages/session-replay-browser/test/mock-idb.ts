import { IDBFactory } from 'fake-indexeddb';

export const createMockIDB = (dbName: string, onCreate: (db: IDBDatabase) => void) => {
  indexedDB = new IDBFactory();
  const request = indexedDB.open(dbName);
  request.onupgradeneeded = function () {
    const db = request.result;
    onCreate(db);
  };
  return indexedDB;
};
