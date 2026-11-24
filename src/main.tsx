import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './ui/settings/fonts';
import App from './ui/App';
import { requestPersistentStorage } from './data/persist';
import StorageErrorProvider from './ui/components/StorageErrorProvider';
import { SettingsProvider } from './ui/settings/SettingsProvider';

void requestPersistentStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StorageErrorProvider>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </StorageErrorProvider>
  </StrictMode>,
);
