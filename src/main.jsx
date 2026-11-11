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

// Register PWA Service Worker for mobile app installation and seamless auto-updating
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('Alaapi PWA ServiceWorker active with scope:', reg.scope);

        // 1. Check for updates whenever the user returns to the app from the background
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            reg.update().catch((err) => console.debug('SW visibility update check:', err));
          }
        });

        // 2. Periodic background update check every 30 minutes
        setInterval(() => {
          reg.update().catch((err) => console.debug('Periodic SW update check:', err));
        }, 30 * 60 * 1000);
      })
      .catch((err) => {
        console.warn('Alaapi PWA ServiceWorker registration failed:', err);
      });

    // 3. When a new service worker version is activated (skipWaiting + clients.claim),
    // update the view automatically - but NEVER reload while in an active call room!
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        if (!window.location.pathname.startsWith('/room/')) {
          window.location.reload();
        }
      }
    });
  });
}
