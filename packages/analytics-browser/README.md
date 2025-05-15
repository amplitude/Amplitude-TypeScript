<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/analytics-browser

Official Amplitude SDK for Web

# Doc

See our [Analytics SDK for Browser](https://amplitude.github.io/Amplitude-TypeScript/modules/_amplitude_analytics_browser.html) Reference for a list and description of all available SDK methods.

# Installation and Quick Start

Please visit our :100:[Developer Center](https://www.docs.developers.amplitude.com/data/sdks/browser-2/) for instructions on installing and using our the SDK.

## Installation

To get started with using Amplitude Browser SDK, install the package to your project via npm, yarn or script loader.

### Installing via package manager

This SDK is available as a package on npm registry named `@amplitude/analytics-browser`. You can install the package using npm or yarn CLI.

#### Using npm CLI

```sh
npm install @amplitude/analytics-browser
```

#### Using yarn CLI

```sh
# yarn
yarn add @amplitude/analytics-browser
```

Import the package into your project and initialize it with your API key.

```ts
import * as amplitude from '@amplitude/analytics-browser';

amplitude.init('<YOUR_API_KEY>');
```

### Installing via script loader

This SDK is also available through CDN. Copy the script loader below and paste before the `</head>` tag of every page you want to track and initialize it with your API key.

<!-- README_SNIPPET_BLOCK -->
```html
<script type="text/javascript">
!function(){"use strict";!function(e,t){var r=e.amplitude||{_q:[],_iq:{}};if(r.invoked)e.console&&console.error&&console.error("Amplitude snippet has been loaded.");else{var n=function(e,t){e.prototype[t]=function(){return this._q.push({name:t,args:Array.prototype.slice.call(arguments,0)}),this}},s=function(e,t,r){return function(n){e._q.push({name:t,args:Array.prototype.slice.call(r,0),resolve:n})}},i=function(e,t,r){e[t]=function(){if(r)return{promise:new Promise(s(e,t,Array.prototype.slice.call(arguments)))};!function(e,t,r){e._q.push({name:t,args:Array.prototype.slice.call(r,0)})}(e,t,Array.prototype.slice.call(arguments))}},o=function(e){for(var t=0;t<y.length;t++)i(e,y[t],!1);for(var r=0;r<g.length;r++)i(e,g[r],!0)};r.invoked=!0;var c=t.createElement("script");c.type="text/javascript",c.integrity="sha384-lBou4NmX75M6JsIU7yhPUiOXMZSbtZs5c2+lyhs7faXYDqKciQqrlJvP8MADhzOi",c.crossOrigin="anonymous",c.async=!0,c.src="https://cdn.amplitude.com/libs/analytics-browser-2.17.6-min.js.gz",c.onload=function(){e.amplitude.runQueuedFunctions||console.log("[Amplitude] Error: could not load SDK")};var a=t.getElementsByTagName("script")[0];a.parentNode.insertBefore(c,a);for(var u=function(){return this._q=[],this},l=["add","append","clearAll","prepend","set","setOnce","unset","preInsert","postInsert","remove","getUserProperties"],p=0;p<l.length;p++)n(u,l[p]);r.Identify=u;for(var d=function(){return this._q=[],this},f=["getEventProperties","setProductId","setQuantity","setPrice","setRevenue","setRevenueType","setReceipt","setReceiptSig","setCurrency","setEventProperties"],v=0;v<f.length;v++)n(d,f[v]);r.Revenue=d;var y=["getDeviceId","setDeviceId","getSessionId","setSessionId","getUserId","setUserId","setOptOut","setTransport","reset","extendSession"],g=["init","add","remove","track","logEvent","identify","groupIdentify","setGroup","revenue","flush"];o(r),r.createInstance=function(e){return r._iq[e]={_q:[]},o(r._iq[e]),r._iq[e]},e.amplitude=r}}(window,document)}();

amplitude.init("<YOUR_API_KEY>");
</script>
```
<!-- / OF README_SNIPPET_BLOCK -->

## Tracking events

Once the SDK is initialize, you can start tracking events.

```ts
amplitude.track('Page Viewed');
```

For in-depth documentation, please visit to our [Developer Center](https://www.docs.developers.amplitude.com/data/sdks/sdk-quickstart/#browser).
