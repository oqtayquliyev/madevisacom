import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { clearAuthIntent, readAuthIntent, safeNext } from '@/lib/authIntent';
import { AuthCard, Input, PrimaryButton, ErrorBanner } from '@/components/auth/AuthUI';

const SKIP_KEY = 'mv:nameSkipped';

export function nameSkipped(): boolean {
  try {
    return window.localStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

/** Back to where the visitor was before signing in (e.g. page 2 of /jobs). */
export function goToNextAfterAuth() {
  const next = safeNext(readAuthIntent().next);
  clearAuthIntent();
  window.history.replaceState({}, '', next);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

/** Renders nothing; sends the freshly signed-in visitor on. */
export function FinishAuth() {
  useEffect(() => {
    goToNextAfterAuth();
  }, []);
  return null;
}

/**
 * First sign-in with an email code: we know the email but not the name.
 * One quick question — it's what appears on their profile. Can be skipped.
 */
export function AddNameStep({ onDone }: { onDone?: () => void } = {}) {
  // With `onDone`, the caller decides what follows (the CV step); otherwise go back to where they were.
  const done = () => (onDone ? onDone() : goToNextAfterAuth());
  const { user, refreshProfile } = useAuth();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 40);
  const fullName = [clean(first), clean(last)].filter(Boolean).join(' ');

  const save = async () => {
    if (!user || clean(first).length < 2) return setError('Please enter your first name.');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id);
    if (err) {
      setBusy(false);
      return setError(err.message);
    }
    await refreshProfile();
    done();
  };

  return (
    <AuthCard title="Welcome to MadeVisa 👋" subtitle="What should we call you? It’s shown on your profile.">
      <ErrorBanner message={error} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className={`grid gap-3 sm:grid-cols-2 ${error ? 'mt-4' : ''}`}
      >
        <Input label="First name" value={first} onChange={(v) => setFirst(v.slice(0, 40))} placeholder="Oqtay" required autoComplete="given-name" />
        <Input label="Last name" value={last} onChange={(v) => setLast(v.slice(0, 40))} placeholder="Quliyev" autoComplete="family-name" />
        <div className="sm:col-span-2">
          <PrimaryButton loading={busy} disabled={clean(first).length < 2}>
            Continue
          </PrimaryButton>
        </div>
      </form>
      <button
        type="button"
        onClick={() => {
          try {
            window.localStorage.setItem(SKIP_KEY, '1');
          } catch {
            /* ignore */
          }
          done();
        }}
        className="mt-3 w-full text-center text-sm font-medium text-ink-500 hover:text-ink-800"
      >
        Skip for now
      </button>
    </AuthCard>
  );
}
