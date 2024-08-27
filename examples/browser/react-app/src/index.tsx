import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import * as amplitude from '@amplitude/analytics-browser';
import * as amplitudeTypes from '@amplitude/analytics-types';

/**
 * Start by calling amplitude.init(). This must be done before any event tracking
 * preferrably in the root file of the project.
 * 
 * Calling init() requires an API key
 * ```
 * amplitude.init(API_KEY)
 * ```
 * 
 * Optionally, a user id can be provided when calling init()
 * ```
 * amplitude.init(API_KEY, 'example.react.user@amplitude.com')
 * ```
 * 
 * Optionally, a config object can be provided. Refer to https://amplitude.github.io/Amplitude-TypeScript/interfaces/Types.BrowserConfig.html
 * for object properties.
 */

// Function to get the browser name
function getBrowserName() {
  const userAgent = navigator.userAgent;
  let browserName = 'Unknown';
  if (userAgent.indexOf('Firefox') > -1) {
    browserName = 'Firefox';
  } else if (userAgent.indexOf('SamsungBrowser') > -1) {
    browserName = 'Samsung Internet';
  } else if (userAgent.indexOf('Opera') > -1 || userAgent.indexOf('OPR') > -1) {
    browserName = 'Opera';
  } else if (userAgent.indexOf('Trident') > -1) {
    browserName = 'Internet Explorer';
  } else if (userAgent.indexOf('Edge') > -1) {
    browserName = 'Edge';
  } else if (userAgent.indexOf('Chrome') > -1) {
    browserName = 'Chrome';
  } else if (userAgent.indexOf('Safari') > -1) {
    browserName = 'Safari';
  }
  return browserName;
}

// Detect device platform
const userAgent = navigator.userAgent.toLowerCase();
let devicePlatform = 'desktop';
if (userAgent.includes('android') || userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('mobile')) {
  devicePlatform = 'mobile-web';
}

// Create the enrichment plugin
const enrichPageViewedPlugin = () => ({
  execute: async (event: amplitudeTypes.Event) => {
    if (event.event_type === '[Amplitude] Page Viewed') {
      event.event_properties = {
        ...event.event_properties,
        'device_platform': devicePlatform,
        'browser_name': getBrowserName()
      };
    }
    return event;
  }
});

amplitude.add(enrichPageViewedPlugin());
amplitude.init('5b9a9510e261f9ead90865bbc5a7ad1d','AMP-105049',{
  logLevel: 4,
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
