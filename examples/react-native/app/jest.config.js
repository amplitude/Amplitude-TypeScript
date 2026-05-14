module.exports = {
  preset: 'react-native',
  // The default `react-native` preset ignores `node_modules/(?!(jest-)?react-native|@react-native(-community)?)/`,
  // which assumes RN packages live at `node_modules/<pkg>/`. With pnpm they live at
  // `node_modules/.pnpm/<id>/node_modules/<pkg>/`, so the default pattern skips
  // transformation and Jest chokes on the Flow types inside @react-native/js-polyfills.
  // This pattern matches RN packages anywhere in the path.
  transformIgnorePatterns: [
    'node_modules/(?!.*(?:(?:jest-)?react-native|@react-native|@react-native-community|@react-native-async-storage|react-native-toast-message))',
  ],
  // AsyncStorage's native binding isn't available in jest. Map every import of it
  // (from this app OR from `@amplitude/analytics-react-native` in the workspace) to
  // the official mock. Using moduleNameMapper instead of jest.mock so the mock applies
  // across all pnpm-resolved copies of the package.
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/../../../node_modules/@react-native-async-storage/async-storage/jest/async-storage-mock.js',
  },
};
