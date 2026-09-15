import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from '@/lib/auth';
import { PersonalizationProvider } from '@/lib/personalization';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <PersonalizationProvider>
        <App />
      </PersonalizationProvider>
    </AuthProvider>
  </StrictMode>
);
