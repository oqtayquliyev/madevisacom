import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AppErrorBoundary } from '@/components/common/AppErrorBoundary';
import { reloadForNewVersion } from '@/lib/lazyPage';
import { AuthProvider } from '@/lib/auth';
import { MfaGate } from '@/components/auth/MfaGate';
import { PersonalizationProvider } from '@/lib/personalization';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { captureEmailClick } from '@/lib/emailAttribution';
import './index.css';

// Arrived from a MadeVisa email: note the click, tidy the address (mc/mt).
captureEmailClick();

// Tidy the address after a repair reload (api/seo.ts adds ?_r=).
try {
  const u = new URL(window.location.href);
  if (u.searchParams.has('_r')) {
    u.searchParams.delete('_r');
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
  }
} catch {
  /* optional */
}

// If the page's stylesheet didn't load (a cached page naming a stylesheet
// from an older deploy), fetch the current one and add it — no reload.
function ensureStyles() {
  const probe = document.createElement('div');
  probe.className = 'hidden';
  document.body.appendChild(probe);
  const styled = getComputedStyle(probe).display === 'none';
  probe.remove();
  if (styled) return;
  fetch('/index.html', { cache: 'no-store' })
    .then((r) => r.text())
    .then((html) => {
      for (const m of html.matchAll(/href="(\/assets\/[^"]+\.css)"/g)) {
        if (document.querySelector(`link[href="${m[1]}"]`)) continue;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = m[1];
        document.head.appendChild(link);
      }
    })
    .catch(() => undefined);
}
if (document.readyState === 'complete') window.setTimeout(ensureStyles, 200);
else window.addEventListener('load', () => window.setTimeout(ensureStyles, 200));

// A tab opened before a deploy asks for page files that no longer exist:
// reload once to get the new ones instead of showing a broken page.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion((event as Event & { payload?: unknown }).payload)) event.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
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
    </AppErrorBoundary>
  </StrictMode>
);
