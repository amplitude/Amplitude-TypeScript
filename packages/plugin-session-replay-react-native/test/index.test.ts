import { getDefaultConfig } from '../src/session-replay-config';

describe('Session Replay default config', () => {
  // write a test that would check the default config for session replay plugin
  it('should have autostart default to true', () => {
    const config = getDefaultConfig();
    expect(config.autoStart).toBe(true);
  });
});
