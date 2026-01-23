import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/numberInputFix.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element not found');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

// Service worker registration - DISABLED in development to prevent stale caching issues
// In production, we enable for offline support
if (process.env.NODE_ENV === 'production') {
    serviceWorkerRegistration.register({
        onSuccess: (registration: ServiceWorkerRegistration) => {
            console.log('[ServiceWorker] ✅ Registered successfully - Offline mode enabled');
        },
        onUpdate: (registration: ServiceWorkerRegistration) => {
            console.log('[ServiceWorker] 🔄 New version available - Reload to update');
            if (window.confirm('New version available! Reload to update?')) {
                window.location.reload();
            }
        },
        onOffline: () => {
            console.log('[ServiceWorker] 📴 You are offline - App will continue to work');
        }
    });
} else {
    // In development, unregister any existing service worker to ensure fresh code loads
    serviceWorkerRegistration.unregister();
    console.log('[Dev] 🔧 Service worker disabled - Fresh code loads on every refresh');
}
