import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/numberInputFix.css';
import App from './App';

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

// The ERP is cloud-authoritative. Remove service workers left by earlier
// cache-first builds so API/UI deploys cannot be shadowed by stale bundles.
if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations().then(async registrations => {
        await Promise.all(registrations.map(registration => registration.unregister()));

        if ('caches' in window) {
            const cacheNames = await window.caches.keys();
            await Promise.all(cacheNames.map(cacheName => window.caches.delete(cacheName)));
        }
    });
}
