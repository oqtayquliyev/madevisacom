import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, Smartphone } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { listTotpFactors, needsMfaCode, verifyTotpCode } from '@/lib/mfa';

/**
 * If the signed-in account has two-step login turned on and this session
 * hasn't passed the code yet (password or Google sign-in), ask for the
 * 6-digit code before showing the site. Works for every sign-in method.
 */
export function MfaGate({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [need, setNeed] = useState(false);

  useEffect(() => {
    if (!session) {
      setNeed(false);
      return;
    }
    needsMfaCode().then(setNeed);
  }, [session?.access_token]);

  if (!need) return <>{children}</>;
  return <MfaChallenge onDone={() => window.location.reload()} />;
}

function MfaChallenge({ onDone }: { onDone: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTotpFactors().then(({ verified }) => setFactorId(verified[0]?.id ?? null));
  }, []);

  const submit = async (value = code) => {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const res = await verifyTotpCode(factorId, value);
    setBusy(false);
    if (res.ok) onDone();
    else {
      setError(res.error ?? 'Could not verify the code.');
      setCode('');
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#f8fafc] px-4">
      <div className="w-full max-w-sm rounded-lg border border-ink-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="grid h-11 w-11 place-items-center rounded-md bg-brand-50 text-brand-700">
          <Smartphone className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-ink-950">Enter your code</h1>
        <p className="mt-1 text-sm text-ink-500">Open your authenticator app and enter the 6-digit code for MadeVisa.</p>
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(v);
            if (v.length === 6) submit(v);
          }}
          placeholder="000000"
          className="mt-5 h-14 w-full rounded-md border border-ink-200 text-center font-mono text-2xl tracking-[0.5em] text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
        <button
          onClick={() => submit()}
          disabled={busy || code.length !== 6 || !factorId}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Verify
        </button>
        <button onClick={() => supabase.auth.signOut().then(() => window.location.assign('/'))} className="mt-3 w-full text-center text-xs font-medium text-ink-500 hover:text-ink-800">
          Sign out
        </button>
        <p className="mt-5 border-t border-ink-100 pt-4 text-[11px] leading-4 text-ink-400">
          Lost your phone? Email hello@madevisa.com from your account's email address.
        </p>
      </div>
    </div>
  );
}
