// Regression guard for SDKRN-8: exclude @react-native-async-storage/async-storage
// from native autolinking so this example app proves the opt-out path works.
// Combined with the in-memory `storageProvider` and `cookieStorage` wired in
// App.tsx, the SDK must boot and continue to function without RNCAsyncStorage
// linked into the iOS / Android binary.
module.exports = {
  dependencies: {
    '@react-native-async-storage/async-storage': {
      platforms: {ios: null, android: null},
    },
  },
};
