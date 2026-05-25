<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/analytics-react-native

Official Amplitude SDK for React Native

# Installation and Quick Start

Please visit our :100:[Developer Center](https://www.docs.developers.amplitude.com/data/sdks/typescript-react-native/) for instructions on installing and using our the SDK.

## Installation

To get started with using Amplitude React Native SDK, install the package to your project via NPM. By default the SDK uses `@react-native-async-storage/async-storage` to persist identity and event queue across app launches, so install it alongside the SDK.

```sh
# npm
npm install @amplitude/analytics-react-native
npm install @react-native-async-storage/async-storage

# yarn
yarn add @amplitude/analytics-react-native
yarn add @react-native-async-storage/async-storage
```

## Opting out of AsyncStorage

If you'd rather use your own storage client (for example `react-native-mmkv`, an encrypted store, or SQLite), you can supply your own storage and exclude AsyncStorage from your native build.

The SDK uses two separate storage slots:

- `storageProvider` — the event queue (events waiting to be flushed to Amplitude).
- `cookieStorage` — identity / session state (device ID, user ID, session ID).

To fully opt out, override **both**. If you only override `storageProvider`, the SDK still tries to read/write identity through the default chain, which falls back to AsyncStorage on native — and if you've also removed AsyncStorage, identity degrades to in-memory and resets on every app launch.

1. Implement the `Storage` interface and pass both slots. Note that `init`'s signature is `(apiKey, userId, options)` — pass `undefined` for `userId` so the overrides land in the options slot, not on `userId`:

   ```typescript
   import { init } from '@amplitude/analytics-react-native';

   init(API_KEY, undefined, {
     storageProvider: myEventQueueStorage,
     cookieStorage: myIdentityStorage,
   });
   ```

2. Exclude AsyncStorage from native autolinking by adding to your `react-native.config.js`:

   ```js
   module.exports = {
     dependencies: {
       '@react-native-async-storage/async-storage': {
         platforms: { ios: null, android: null },
       },
     },
   };
   ```

   AsyncStorage is no longer linked into your iOS or Android binaries. The JS package stays in `node_modules` so `require()` still resolves, but with both storage slots overridden, the SDK never invokes any AsyncStorage methods.

3. For React Native Web, exclude AsyncStorage from your web bundle.

   Once you've completed steps 1 and 2, the SDK never calls AsyncStorage at runtime — but the `@react-native-async-storage/async-storage` package is still reachable from `node_modules`, so any web bundler will pull it into the JS bundle by default. To shrink the bundle and remove the dead code, configure your bundler to resolve the package to an empty stub.

   First, create a stub file at a path of your choice (e.g. `stubs/async-storage.js`):

   ```js
   // stubs/async-storage.js
   //
   // No-op AsyncStorage stub used in web builds. The SDK should never call these
   // methods because `storageProvider` and `cookieStorage` are both overridden,
   // but exposing the full surface avoids any runtime surprises if some path
   // does reach here.
   const noop = async () => undefined;
   const noopReturningNull = async () => null;

   const stub = {
     getItem: noopReturningNull,
     setItem: noop,
     removeItem: noop,
     clear: noop,
     getAllKeys: async () => [],
     multiGet: async () => [],
     multiSet: noop,
     multiRemove: noop,
     mergeItem: noop,
     multiMerge: noop,
   };

   module.exports = stub;
   module.exports.default = stub;
   ```

   Then wire the stub in for each bundler you use:

   **Webpack** (Create React App ejected, Craco, custom webpack, react-native-web template, etc.)

   ```js
   // webpack.config.js
   const path = require('path');

   module.exports = {
     // ...existing config
     resolve: {
       alias: {
         '@react-native-async-storage/async-storage': path.resolve(
           __dirname,
           'stubs/async-storage.js',
         ),
       },
     },
   };
   ```

   If you don't want to maintain a stub file, webpack 5 also accepts `false` to resolve the import to an empty module. The SDK's internal try/catch will swallow the resulting "method is not a function" errors, but every storage call still attempts the import, so the stub file above is preferred.

   **Next.js** (using next-transpile-modules or built-in transpilePackages for RN Web)

   ```js
   // next.config.js
   const path = require('path');

   module.exports = {
     // ...existing config
     webpack: (config) => {
       config.resolve.alias['@react-native-async-storage/async-storage'] = path.resolve(
         __dirname,
         'stubs/async-storage.js',
       );
       return config;
     },
   };
   ```

   **Vite** (used by some RN Web setups, e.g. via `vite-plugin-react-native-web`)

   ```js
   // vite.config.js
   import path from 'node:path';
   import { defineConfig } from 'vite';

   export default defineConfig({
     resolve: {
       alias: {
         '@react-native-async-storage/async-storage': path.resolve(
           __dirname,
           'stubs/async-storage.js',
         ),
       },
     },
   });
   ```

   **Expo Web (Metro)** — Expo SDK 50+ uses Metro for web bundling. Use Metro's `resolveRequest` to short-circuit the package on the `web` platform only, so native builds still resolve the real package (or its native exclusion via step 2):

   ```js
   // metro.config.js
   const { getDefaultConfig } = require('expo/metro-config');
   const path = require('node:path');

   const config = getDefaultConfig(__dirname);

   const stubPath = path.resolve(__dirname, 'stubs/async-storage.js');

   const originalResolveRequest = config.resolver.resolveRequest;
   config.resolver.resolveRequest = (context, moduleName, platform) => {
     if (platform === 'web' && moduleName === '@react-native-async-storage/async-storage') {
       return { type: 'sourceFile', filePath: stubPath };
     }
     if (originalResolveRequest) {
       return originalResolveRequest(context, moduleName, platform);
     }
     return context.resolveRequest(context, moduleName, platform);
   };

   module.exports = config;
   ```

   **Verifying the bundle no longer contains AsyncStorage**

   After rebuilding, you can confirm AsyncStorage is gone in one of two ways:

   - Run `npx source-map-explorer build/static/js/*.js` (or your bundler's equivalent) and search for `react-native-async-storage`. If the alias is wired correctly, only the stub file shows up.
   - In a dev build, set a breakpoint inside the stub's `getItem` / `setItem`. If neither hits during a session that triggers identity reads (e.g. calling `getUserId()`), then steps 1 and 2 are also correctly applied and the stub is genuinely unused — at which point you can safely keep the stub purely as a build-time guard.

   **Common gotchas**

   - If your project uses both a server (SSR / Next.js API routes) and a browser bundle, apply the alias to both bundler configs. Otherwise the server-side render will still pull in the real package and may attempt to access `window`/`document`.
   - Yarn PnP and pnpm with `nodeLinker: hoisted` resolve alias targets relative to a different root than npm. Use absolute paths (`path.resolve(__dirname, ...)`) rather than relative paths to avoid drift.
   - If you're using Jest in the same project, your Jest config has its own `moduleNameMapper` — adding the alias to webpack/Vite/Metro does not apply to Jest. Add a matching entry in your Jest config if you want consistent behavior in tests.
   - The Amplitude SDK package itself does not need to be transpiled differently after this change; the SDK's lazy `require()` runs at first storage method call, and the bundler's resolution picks up the stub at that point.

## Usage

### Initializing SDK

Initialization is necessary before any instrumentation is done. The API key for your Amplitude project is required.

```typescript
amplitude.init(API_KEY);
```

### Set UserId

Sets an `userId` (usually called after user logs in).
```typescript
import { setUserId } from '@amplitude/analytics-react-native';

setUserId('xxxxx');
```


### Tracking an Event

Events represent how users interact with your application. For example, “Button Clicked” may be an action you want to note.

```typescript
import { track } from '@amplitude/analytics-react-native';

// Track a basic event
track('Button Clicked');

// Track events with additional properties
const eventProperties = {
  selectedColors: ['red', 'blue'],
};
track('Button Clicked', eventProperties);
```

### User Properties

User properties help you understand your users at the time they performed some action within your app such as their device details, their preferences, or language.

```typescript
import { Identify, identify } from '@amplitude/analytics-react-native';

const event = new Identify();

// sets the value of a user property
event.set('key1', 'value1');

// sets the value of a user property only once
event.setOnce('key1', 'value1');

// increments a user property by some numerical value.
event.add('value1', 10);

// pre inserts a value or values to a user property
event.preInsert('ab-tests', 'new-user-test');

// post inserts a value or values to a user property
event.postInsert('ab-tests', 'new-user-test');

// removes a value or values to a user property
event.remove('ab-tests', 'new-user-test')

// sends identify event
identify(event);
```

### prepend/append

* append will append a value or values to a user property array.
* prepend will prepend a value or values to a user property.

### User Groups

```typescript
import { setGroup } from '@amplitude/analytics-react-native';

// set group with single group name
setGroup('orgId', '15');

// set group with multiple group names
setGroup('sport', ['soccer', 'tennis']);
```

### Group Identify

This feature is only available to Growth and Enterprise customers who have purchased the [Accounts add-on](https://amplitude.zendesk.com/hc/en-us/articles/115001765532).

Use the Group Identify API to set or update properties of particular groups. However, these updates will only affect events going forward.

```typescript
import { Identify, groupIdentify } from '@amplitude/analytics-react-native';

const groupType = 'plan';
const groupName = 'enterprise';
const identity = new Identify()
identity.set('key1', 'value1');

groupIdentify(groupType, groupName, identity);
```

### Track Revenue

Revenue instances will store each revenue transaction and allow you to define several special revenue properties (such as 'revenueType', 'productIdentifier', etc.) that are used in Amplitude's Event Segmentation and Revenue LTV charts. These Revenue instance objects are then passed into `revenue` to send as revenue events to Amplitude. This allows us to automatically display data relevant to revenue in the platform. You can use this to track both in-app and non-in-app purchases.

```typescript
import { Revenue, revenue } from '@amplitude/analytics-react-native';

const event = new Revenue()
  .setProductId('com.company.productId')
  .setPrice(3.99)
  .setQuantity(3);

revenue(event);
```

### Callback

All asynchronous API are optionally awaitable through a specific Promise interface. This also serves as callback interface.

```typescript
// Using async/await
const results = await track('Button Clicked').promise;
result.event; // {...} (The final event object sent to Amplitude)
result.code; // 200 (The HTTP response status code of the request.
result.message; // "Event tracked successfully" (The response message)

// Using promises
track('Button Clicked').promise.then((result) => {
  result.event; // {...} (The final event object sent to Amplitude)
  result.code; // 200 (The HTTP response status code of the request.
  result.message; // "Event tracked successfully" (The response message)
});
```

### User Log out

This updates user ID and device ID. After calling `reset()` the succeeding events now belong to a new user identity.

```typescript
import { reset } from '@amplitude/analytics-react-native';

reset();
```
