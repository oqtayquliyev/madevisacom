import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Copy, Download, FileText, HelpCircle, Image as ImageIcon, Lock, Zap } from 'lucide-react';
import { docxBytes, downloadBytes, letterLines } from '@/lib/apply/docx';
import { isConsentStop } from '@/lib/apply/login';
import { STAGES, STAGE_LABEL, useApplyState, sendNow, acceptConsent, answerAttention, fetchReceipt, fileLink, markSent, recordOutcome, retry, skip, type App, type Receipt, type Stage } from '@/lib/apply/store';
import { cvDownloadUrl, type StoredCv } from '@/lib/cv/store';
import type { Needed } from '@/lib/apply/types';
import { ApplicationStatus, VerifiedBadge } from '@/components/apply/ApplicationStatus';
import { Sheet } from '@/components/apply/Sheet';
import { SendingBar } from '@/components/apply/SendingBar';
import { CompanyLogo } from '@/components/common/CompanyLogo';
import { BTN, FIELD } from '@/components/apply/ui';

const ago = (iso: string | null) => {
  if (!iso) return '';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} minutes ago`;
  if (min < 60 * 36) return `${Math.round(min / 60)} hours ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        });
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"
    >
      {done ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {done ? 'Copied' : label}
    </button>
  );
}

/** The exact CV, letter and answers kept with an application. */
function Documents({ r, app }: { r: Receipt; app: App }) {
  const [showLetter, setShowLetter] = useState(false);
  return (
    <div className="space-y-2.5">
      {r.cv && (
        <div className="rounded-2xl p-3.5 ring-1 ring-ink-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-2 text-[14px] font-bold text-ink-950">
              <FileText className="h-4 w-4 shrink-0 text-brand-700" /> <span className="truncate">{r.cv.name}</span>
            </p>
            <button type="button" onClick={() => downloadBytes(docxBytes(r.cv!.lines, r.cv!.name), `${r.cv!.name}.docx`)} className={BTN.small}>
              <Download className="h-3.5 w-3.5" /> Word file
            </button>
          </div>
          <p className="mt-1 text-[12.5px] leading-5 text-ink-600">
            {r.file?.kind === 'tailored' ? 'This Word version was attached to the application.' : 'MadeVisa attaches the CV file you uploaded, exactly as it is. This tailored Word version is kept for you, if you want to use it yourself.'}{' '}
            {r.file?.kind !== 'tailored' && (
              <button
                type="button"
                onClick={async () => {
                  const url = await cvDownloadUrl();
                  if (url) window.open(url, '_blank', 'noopener');
                }}
                className="font-semibold text-brand-700 hover:underline"
              >
                Download your original CV
              </button>
            )}
          </p>
          <p className="mt-1 text-[12.5px] font-semibold text-ink-700">{r.cv.changes.length ? 'Tailored for this role' : 'Your CV as it is — it already leads with what this ad asks for'}</p>
          {r.cv.changes.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px] leading-5 text-ink-600 marker:text-ink-300">
              {r.cv.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-[12px] text-ink-500">Every line is from your own CV. Nothing was added.</p>
        </div>
      )}

      <div className="rounded-2xl p-3.5 ring-1 ring-ink-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[14px] font-bold text-ink-950">Cover letter{r.letter ? '' : ': none'}</p>
          {r.letter && (
            <span className="flex gap-1.5">
              <CopyButton text={r.letter.content} />
              <button type="button" onClick={() => downloadBytes(docxBytes(letterLines(r.letter!.content), r.letter!.name), `Cover letter ${app.company}.docx`)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
                <Download className="h-3 w-3" /> Word
              </button>
            </span>
          )}
        </div>
        {r.letter ? (
          <>
            <p className={`mt-1.5 whitespace-pre-wrap text-[12.5px] leading-5 text-ink-700 ${showLetter ? '' : 'line-clamp-3'}`}>{r.letter.content}</p>
            <button type="button" onClick={() => setShowLetter(!showLetter)} className="mt-1 text-[12px] font-semibold text-brand-700 hover:underline">
              {showLetter ? 'Show less' : 'Read it all'}
            </button>
          </>
        ) : (
          <p className="mt-1 text-[12.5px] leading-5 text-ink-600">The ad doesn’t ask for one, and a letter that says nothing new doesn’t help. MadeVisa writes one when the ad asks, for senior roles and for your strongest matches.</p>
        )}
      </div>

      {r.answers.length > 0 && (
        <div className="rounded-2xl p-3.5 ring-1 ring-ink-200">
          <p className="text-[14px] font-bold text-ink-950">Your answers</p>
          <dl className="mt-1.5 divide-y divide-ink-100">
            {r.answers.map((a) => (
              <div key={a.label} className="flex items-start justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <dt className="text-[12px] text-ink-500">{a.label}</dt>
                  <dd className="break-words text-[13.5px] font-semibold text-ink-900 [overflow-wrap:anywhere]">{a.value}</dd>
                </div>
                <CopyButton text={a.value} />
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function Outcomes({ app, r, onChange }: { app: App; r: Receipt; onChange: (o: Receipt['outcomes']) => void }) {
  const has = (s: string) => r.outcomes.some((o) => o.stage === s);
  const [busy, setBusy] = useState<string | null>(null);
  const flip = async (s: Stage) => {
    setBusy(s);
    const next = await recordOutcome(app.id, s, !has(s));
    setBusy(null);
    if (next) onChange(next);
  };
  return (
    <div className="mt-4">
      <p className="text-[13px] font-bold text-ink-950">What happened next?</p>
      <p className="text-[12px] text-ink-500">Tap a stage when you reach it. It keeps your funnel honest.</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {STAGES.map((s) => (
          <button key={s} type="button" disabled={busy === s} aria-pressed={has(s)} onClick={() => flip(s)} className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 transition ${has(s) ? 'bg-ink-950 text-white ring-ink-950' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-400'}`}>
            {STAGE_LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** What one application is waiting on: answered here once, saved for next time, and MadeVisa carries on. */
function Answers({ app, cv, onDone }: { app: App; cv: StoredCv | null; onDone: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = app.needs.every((n) => values[n.id]?.trim());
  const input = (n: Needed) => {
    const v = values[n.id] ?? '';
    const set = (x: string) => setValues((s) => ({ ...s, [n.id]: x }));
    if ((n.options?.length ?? 0) > 6) {
      return (
        <select value={v} onChange={(e) => set(e.target.value)} aria-label={n.label} className={FIELD}>
          <option value="">Choose…</option>
          {n.options!.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    }
    if (n.options?.length || n.kind === 'yesno' || n.kind === 'checkbox') {
      const opts = n.options?.length ? n.options : ['Yes', 'No'];
      return (
        <div role="radiogroup" aria-label={n.label} className="flex flex-wrap gap-1.5">
          {opts.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={v === o} onClick={() => set(o)} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 ${v === o ? 'bg-ink-950 text-white ring-ink-950' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-400'}`}>
              {o}
            </button>
          ))}
        </div>
      );
    }
    return n.kind === 'long' ? <textarea value={v} onChange={(e) => set(e.target.value)} rows={4} maxLength={4000} aria-label={n.label} className={FIELD} /> : <input value={v} onChange={(e) => set(e.target.value)} maxLength={300} aria-label={n.label} className={FIELD} />;
  };
  const send = async () => {
    setBusy(true);
    setError(null);
    const r = await answerAttention(app, values, cv);
    setBusy(false);
    if (!r.ok) return setError(r.error ?? 'That didn’t save. Try again.');
    onDone();
  };
  return (
    <div className="mb-4 rounded-2xl p-4 ring-2 ring-brand-200">
      <p className="text-[12px] font-bold uppercase tracking-wide text-brand-700">Your input needed · {app.needs.length}</p>
      <ul className="mt-3 space-y-4">
        {app.needs.map((n) => (
          <li key={n.id}>
            <p className="mb-2 text-[14px] font-bold leading-snug text-ink-950">{n.label}</p>
            {input(n)}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-ink-500">Saved, so you’re asked once.</p>
      {error && <p className="mt-2 text-[13px] text-rose-700">{error}</p>}
      <button onClick={send} disabled={!ready || busy} className={`${BTN.primary} mt-3 w-full`}>
        {busy ? 'Saving…' : 'Save answer & let MadeVisa apply'}
      </button>
    </div>
  );
}

/** Finish it yourself: the employer's page, your answers to paste, your CV — then one tap to log it. */
function FinishYourself({ app, r, onDone, main }: { app: App; r: Receipt | null; onDone: () => void; main?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = async () => {
    setBusy(true);
    setError(null);
    const res = await markSent(app);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onDone();
  };
  const copy = async () => {
    const text = (r?.answers ?? []).map((a) => `${a.label}\n${a.value}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Couldn’t copy. Open “Show CV, cover letter and answers” below instead.');
    }
  };
  return (
    <div className="mt-2">
      {error && <p className="mb-2 text-[13px] text-rose-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {app.url && (
          <a href={app.url} target="_blank" rel="noopener noreferrer" className={main ? BTN.primary : BTN.secondary}>
            Open {app.company}’s page <ArrowUpRight className="h-4 w-4" />
          </a>
        )}
        {(r?.answers.length ?? 0) > 0 && (
          <button type="button" onClick={copy} className={BTN.secondary}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy my answers'}
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            const url = await cvDownloadUrl();
            if (url) window.open(url, '_blank', 'noopener');
          }}
          className={BTN.secondary}
        >
          <Download className="h-4 w-4" /> My CV
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={sent} disabled={busy} className={BTN.secondary}>
          <Check className="h-4 w-4" /> {busy ? 'Saving…' : 'Done, I applied'}
        </button>
        <button
          onClick={async () => {
            await skip(app);
            onDone();
          }}
          disabled={busy}
          className="rounded-full px-3 py-2 text-[13px] font-semibold text-ink-600 hover:bg-ink-50"
        >
          Skip this job
        </button>
      </div>
    </div>
  );
}

/** A privacy notice was the only thing missing: one tick, and MadeVisa submits it. */
function Consent({ app, cv, onDone }: { app: App; cv: StoredCv | null; onDone: () => void }) {
  const [yes, setYes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mb-4 rounded-2xl p-4 ring-2 ring-brand-200">
      <p className="mb-3 text-[12px] font-bold uppercase tracking-wide text-brand-700">Your input needed</p>
      <label className="flex cursor-pointer items-start gap-3 text-[14px] font-semibold leading-5 text-ink-950">
        <input type="checkbox" checked={yes} onChange={(e) => setYes(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
        <span>I agree to {app.company}’s privacy notice</span>
      </label>
      {error && <p className="mt-2 text-[13px] text-rose-700">{error}</p>}
      <button
        disabled={!yes || busy}
        onClick={async () => {
          setBusy(true);
          const r = await acceptConsent(app, cv);
          setBusy(false);
          if (!r.ok) return setError(r.error ?? 'That didn’t save. Try again.');
          onDone();
        }}
        className={`${BTN.primary} mt-3 w-full`}
      >
        {busy ? 'Starting…' : 'Submit it for me'}
      </button>
    </div>
  );
}

/** The employer's logo, or its initials. */
function Logo({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-200 bg-white">
      {src && !failed ? <img src={src} alt="" width={44} height={44} onError={() => setFailed(true)} className="h-full w-full object-contain p-1" /> : <CompanyLogo name={name} size={36} />}
    </span>
  );
}

/** Where one application is, step by step — and, while it waits, what it is waiting for. */
function Timeline({ app }: { app: App }) {
  const st = useApplyState();
  const steps = ['Queued', 'Employer’s form checked', 'CV and answers ready', 'Submitting on the employer’s site', 'Submitted'];
  const at = { queued: 0, analyzing: 1, preparing: 2, ready: 3, submitting: 3, submitted: 4 }[app.status as string] ?? -1;
  if (at < 0) return null;
  const q = st.queue && st.queue.id === app.queueId ? st.queue : null;
  const online = Boolean(st.status?.worker?.online);
  const wait =
    app.status === 'submitted'
      ? null
      : q?.state === 'paused' && q.reason === 'allowance'
        ? 'Waiting: this month’s applications are used. It goes as soon as there are more.'
        : q?.state === 'paused'
          ? 'Paused. Press Continue to carry on.'
          : app.status === 'ready' && !online
            ? 'Ready to send.'
            : app.status === 'ready' && (st.status?.worker?.waitMinutes ?? 0) > 0
              ? `Ready. MadeVisa submits it within ${st.status!.worker!.waitMinutes} minutes.`
              : app.status === 'submitting'
                ? { opening: 'Opening the employer’s careers page…', uploading: 'Attaching your CV…', filling: 'Filling in the form…', submitting: 'Pressing Submit and waiting for the employer’s confirmation…' }[app.progress ?? 'opening'] ?? 'Submitting…'
                : app.status === 'queued'
                  ? 'Waiting its turn in this batch.'
                  : 'Being prepared…';
  return (
    <div className="mb-4 rounded-2xl bg-ink-50 p-4">
      <ol className="space-y-2">
        {steps.map((label, i) => {
          const state = i < at || (i === at && app.status === 'submitted') ? 'done' : i === at ? 'now' : 'todo';
          return (
            <li key={label} className={`flex items-center gap-2.5 text-[13.5px] ${state === 'todo' ? 'text-ink-400' : state === 'now' ? 'font-semibold text-ink-950' : 'text-ink-700'}`}>
              {state === 'done' ? (
                <Check className="h-4 w-4 text-emerald-600" strokeWidth={3} />
              ) : state === 'now' ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600 motion-reduce:animate-none" aria-hidden />
              ) : (
                <span className="h-4 w-4 rounded-full border-2 border-ink-200" aria-hidden />
              )}
              {label}
            </li>
          );
        })}
      </ol>
      {app.status === 'ready' && st.sending && (!st.sending.ids || st.sending.ids.includes(app.id)) ? (
        <SendingBar className="mt-3" />
      ) : (
        wait && <p className="mt-3 text-[13px] leading-5 text-ink-600">{wait}</p>
      )}
      {app.status === 'ready' && !st.sending && (
        <button type="button" onClick={() => void sendNow([app.id])} className={`${BTN.primary} mt-3 w-full`}>
          <Zap className="h-4 w-4" /> Apply now
        </button>
      )}
    </div>
  );
}

/** Which "needs attention" reasons another try can fix. */
/** One short line: what stopped it. */
function headline(app: App): string {
  switch (app.reasonCode) {
    case 'handover':
      return 'Prepared, not sent yet.';
    case 'login_required':
      return `${app.company}’s site needs your own login.`;
    case 'captcha':
      return `${app.company}’s site showed a “prove you’re human” check.`;
    case 'closed':
      return 'This job has closed.';
    case 'no_form':
      return 'No online form MadeVisa can reach.';
    case 'unconfirmed':
      return `Sent, but ${app.company} didn’t confirm it.`;
    default:
      return app.reason ?? 'MadeVisa couldn’t finish this one by itself.';
  }
}

/** The quickest way through, when there is one. */
function tip(app: App): string | null {
  switch (app.reasonCode) {
    case 'login_required':
      return 'Quickest: sign in there with Google or LinkedIn, attach your CV, paste your answers. About 3 minutes.';
    case 'captcha':
      return 'Try again — it often passes the second time. Or do it yourself in 2 minutes.';
    case 'unconfirmed':
      return `Check ${app.emailUsed ?? 'your inbox'} for their email before trying again.`;
    case 'no_form':
      return 'Their page may ask you to email your CV.';
    default:
      return null;
  }
}

const RETRYABLE = new Set(['captcha', 'fill_failed', 'form_refused', 'handover', 'dry_run', 'no_submit', 'unreachable', 'error', 'retries', 'timeout', 'worker_error', 'mail_not_set_up', 'channel_off', 'unconfirmed', 'prepare']);

type Props = { app: App; cv: StoredCv | null; logo?: string | null; onClose: () => void };

/**
 * One application, opened: what it is waiting on, or — once submitted — the
 * receipt of exactly what was sent, with which email, and the employer's confirmation.
 */
export function ApplicationReceipt({ app, cv, logo = null, onClose }: Props) {
  const [r, setR] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState(false);
  useEffect(() => {
    let alive = true;
    setR(null);
    void fetchReceipt(app.id).then((x) => alive && setR(x));
    return () => {
      alive = false;
    };
  }, [app.id, app.status]);

  const open = async (path: string) => {
    const url = await fileLink(path);
    if (url) window.open(url, '_blank', 'noopener');
  };
  const attention = app.status === 'needs_attention' || app.status === 'blocked' || app.status === 'failed';
  const asking = app.status === 'needs_attention' && app.needs.length > 0 && !(isConsentStop(app.reason) && app.needs.every((n) => n.key === 'consent' || /privacy/i.test(n.label)));
  const consent = app.status === 'needs_attention' && isConsentStop(app.reason) && app.needs.every((n) => n.key === 'consent' || /privacy/i.test(n.label));
  const title =
    app.status === 'submitted'
      ? `${app.company}: application submitted`
      : attention
        ? `Review your ${app.company} application`
        : ['queued', 'analyzing', 'preparing', 'ready', 'submitting'].includes(app.status)
          ? `${app.company}: application in progress`
          : `Your ${app.company} application`;

  return (
    <Sheet
      id="apply-receipt"
      title={title}
      onClose={onClose}
      wide
      sub={
        <span className="mt-1 flex items-center gap-3">
          <Logo src={logo} name={app.company} />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink-900">{app.title}</span>
            <span className="block text-[12.5px] tabular-nums text-ink-500">{app.score}% match</span>
          </span>
        </span>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <ApplicationStatus app={app} />
        <VerifiedBadge app={app} />
        {app.status === 'submitted' && <span className="text-[12.5px] text-ink-500">Submitted {ago(app.submittedAt)}</span>}
      </div>

      <Timeline app={app} />

      {attention && consent && <Consent app={app} cv={cv} onDone={onClose} />}
      {attention && !consent && !asking && (
        <div className="mb-4 rounded-2xl bg-amber-50 p-3.5 ring-1 ring-amber-200">
          <p className="flex items-start gap-2 text-[13.5px] font-semibold leading-5 text-amber-950">
            {app.status === 'blocked' ? <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
            <span>{headline(app)}</span>
          </p>
          {tip(app) && <p className="mt-1 pl-6 text-[12.5px] leading-5 text-amber-900">{tip(app)}</p>}
          {app.status !== 'blocked' && app.needs.length === 0 && RETRYABLE.has(app.reasonCode ?? '') && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await retry(app);
                setBusy(false);
                onClose();
              }}
              className={`${BTN.primary} mt-3`}
            >
              {busy ? 'Starting…' : app.reasonCode === 'handover' ? 'Let MadeVisa submit it' : 'Let MadeVisa try again'}
            </button>
          )}
        </div>
      )}
      {asking && <Answers app={app} cv={cv} onDone={onClose} />}
      {attention && (
        <div className="mb-4">
          {(consent || app.needs.length > 0 || RETRYABLE.has(app.reasonCode ?? '')) && <p className="text-[12.5px] font-semibold text-ink-500">Or apply yourself</p>}
          <FinishYourself app={app} r={r} onDone={onClose} main={app.status === 'blocked' && !consent} />
        </div>
      )}

      {app.status === 'submitted' && (
        <dl className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              ['Submitted using', app.emailUsed ?? '—'],
              ['When', app.submittedAt ? new Date(app.submittedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'],
              ['How', app.verified ? (app.confirmation?.kind === 'email' ? 'Emailed by MadeVisa to the employer' : 'Submitted by MadeVisa on the employer’s careers site') : 'Submitted by you on the employer’s site'],
              ['Confirmation', app.confirmation?.kind === 'self' ? 'Your word' : app.confirmation?.id && app.confirmation.id !== app.id ? app.confirmation.id : 'Employer’s confirmation page'],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-ink-50 p-3">
              <dt className="text-[11.5px] text-ink-500">{k}</dt>
              <dd className="mt-0.5 break-words text-[13px] font-bold leading-snug text-ink-950 [overflow-wrap:anywhere]">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {app.status === 'submitted' && app.evidence && (
        <div className="mb-4 rounded-2xl p-3.5 ring-1 ring-emerald-200">
          <p className="text-[13px] font-bold text-emerald-900">What the employer’s site said</p>
          {app.evidence.text && <p className="mt-1 text-[13px] italic leading-5 text-ink-700">“{app.evidence.text}”</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {app.evidence.screenshot && (
              <button type="button" onClick={() => void open(app.evidence!.screenshot!)} className={BTN.small}>
                <ImageIcon className="h-3.5 w-3.5" /> Screenshot
              </button>
            )}
            {app.url && (
              <a href={app.url} target="_blank" rel="noopener noreferrer" className={BTN.small}>
                Job page <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      )}
      {app.status === 'submitted' && r?.file && (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
          {r.file.kind === 'tailored' ? 'CV sent: the tailored Word version' : 'CV sent: your own uploaded file'}
          {r.file.sha256 ? <span className="font-mono">· {r.file.sha256.slice(0, 12)}</span> : null}
          <button type="button" onClick={() => void open(r.file!.path)} className={BTN.link}>
            Download it
          </button>
        </p>
      )}

      {['skipped', 'already_applied', 'expired'].includes(app.status) && app.reason && <p className="mb-4 rounded-2xl bg-ink-50 p-3.5 text-[13px] leading-5 text-ink-700">{app.reason}</p>}

      {r && (r.cv || r.letter || r.answers.length > 0) && (
        <div className="mt-2">
          <button type="button" onClick={() => setDetails(!details)} aria-expanded={details} className={BTN.link}>
            {details ? 'Hide details' : 'Show CV, cover letter and answers'}
          </button>
          {details && (
            <div className="mt-3">
              <Documents r={r} app={app} />
            </div>
          )}
        </div>
      )}
      {app.status === 'submitted' && r && <Outcomes app={app} r={r} onChange={(o) => setR({ ...r, outcomes: o })} />}
    </Sheet>
  );
}
