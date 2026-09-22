import { useEffect, useRef } from 'react';

// Place at: src/components/auth/Turnstile.tsx
//
// Cloudflare Turnstile widget — invisible-friendly CAPTCHA alternative,
// wired to feed Supabase Auth's captchaToken param on signUp /
// signInWithPassword. Supabase verifies the token server-side against
// your Turnstile secret key before allowing the auth attempt through,
// which is the actual bot-mitigation boundary here (not this widget by
// itself — a widget with no server-side verification is decorative).
//
// TWO MANUAL STEPS THIS CODE CANNOT DO FOR YOU:
//   1. Create a free site at https://dash.cloudflare.com/?to=/:account/turnstile
//      — get a Site Key and a Secret Key.
//   2. In your Supabase project: Authentication -> Settings -> Bot and
//      Abuse Protection -> enable Turnstile -> paste the Secret Key.
//      Without this step, Supabase accepts signups/logins with no
//      token at all, silently ignoring this widget's output.
//
// Set the Site Key as VITE_TURNSTILE_SITE_KEY in your env.

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve) => {
    if (window.turnstile) return resolve();
    if (document.getElementById(SCRIPT_ID)) {
      // Already loading elsewhere — poll briefly for it to finish.
      const check = setInterval(() => {
        if (window.turnstile) {
          clearInterval(check);
          resolve();
        }
      }, 50);
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

export function Turnstile({ onVerify }: { onVerify: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
    if (!siteKey) {
      console.warn('VITE_TURNSTILE_SITE_KEY is not set — Turnstile widget will not render.');
      return;
    }

    let cancelled = false;

    loadTurnstileScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onVerify,
        'expired-callback': () => onVerify(''),
      });
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="my-2" />;
}
