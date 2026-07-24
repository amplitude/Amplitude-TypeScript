import { Platform } from 'react-native';

/** Keep in sync with scripts/mock-api-server.mjs */
export const MOCK_API_PORT = 9876;

/**
 * Host that reaches the Node mock API from this device/simulator.
 * Android emulator → host loopback is 10.0.2.2; iOS Simulator → localhost.
 */
export function getMockApiHost(): string {
  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
}

export function mockApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `http://${getMockApiHost()}:${MOCK_API_PORT}${normalized}`;
}
