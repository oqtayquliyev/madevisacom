import { useCallback, useEffect, useRef, useState } from 'react';

// Cloudflare Turnstile — feeds Supabase Auth's captchaToken. Supabase
// verifies each token against the Turnstile secret (Authentication →
// Attack Protection) before any sign-in, sign-up, password reset or
// email link is allowed. The site key comes from VITE_TURNSTILE_SITE_KEY.
//
// Tokens are single-use: after every auth request (successful or not) the
// widget must produce a new one — useCaptcha().reset() does that.

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || '';

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve) => {
    if (window.turnstile) return resolve();
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    const check = window.setInterval(() => {
      if (window.turnstile) {
        window.clearInterval(check);
        resolve();
      }
    }, 50);
  });
}

export function Turnstile({ onVerify, invisible = false }: { onVerify: (token: string) => void; invisible?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) {
      console.warn('VITE_TURNSTILE_SITE_KEY is not set — no captcha is sent to Supabase.');
      return;
    }
    let cancelled = false;
    loadTurnstileScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        // Only shows a challenge when Cloudflare isn't sure; usually nothing to click.
        appearance: invisible ? 'interaction-only' : 'always',
        callback: (t: string) => onVerifyRef.current(t),
        'expired-callback': () => onVerifyRef.current(''),
        'error-callback': () => onVerifyRef.current(''),
      });
    });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
    };
  }, [invisible]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={containerRef} className="my-2 min-h-0" />;
}

/**
 * Captcha state for one form:
 *   const captcha = useCaptcha();
 *   ...{captcha.element}
 *   await supabase.auth.signUp({ ..., options: { captchaToken: captcha.token } });
 *   captcha.reset(); // after every attempt
 * `ready` is true once a token exists — or always when no site key is set.
 */
export function useCaptcha({ invisible = false }: { invisible?: boolean } = {}) {
  const [token, setToken] = useState('');
  const [round, setRound] = useState(0);
  const reset = useCallback(() => {
    setToken('');
    setRound((r) => r + 1); // remounts the widget → fresh token
  }, []);
  return {
    token: token || undefined,
    ready: !TURNSTILE_SITE_KEY || Boolean(token),
    reset,
    element: <Turnstile key={round} onVerify={setToken} invisible={invisible} />,
  };
}
