import { getConfig, createConfig } from '../src/config';

describe('Config', () => {
  const API_KEY = 'apikey';
  const USER_ID = 'userid';

  test('should create new config', () => {
    expect(getConfig()).toBeUndefined();
    createConfig(API_KEY, USER_ID);
    expect(getConfig()).toBeDefined();
  });
});
