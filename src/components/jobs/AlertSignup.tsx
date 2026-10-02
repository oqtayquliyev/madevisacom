import { useState } from 'react';
import { BellRing, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { rememberAuthIntent } from '@/lib/authIntent';
import { alertMatches, createJobAlert, rememberAlertWish, useMyAlerts } from '@/lib/jobAlerts';

/**
 * One line: "Get new <keywords> jobs in <country> by email — free, once a day".
 * Guests are asked to sign up (email code or Google) and the alert is created
 * right after. The main reason people make an account on a job site.
 */
export function AlertSignup({
  keywords,
  country,
  onAuth,
  className = '',
}: {
  keywords: string;
  /** Country name or code; empty / "All countries" = everywhere. */
  country: string | null;
  onAuth?: (page: 'login' | 'register') => void;
  className?: string;
}) {
  const { session } = useAuth();
  const alerts = useMyAlerts();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kw = keywords.trim().slice(0, 60);
  const place = country && !/^all\b/i.test(country) ? country : null;
  if (!kw && !place) return null;

  const what = `${kw ? `“${kw}” ` : ''}jobs${place ? ` in ${place}` : ''}`;
  const already = done || (alerts ?? []).some((a) => alertMatches(a, kw, place));

  const go = async () => {
    setError(null);
    if (!session) {
      rememberAlertWish({ keywords: kw, country: place });
      rememberAuthIntent({ reason: 'alert', next: `${window.location.pathname}${window.location.search}` });
      onAuth?.('register');
      return;
    }
    setBusy(true);
    const res = await createJobAlert({ keywords: kw, country: place });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error ?? 'Couldn’t save the alert.');
  };

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-ink-200 ${className}`}>
      <p className="flex min-w-0 items-start gap-2 text-[14px] leading-5 text-ink-800">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-[#1D4ED8]" />
        <span>
          {already ? (
            <>
              <strong className="text-ink-950">You’ll get new {what} by email</strong> — once a day, unsubscribe anytime.
            </>
          ) : (
            <>
              <strong className="text-ink-950">Get new {what} by email.</strong> Free, once a day.
            </>
          )}
          {error && <span className="block text-[12px] text-rose-600">{error}</span>}
        </span>
      </p>
      {already ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-emerald-700">
          <Check className="h-4 w-4" /> Alert on
        </span>
      ) : (
        <button
          onClick={() => void go()}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#1D4ED8] px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Email me these jobs
        </button>
      )}
    </div>
  );
}
