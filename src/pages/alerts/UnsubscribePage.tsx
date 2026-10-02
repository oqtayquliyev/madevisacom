import { useEffect, useState } from 'react';
import { BellOff, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSeo } from '@/lib/seo';

/** /alerts/unsubscribe?t=<token> — one click, no sign-in (link in every alert email). */
export function UnsubscribePage() {
  const [state, setState] = useState<'busy' | 'done' | 'bad'>('busy');
  const [label, setLabel] = useState('');
  useSeo({ title: 'Unsubscribe — MadeVisa', description: 'Stop job alert emails.', path: '/alerts/unsubscribe', noindex: true });

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('t') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(t)) return setState('bad');
    supabase.rpc('unsubscribe_job_alert', { p_token: t }).then(({ data, error }) => {
      if (error) return setState('bad');
      setLabel(String(data ?? ''));
      setState('done');
    });
  }, []);

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
                ? `You won’t get emails for ${label ? `“${label}”` : 'this alert'} any more.`
                : 'It may be incomplete. Copy the whole link from the email, or turn alerts off from your account.'}
            </p>
            <a href="/jobs" className="mt-5 inline-block rounded-full bg-[#1D4ED8] px-5 py-2.5 text-[14px] font-bold text-white hover:bg-brand-800">
              Browse jobs
            </a>
          </>
        )}
      </div>
    </div>
  );
}
