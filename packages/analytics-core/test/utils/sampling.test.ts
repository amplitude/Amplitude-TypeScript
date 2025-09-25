import { generateHashCode, isSessionInSample } from '../../src/utils/sampling';

describe('Sampling utilities', () => {
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
      const result = isSessionInSample(1691092433788, 0.56);
      expect(result).toEqual(true);
    });
    test('should deterministically return false if calculation puts session id above sample rate', () => {
      const result = isSessionInSample(1691092416403, 0.13);
      expect(result).toEqual(false);
    });
  });
});
