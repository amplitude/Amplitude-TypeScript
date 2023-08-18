import { UNMASK_TEXT_CLASS } from '../src/constants';
import { generateHashCode, isSessionInSample, maskInputFn } from '../src/helpers';

describe('SessionReplayPlugin helpers', () => {
  describe('maskInputFn', () => {
    test('should not mask an element whose class list has amp-unmask in it', () => {
      const htmlElement = document.createElement('div');
      htmlElement.classList.add(UNMASK_TEXT_CLASS);
      const result = maskInputFn('some text', htmlElement);
      expect(result).toEqual('some text');
    });
    test('should mask any other element', () => {
      const htmlElement = document.createElement('div');
      htmlElement.classList.add('another-class');
      const result = maskInputFn('some text', htmlElement);
      expect(result).toEqual('*********');
    });
    test('should handle an element without a class list', () => {
      const htmlElement = {} as unknown as HTMLElement;
      const result = maskInputFn('some text', htmlElement);
      expect(result).toEqual('*********');
    });
  });

  describe('generateHashCode', () => {
    test('should return 0 if string length is 0', () => {
      const hashCode = generateHashCode('');
      expect(hashCode).toEqual(0);
    });
    test('should return hash for numeric string', () => {
      const hashCode = generateHashCode('1691093770366');
      expect(hashCode).toEqual(139812688);
    });
    test('should return hash for alphabetic string', () => {
      const hashCode = generateHashCode('my_session_identifier');
      expect(hashCode).toEqual(989939557);
    });
  });

  describe('isSessionInSample', () => {
    test('should deterministically return true if calculation puts session id below sample rate', () => {
      const result = isSessionInSample(1691092433788, 0.5);
      expect(result).toEqual(true);
    });
    test('should deterministically return false if calculation puts session id above sample rate', () => {
      const result = isSessionInSample(1691092416403, 0.5);
      expect(result).toEqual(false);
    });
  });
});
