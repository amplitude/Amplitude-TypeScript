import { isNewSession } from '../src/session';

describe('session', () => {
  const sessionTimeout: number = 30 * 60 * 1000;

  test('should be in a same session for undefined lastEventTime', () => {
    const isEventInNewSession = isNewSession(sessionTimeout, undefined);

    expect(isEventInNewSession).toBe(false);
  });

  test('should be a new session', () => {
    const lastEventTime = Date.now() - sessionTimeout * 2;
    const isEventInNewSession = isNewSession(sessionTimeout, lastEventTime);

    expect(isEventInNewSession).toBe(true);
  });

  test('should be in a same session', () => {
    const lastEventTime = Date.now();
    const isEventInNewSession = isNewSession(sessionTimeout, lastEventTime);

    expect(isEventInNewSession).toBe(false);
  });
});
