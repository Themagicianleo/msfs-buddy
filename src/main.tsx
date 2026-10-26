import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './shared/glass.css';
import './styles.css';
import { importUserFromUrl } from './lib/storage';

importUserFromUrl();
// Ask the browser not to evict saved settings under storage pressure.
void navigator.storage?.persist?.().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
