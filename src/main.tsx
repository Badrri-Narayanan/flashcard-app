import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './ui/settings/fonts';
import App from './ui/App';
import { SettingsProvider } from './ui/settings/SettingsProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>,
);
