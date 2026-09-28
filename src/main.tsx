import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from '@/lib/auth';
import { MfaGate } from '@/components/auth/MfaGate';
import { PersonalizationProvider } from '@/lib/personalization';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <PersonalizationProvider>
        <MfaGate>
          <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#f8fafc]" aria-busy="true" />}>
            <App />
          </Suspense>
        </MfaGate>
        <Analytics />
        <SpeedInsights />
      </PersonalizationProvider>
    </AuthProvider>
  </StrictMode>
);
