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

### 1. Load Amplitude's Google Analytics events forwarder plugin

Add Amplitude SDK with Google Analytics events forwarder snippet right before your Google Tag snippet. Adding it before ensures that all Google Analytics (GA4) events are forwarded to Amplitude.

```html
<script src="https://cdn.amplitude.com/libs/plugin-ga-events-forwarder-browser-0.1.0-min.js.gz"></script>
```

### 3. Load Amplitude SDK for Browser

```html
<!-- Amplitude SDK -->
<script type="text/javascript">
  !function(){"use strict";!function(e,t){var r=e.amplitude||{_q:[],_iq:{}};if(r.invoked)e.console&&console.error&&console.error("Amplitude snippet has been loaded.");else{var n=function(e,t){e.prototype[t]=function(){return this._q.push({name:t,args:Array.prototype.slice.call(arguments,0)}),this}},s=function(e,t,r){return function(n){e._q.push({name:t,args:Array.prototype.slice.call(r,0),resolve:n})}},o=function(e,t,r){e[t]=function(){if(r)return{promise:new Promise(s(e,t,Array.prototype.slice.call(arguments)))}}},i=function(e){for(var t=0;t<m.length;t++)o(e,m[t],!1);for(var r=0;r<y.length;r++)o(e,y[r],!0)};r.invoked=!0;var a=t.createElement("script");a.type="text/javascript",a.crossOrigin="anonymous",a.src="https://cdn.amplitude.com/libs/plugin-ga-events-forwarder-browser-0.0.0-min.js.gz",a.onload=function(){e.gaEventsForwarder&&e.gaEventsForwarder.plugin&&e.amplitude.add(e.gaEventsForwarder.plugin())};var c=t.createElement("script");c.type="text/javascript",c.integrity="sha384-HpnlFSsUOQTaqmMKb6/PqZKVOBEpRji3JNLr81x6XElQ4bkquzRyG/F8rY8IDMuw",c.crossOrigin="anonymous",c.async=!0,c.src="https://cdn.amplitude.com/libs/analytics-browser-2.2.1-min.js.gz",c.onload=function(){e.amplitude.runQueuedFunctions||console.log("[Amplitude] Error: could not load SDK")};var u=t.getElementsByTagName("script")[0];u.parentNode.insertBefore(a,u),u.parentNode.insertBefore(c,u);for(var p=function(){return this._q=[],this},d=["add","append","clearAll","prepend","set","setOnce","unset","preInsert","postInsert","remove","getUserProperties"],l=0;l<d.length;l++)n(p,d[l]);r.Identify=p;for(var g=function(){return this._q=[],this},v=["getEventProperties","setProductId","setQuantity","setPrice","setRevenue","setRevenueType","setEventProperties"],f=0;f<v.length;f++)n(g,v[f]);r.Revenue=g;var m=["getDeviceId","setDeviceId","getSessionId","setSessionId","getUserId","setUserId","setOptOut","setTransport","reset","extendSession"],y=["init","add","remove","track","logEvent","identify","groupIdentify","setGroup","revenue","flush"];i(r),r.createInstance=function(e){return r._iq[e]={_q:[]},i(r._iq[e]),r._iq[e]},e.amplitude=r}}(window,document)}();
</script>
```

### 3. Add Amplitude's Google Analytics event forwarder plugin to Amplitude SDK for Browser

You must replace `'YOUR_API_KEY'`` with your actual Amplitude API key, which you can find in your Amplitude account.

```js
amplitude.add(gaEventsForwarder.plugin());
amplitude.add('YOUR_API_KEY');
```

If you followed along, you should arrive at something like this.

```html
<!-- Amplitude's GA events forwarder plugin -->
<script src="https://cdn.amplitude.com/libs/plugin-ga-events-forwarder-browser-0.1.0-min.js.gz"></script>

