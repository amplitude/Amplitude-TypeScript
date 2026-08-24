# Unified React Native SDK example

This bare React Native application demonstrates the one-package installation flow for `@amplitude/unified-react-native`. Its only direct Amplitude dependency is the unified SDK; Analytics, Experiment, Session Replay, Guides and Surveys, and AsyncStorage are transitive dependencies.

The application-level [`react-native.config.js`](./react-native.config.js) loads the unified SDK's autolinking preset so React Native CLI can discover those transitive native modules.

## Setup

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

Replace `YOUR_API_KEY` and `YOUR_DEPLOYMENT_KEY` in [`App.tsx`](./App.tsx), then run the app from its directory:

```sh
pnpm start
pnpm ios
# or: pnpm android
```
