import { Config } from '../src/config';

describe('Config', () => {
  const API_KEY = 'apikey';
  const USER_ID = 'userid';

  test('should create new config', () => {
    expect(Config.get()).toBeUndefined();
    Config.create(API_KEY, USER_ID);
    expect(Config.get()).toBeDefined();
  });
});
