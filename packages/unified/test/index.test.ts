import * as amplitude from '../src/index';
import { initAll, sessionReplay, experiment } from '../src/index';

test('should return non undefined sessionReplay and experiment after initAll() by import method 1', async () => {
  // Method 1: import * as amplitude should work
  expect(typeof amplitude.initAll).toBe('function');
  expect(typeof amplitude.sessionReplay).toBe('function');
  expect(typeof amplitude.experiment).toBe('function');

  // Test that methods work before and after initAll()
  expect(amplitude.sessionReplay()).toBeUndefined();
  expect(amplitude.experiment()).toBeUndefined();

  await amplitude.initAll('test-api-key');

  expect(amplitude.sessionReplay()).toBeDefined();
  expect(amplitude.experiment()).toBeDefined();
});

test('should return non undefined sessionReplay and experiment after initAll() by import method 2', async () => {
  // Method 2: named imports { initAll, sessionReplay, experiment } should work
  expect(typeof initAll).toBe('function');
  expect(typeof sessionReplay).toBe('function');
  expect(typeof experiment).toBe('function');

  // Test that methods work before and after initAll()
  expect(sessionReplay()).toBeUndefined();
  expect(experiment()).toBeUndefined();

  await initAll('test-api-key');

  expect(sessionReplay()).toBeDefined();
  expect(experiment()).toBeDefined();
});
