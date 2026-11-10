import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/vazirmatn';
import App from './App';
import './i18n';
import './styles.css';
import { markOperatorWebAppLaunch } from './telegram/operator-webapp';

/**
 * Mounts the React 19 Studio dashboard root.
 * @returns {void}
 */
function bootstrap(): void {
  const container = document.getElementById('root');
  if (!container) return;
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

/**
 * The Telegram SDK is never loaded for ordinary web-dashboard visits.
 * It is required only for a signed launch from the dedicated operator bot,
 * and must initialize before AuthProvider reads WebApp.initData.
 */
async function loadOperatorWebAppSdk(): Promise<void> {
  if (new URLSearchParams(window.location.search).get('tg_admin') !== '1') return;
  await new Promise<void>((resolve) => {
    const script = document.createElement('script');
    const timer = window.setTimeout(resolve, 10_000);
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.async = true;
    script.onload = script.onerror = () => {
      window.clearTimeout(timer);
      resolve();
    };
    document.head.appendChild(script);
  });
}

void loadOperatorWebAppSdk().then(() => {
  markOperatorWebAppLaunch();
  bootstrap();
});
