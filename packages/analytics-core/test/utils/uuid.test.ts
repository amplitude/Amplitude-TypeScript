import { UUID } from '../../src/utils/uuid';

describe('UUID', () => {
  const testUuids = {} as Record<string, boolean>;

  function assertUuidFormat(uuid: string) {
    expect(uuid.length).toEqual(36);
    expect(uuid.charAt(14)).toEqual('4');
    expect(['8', '9', 'a', 'b'].includes(uuid.charAt(19))).toEqual(true);
    expect(uuid).toMatch(/^[0-9a-fA-F-]+$/);
    const tokens = uuid.split('-');
    expect(tokens.length).toEqual(5);
    expect(tokens[0].length).toEqual(8);
    expect(tokens[1].length).toEqual(4);
    expect(tokens[2].length).toEqual(4);
    expect(tokens[3].length).toEqual(4);
    expect(tokens[4].length).toEqual(12);
    expect(testUuids[uuid]).toEqual(undefined); // check for duplicates
    testUuids[uuid] = true;
  }

  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
  /* eslint-disable @typescript-eslint/no-unsafe-call */
  test('should generate a valid UUID-4', () => {
    // polyfill getRandomValues for Node < 20
    // this is not needed in Node >= 20
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
    assertUuidFormat(uuid);
  });

  test('should generate a valid UUID-4 (no native Crypto)', () => {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    const backupCrypto = (global as any).crypto;
    Object.defineProperty(global, 'crypto', {
      value: null,
      writable: true,
    });

    try {
      // Generate 100 UUIDs and check that they are all valid UUIDs
      for (let i = 0; i < 100; i++) {
        const uuid = UUID();
        assertUuidFormat(uuid);
      }
    } finally {
      // Restore the original crypto object
      (global as any).crypto = backupCrypto;
    }
  });
});
