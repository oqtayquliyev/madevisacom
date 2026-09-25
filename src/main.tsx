import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from '@/lib/auth';
import { MfaGate } from '@/components/auth/MfaGate';
import { PersonalizationProvider } from '@/lib/personalization';
import { Analytics } from '@vercel/analytics/react';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <PersonalizationProvider>
        <MfaGate>
          <App />
        </MfaGate>
        <Analytics />
      </PersonalizationProvider>
    </AuthProvider>
  </StrictMode>
);
