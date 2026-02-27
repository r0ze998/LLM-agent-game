import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StarknetProvider } from './services/starknetProvider.tsx';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StarknetProvider>
      <App />
    </StarknetProvider>
  </StrictMode>,
);
