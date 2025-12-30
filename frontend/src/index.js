import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import './setupFetch';
// In development, proxy /api calls to backend port via fetch wrapper

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Force English validation messages for required fields
// Customize the default browser message "Please fill out this field."
try {
  window.addEventListener('invalid', function (e) {
    const t = e.target;
    if (t && t.validity && t.validity.valueMissing) {
      t.setCustomValidity('Please fill out this field.');
    }
  }, true);
  window.addEventListener('input', function (e) {
    const t = e.target;
    if (t && typeof t.setCustomValidity === 'function') {
      t.setCustomValidity('');
    }
  }, true);
} catch (_) {}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
