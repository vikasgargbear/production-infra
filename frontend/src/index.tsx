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
// offline builds so API/UI deploys cannot be shadowed by stale cached bundles.
if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations().then(registrations => (
        Promise.all(registrations.map(registration => registration.unregister()))
    ));
}
