<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-ga-events-forwarder-browser

Official Browser SDK plugin for Google Analytics events forwarder

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-ga-events-forwarder-browser

# yarn
yarn add @amplitude/plugin-ga-events-forwarder-browser
```

## Usage

This plugin works on top of Amplitude Browser SDK which listens for events tracked using Google Analytics and sends these events to Amplitude. To use this plugin, you need to install `@amplitude/analytics-browser` version `v1.9.1` or later.

**If you installed Amplitude SDK using the snippet loader, follow these instructions to load this plugin.**

### 1. Find where your Google Tag is installed

Your Google tag should look something like this

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### 2. Load Amplitude's Google Analytics events forwarder plugin

Add this code block before your Google tag.

```html
<script src="https://cdn.amplitude.com/libs/plugin-ga-events-forwarder-browser-0.1.0-min.js.gz"></script>
<script>
  const gaEventsForwarderPlugin = gaEventsForwarder.plugin();
</script>
```

### 3. Add Google Analytics events forwarder plugin to Amplitude SDK

```ts
amplitude.add(gaEventsForwarderPlugin);
```

To guarantee all events are forwarded to Amplitude, add all Amplitude related code before your Google tag. You should arrive at something like this.

```html
<!-- Amplitude's GA events forwarder plugin -->
<script src="https://cdn.amplitude.com/libs/plugin-ga-events-forwarder-browser-0.1.0-min.js.gz"></script>
<script>
  const gaEventsForwarderPlugin = gaEventsForwarder.plugin();
</script>

<!-- Amplitude SDK -->
<script type="text/javascript">
  !function(){"use strict";!function(e,t){var r=e.amplitude||{_q:[],_iq:{}};if(r.invoked)e.console&&console.error&&console.error("Amplitude snippet has been loaded.");else{var n=function(e,t){e.prototype[t]=function(){return this._q.push({name:t,args:Array.prototype.slice.call(arguments,0)}),this}},s=function(e,t,r){return function(n){e._q.push({name:t,args:Array.prototype.slice.call(r,0),resolve:n})}},i=function(e,t,r){e[t]=function(){if(r)return{promise:new Promise(s(e,t,Array.prototype.slice.call(arguments)))}}},o=function(e){for(var t=0;t<g.length;t++)i(e,g[t],!1);for(var r=0;r<m.length;r++)i(e,m[r],!0)};r.invoked=!0;var a=t.createElement("script");a.type="text/javascript",a.integrity="sha384-tVVRWU7GrpjrC44WiDzQSQ9/fCEp3KlzT6HvGeU9Q4YPkOziz0qa/azi73J6jBr6",a.crossOrigin="anonymous",a.async=!0,a.src="https://cdn.amplitude.com/libs/analytics-browser-1.12.1-min.js.gz",a.onload=function(){e.amplitude.runQueuedFunctions||console.log("[Amplitude] Error: could not load SDK")};var c=t.getElementsByTagName("script")[0];c.parentNode.insertBefore(a,c);for(var u=function(){return this._q=[],this},p=["add","append","clearAll","prepend","set","setOnce","unset","preInsert","postInsert","remove","getUserProperties"],l=0;l<p.length;l++)n(u,p[l]);r.Identify=u;for(var d=function(){return this._q=[],this},f=["getEventProperties","setProductId","setQuantity","setPrice","setRevenue","setRevenueType","setEventProperties"],v=0;v<f.length;v++)n(d,f[v]);r.Revenue=d;var g=["getDeviceId","setDeviceId","getSessionId","setSessionId","getUserId","setUserId","setOptOut","setTransport","reset"],m=["init","add","remove","track","logEvent","identify","groupIdentify","setGroup","revenue","flush"];o(r),r.createInstance=function(e){return r._iq[e]={_q:[]},o(r._iq[e]),r._iq[e]},e.amplitude=r}}(window,document)}();

  amplitude.add(gaEventsForwarderPlugin);
  amplitude.add('YOUR_API_KEY');
</script>

<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

**If you installed Amplitude SDK using npm or yarn , follow these instructions to install this plugin.**

### 1. Import Amplitude packages

* `@amplitude/plugin-ga-events-forwarder-browser`

```typescript
import { gaEventsForwarderPlugin } from '@amplitude/plugin-ga-events-forwarder-browser';
```

### 2. Instantiate Google Analytics event listener

```typescript
const gaEventsForwarder = gaEventsForwarderPlugin();
```

### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(gaEventsForwarder);
```

### 4. Initialize Amplitude SDK

```typescript
amplitude.init('API_KEY');
```

### Options

|Name|Type|Default|Description|
|-|-|-|-|
|`trackingIds`|`string` or `string[]`|Default value is `[]` which listens to all events tracked with all tracking IDs.|A Google Analytics tracking ID or a list of Google Analytics tracking IDs. This limits the plugin to only listen for events tracked with the specified tracking ID/s.<br/><br/>To listen for a single Google Tracking ID, pass a string, eg: <br/><br/>```const gaEventsForwarder = gaEventsForwarderPlugin({ trackingIds: 'G-XXXXXXXXXX' });```<br/><br/>To listen for multiple Google Tracking IDs, pass an array of strings, eg: <br/><br/>````const gaEventsForwarder = gaEventsForwarderPlugin({ trackingIds: ['G-XXXXXXXXXX', 'G-YYYYYYYYYY'] });````|
