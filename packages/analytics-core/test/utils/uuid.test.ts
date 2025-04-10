import { UUID } from '../../src/utils/uuid';

describe('UUID', () => {
  test('should generate a valid UUID-4', () => {
    const uuid = UUID();
    expect(uuid.length).toEqual(36);
    expect(uuid.substring(14, 15)).toEqual('4');
  });
  
  test('should generate a valid UUID-4 (no native Crypto)', () => {
    const backupCrypto = (global as any).crypto;
    (global as any).crypto = null;
    
    try {
      const uuid = UUID();
      expect(uuid.length).toEqual(36);
      expect(uuid.substring(14, 15)).toEqual('4');
    } finally {
      // Restore the original crypto object
      (global as any).crypto = backupCrypto;
    }
  });
});
