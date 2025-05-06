import instance from '../src/unified-client-factory';

test('should create a UnifiedClient instance with expected methods', () => {
  expect(instance).toHaveProperty('experiment');
  expect(instance).toHaveProperty('sr');
  expect(typeof instance.initAll).toBe('function');
  expect(typeof instance.init).toBe('function');
  expect(typeof instance.add).toBe('function');
  expect(typeof instance.remove).toBe('function');
  expect(typeof instance.track).toBe('function');
  expect(typeof instance.logEvent).toBe('function');
  expect(typeof instance.identify).toBe('function');
  expect(typeof instance.groupIdentify).toBe('function');
  expect(typeof instance.setGroup).toBe('function');
  expect(typeof instance.revenue).toBe('function');
  expect(typeof instance.flush).toBe('function');
  expect(typeof instance.getUserId).toBe('function');
  expect(typeof instance.setUserId).toBe('function');
  expect(typeof instance.getDeviceId).toBe('function');
  expect(typeof instance.setDeviceId).toBe('function');
  expect(typeof instance.reset).toBe('function');
  expect(typeof instance.getSessionId).toBe('function');
  expect(typeof instance.setSessionId).toBe('function');
  expect(typeof instance.extendSession).toBe('function');
  expect(typeof instance.setOptOut).toBe('function');
  expect(typeof instance.setTransport).toBe('function');
});
