import * as amplitude from '../src/index';
import { sessionReplay, experiment } from '../src/index';

test('should return non undefined sessionReplay and experiment after initAll() by import method 1 & 2', async () => {
  // Test that methods work before and after initAll()
  expect(amplitude.sessionReplay()).toBeUndefined();
  expect(amplitude.experiment()).toBeUndefined();

  await amplitude.initAll('test-api-key');

  // Method 1: import * as amplitude should work
  expect(amplitude.sessionReplay()).toBeDefined();
  expect(amplitude.experiment()).toBeDefined();
  // Method 2: named imports { initAll, sessionReplay, experiment } should work
  expect(sessionReplay()).toBeDefined();
  expect(experiment()).toBeDefined();
});
