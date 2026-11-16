<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/brand/amplitude-logo-with-text.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/analytics-react-native

Official Amplitude SDK for React Native

# Installation and Quick Start

Please visit our :100:[Developer Center](https://www.docs.developers.amplitude.com/data/sdks/typescript-react-native/) for instructions on installing and using our the SDK.

## Installation

To get started with using Amplitude React Native SDK, install the package to your project via NPM. In addition, this package relies on `@react-native-async-storage/async-storage`, which must also be installed.

```sh
# npm
npm install @amplitude/analytics-react-native
npm install @react-native-async-storage/async-storage

# yarn
yarn add @amplitude/analytics-react-native
yarn add @react-native-async-storage/async-storage
```

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

## Troubleshooting

### Metro cannot resolve an optional Session Replay package

The SDK uses `@amplitude/plugin-session-replay-react-native` and `@amplitude/session-replay-react-native` as optional peers for dead-click detection. Analytics works without either package. Dead clicks require a compatible Session Replay package installed and recording.

If Metro reports `Unable to resolve module` for either package when it isn't installed, enable `transformer.allowOptionalDependencies` in your app's `metro.config.js`. This lets Metro bundle the SDK's guarded `require` calls when an optional package is absent. Setting `optionalDependencies` or `peerDependenciesMeta` in `package.json` alone doesn't configure Metro.

For React Native CLI apps, merge the option into your existing configuration:

```js
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

const config = {
  // Keep your existing configuration here.
  transformer: {
    // Keep your existing transformer options here.
    allowOptionalDependencies: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
```

For Expo apps, add the option to the config returned by `expo/metro-config` before exporting it:

```js
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Keep your existing configuration changes.
config.transformer = {
  ...config.transformer,
  allowOptionalDependencies: true,
};

module.exports = config;
```

Stop Metro, then restart it with a cleared cache:

```sh
# React Native CLI
npx react-native start --reset-cache

# Expo
npx expo start --clear
```

You don't need to install both Replay packages to resolve this error. To capture dead clicks, follow the [React Native Session Replay setup instructions](https://amplitude.com/docs/sdks/session-replay/session-replay-react-native-sdk-plugin). For details about optional module resolution, see [Metro's `allowOptionalDependencies` option](https://metrobundler.dev/docs/configuration/#allowoptionaldependencies).
