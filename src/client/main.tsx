import './lib/monaco-setup.js';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

