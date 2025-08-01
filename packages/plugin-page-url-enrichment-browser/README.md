<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-page-url-enrichment-browser

Official Browser SDK plugin for page url enrichment

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-page-url-enrichment-browser

# yarn
yarn add @amplitude/plugin-page-url-enrichment-browser
```

## Usage

This plugin works on top of Amplitude Browser SDK and adds page url enrichment properties to all events. To use this plugin, you need to install `@amplitude/analytics-browser` version `v2.0.0` or later.

### 1. Import Amplitude packages

* `@amplitude/plugin-page-url-enrichment-browser`

```typescript
import { pageUrlEnrichmentPlugin } from '@amplitude/plugin-page-url-enrichment-browser';
```

### 2. Instantiate page url enrichment plugin

The plugin accepts an optional parameter of type `Object` to configure the plugin based on your use case.

```typescript
const pageUrlEnrichment = pageUrlEnrichmentPlugin();
```

#### Options


### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(pageUrlEnrichment);
```

### 4. Initialize Amplitude SDK

```typescript
amplitude.init('API_KEY');
```

## Resulting Page URL properties

This plugin adds Page URL properties to all events based on your configuration

#### Event type
* No event type added

#### Event properties

| Property                               | Description                                                                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'[Amplitude] Page Domain'`            | The website's hostname or `location.hostname`                                                                                                                        |
| `'[Amplitude] Page Location'`          | The website's full url or `location.href`                                                                                                                            |
| `'[Amplitude] Page Path'`              | The website's pathname or `location.pathname`                                                                                                                        |
| `'[Amplitude] Page Title'`             | The website's title or `document.title`                                                                                                                              |
| `'[Amplitude] Page URL'`               | The website's url excluding query parameters                                                                                                                         |
| `'[Amplitude] Previous Page Location'` | The URL of the previous page the user visited; document.referrer if coming from an external domain; and using the sessionStorage which tracks the last url otherwise |
| `'Amplitude] Previous Page Type'`      | A classification of the previous page (e.g., 'Internal', 'External', 'Direct'), typically derived from a custom function that analyzes the previous page's URL       |
