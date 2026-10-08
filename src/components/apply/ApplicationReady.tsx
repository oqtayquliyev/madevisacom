import { useMemo, useState } from 'react';
import { ChevronDown, Lock, Mail, Send, ShieldCheck } from 'lucide-react';
import type { AskItem, BatchJob, BatchPlan, Source } from '@/lib/apply/batch';
import type { ApplyStatus } from '@/lib/apply/store';
import { ApplicationCredits } from '@/components/apply/ApplicationCredits';
import { Sheet } from '@/components/apply/Sheet';
import { BTN, FIELD } from '@/components/apply/ui';

const EMAIL = /^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]{2,}$/;
const SOURCE: Record<Source, string> = { you: 'you saved', cv: 'your CV', account: 'your account', madevisa: 'MadeVisa', derived: 'your nationality & residence', batch: 'this form' };

function Pills({ value, options, onPick, label }: { value: string; options: string[]; onPick: (v: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onPick(o)} className={`rounded-full px-4 py-1.5 text-[13.5px] font-semibold ring-1 transition ${value === o ? 'bg-ink-950 text-white ring-ink-950' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-400'}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

function Question({ item, value, onChange, n }: { item: AskItem; value: string; onChange: (v: string) => void; n: number }) {
  const used = item.jobs.length === n ? `Used for all ${n} applications` : item.jobs.length === 1 ? `Only for ${item.companies[0]}` : `Used for ${item.jobs.length} applications`;
  return (
    <li className="rounded-2xl p-4 ring-1 ring-ink-200">
      <p className="text-[15px] font-bold leading-snug text-ink-950">{item.label}</p>
      {item.hint && <p className="mt-0.5 text-[12.5px] leading-5 text-ink-500">{item.hint}</p>}
      <div className="mt-2.5">
        {item.options?.length && item.options.length <= 6 && item.input !== 'text' && item.input !== 'long' ? (
          <Pills value={value} options={item.options} onPick={onChange} label={item.label} />
        ) : item.options?.length ? (
          <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={item.label} className={FIELD}>
            <option value="">Choose…</option>
            {item.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ) : item.input === 'long' ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} maxLength={4000} aria-label={item.label} className={FIELD} />
        ) : (
          <input value={value} onChange={(e) => onChange(e.target.value)} inputMode={item.input === 'number' ? 'numeric' : undefined} maxLength={300} aria-label={item.label} className={FIELD} placeholder={item.concept === 'salary_expectation' ? '$90,000' : undefined} />
        )}
      </div>
      <p className="mt-2 text-[12px] text-ink-500">{used}</p>
    </li>
  );
}

type Props = {
  plan: BatchPlan;
  jobs: BatchJob[];
  status: ApplyStatus;
  email: string | null;
  onClose: () => void;
  onReview: () => void;
  onConfirm: (given: Record<string, string>, email: string) => Promise<{ ok: boolean; error?: string }>;
};

/**
 * "Ready to apply": every selected application was read; this is the one
 * place the person answers what MadeVisa doesn't know yet — once, for all of them.
 */
export function ApplicationReady({ plan, jobs, status, email: savedEmail, onClose, onReview, onConfirm }: Props) {
  const [given, setGiven] = useState<Record<string, string>>({});
  const [email, setEmail] = useState(savedEmail ?? '');
  const [editEmail, setEditEmail] = useState(!savedEmail);
  const [showExtra, setShowExtra] = useState(false);
  const [showUsed, setShowUsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = jobs.length;
  // The privacy-notice consent isn't a question: it's a tick next to the button, at the end.
  const consentItem = plan.ask.find((a) => a.key === 'consent') ?? null;
  const asks = plan.ask.filter((a) => a !== consentItem);
  const blocked = plan.jobs.filter((j) => j.outcome === 'blocked');
  const stuck = plan.jobs.filter((j) => j.outcome === 'attention');
  const answeredExtra = plan.extra.filter((x) => given[x.key]?.trim());
  // The applications that go once this form is saved: the ones the main questions complete, plus any whose own question was answered.
  const going = useMemo(() => {
    const done = new Set([...plan.ask, ...answeredExtra].map((a) => a.key));
    return plan.jobs.filter((j) => j.outcome === 'apply' && j.waits.every((w) => done.has(w))).length;
  }, [plan, answeredExtra]);
  const missing = asks.filter((a) => !given[a.key]?.trim());
  const agreed = !consentItem || given.consent === 'Yes';
  const emailOk = EMAIL.test(email.trim());

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await onConfirm(given, email.trim());
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'That didn’t save. Try again.');
  };

  return (
    <Sheet
      id="apply-ready"
      title="Ready to apply"
      sub={`We checked all ${n} ${n === 1 ? 'application' : 'applications'}.`}
      onClose={onClose}
      wide
      footer={
        <div>
          {error && <p className="mb-2 text-[13px] text-rose-700">{error}</p>}
          {consentItem && (
            <label className="mb-3 flex cursor-pointer items-start gap-3 text-[13.5px] font-semibold leading-5 text-ink-900">
              <input
                type="checkbox"
                checked={given.consent === 'Yes'}
                onChange={(e) => setGiven((g) => ({ ...g, consent: e.target.checked ? 'Yes' : '' }))}
                className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600"
              />
              <span>
                I confirm MadeVisa may accept the privacy notice of {consentItem.companies.length === 1 ? consentItem.companies[0] : `these ${consentItem.companies.length} employers`} for me.
              </span>
            </label>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button onClick={save} disabled={busy || missing.length > 0 || !agreed || !emailOk || going === 0} className={`${BTN.primary} w-full whitespace-nowrap sm:w-auto sm:flex-1`}>
              <Send className="h-4 w-4" /> {busy ? 'Saving…' : asks.length ? `Save answers & apply to ${going} ${going === 1 ? 'job' : 'jobs'}` : `Apply to ${going} ${going === 1 ? 'job' : 'jobs'}`}
            </button>
            <button onClick={onReview} disabled={busy} className={`${BTN.secondary} w-full sm:w-auto`}>
              Review selected jobs
            </button>
          </div>
          {missing.length > 0 && <p className="mt-2 text-[12.5px] text-ink-500">{missing.length === 1 ? '1 answer to go.' : `${missing.length} answers to go.`}</p>}
        </div>
      }
    >
      <div className="rounded-2xl bg-emerald-50/70 p-4 ring-1 ring-emerald-200">
        <p className="text-[15px] font-bold leading-snug text-emerald-950">
          {asks.length === 0 ? 'Nothing is missing.' : `${asks.length} ${asks.length === 1 ? 'answer' : 'answers'} and MadeVisa does the rest.`}
        </p>
        <p className="mt-0.5 text-[13px] text-emerald-900">
          <span className="tabular-nums">{plan.coverage.pct}%</span> already filled from your CV and profile.
        </p>
      </div>

      {asks.length > 0 && (
        <ul className="mt-4 space-y-2.5">
          {asks.map((item) => (
            <Question key={item.key} item={item} n={n} value={given[item.key] ?? ''} onChange={(v) => setGiven((g) => ({ ...g, [item.key]: v }))} />
          ))}
        </ul>
      )}

      {plan.extra.length > 0 && (
        <div className="mt-4 rounded-2xl bg-ink-50 p-4">
          <button type="button" onClick={() => setShowExtra(!showExtra)} aria-expanded={showExtra} className="flex w-full items-start justify-between gap-3 text-left">
            <span>
              <span className="block text-[14px] font-bold text-ink-950">
                {plan.extra.length === 1 ? '1 employer asks its own question' : `${plan.extra.length} questions only one employer asks`}
                <span className="font-normal text-ink-500"> · optional</span>
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-5 text-ink-600">Answer now and those applications go out too. Leave them, and only those wait for you — the rest don’t.</span>
            </span>
            <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-ink-500 transition ${showExtra ? 'rotate-180' : ''}`} />
          </button>
          {showExtra && (
            <ul className="mt-3 space-y-2.5">
              {plan.extra.map((item) => (
                <Question key={item.key} item={item} n={n} value={given[item.key] ?? ''} onChange={(v) => setGiven((g) => ({ ...g, [item.key]: v }))} />
              ))}
            </ul>
          )}
        </div>
      )}

      {(blocked.length > 0 || stuck.length > 0) && (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 text-[14px] font-bold text-amber-950">
            <Lock className="h-4 w-4" /> {blocked.length + stuck.length} can’t be completed automatically
          </p>
          <ul className="mt-1.5 space-y-1 text-[12.5px] leading-5 text-amber-900">
            {[...blocked, ...stuck].slice(0, 6).map((j) => (
              <li key={j.id}>
                <strong className="font-semibold">{j.company}</strong> — {j.reason}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[12.5px] leading-5 text-amber-900">They wait under “Need you” with everything ready to paste.</p>
        </div>
      )}

      <div className="mt-4 rounded-2xl p-4 ring-1 ring-ink-200">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-700">
          <Mail className="h-4 w-4 text-brand-700" /> Applications are submitted using
        </p>
        {editEmail ? (
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-label="Email for your applications" className={`${FIELD} mt-2`} placeholder="you@example.com" />
        ) : (
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <span className="break-all text-[15px] font-bold text-ink-950">{email}</span>
            <button type="button" onClick={() => setEditEmail(true)} className={BTN.link}>
              Change
            </button>
          </p>
        )}
      </div>

      {plan.reused.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setShowUsed(!showUsed)} aria-expanded={showUsed} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline">
            What MadeVisa will use <ChevronDown className={`h-3.5 w-3.5 transition ${showUsed ? 'rotate-180' : ''}`} />
          </button>
          {showUsed && (
            <dl className="mt-2 divide-y divide-ink-100 rounded-2xl ring-1 ring-ink-200">
              {plan.reused.slice(0, 20).map((r) => (
                <div key={`${r.label}=${r.value}`} className="flex items-start justify-between gap-3 px-3.5 py-2">
                  <div className="min-w-0">
                    <dt className="text-[12px] text-ink-500">{r.label}</dt>
                    <dd className="break-words text-[13.5px] font-semibold text-ink-900 [overflow-wrap:anywhere]">{r.value}</dd>
                  </div>
                  <span className="shrink-0 text-right text-[11.5px] text-ink-400">
                    from {SOURCE[r.source]}
                    <br />
                    {r.jobs} {r.jobs === 1 ? 'application' : 'applications'}
                  </span>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      <ApplicationCredits status={status} asking={going} className="mt-4" />
      {status.worker && !status.worker.online && (
        <p className="mt-2 rounded-xl bg-ink-50 px-3 py-2 text-[12.5px] leading-5 text-ink-600">MadeVisa’s application service is offline right now. Your applications will be prepared now and submitted as soon as it’s back.</p>
      )}
      <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-5 text-ink-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <span>Nothing is made up. Answers are saved, so you’re asked once.</span>
      </p>
    </Sheet>
  );
}
