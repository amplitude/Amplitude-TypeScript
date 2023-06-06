<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-page-view-tracking-browser

Official Browser SDK plugin for page view tracking

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-page-view-tracking-browser

# yarn
yarn add @amplitude/plugin-page-view-tracking-browser
```

## Usage

This plugin works on top of Amplitude Browser SDK and adds page view tracking features to built-in features. To use this plugin, you need to install `@amplitude/analytics-browser` version `v2.0.0` or later.

### 1. Import Amplitude packages

* `@amplitude/plugin-page-view-tracking-browser`

```typescript
import { pageViewTrackingPlugin } from '@amplitude/plugin-page-view-tracking-browser';
```

### 2. Instantiate page view plugin

The plugin accepts an optional parameter of type `Object` to configure the plugin based on your use case.

```typescript
const pageViewTracking = pageViewTrackingPlugin({
  trackOn: undefined,
  trackHistoryChanges: undefined,
});
```

#### Options

|Name|Type|Default|Description|
|-|-|-|-|
|`trackOn`|`"attribution"` or `() => boolean`|`undefined`|Use this option to control when to track a page view event. By default, a page view event is sent on each SDK initialization.<br/><br/>Use `() => boolean` to control sending page view events using custom conditional logic.<br/><br/>Use `"attribution"` to send page view events with attribution events. This option requires using [@amplitude/plugin-web-attribution-browser](https://github.com/amplitude/Amplitude-TypeScript/tree/main/packages/plugin-web-attribution-browser).|
|`trackHistoryChanges`|`"all"` or `"pathOnly"`|`undefined`|Use this option to subscribe to page view changes based on full URL or URL path in a single page application like React.js. By default, page view changes are based on full URL.<br/><br/>Use `"all"` to compare the full url changes.<br/><br/>Use `"pathOnly"` to compare only url path changes.|

### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(pageViewTracking);
```

### 4. Initialize Amplitude SDK

```typescript
amplitude.init('API_KEY');
```

## Resulting page view event

This plugin tracks page views based on your configuration. A page view event is composed of the following values:

#### Event type
* `"[Amplitude ]Page Viewed"`

#### Event properties

|Property|Description|
|-|-|
|`'[Amplitude] Page Domain'`|The website's hostname or `location.hostname`|
|`'[Amplitude] Page Location'`|The website's full url or `location.href`|
|`'[Amplitude] Page Path'`|The website's pathname or `location.pathname`|
|`'[Amplitude] Page Title'`|The website's title or `document.title`|
|`'[Amplitude] Page URL'`|The website's url excluding query parameters|
