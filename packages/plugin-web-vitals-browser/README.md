<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-web-vitals-browser (beta)
**This plugin is in beta at the moment, naming and interface might change in the future.**

Autocaptures [web-vitals](https://www.npmjs.com/package/web-vitals) metrics (INP, LCP, FCP, CLS)

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-web-vitals-browser@beta

# yarn
yarn add @amplitude/plugin-web-vitals-browser@beta
```

## Usage

```typescript
import * as amplitude from '@amplitude/analytics-browser';
import { webVitalsPlugin } from '@amplitude/plugin-web-vitals-browser';
```

### 2. Instantiate the plugin

```typescript
const plugin = webVitalsPlugin();
```

#### Options

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `reportSoftNav` | `boolean` | `false` | Also report web vitals for soft navigations, not only for the initial page load. |

##### `reportSoftNav`

Single page applications update the URL and history without a full page navigation, so by default
Core Web Vitals are only measured once, for the initial page load. With `reportSoftNav` enabled,
LCP, FCP, INP, CLS and TTFB are also measured per
[soft navigation](https://github.com/WICG/soft-navigations), and one `[Amplitude] Web Vitals` event
is sent per navigation, with the page properties of the URL the metrics belong to and a
`navigationId` on each metric. Metrics measured for a soft navigation have a `navigationType` of
`soft-navigation`.

```typescript
const plugin = webVitalsPlugin({ reportSoftNav: true });
```

This requires browser support for the Soft Navigations API (Chromium 151+). In browsers without it,
reporting is unchanged from the default behavior.

Note that enabling this also changes how the initial page load is measured: its metrics are
finalized once the first soft navigation occurs, rather than when the page is hidden.

When using the Browser SDK's autocapture, the same option can be set through
`autocapture.webVitals`:

```typescript
amplitude.init('API_KEY', {
  autocapture: {
    webVitals: { reportSoftNav: true },
  },
});
```

### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(plugin);
```

### 4. Initialize Amplitude SDK

```typescript
amplitude.init('API_KEY');
```
