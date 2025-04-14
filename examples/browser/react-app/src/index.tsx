import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

import * as amplitude from '@amplitude/analytics-browser';
import { sessionReplayPlugin } from '@amplitude/plugin-session-replay-browser';
import { plugin as engagementPlugin } from '@amplitude/engagement-browser';

// Guides and Surveys SDK
amplitude.add(engagementPlugin());
// Session Replay Browser SDK
amplitude.add(sessionReplayPlugin());
amplitude.init('5b9a9510e261f9ead90865bbc5a7ad1d', { "autocapture": true, logLevel: amplitude.Types.LogLevel.Debug });

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
