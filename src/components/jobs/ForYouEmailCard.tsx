import { useEffect, useState } from 'react';
import { Check, Loader2, Mail } from 'lucide-react';
import { useForYou, type ForYouFrequency } from '@/lib/forYou';

const OPTIONS: { value: ForYouFrequency; label: string; text: string }[] = [
  { value: 'daily', label: 'Daily', text: 'One email on mornings when new jobs fit you' },
  { value: 'weekly', label: 'Weekly', text: 'One email on Mondays with the week’s new jobs' },
  { value: 'off', label: 'Off', text: 'No “Jobs for you” emails' },
];

/** Profile → Settings: how often the "Jobs for you" email comes, and what it is based on. */
export function ForYouEmailCard() {
  const { state, save } = useForYou();
  const [busy, setBusy] = useState<ForYouFrequency | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Arriving from the email's "Daily, weekly or off" link (/profile?tab=settings#for-you).
  useEffect(() => {
    if (window.location.hash === '#for-you') window.setTimeout(() => document.getElementById('for-you')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, []);

  if (state === null) return null;
  const current = state?.frequency ?? 'daily';
  const t = state?.terms;
  const based = [...(t?.titles ?? []).slice(0, 5), ...(t?.skills ?? []).slice(0, 4)];

  const pick = async (f: ForYouFrequency) => {
    if (f === current || busy) return;
    setBusy(f);
    setMsg(null);
    const err = await save(f);
    setBusy(null);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: f === 'off' ? 'Saved. No more “Jobs for you” emails.' : `Saved. You’ll get them ${f}.` });
  };

  return (
    <section id="for-you" className="scroll-mt-28 rounded-xl border border-ink-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#1D4ED8]/10 text-[#1D4ED8]">
          <Mail className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold text-ink-950">“Jobs for you” emails</h2>
          <p className="mt-0.5 text-[14px] leading-6 text-ink-600">
            New jobs that fit your CV, your specialization, your job alerts and what you search for. Only jobs posted since your last email — never the same one twice. No new jobs that fit, no email.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="How often">
        {OPTIONS.map((o) => {
          const on = current === o.value;
          return (
            <button
              key={o.value}
              role="radio"
              aria-checked={on}
              onClick={() => void pick(o.value)}
              disabled={state === undefined}
              className={`rounded-lg border p-3 text-left transition disabled:opacity-60 ${on ? 'border-[#1D4ED8] bg-[#1D4ED8]/5 ring-2 ring-[#1D4ED8]/20' : 'border-ink-200 hover:bg-ink-50'}`}
            >
              <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink-950">
                {busy === o.value ? <Loader2 className="h-4 w-4 animate-spin" /> : on ? <Check className="h-4 w-4 text-[#1D4ED8]" /> : null}
                {o.label}
              </span>
              <span className="mt-0.5 block text-[13px] leading-5 text-ink-500">{o.text}</span>
            </button>
          );
        })}
      </div>

      {state !== undefined && (
        <div className="mt-4 rounded-lg bg-ink-50 px-4 py-3 text-[13px] leading-5 text-ink-600">
          {based.length ? (
            <>
              <span className="font-semibold text-ink-800">Based on: </span>
              {based.join(' · ')}
              {t?.from?.length ? <span className="text-ink-500"> (from {t.from.join(', ')})</span> : null}
            </>
          ) : (
            <>Upload your CV on CV match, or add your specialization above, so we know which jobs fit you.</>
          )}
        </div>
      )}

      {msg && <p className={`mt-3 text-[13px] font-medium ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}
    </section>
  );
}
