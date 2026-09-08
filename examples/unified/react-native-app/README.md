# Unified React Native SDK example

This bare React Native application demonstrates the customer-facing, one-package installation flow for `@amplitude/unified-react-native`. Its only direct Amplitude dependency is the unified SDK. Analytics, Experiment, Session Replay, Guides and Surveys, and AsyncStorage are installed transitively and do not appear as application dependencies.

The application-level [`react-native.config.js`](./react-native.config.js) loads the unified SDK's autolinking preset so React Native CLI can discover those transitive native modules.

## Add the unified SDK to an application

From an existing bare React Native application, install one package:

```sh
npm install @amplitude/unified-react-native
```

This command adds only `@amplitude/unified-react-native` to the application's `package.json`. Do not install the Analytics, Experiment, Session Replay, Guides and Surveys, or AsyncStorage packages separately.

Next, create `react-native.config.js` in the application root:

```javascript
module.exports = require('@amplitude/unified-react-native/react-native.config');
```

If the application already has a React Native configuration, merge the preset with it:

```javascript
const amplitude = require('@amplitude/unified-react-native/react-native.config');

module.exports = {
  // Existing React Native configuration
  dependencies: {
    ...amplitude.dependencies,
    // Existing dependency overrides
  },
};
```

For iOS, run the application's normal pod installation step after installing the package:

```sh
npx pod-install
```

Then rebuild the native application. No additional JavaScript packages need to be installed. The unified SDK requires React Native 0.76 or newer.

Guides and Surveys uses React Native's typed native event emitters, so enable the React Native New Architecture before rebuilding. For Android, set `newArchEnabled=true` in `android/gradle.properties`; use your React Native version's corresponding New Architecture setup for iOS. This example already enables it for Android.

## How the autolinking preset works

React Native CLI normally discovers native modules by inspecting the dependencies declared directly in the application's `package.json`. The blade SDKs are dependencies of the unified SDK instead, so the CLI would not discover every blade from the application's dependency list alone.

The preset exported by `@amplitude/unified-react-native/react-native.config` resolves each transitive native package and returns it under React Native CLI's `dependencies` configuration. Loading that preset from the application-level `react-native.config.js` makes the packages visible to the existing native tooling:

- CocoaPods links the five iOS modules during `pod install`.
- The React Native Gradle plugin adds the five Android packages to its generated package list.
- React Native Codegen sees the Engagement and AsyncStorage specifications.

The preset only supplies package locations to React Native's standard autolinking process. It does not copy native code or initialize any SDK at runtime.

This example's [`package.json`](./package.json) uses `workspace:*` for `@amplitude/unified-react-native` so it links to the package in this repository. A customer project gets a normal published version in that same single dependency entry when running `npm install`.

## Run this repository example

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @amplitude/unified-react-native... build
pnpm --filter @amplitude/unified-react-native-example check:autolinking
```

The last command prints the React Native configuration. Its `dependencies` section should include:

- `@amplitude/analytics-react-native`
- `@amplitude/experiment-react-native-client`
- `@amplitude/plugin-engagement-react-native`
- `@amplitude/plugin-session-replay-react-native`
- `@react-native-async-storage/async-storage`

For iOS, install pods after activating the repository's Ruby version and a UTF-8 locale:

```sh
cd examples/unified/react-native-app/ios
bundle install
bundle exec pod install
```

Copy the repository's [`.env.example`](../../../.env.example) to `.env` at the repository root and set `VITE_AMPLITUDE_API_KEY`:

```sh
cp .env.example .env
```

The example's [`babel.config.js`](./babel.config.js) loads the root `.env` and inlines `VITE_AMPLITUDE_API_KEY` into the JavaScript bundle. Experiment uses the same key by default, so a separate deployment key is not required when Analytics and Experiment use the same Amplitude project.

Restart Metro after creating or changing `.env`. The example's `pnpm start` command resets Metro's transform cache so a previously bundled placeholder cannot be reused.

Environment variables embedded in a React Native bundle are visible to anyone who can inspect the application. Use `.env` to keep local configuration out of source control, not to store a client-side secret.

The app does not initialize any blade on launch. To inspect the complete initialization sequence, start the app, attach Android Studio's Network Inspector, and then press **Initialize all SDKs**. That single button calls the unified SDK's `init()` method, which initializes Analytics, starts Experiment, starts Session Replay, and boots Guides and Surveys. The example disables Session Replay remote configuration and fixes its local sample rate at `1` so the emulator is always captured; look for `track?device_id=...` requests after initialization.

Then run the app from its directory:

```sh
pnpm start
pnpm ios
# or: pnpm android
```
