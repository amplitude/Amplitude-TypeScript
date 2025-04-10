import { UUID } from '../../src/utils/uuid';

describe('UUID', () => {
  test('should generate a valid UUID-4 (web)', () => {
    const uuid = UUID();
    expect(uuid.length).toEqual(36);
    expect(uuid.substring(14, 15)).toEqual('4');
  });
  
  test('should generate a valid UUID-4 (nodejs)', () => {
    const backupCrypto = global.crypto;
    Object.defineProperties(global, {
      crypto: {
        value: null,
        writable: true,
        enumerable: true,
        configurable: true,
      },
    });

    try {
      const uuid = UUID();
      expect(uuid.length).toEqual(36);
      expect(uuid.substring(14, 15)).toEqual('4');
    } finally {
      // Restore the original crypto object
      global.crypto = backupCrypto;
    }
  });
});
