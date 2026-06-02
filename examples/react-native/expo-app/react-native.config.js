const android = require('@react-native-community/cli-platform-android');

module.exports = {
  commands: android.commands,
  platforms: {
    android: {
      projectConfig: android.projectConfig,
      dependencyConfig: android.dependencyConfig,
    },
  },
};
