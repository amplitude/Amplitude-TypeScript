import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import * as amplitude from '@amplitude/analytics-browser';
import { AmplitudeBrowser } from "@amplitude/analytics-browser";

import { sessionReplayPlugin, AmplitudeSessionReplay, SessionReplayPlugin } from '@amplitude/plugin-session-replay-browser';

// Module augmentation to add sr at compile time
declare module '@amplitude/analytics-browser' {
  interface AmplitudeBrowser {
    /**
     * Install the Amplitude Experiment plugin to the Amplitude Analytics instance
     * by `client.add(new ExperimentAnalyticsPlugin());`
     *
     * Call experiment APIs by accessing the underlying experiment instance,
     * for example, `client.experiment.fetch();`
     *
     * The user identity and user properties set in the analytics SDK will
     * automatically be used by the Experiment SDK on fetch().
     */
    sr: AmplitudeSessionReplay;
  }
}

// Add experiment property at run time
Object.defineProperty(AmplitudeBrowser.prototype, 'sr', {
  get: function() {
    return (
      this.plugin(
        SessionReplayPlugin.pluginName,
      ) as SessionReplayPlugin
    ).sr;
  },
});

/**
 * Start by calling amplitude.init(). This must be done before any event tracking
 * preferably in the root file of the project.
 *
 * Calling init() requires an API key
 * ```
 * init(API_KEY)
 * ```
 *
 * Optionally, a user id can be provided when calling init()
 * ```
 * init(API_KEY, 'example.react.user@amplitude.com')
 * ```
 *
 * Optionally, a config object can be provided. Refer to https://amplitude.github.io/Amplitude-TypeScript/interfaces/Types.BrowserConfig.html
 * for object properties.
 */

const client: AmplitudeBrowser = new amplitude.AmplitudeBrowser();
client.init('API_KEY', 'example.react.user@amplitude.com', {
  logLevel: amplitude.Types.LogLevel.Debug,
}).promise.then((_) => {
  client.add(sessionReplayPlugin({debugMode: true})).promise.then((_) => {
    // Add SR plugin to existing Amplitude analytics SDK
    // and call SR APIs.
    // SR APIs are only available when
    // 1. Amplitude instance has successfully setup
    // 2. SR plugin has been installed successfully
    console.log(`client.sr.getSessionId(): ${client.sr.getSessionId()}`);
    console.log(`client.sr.getSessionReplayProperties(): ${client.sr.getSessionReplayProperties()}`);
  });
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
