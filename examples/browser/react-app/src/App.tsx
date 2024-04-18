import logo from './logo.svg';
import './App.css';
import {
    Route,
    Routes,
    NavLink,
    HashRouter
  } from "react-router-dom";

import Home from "./Home";
import Other from "./Other";
import Contact from "./Contact";

function App() {
  return (
    <HashRouter>
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
      </header>
      <div>
            <h1>Amplitude Analytics Browser Example with React</h1>
            <ul className="header">
              <li><NavLink to="/home">Home</NavLink></li>
              <li><NavLink to="/other">Other</NavLink></li>
              <li><NavLink to="/contact">Contact</NavLink></li>
            </ul>
            <div className="content">
                <Routes>
                 <Route path="/home"  element={<Home/>}/>
                 <Route path="/other"  element={<Other/>}/>
                 <Route path="/contact"  element={<Contact/>}/>
               </Routes>
            </div>
          </div>
    </div>
    </HashRouter>
  );
}

export default App;
