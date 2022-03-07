import { getConfig, createConfig } from '../src/config';
import { API_KEY, USER_ID, DEFAULT_OPTIONS } from './helpers/default';

describe('config', () => {
  test('should create new config', () => {
    expect(getConfig()).toBeUndefined();
    createConfig(API_KEY, USER_ID, DEFAULT_OPTIONS);
    expect(getConfig()).toBeDefined();
  });
});
