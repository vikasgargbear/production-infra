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

// Register service worker for offline support
// This enables:
// 1. Offline functionality - App works without internet
// 2. Background sync - Automatic sync when connection returns
// 3. API caching - Faster responses with cached data
serviceWorkerRegistration.register({
    onSuccess: (registration: ServiceWorkerRegistration) => {
        console.log('[ServiceWorker] ✅ Registered successfully - Offline mode enabled');
    },
    onUpdate: (registration: ServiceWorkerRegistration) => {
        console.log('[ServiceWorker] 🔄 New version available - Reload to update');
        // Optionally show toast notification to user
        if (window.confirm('New version available! Reload to update?')) {
            window.location.reload();
        }
    },
    onOffline: () => {
        console.log('[ServiceWorker] 📴 You are offline - App will continue to work');
    }
});