<!-- Amplitude SDK -->
<script type="text/javascript">
  !function(){"use strict";!function(e,t){var r=e.amplitude||{_q:[],_iq:{}};if(r.invoked)e.console&&console.error&&console.error("Amplitude snippet has been loaded.");else{var n=function(e,t){e.prototype[t]=function(){return this._q.push({name:t,args:Array.prototype.slice.call(arguments,0)}),this}},s=function(e,t,r){return function(n){e._q.push({name:t,args:Array.prototype.slice.call(r,0),resolve:n})}},o=function(e,t,r){e[t]=function(){if(r)return{promise:new Promise(s(e,t,Array.prototype.slice.call(arguments)))}}},i=function(e){for(var t=0;t<m.length;t++)o(e,m[t],!1);for(var r=0;r<y.length;r++)o(e,y[r],!0)};r.invoked=!0;var a=t.createElement("script");a.type="text/javascript",a.crossOrigin="anonymous",a.src="https://cdn.amplitude.com/libs/plugin-ga-events-forwarder-browser-0.0.0-min.js.gz",a.onload=function(){e.gaEventsForwarder&&e.gaEventsForwarder.plugin&&e.amplitude.add(e.gaEventsForwarder.plugin())};var c=t.createElement("script");c.type="text/javascript",c.integrity="sha384-HpnlFSsUOQTaqmMKb6/PqZKVOBEpRji3JNLr81x6XElQ4bkquzRyG/F8rY8IDMuw",c.crossOrigin="anonymous",c.async=!0,c.src="https://cdn.amplitude.com/libs/analytics-browser-2.2.1-min.js.gz",c.onload=function(){e.amplitude.runQueuedFunctions||console.log("[Amplitude] Error: could not load SDK")};var u=t.getElementsByTagName("script")[0];u.parentNode.insertBefore(a,u),u.parentNode.insertBefore(c,u);for(var p=function(){return this._q=[],this},d=["add","append","clearAll","prepend","set","setOnce","unset","preInsert","postInsert","remove","getUserProperties"],l=0;l<d.length;l++)n(p,d[l]);r.Identify=p;for(var g=function(){return this._q=[],this},v=["getEventProperties","setProductId","setQuantity","setPrice","setRevenue","setRevenueType","setEventProperties"],f=0;f<v.length;f++)n(g,v[f]);r.Revenue=g;var m=["getDeviceId","setDeviceId","getSessionId","setSessionId","getUserId","setUserId","setOptOut","setTransport","reset","extendSession"],y=["init","add","remove","track","logEvent","identify","groupIdentify","setGroup","revenue","flush"];i(r),r.createInstance=function(e){return r._iq[e]={_q:[]},i(r._iq[e]),r._iq[e]},e.amplitude=r}}(window,document)}();

  amplitude.add(gaEventsForwarder.plugin());
  amplitude.add('YOUR_API_KEY');
</script>
```

To guarantee all Google Analytics events are forwarded to Amplitude, add all Amplitude related code before your Google tag.

<details>
  <summary>Where do I find my Google Tag?</summary>

  Your Google Tag can be found in every page of your website, immediately after the element. The Google Tag for your account should look like the snippet below.

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
</details>

**If you installed Amplitude SDK using npm or yarn, follow these instructions to install this plugin.**

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
|`measurementIds`|`string` or `string[]`|Default value is `[]` which listens to all events tracked with all measurement IDs.|A Google Analytics measurement ID or a list of Google Analytics measurement IDs. This limits the plugin to only listen for events tracked with the specified measurement ID/s.<br/><br/>To listen for a single Google measurement ID, pass a string, eg: <br/><br/>```const gaEventsForwarder = gaEventsForwarderPlugin({ measurementIds: 'G-XXXXXXXXXX' });```<br/><br/>To listen for multiple Google measurement IDs, pass an array of strings, eg: <br/><br/>````const gaEventsForwarder = gaEventsForwarderPlugin({ measurementIds: ['G-XXXXXXXXXX', 'G-YYYYYYYYYY'] });````|
