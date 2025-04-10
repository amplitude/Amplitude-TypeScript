import { UUID } from '../../src/utils/uuid';

describe('UUID', () => {
  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
  /* eslint-disable @typescript-eslint/no-unsafe-call */
  test('should generate a valid UUID-4', () => {
    // hack to make sure that the test runs in nodejs v18.x
    // this is never reached in Node >= 20
    if (!globalThis.crypto?.getRandomValues) {
      (globalThis as any).crypto = {
        getRandomValues: (arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
          }
          return arr;
        },
      };
    }
    const uuid = UUID();
    expect(uuid.length).toEqual(36);
    expect(uuid.substring(14, 15)).toEqual('4');
  });

  test('should generate a valid UUID-4 (no native Crypto)', () => {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
