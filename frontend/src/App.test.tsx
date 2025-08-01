import React from 'react';
import ReactDOM from 'react-dom/client';
import { TestIntegration } from './TestIntegration';
import './index.css';

// Create root element
const rootElement = document.getElementById('root') as HTMLElement;
const root = ReactDOM.createRoot(rootElement);

// Render test integration component
root.render(
  <React.StrictMode>
    <TestIntegration />
  </React.StrictMode>
);