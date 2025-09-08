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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with apiKey and logger', () => {
      const storage = new DiagnosticsStorage(apiKey, mockLogger);

      expect(storage.dbName).toBe('AMP_diagnostics_1234567890');
      expect(storage.logger).toBe(mockLogger);
    });
  });
});
