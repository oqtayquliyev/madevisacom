import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Copy, Download, FileText, HelpCircle } from 'lucide-react';
import { SPONSOR_LABEL } from '@/lib/apply/decision';
import { docxBytes, downloadBytes, letterLines } from '@/lib/apply/docx';
import { STAGES, STAGE_LABEL, answer, fetchReceipt, markSent, recordOutcome, retry, skip, type App, type Receipt, type Stage } from '@/lib/apply/store';
import type { StoredCv } from '@/lib/cv/store';
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
          <p className="mt-1 text-[12.5px] font-semibold text-ink-700">{r.cv.changes.length ? 'CV tailored for this role' : 'Your CV as it is — it already leads with what this ad asks for'}</p>
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

/** Questions only the person can answer. Saved for next time, unless they say otherwise. */
function Answers({ app, cv, onDone }: { app: App; cv: StoredCv | null; onDone: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [keep, setKeep] = useState<Record<string, 'save' | 'ask' | 'once'>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = app.needs.every((n) => values[n.id]?.trim());
  const input = (n: Needed) => {
    const v = values[n.id] ?? '';
    const set = (x: string) => setValues((s) => ({ ...s, [n.id]: x }));
    if (n.options?.length || n.kind === 'yesno') {
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
    // Asked up front for every job abroad: a plain yes or no.
    if (n.key === 'sponsorship' || n.key === 'relocation' || n.key === 'work_authorization') {
      return (
        <div role="radiogroup" aria-label={n.label} className="flex gap-1.5">
          {['Yes', 'No'].map((o) => (
            <button key={o} type="button" role="radio" aria-checked={v === o} onClick={() => set(o)} className={`rounded-full px-4 py-1.5 text-[13px] font-bold ring-1 ${v === o ? 'bg-ink-950 text-white ring-ink-950' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-400'}`}>
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
    const r = await answer(app, app.needs.map((n) => ({ need: n, value: values[n.id] ?? '', keep: keep[n.id] ?? 'save' })), cv);
    setBusy(false);
    if (!r.ok) return setError(r.error ?? 'That didn’t save. Try again.');
    onDone();
  };
  return (
    <div>
      <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3.5 text-[13px] leading-5 text-amber-950 ring-1 ring-amber-200">
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        {app.reason ?? 'The employer asked a question that MadeVisa cannot safely answer automatically.'}
      </p>
      <ul className="mt-4 space-y-4">
        {app.needs.map((n) => (
          <li key={n.id}>
            <p className="text-[14px] font-bold leading-snug text-ink-950">{n.label}</p>
            <p className="mb-2 text-[12px] text-ink-500">{n.why}</p>
            {input(n)}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-600" role="radiogroup" aria-label="Next time">
              {(
                [
                  ['save', 'Use this answer next time'],
                  ['ask', 'Ask me each time'],
                  ['once', 'Just for this application'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="radio" name={`keep-${n.id}`} checked={(keep[n.id] ?? 'save') === k} onChange={() => setKeep((s) => ({ ...s, [n.id]: k }))} className="h-3.5 w-3.5 border-ink-300 text-brand-600 focus:ring-brand-200" />
                  {label}
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="mt-3 text-[13px] text-rose-700">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={send} disabled={!ready || busy} className={`${BTN.primary} flex-1`}>
          {busy ? 'Saving…' : 'Continue applications'}
        </button>
        <button
          onClick={async () => {
            await skip(app);
            onDone();
          }}
          disabled={busy}
          className={BTN.secondary}
        >
          Skip this job
        </button>
      </div>
    </div>
  );
}

type Props = { app: App; cv: StoredCv | null; onClose: () => void; onNext?: () => void };

/**
 * One application, opened: answer what is asked, send what is ready, or —
 * once it has gone — the receipt of exactly what was submitted.
 */
export function ApplicationReceipt({ app, cv, onClose, onNext }: Props) {
  const [r, setR] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setR(null);
    setOpened(false);
    setError(null);
    void fetchReceipt(app.id).then((x) => alive && setR(x));
    return () => {
      alive = false;
    };
  }, [app.id, app.status]);

  const title = app.status === 'submitted' ? 'Application submitted' : app.status === 'needs_answer' ? 'Answer question' : app.status === 'review_required' ? 'Ready to send' : app.status === 'failed' ? 'Application needs your attention' : 'Your application';
  const sent = async () => {
    setBusy(true);
    setError(null);
    const res = await markSent(app);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    if (onNext) onNext();
  };

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

      {app.status === 'needs_answer' && <Answers app={app} cv={cv} onDone={onClose} />}

      {app.status === 'failed' && (
        <div className="mb-4 rounded-2xl bg-rose-50 p-3.5 ring-1 ring-rose-200">
          <p className="text-[13.5px] font-bold text-rose-950">Could not submit</p>
          <p className="mt-0.5 text-[13px] leading-5 text-rose-900">{app.reason ?? 'Something went wrong while sending.'} Nothing was counted against your month.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={async () => {
                await retry(app, cv);
                onClose();
              }}
              className={BTN.small}
            >
              Try again
            </button>
            <button
              onClick={async () => {
                await skip(app);
                onClose();
              }}
              className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink-600 hover:bg-white"
            >
              Skip this job
            </button>
          </div>
        </div>
      )}

      {app.status === 'review_required' && (
        <div className="mb-4 rounded-2xl bg-brand-50/60 p-3.5 ring-1 ring-brand-200">
          <p className="text-[13px] leading-5 text-ink-800">{app.reason}</p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[13px] leading-5 text-ink-800 marker:font-bold marker:text-brand-700">
            <li>Download the CV below.</li>
            <li>Open the form and attach it. Your letter and answers are below, ready to copy.</li>
            <li>Come back and say it’s sent, so MadeVisa can track it.</li>
          </ol>
          {error && <p className="mt-2 text-[13px] text-rose-700">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {app.url && (
              <a href={app.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)} className={BTN.primary}>
                Open the application form <ArrowUpRight className="h-4 w-4" />
              </a>
            )}
            <button onClick={sent} disabled={busy} className={opened || !app.url ? BTN.primary : BTN.secondary}>
              <Check className="h-4 w-4" /> {busy ? 'Saving…' : 'I’ve sent it'}
            </button>
            <button
              onClick={async () => {
                await skip(app);
                if (onNext) onNext();
                else onClose();
              }}
              disabled={busy}
              className="rounded-full px-3 py-2 text-[13px] font-semibold text-ink-600 hover:bg-white"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {app.status === 'submitted' && (
        <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ['CV', app.cvName ?? r?.cv?.name ?? 'Your CV'],
              ['Cover letter', app.coverLetter ? 'Tailored' : 'None'],
              ['Sponsorship', app.sponsorship === 'unclear' ? 'Information unavailable' : SPONSOR_LABEL[app.sponsorship]],
              ['Sent', app.verified ? 'By MadeVisa' : 'By you, on the employer’s site'],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-ink-50 p-3">
              <dt className="text-[11.5px] text-ink-500">{k}</dt>
              <dd className="mt-0.5 break-words text-[13px] font-bold leading-snug text-ink-950 [overflow-wrap:anywhere]">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {app.status === 'submitted' && app.verified && app.confirmation?.id && (
        <p className="mb-4 text-[12px] text-ink-500">
          Delivery confirmation: <span className="font-mono text-ink-700">{app.confirmation.id}</span>
        </p>
      )}

      {['skipped', 'already_applied', 'expired'].includes(app.status) && app.reason && <p className="mb-4 rounded-2xl bg-ink-50 p-3.5 text-[13px] leading-5 text-ink-700">{app.reason}</p>}

      {app.status !== 'needs_answer' && (r ? (r.cv || r.letter || r.answers.length > 0) && <Documents r={r} app={app} /> : <p className="py-6 text-center text-[13px] text-ink-500">Loading what was prepared…</p>)}
      {app.status === 'submitted' && r && <Outcomes app={app} r={r} onChange={(o) => setR({ ...r, outcomes: o })} />}
    </Sheet>
  );
}
