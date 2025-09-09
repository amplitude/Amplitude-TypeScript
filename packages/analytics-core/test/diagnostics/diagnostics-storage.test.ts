import 'fake-indexeddb/auto';
import { DiagnosticsStorage } from '../../src/diagnostics/diagnostics-storage';
import { ILogger } from '../../src/logger';

// Mock logger
const mockLogger: ILogger = {
  disable: jest.fn(),
  enable: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const apiKey = '1234567890abcdefg';

describe('DiagnosticsStorage', () => {
  let storage: DiagnosticsStorage;
  beforeEach(() => {
    jest.clearAllMocks();
    storage = new DiagnosticsStorage(apiKey, mockLogger);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with apiKey and logger', () => {
      expect(storage.dbName).toBe('AMP_diagnostics_1234567890');
      expect(storage.logger).toBe(mockLogger);
    });
  });

  describe('getDB', () => {
    test('should return the db', async () => {
      await expect(storage.getDB()).resolves.toBeDefined();
    });

    test('should call openDB if dbPromise is not set', async () => {
      storage.dbPromise = null;
      const mockDB = {} as IDBDatabase;
      const openDBSpy = jest.spyOn(storage, 'openDB').mockResolvedValue(mockDB);

      await expect(storage.getDB()).resolves.toBeDefined();
      expect(openDBSpy).toHaveBeenCalled();
    });
  });

  describe('setTags', () => {
    test('should set tags', async () => {
      await expect(storage.setTags({ test: 'test' })).resolves.toBeUndefined();
    });
  });
});
