import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Admin, on a job: "this employer takes applications through MadeVisa".
 * When it is on, Auto Apply emails people's applications (their tailored CV
 * and details) to the address below — so it is switched on only for an
 * address the employer gave for exactly that. Saved straight away, apart
 * from the rest of the form. Shows nothing until migration 20261204090000
 * is run.
 */
export function ApplyChannelControl({ jobId }: { jobId: string }) {
  const [state, setState] = useState<{ on: boolean; email: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase
      .from('application_channels')
      .select('enabled, email')
      .eq('job_id', jobId)
      .maybeSingle()
      .then(({ data, error }) => {
        // An error here means the table isn't there yet (or this isn't an admin): show nothing.
        if (!alive || error) return;
        const row = data as { enabled: boolean; email: string } | null;
        setState({ on: Boolean(row?.enabled), email: row?.email ?? '' });
      });
    return () => {
      alive = false;
    };
  }, [jobId]);

  if (!state) return null;
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(state.email.trim());

  const save = async (on: boolean) => {
    setBusy(true);
    setNote(null);
    const { error } = await supabase.rpc('apply_set_job_channel', { p_job: jobId, p_on: on, p_email: state.email.trim() || null });
    setBusy(false);
    if (error) return setNote({ ok: false, text: error.message });
    setState({ ...state, on });
    setNote({ ok: true, text: on ? 'On. Applications for this job are emailed to this address.' : 'Off. People apply on the employer’s own site.' });
  };

  return (
    <div className="rounded-lg border border-ink-200 p-3">
      <p className="text-sm font-semibold text-ink-900">Applications through MadeVisa</p>
      <p className="mt-0.5 text-xs leading-5 text-ink-500">
        Turn this on only when the employer has given an address for receiving applications. Auto Apply then emails each candidate’s tailored CV and details there, with the candidate as the reply address. Off, candidates apply on the employer’s own site.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={state.email}
          onChange={(e) => setState({ ...state, email: e.target.value })}
          placeholder="careers@company.com"
          aria-label="Email address for applications"
          className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
        />
        {state.on ? (
          <>
            <button type="button" disabled={busy || !valid} onClick={() => save(true)} className="rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50 disabled:opacity-50">
              Update address
            </button>
            <button type="button" disabled={busy} onClick={() => save(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50">
              Turn off
            </button>
          </>
        ) : (
          <button type="button" disabled={busy || !valid} onClick={() => save(true)} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            Turn on
          </button>
        )}
      </div>
      <p className={`mt-1.5 text-xs font-medium ${state.on ? 'text-emerald-700' : 'text-ink-500'}`}>{note ? <span className={note.ok ? '' : 'text-rose-600'}>{note.text}</span> : state.on ? 'On' : 'Off'}</p>
    </div>
  );
}
