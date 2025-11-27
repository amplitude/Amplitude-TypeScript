import { useEffect } from 'react';
import * as amplitude from '@amplitude/analytics-browser';
import './App.css';

const logMessage = (message: string) => {
  const logElement = document.getElementById('log');
  if (!logElement) {
    return;
  }
  const timestamp = new Date().toISOString();
  logElement.textContent = `[${timestamp}] ${message}\n${logElement.textContent}`;
};

const registerGlobalLoggers = () => {
  window.addEventListener('error', (event) => {
    logMessage(`[window.error] ${event.message} (${event.filename ?? 'unknown'})`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    logMessage(`[unhandledrejection] ${String(event.reason)}`);
  });
};

registerGlobalLoggers();

export default function App() {
  useEffect(() => {
    amplitude.init('5b9a9510e261f9ead90865bbc5a7ad1d', 'module.playground@amplitude.com');
  }, []);

  const triggerSdkError = () => {
    logMessage('Registering failing plugin to simulate SDK error');
    amplitude.add({
      name: 'module-playground-failing-plugin',
      type: 'before',
      async setup() {
        throw new Error('Module playground plugin exploded');
      },
      async execute(event) {
        return event;
      },
    });
  };

  const triggerAppError = () => {
    logMessage('Throwing error from application code');
    throw new Error('Application level error');
  };

  return (
    <div className="app">
      <h1>Amplitude Module Playground</h1>
      <p>This playground imports @amplitude/analytics-browser via npm/yarn.</p>
      <div className="actions">
        <button onClick={triggerSdkError}>Trigger SDK Error</button>
        <button onClick={triggerAppError}>Trigger App Error</button>
      </div>
      <pre id="log" className="log" />
    </div>
  );
}

