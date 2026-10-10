import { useEffect, useState } from 'react';
import { BellOff, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSeo } from '@/lib/seo';

/**
 * /alerts/unsubscribe?t=<token>[&k=<kind>] — one click, no sign-in (the link in every email).
 *   no k            one job alert (its own token, as in older alert emails)
 *   k=foryou        "Jobs that match your skills"
 *   k=alerts        all job alert emails
 *   k=applications  application updates (Auto Apply)
 *   k=news          news and tips
 *   k=all           every MadeVisa email
 */
export function UnsubscribePage() {
  const [state, setState] = useState<'busy' | 'done' | 'bad'>('busy');
  const [label, setLabel] = useState('');
  const [allToken, setAllToken] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  useSeo({ title: 'Unsubscribe — MadeVisa', description: 'Stop MadeVisa emails.', path: '/alerts/unsubscribe', noindex: true });

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get('t') ?? '';
    const k = (q.get('k') ?? '').toLowerCase();
    if (!/^[0-9a-f-]{36}$/i.test(t)) return setState('bad');
    const done = ({ data, error }: { data: unknown; error: unknown }) => {
      if (error || !data) return setState('bad');
      setLabel(String(data));
      setState('done');
    };
    if (!k) {
      // An older alert email: that one alert.
      supabase.rpc('unsubscribe_job_alert', { p_token: t }).then(({ data, error }) => {
        if (error) return setState('bad');
        setLabel(data ? `the “${String(data)}” alert` : 'this alert');
        setState('done');
      });
      return;
    }
    if (k !== 'all') setAllToken(t);
    supabase.rpc('email_unsubscribe', { p_token: t, p_kind: k }).then(done);
  }, []);

  const unsubAll = async () => {
    if (!allToken) return;
    const { data, error } = await supabase.rpc('email_unsubscribe', { p_token: allToken, p_kind: 'all' });
    if (!error && data) {
      setLabel(String(data));
      setAllDone(true);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#f8fafc] p-6">
      <div className="max-w-md rounded-2xl bg-white p-8 text-center ring-1 ring-ink-200">
        {state === 'busy' ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-ink-400" />
        ) : (
          <>
            <BellOff className="mx-auto h-8 w-8 text-ink-400" />
            <h1 className="mt-3 text-[20px] font-bold text-ink-950">{state === 'done' ? 'You’re unsubscribed' : 'This link doesn’t work'}</h1>
            <p className="mt-2 text-[14px] leading-6 text-ink-600">
              {state === 'done'
                ? `You won’t get emails for ${label.startsWith('the ') || label === 'this alert' ? label : `“${label}”`} any more.`
                : 'It may be incomplete. Copy the whole link from the email, or change your emails in your profile settings.'}
            </p>
            {state === 'done' && allToken && !allDone && (
              <button onClick={() => void unsubAll()} className="mt-3 text-[13px] font-semibold text-ink-500 underline underline-offset-2 hover:text-rose-700">
                Unsubscribe from all MadeVisa emails
              </button>
            )}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <a href="/profile?tab=settings#emails" className="rounded-full px-5 py-2.5 text-[14px] font-bold text-ink-800 ring-1 ring-ink-200 hover:bg-ink-50">
                Email settings
              </a>
              <a href="/jobs" className="rounded-full bg-[#1D4ED8] px-5 py-2.5 text-[14px] font-bold text-white hover:bg-brand-800">
                Browse jobs
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
