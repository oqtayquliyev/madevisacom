import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from '@/lib/auth';
import { MfaGate } from '@/components/auth/MfaGate';
import { PersonalizationProvider } from '@/lib/personalization';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './index.css';

// Started fine: clear the one-time reload guard (api/seo.ts) and remove its ?_r= marker.
try {
  sessionStorage.removeItem('mv-boot-retry');
  const u = new URL(window.location.href);
  if (u.searchParams.has('_r')) {
    u.searchParams.delete('_r');
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
  }
} catch {
  /* optional */
}

// A tab opened before a deploy asks for page files that no longer exist:
// reload once to get the new ones instead of showing a broken page.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  try {
    if (sessionStorage.getItem('mv-chunk-retry')) return;
    sessionStorage.setItem('mv-chunk-retry', '1');
  } catch {
    /* reload anyway */
  }
  window.location.reload();
});
window.setTimeout(() => {
  try {
    sessionStorage.removeItem('mv-chunk-retry');
  } catch {
    /* optional */
  }
}, 30_000);

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
