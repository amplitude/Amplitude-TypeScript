<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/analytics-browser

Official Amplitude SDK for Web

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

### Using script loader

Alternatively, the package is also distributed through a CDN. Copy and paste the script below to your html file.

<!-- README_SNIPPET_BLOCK -->
```html
<script type="text/javascript">
!function(){"use strict";!function(e,t){var n=e.amplitude||{_q:[],_iq:[]};if(n.invoked)e.console&&console.error&&console.error("Amplitude snippet has been loaded.");else{n.invoked=!0;var r=t.createElement("script");r.type="text/javascript",r.integrity="sha384-62aOVvQqHGvYedCoPJCBPq1xmZvxT0fpDz2Rnn8GhSul5G7R6ErTdlwMnEZFZmMn",r.crossOrigin="anonymous",r.async=!0,r.src="https://cdn.amplitude.com/libs/analytics-browser-1.5.0-min.js.gz",r.onload=function(){e.amplitude.runQueuedFunctions||console.log("[Amplitude] Error: could not load SDK")};var s=t.getElementsByTagName("script")[0];function v(e,t){e.prototype[t]=function(){return this._q.push({name:t,args:Array.prototype.slice.call(arguments,0)}),this}}s.parentNode.insertBefore(r,s);for(var o=function(){return this._q=[],this},i=["add","append","clearAll","prepend","set","setOnce","unset","preInsert","postInsert","remove","getUserProperties"],a=0;a<i.length;a++)v(o,i[a]);n.Identify=o;for(var u=function(){return this._q=[],this},c=["getEventProperties","setProductId","setQuantity","setPrice","setRevenue","setRevenueType","setEventProperties"],p=0;p<c.length;p++)v(u,c[p]);n.Revenue=u;var l=["getDeviceId","setDeviceId","getSessionId","setSessionId","getUserId","setUserId","setOptOut","setTransport","reset"],d=["init","add","remove","track","logEvent","identify","groupIdentify","setGroup","revenue","flush"];function f(e){function t(t,n){e[t]=function(){var r={promise:new Promise((n=>{e._q.push({name:t,args:Array.prototype.slice.call(arguments,0),resolve:n})}))};if(n)return r}}for(var n=0;n<l.length;n++)t(l[n],!1);for(var r=0;r<d.length;r++)t(d[r],!0)}f(n),n.createInstance=function(){var e=n._iq.push({_q:[]})-1;return f(n._iq[e]),n._iq[e]},e.amplitude=n}}(window,document)}();

amplitude.init("YOUR_API_KEY_HERE");
</script>
```
<!-- / OF README_SNIPPET_BLOCK -->

## Usage

### Initializing SDK

Initialization is necessary before any instrumentation is done. The API key for your Amplitude project is required.

```typescript
amplitude.init(API_KEY);
```

### Tracking an Event

Events represent how users interact with your application. For example, "Button Clicked" may be an action you want to note.

```typescript
import { track } from '@amplitude/analytics-browser';

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
import { Identify, identify } from '@amplitude/analytics-browser';

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
import { setGroup } from '@amplitude/analytics-browser';

// set group with single group name
setGroup('orgId', '15');

// set group with multiple group names
setGroup('sport', ['soccer', 'tennis']);
```

### Group Identify

This feature is only available to Growth and Enterprise customers who have purchased the [Accounts add-on](https://amplitude.zendesk.com/hc/en-us/articles/115001765532).

Use the Group Identify API to set or update properties of particular groups. However, these updates will only affect events going forward.

```typescript
import { Identify, groupIdentify } from '@amplitude/analytics-browser';

const groupType = 'plan';
const groupName = 'enterprise';
const identity = new Identify()
identity.set('key1', 'value1');

groupIdentify(groupType, groupName, identity);
```

### Track Revenue

Revenue instances will store each revenue transaction and allow you to define several special revenue properties (such as 'revenueType', 'productIdentifier', etc.) that are used in Amplitude's Event Segmentation and Revenue LTV charts. These Revenue instance objects are then passed into `revenue` to send as revenue events to Amplitude. This allows us to automatically display data relevant to revenue in the platform. You can use this to track both in-app and non-in-app purchases.

```typescript
import { Revenue, revenue } from '@amplitude/analytics-browser';

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
import { reset } from '@amplitude/analytics-browser';

reset();
```
