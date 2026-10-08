import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Copy, Download, FileText, HelpCircle, Image as ImageIcon, Lock } from 'lucide-react';
import { docxBytes, downloadBytes, letterLines } from '@/lib/apply/docx';
import { STAGES, STAGE_LABEL, answerAttention, fetchReceipt, fileLink, markSent, recordOutcome, retry, skip, type App, type Receipt, type Stage } from '@/lib/apply/store';
import { cvDownloadUrl, type StoredCv } from '@/lib/cv/store';
import type { Needed } from '@/lib/apply/types';
import { ApplicationStatus, VerifiedBadge } from '@/components/apply/ApplicationStatus';
import { Sheet } from '@/components/apply/Sheet';
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
    <div className="mb-4">
      <ul className="space-y-4">
        {app.needs.map((n) => (
          <li key={n.id}>
            <p className="text-[14px] font-bold leading-snug text-ink-950">{n.label}</p>
            <p className="mb-2 text-[12px] text-ink-500">{n.why}</p>
            {input(n)}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-ink-500">Saved to your application profile, so MadeVisa won’t ask again.</p>
      {error && <p className="mt-2 text-[13px] text-rose-700">{error}</p>}
      <button onClick={send} disabled={!ready || busy} className={`${BTN.primary} mt-3 w-full`}>
        {busy ? 'Saving…' : 'Save answer & let MadeVisa apply'}
      </button>
    </div>
  );
}

/** Finish it yourself: the employer's page, and everything prepared for it. */
function FinishYourself({ app, onDone }: { app: App; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = async () => {
    setBusy(true);
    setError(null);
    const res = await markSent(app);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onDone();
  };
  return (
    <div className="mt-3">
      {error && <p className="mb-2 text-[13px] text-rose-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {app.url && (
          <a href={app.url} target="_blank" rel="noopener noreferrer" className={BTN.secondary}>
            Open the employer’s page <ArrowUpRight className="h-4 w-4" />
          </a>
        )}
        <button onClick={sent} disabled={busy} className={BTN.secondary}>
          <Check className="h-4 w-4" /> {busy ? 'Saving…' : 'I submitted it myself'}
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

/** Which "needs attention" reasons another try can fix. */
const RETRYABLE = new Set(['captcha', 'fill_failed', 'form_refused', 'handover', 'dry_run', 'no_submit', 'unreachable', 'error', 'retries', 'timeout', 'worker_error', 'mail_not_set_up', 'channel_off', 'unconfirmed', 'prepare']);

type Props = { app: App; cv: StoredCv | null; onClose: () => void };

/**
 * One application, opened: what it is waiting on, or — once submitted — the
 * receipt of exactly what was sent, with which email, and the employer's confirmation.
 */
export function ApplicationReceipt({ app, cv, onClose }: Props) {
  const [r, setR] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
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
  const title = app.status === 'submitted' ? 'Application submitted' : attention ? 'Review application' : app.status === 'ready' || app.status === 'submitting' ? 'MadeVisa is on it' : 'Your application';

  return (
    <Sheet
      id="apply-receipt"
      title={title}
      onClose={onClose}
      wide
      sub={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-ink-900">{app.title}</span>
          <span>{app.company}</span>
          <span className="tabular-nums">{app.score}% match</span>
        </span>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <ApplicationStatus app={app} />
        <VerifiedBadge app={app} />
        {app.status === 'submitted' && <span className="text-[12.5px] text-ink-500">Submitted {ago(app.submittedAt)}</span>}
      </div>

      {attention && (
        <div className="mb-4 rounded-2xl bg-amber-50 p-3.5 ring-1 ring-amber-200">
          <p className="flex items-start gap-2 text-[13.5px] leading-5 text-amber-950">
            {app.status === 'blocked' ? <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
            <span>{app.reason ?? 'MadeVisa couldn’t finish this application by itself.'}</span>
          </p>
          {app.reasonCode === 'unconfirmed' && <p className="mt-1.5 text-[12.5px] leading-5 text-amber-900">Check {app.emailUsed ?? 'your inbox'} for a confirmation from {app.company} before trying again.</p>}
          {app.status !== 'blocked' && app.needs.length === 0 && RETRYABLE.has(app.reasonCode ?? '') && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await retry(app);
                setBusy(false);
                onClose();
              }}
              className={`${BTN.small} mt-3`}
            >
              {busy ? 'Starting…' : 'Let MadeVisa try again'}
            </button>
          )}
        </div>
      )}
      {app.status === 'needs_attention' && app.needs.length > 0 && <Answers app={app} cv={cv} onDone={onClose} />}
      {attention && (
        <div className="mb-4">
          <p className="text-[13px] font-semibold text-ink-800">{app.needs.length > 0 ? 'Or finish it yourself' : 'Finish it yourself'} — everything below is prepared for it.</p>
          <FinishYourself app={app} onDone={onClose} />
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

      {r ? (r.cv || r.letter || r.answers.length > 0) && <Documents r={r} app={app} /> : <p className="py-6 text-center text-[13px] text-ink-500">Loading what was prepared…</p>}
      {app.status === 'submitted' && r && <Outcomes app={app} r={r} onChange={(o) => setR({ ...r, outcomes: o })} />}
    </Sheet>
  );
}
