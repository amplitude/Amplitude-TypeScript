import { isNewSession, isSessionExpired } from '../src/session';

const sessionTimeout: number = 30 * 60 * 1000;

describe('session', () => {
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

test('should be in a same session for undefined lastEventTime', () => {
  const isEventInNewSession = isSessionExpired(sessionTimeout, undefined);

  expect(isEventInNewSession).toBe(false);
});

test('should be a new session', () => {
  const lastEventTime = Date.now() - sessionTimeout * 2;
  const isEventInNewSession = isSessionExpired(sessionTimeout, lastEventTime);

  expect(isEventInNewSession).toBe(true);
});

test('should be in a same session', () => {
  const lastEventTime = Date.now();
  const isEventInNewSession = isSessionExpired(sessionTimeout, lastEventTime);

  expect(isEventInNewSession).toBe(false);
});
