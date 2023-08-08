<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/@amplitude/plugin-page-view-v1-enrichment-browser

Official Browser SDK plugin for making page view event compatible with browser v1.

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-page-view-v1-enrichment-browser@^1.0.0

# yarn
yarn add @amplitude/plugin-page-view-v1-enrichment-browser@^1.0.0
```

## Usage

This plugin works on top of the Amplitude Browser SDK. It's used for updating the page view event_type and event_properties the same as Browser v1.
In Browser v2.x, we have enriched the page view event_type and event_propertis. You can use this plugin to maintain consistency with page view tracking from earlier SDK versions.

### 1. Import Amplitude packages

* `@amplitude/analytics-browser`
* `@amplitude/plugin-page-view-v1-enrichment-browser`

```typescript
import * as amplitude from '@amplitude/analytics-browser';
import { pageViewV1EnrichmentPlugin } from '@amplitude/plugin-page-view-v1-enrichment-browser';
```

### 2. Instantiate page view v1 enrichment plugin

```typescript
const pageViewPlugin = pageViewV1EnrichmentPlugin();
```

### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(pageViewPlugin);
```

### 4. Initialize Amplitude SDK

```typescript
amplitude.init('API_KEY');
```

## Resulting on page view event

| property |[Browser SDK 2.0](../) </div> | With this plugin |
| --- | --- | --- |
| `Event Type` | `[Amplitude] Page Viewed` | `Page View` |
| `Event Properties` | `page_domain` |  `[Amplitude] Page Domain` |
| | `page_location` | `[Amplitude] Page Location` |
| | `page_path` | `[Amplitude] Page Path` |
| | `page_title` | `[Amplitude] Page Title` |
| | `page_url` | `[Amplitude] Page URL`|
