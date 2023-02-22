/* eslint-disable @typescript-eslint/unbound-method */

import { createAmplitudeMock, createConfigurationMock } from '../helpers/mock';
import { sessionHandlerPlugin } from '../../src/plugins/session-handler';

describe('sessionHandlerPlugin', () => {
  let amplitude = createAmplitudeMock();

  beforeEach(() => {
    amplitude = createAmplitudeMock();
  });

  test('should use the existing session', async () => {
    const plugin = sessionHandlerPlugin();
    const time = Date.now();
    const config = createConfigurationMock({
      sessionId: 1,
      lastEventTime: time - 999,
      sessionTimeout: 1000,
    });
    await plugin.setup(config, amplitude);
    await plugin.execute({
      event_type: 'Test Event',
    });

    // assert session id is unchanged
    expect(config.sessionId).toBe(1);

    // assert last event time was updated
    expect(config.lastEventTime).not.toBe(time - 999);

    // assert no events are instrumented
    expect(amplitude.track).toHaveBeenCalledTimes(0);
  });

  test('should use the existing session with no lastEventTime', async () => {
    const plugin = sessionHandlerPlugin();
    const config = createConfigurationMock({
      sessionId: 1,
      lastEventTime: undefined,
      sessionTimeout: 1000,
    });
    await plugin.setup(config, amplitude);
    await plugin.execute({
      event_type: 'Test Event',
    });

    // assert session id is unchanged
    expect(config.sessionId).toBe(1);

    // assert last event time was updated
    expect(config.lastEventTime).not.toBeUndefined();

    // assert no events are instrumented
    expect(amplitude.track).toHaveBeenCalledTimes(0);
  });

  test('should assign new session', async () => {
    const plugin = sessionHandlerPlugin();
    const time = Date.now();
    const config = createConfigurationMock({
      sessionId: 1,
      lastEventTime: time - 1001,
      sessionTimeout: 1000,
      autoTracking: {
        sessions: true,
      },
    });
    await plugin.setup(config, amplitude);
    await plugin.execute({
      event_type: 'Test Event',
    });

    // assert session id was changed
    expect(amplitude.setSessionId).toHaveBeenCalledTimes(1);
  });

  test.each(['session_start', 'session_end'])('should handle session events', async (eventType) => {
    const plugin = sessionHandlerPlugin();
    const time = Date.now();
    const config = createConfigurationMock({
      sessionId: 1,
      lastEventTime: time - 1001,
      sessionTimeout: 1000,
      autoTracking: {
        sessions: true,
      },
    });
    await plugin.setup(config, amplitude);
    await plugin.execute({
      event_type: eventType,
    });

    // assert session id was changed
    expect(amplitude.setSessionId).toHaveBeenCalledTimes(0);
  });
});
