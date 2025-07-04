// Mock React Native modules that cause issues in Jest
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: jest.fn(),
  },
  NativeModules: {},
  NativeEventEmitter: jest.fn(),
}));

// Mock @react-native/polyfills
jest.mock('@react-native/polyfills', () => ({}));

// Mock any other React Native related modules that might cause issues
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
})); 