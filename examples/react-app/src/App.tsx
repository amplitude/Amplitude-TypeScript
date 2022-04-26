import React, { useEffect } from 'react';
import logo from './logo.svg';
import './App.css';
import { track, identify, setGroup, groupIdentify, Identify } from '@amplitude/analytics-browser';

function App() {
  useEffect(() => {
    track('Page View', {
      name: 'App',
    });
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <h2>Amplitude Analytics Browser Example with React</h2>

        <button onClick={() => identify(new Identify().set('role', 'engineer'))}>
          Identify
        </button>

        <button onClick={() => setGroup('org', 'engineering')}>
          Group
        </button>

        <button onClick={() => groupIdentify('org', 'engineering', new Identify().set('technology', 'react.js'))}>
          Group Identify
        </button>

        <button onClick={() => track('Button Click', { name: 'App' })}>
          Track
        </button>
      </header>
    </div>
  );
}

export default App;
