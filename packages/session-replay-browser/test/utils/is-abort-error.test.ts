import { logIdbError } from '../../src/utils/is-abort-error';

describe('logIdbError', () => {
  const mockLogger = {
    debug: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  test('should log at debug level for AbortError', () => {
    const abortError = new DOMException('The transaction was aborted', 'AbortError');
    logIdbError(mockLogger, 'idb failed', abortError);
    expect(mockLogger.debug).toHaveBeenCalledWith('idb failed');
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  test('should log at debug level for plain object with name AbortError', () => {
    const abortLike = { name: 'AbortError', message: 'aborted' };
    logIdbError(mockLogger, 'idb failed', abortLike);
    expect(mockLogger.debug).toHaveBeenCalledWith('idb failed');
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  test('should log at warn level for non-AbortError', () => {
    logIdbError(mockLogger, 'idb failed', new Error('something broke'));
    expect(mockLogger.warn).toHaveBeenCalledWith('idb failed');
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });

  test('should log at warn level when error is undefined', () => {
    logIdbError(mockLogger, 'idb failed');
    expect(mockLogger.warn).toHaveBeenCalledWith('idb failed');
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });
});
