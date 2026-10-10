import { useEffect, useState } from 'react';
import { Bell, Briefcase, Loader2, Mail, Megaphone, Send } from 'lucide-react';
import { useEmailPrefs, type EmailPrefs } from '@/lib/emailPrefs';

type Key = 'job_alerts' | 'applications' | 'news';

const ROWS: { key: Key; icon: typeof Mail; title: string; text: string }[] = [
  { key: 'applications', icon: Send, title: 'Application updates', text: 'An email each time MadeVisa applies to a job for you, and when Auto Apply starts.' },
  { key: 'job_alerts', icon: Bell, title: 'Job alerts', text: 'New jobs for the alerts you set on job pages.' },
  { key: 'news', icon: Megaphone, title: 'News and tips', text: 'Now and then: new features and visa news. Never more than a few a month.' },
];

function Toggle({ on, busy, onChange, label }: { on: boolean; busy: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      disabled={busy}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-60 ${on ? 'bg-[#1D4ED8]' : 'bg-ink-200'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      {busy && <Loader2 className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-ink-500" />}
    </button>
  );
}

/** Profile → Settings: every email MadeVisa sends, on or off. Linked from every email's footer (/profile?tab=settings#emails). */
export function EmailSettingsCard() {
  const { prefs, save } = useEmailPrefs();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (prefs && /#(emails|for-you)$/.test(window.location.hash)) window.setTimeout(() => document.getElementById('emails')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, [prefs]);

  if (prefs === null) return null;

  const change = async (key: string, p: Partial<Omit<EmailPrefs, 'email' | 'alerts_count'>>, done: string) => {
    setBusy(key);
    setMsg(null);
    const err = await save(p);
    setBusy(null);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: done });
  };

  const off = prefs?.all_off ?? false;

  return (
    <section id="emails" className="scroll-mt-28 rounded-xl border border-ink-200 bg-white p-5 sm:p-6">
      <span id="for-you" className="block scroll-mt-28" aria-hidden />
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#1D4ED8]/10 text-[#1D4ED8]">
          <Mail className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold text-ink-950">Email notifications</h2>
          <p className="mt-0.5 text-[14px] leading-6 text-ink-600">
            Choose what MadeVisa emails you{prefs?.email ? <> at <b className="font-semibold text-ink-800">{prefs.email}</b></> : null}. Sign-in codes and security emails always come.
          </p>
        </div>
      </div>

      {prefs === undefined ? (
        <div className="mt-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-ink-300" />
        </div>
      ) : (
        <>
          {off && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 px-4 py-3 text-[13.5px] text-amber-900">
              <span>You’re unsubscribed from all MadeVisa emails.</span>
              <button
                onClick={() => void change('all', { all_off: false, applications: true, job_alerts: true, for_you: 'daily' }, 'Emails are back on.')}
                className="rounded-full bg-amber-600 px-3.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-amber-700"
              >
                Turn emails back on
              </button>
            </div>
          )}

          <ul className="mt-5 divide-y divide-ink-100 rounded-lg ring-1 ring-ink-200">
            {/* Jobs that match your skills: how often */}
            <li className="p-4">
              <div className="flex items-start gap-3">
                <Briefcase className="mt-0.5 h-5 w-5 shrink-0 text-ink-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-ink-950">Jobs that match your skills</p>
                  <p className="mt-0.5 text-[13px] leading-5 text-ink-500">New jobs that fit your CV and searches, with the skills each one matches. Never the same job twice.</p>
                  <div className="mt-3 grid max-w-sm grid-cols-3 gap-1 rounded-lg bg-ink-100 p-1" role="radiogroup" aria-label="How often">
                    {(['daily', 'weekly', 'off'] as const).map((f) => {
                      const on = prefs.for_you === f;
                      return (
                        <button
                          key={f}
                          role="radio"
                          aria-checked={on}
                          disabled={busy !== null}
                          onClick={() => !on && void change(`fy-${f}`, { for_you: f }, f === 'off' ? 'Job match emails are off.' : `You’ll get job matches ${f}.`)}
                          className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[13px] font-semibold capitalize transition ${on ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600 hover:text-ink-900'}`}
                        >
                          {busy === `fy-${f}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {f}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </li>
            {ROWS.map((r) => (
              <li key={r.key} className="flex items-start gap-3 p-4">
                <r.icon className="mt-0.5 h-5 w-5 shrink-0 text-ink-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-ink-950">{r.title}</p>
                  <p className="mt-0.5 text-[13px] leading-5 text-ink-500">
                    {r.text}
                    {r.key === 'job_alerts' && prefs.alerts_count > 0 ? ` You have ${prefs.alerts_count} ${prefs.alerts_count === 1 ? 'alert' : 'alerts'}.` : ''}
                  </p>
                </div>
                <Toggle on={prefs[r.key]} busy={busy === r.key} label={r.title} onChange={(v) => void change(r.key, { [r.key]: v }, `${r.title}: ${v ? 'on' : 'off'}.`)} />
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {msg ? <p className={`text-[13px] font-medium ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p> : <span />}
            {!off && (
              <button
                onClick={() => void change('all', { all_off: true }, 'Unsubscribed from all MadeVisa emails.')}
                disabled={busy !== null}
                className="text-[13px] font-semibold text-ink-500 underline-offset-2 hover:text-rose-700 hover:underline"
              >
                Unsubscribe from all
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
