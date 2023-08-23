import { isNewSession } from '../src/session';

describe('session', () => {
  const sessionTimeout: number = 30 * 60 * 1000;

  test('should be a new session for the first event', () => {
    const _isNewSession = isNewSession(sessionTimeout, undefined);

    expect(_isNewSession).toBe(false);
  });

  test('should be a new session', () => {
    const lastEventTime = Date.now() - sessionTimeout * 2;
    const _isNewSession = isNewSession(sessionTimeout, lastEventTime);

    expect(_isNewSession).toBe(true);
  });

  test('should be in a same session', () => {
    const lastEventTime = Date.now();
    const _isNewSession = isNewSession(sessionTimeout, lastEventTime);

    expect(_isNewSession).toBe(false);
  });
});
