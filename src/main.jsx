import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

// Register PWA Service Worker for mobile full-screen app installation and offline caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('Alaapi PWA ServiceWorker active with scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('Alaapi PWA ServiceWorker registration failed:', err);
      });
  });
}
