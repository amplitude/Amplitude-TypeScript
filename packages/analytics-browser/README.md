# @amplitude/analytics-browser

## Installation

To get started with using Amplitude Browser SDK, install the package to your project via NPM or script loader.

### Using Node package

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm 
npm install @amplitude/analytics-browser

# yarn
yarn add @amplitude/analytics-browser
```

## Import amplitude

```js
import * as amplitude from '@amplitude/analytics-browser';

amplitude.init('API_KEY', 'USER_ID');
await amplitude.track('Button Click');
```
