import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from '@/lib/auth';
import { PersonalizationProvider } from '@/lib/personalization';
import { Analytics } from '@vercel/analytics/react';
import './index.css';
import { initTheme } from '@/lib/theme';

initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <PersonalizationProvider>
        <App />
        <Analytics />
      </PersonalizationProvider>
    </AuthProvider>
  </StrictMode>
);
