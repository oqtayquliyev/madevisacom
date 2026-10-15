import { useEffect, useState } from 'react';
import { Check, ChevronDown, Loader2, Lock, ScanSearch, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { nav } from '@/lib/pageLayout';
import { FREE_DAILY_CHECKS } from '@/lib/pricing';
import { rememberAuthIntent } from '@/lib/authIntent';
import type { JobMatch } from '@/lib/cv/checks';
import type { Part } from '@/lib/cv/match';
import { CvReplaceButton, CvUpload } from '@/components/cv/CvUpload';
import { MatchLabel, MatchRing, PartBar, ProPrice, Row, toneFor } from '@/components/cv/MatchBits';
import { SponsorDocRow } from '@/components/cv/SponsorDocRow';
import { UpgradePrompt } from '@/components/pro/UpgradePrompt';
import { useMyPlan } from '@/lib/plans';
import { noteMilestone } from '@/lib/emailAttribution';
import { checkoutHref, trackBilling } from '@/lib/billing';

type Props = {
  match: JobMatch;
  jobTitle: string;
  company: string;
  /** Sponsorship document for this job: shown as part of the application when it applies. */
  doc?: { jobId: string; country?: string | null; visaOffered: boolean } | null;
  closed?: boolean;
  onAuth?: (p: 'login' | 'register') => void;
};

/**
 * "How well does your CV match this job?" — on every job page.
 *   Score, missing skills and the full report: Starter and Pro.
 *   Full report: Starter and Pro.
 * Below it, the application as a checklist — where the sponsorship
 * document shows up as the missing piece.
 */
export function MatchPanel({ match, jobTitle, company, doc, closed = false, onAuth }: Props) {
  const { session } = useAuth();
  const { plan, isPaid, loading: planLoading } = useMyPlan();
  const { cv, result, busy, unlocked, full, quota } = match;
  const [open, setOpen] = useState<string | null>(null);
  // A paying member seeing the full report has used the plan (refund terms). The server only counts paying members.
  useEffect(() => {
    if (isPaid && cv && result) noteMilestone('paid_feature_used');
  }, [isPaid, cv, result]);

  const signUp = () => {
    rememberAuthIntent({ reason: 'match', next: `${window.location.pathname}${window.location.search}#cv-match` });
    onAuth?.('register');
  };

  // ---- no CV yet ----
  if (!cv) {
    return (
      <section id="cv-match" aria-labelledby="cv-match-title" className="scroll-mt-24 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)] md:items-center">
          <div>
            <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-brand-700">
              <ScanSearch className="h-4 w-4" /> CV match
            </p>
            <h2 id="cv-match-title" className="mt-1.5 text-[22px] font-bold leading-tight tracking-tight text-ink-950">
              How well does your CV match this job?
            </h2>
            <p className="mt-1.5 text-[14px] leading-6 text-ink-600">
              Upload your CV once. On every job you get a match score, the skills the ad asks for that your CV doesn’t show, and what to change before you apply.
            </p>
            <p className="mt-2 text-[12px] text-ink-500">Part of Starter and Pro. Your CV is read on your device, and goes to an employer only when you ask.</p>
          </div>
          <CvUpload />
        </div>
      </section>
    );
  }

  // ---- CV match is part of Starter and Pro ----
  if (!isPaid && !planLoading) {
    return (
      <section id="cv-match" aria-labelledby="cv-match-title" className="scroll-mt-24 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span aria-hidden className="pointer-events-none select-none blur-[4px]">
            <MatchRing score={82} size={72} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="cv-match-title" className="flex items-center gap-2 text-[18px] font-bold leading-tight text-ink-950">
              <Lock className="h-4 w-4 text-brand-700" /> Your match with this job
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-ink-600">
              CV match is part of Starter and Pro: your score, the skills {company} asks for that {cv.name} doesn’t show, and what to change before you apply.
            </p>
          </div>
          <button
            onClick={() => {
              trackBilling('feature_limit_reached', { feature: 'cv_match' });
              nav(checkoutHref('starter', 'job_match_locked'));
            }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-[15px] font-bold text-white shadow-sm hover:bg-brand-700"
          >
            <Sparkles className="h-4 w-4" /> Unlock with Starter
          </button>
        </div>
        {doc && (
          <div className="mt-4">
            <SponsorDocRow jobId={doc.jobId} company={company} country={doc.country} visaOffered={doc.visaOffered} onAuth={onAuth} />
          </div>
        )}
      </section>
    );
  }

  // ---- CV, not checked for this job ----
  if (!result) {
    return (
      <section id="cv-match" aria-labelledby="cv-match-title" className="scroll-mt-24 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <MatchRing score={null} size={72} pending={busy} />
          <div className="min-w-0 flex-1">
            <h2 id="cv-match-title" className="text-[18px] font-bold leading-tight text-ink-950">
              {busy ? 'Reading the ad against your CV…' : 'How well does your CV match this job?'}
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-ink-600">
              {busy ? 'Skills, role, years, languages and education.' : `Compare ${cv.name} with what ${company} asks for.`}
            </p>
          </div>
          <button
            onClick={() => void match.check()}
            disabled={busy || closed}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-[15px] font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />} Check my match
          </button>
        </div>
      </section>
    );
  }

  // ---- result ----
  const tone = toneFor(result.score);
  const missing = result.skills.missing;
  const must = missing.filter((m) => (m.kind ?? (m.required ? 'skill' : 'nice')) === 'skill');
  const wantedExp = missing.filter((m) => m.kind === 'experience');
  const niceToHave = missing.filter((m) => (m.kind ?? (m.required ? 'skill' : 'nice')) === 'nice');
  const canUnlock = Boolean(session) && !unlocked && (quota?.left ?? 1) > 0;

  return (
    <section id="cv-match" aria-labelledby="cv-match-title" className="scroll-mt-24 overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[200px_minmax(0,1fr)]">
        {/* The score — free for everyone */}
        <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-3">
          <MatchRing score={result.score} size={120} />
          <div className="min-w-0">
            <MatchLabel result={result} />
            <h2 id="cv-match-title" className="mt-1.5 text-[15px] font-bold leading-snug text-ink-950">
              Your CV vs. this job
            </h2>
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-ink-500">{jobTitle}</p>
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          {result.capReason && <p className={`rounded-lg px-3 py-2 text-[13px] font-medium leading-5 ${tone.bg} ${tone.text}`}>{result.capReason}</p>}

          {/* Skills: Starter and Pro */}
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[15px] font-bold text-ink-950">Skills</h3>
              {result.skills.asked > 0 && (
                <p className="text-[13px] text-ink-600">
                  <strong className="text-ink-950">
                    {result.skills.covered} of {result.skills.asked}
                  </strong>{' '}
                  the ad names are covered
                </p>
              )}
            </div>

            {result.skills.asked === 0 ? (
              <p className="mt-1.5 text-[13px] leading-5 text-ink-600">This ad doesn’t name specific skills, so the score leans on the role and the ad’s wording.</p>
            ) : missing.length === 0 ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
                <Check className="h-4 w-4" /> Your CV shows every skill this ad names.
              </p>
            ) : unlocked ? (
              <>
                {(
                  [
                    ['Missing skills', must, 'bg-amber-100 text-amber-900'],
                    ['Experience the ad also wants', wantedExp, 'bg-sky-50 text-sky-900 ring-1 ring-sky-200'],
                    ['Nice to have', niceToHave, 'bg-ink-100 text-ink-700'],
                  ] as [string, typeof missing, string][]
                )
                  .filter(([, list]) => list.length > 0)
                  .map(([label, list, cls]) => (
                    <div key={label} className="mt-2.5">
                      <p className="text-[12px] font-semibold text-ink-500">{label}</p>
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {list.map((m) => (
                          <li key={m.name} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${cls}`}>
                            {label === 'Missing skills' ? <X className="h-3 w-3" strokeWidth={3} /> : null}
                            {m.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                {!full && quota && (
                  <p className="mt-2 text-[12px] text-ink-500">
                    {quota.left > 0 ? `${quota.left} of ${FREE_DAILY_CHECKS} free skill checks left today.` : `That was today’s last free skill check. ${FREE_DAILY_CHECKS} more tomorrow.`}
                  </p>
                )}
              </>
            ) : (
              <div className="relative mt-2 overflow-hidden rounded-xl bg-ink-50 p-4">
                {/* Placeholders only — the real names aren't in the page until unlocked. */}
                <div className="flex flex-wrap gap-1.5 blur-[5px]" aria-hidden>
                  {missing.slice(0, 7).map((_, i) => (
                    <span key={i} className="h-7 rounded-full bg-amber-200" style={{ width: 64 + ((i * 37) % 60) }} />
                  ))}
                </div>
                <div className="relative mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[13.5px] font-semibold leading-5 text-ink-900">
                    {missing.length} skill{missing.length === 1 ? '' : 's'} the ad asks for {missing.length === 1 ? 'is' : 'are'} missing from your CV
                    {must.length > 0 && must.length < missing.length ? ` — ${must.length} required` : ''}.
                    <span className="block text-[12.5px] font-normal text-ink-600">
                      {!session
                        ? `Create a free account to see which — free on ${FREE_DAILY_CHECKS} jobs every day.`
                        : canUnlock
                          ? `${quota ? quota.left : FREE_DAILY_CHECKS} of ${FREE_DAILY_CHECKS} free skill checks left today.`
                          : `You’ve used today’s ${FREE_DAILY_CHECKS} free skill checks. See these tomorrow, or now with Starter.`}
                    </span>
                  </p>
                  {!session ? (
                    <button onClick={signUp} className="shrink-0 rounded-lg bg-brand-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-brand-700">
                      Create free account
                    </button>
                  ) : canUnlock ? (
                    <button onClick={() => void match.check()} disabled={busy} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-brand-700 disabled:opacity-60">
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />} Show missing skills
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        trackBilling('feature_limit_reached', { feature: 'cv_missing_skills' });
                        nav(checkoutHref('starter', 'cv_daily_limit'));
                      }}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-brand-700"
                    >
                      <Sparkles className="h-4 w-4" /> Every job with Starter
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* The full report — Starter and Pro */}
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[15px] font-bold text-ink-950">Where your {result.score}% comes from</h3>
              {full && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{plan === 'pro' ? 'Pro' : 'Starter'}</span>}
            </div>
            {full ? (
              <>
                <FullReport parts={result.parts} open={open} setOpen={setOpen} fixes={result.fixes} health={result.health} />
                {plan === 'starter' && <UpgradePrompt id="match_auto_apply" plan="pro" source="cv_match" className="mt-4" />}
              </>
            ) : (
              <div className="mt-2.5 rounded-xl border border-ink-200 p-4">
                <div className="space-y-2.5">
                  {result.parts.map((p) => (
                    <PartBar key={p.key} name={p.name} score={null} weight={p.weight} locked />
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-3 border-t border-ink-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[13.5px] font-semibold leading-5 text-ink-900">
                    See each part of your score and what to change in your CV for this job.
                    <span className="block text-[12.5px] font-normal text-ink-600">
                      Full report on every job, no daily limit, plus 20 sponsorship documents a month. <ProPrice />.
                    </span>
                  </p>
                  <button onClick={() => nav(checkoutHref('starter', 'cv_full_report'))} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-ink-950 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-ink-800">
                    <Lock className="h-3.5 w-3.5" /> Get the full report
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Your application */}
      <div className="border-t border-ink-200 bg-ink-50/60 px-5 py-3 sm:px-6">
        <p className="pt-1 text-[12px] font-bold uppercase tracking-wide text-ink-500">Your application to {company}</p>
        <div className="divide-y divide-ink-200/70">
          <Row
            ok
            title="CV"
            status={`${result.score}% match`}
            text={`${cv.name} · ${cv.profile.words} words. You send your own file on ${company}’s site; MadeVisa never passes it on.`}
            action={<CvReplaceButton />}
          />
          {doc && <SponsorDocRow jobId={doc.jobId} company={company} country={doc.country} visaOffered={doc.visaOffered} onAuth={onAuth} />}
        </div>
      </div>
    </section>
  );
}

function FullReport({ parts, open, setOpen, fixes, health }: { parts: Part[]; open: string | null; setOpen: (k: string | null) => void; fixes: string[]; health: { ok: boolean; text: string }[] }) {
  return (
    <div className="mt-2.5 space-y-4">
      <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
        {parts.map((p) => {
          const isOpen = open === p.key;
          return (
            <li key={p.key}>
              <button onClick={() => setOpen(isOpen ? null : p.key)} aria-expanded={isOpen} className="flex w-full items-center gap-2 px-3.5 py-3 text-left hover:bg-ink-50">
                <span className="min-w-0 flex-1">
                  <PartBar name={p.name} score={p.score} weight={p.weight} />
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="px-3.5 pb-3.5">
                  <p className="text-[13px] leading-5 text-ink-700">{p.summary}</p>
                  <ul className="mt-1.5 space-y-1">
                    {p.findings.map((f) => (
                      <li key={f.text} className="flex gap-2 text-[13px] leading-5 text-ink-600">
                        {f.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                        {f.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {fixes.length > 0 && (
        <div>
          <h4 className="text-[14px] font-bold text-ink-950">What to change before you apply</h4>
          <ol className="mt-2 space-y-2">
            {fixes.map((f, i) => (
              <li key={f} className="flex gap-3 text-[13.5px] leading-5 text-ink-700">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-600 text-[11px] font-bold tabular-nums text-white">{i + 1}</span>
                {f}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[12px] text-ink-500">Only add what is true. Employers check, and a visa application repeats what your CV says.</p>
        </div>
      )}

      <div>
        <h4 className="text-[14px] font-bold text-ink-950">Your CV itself</h4>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {health.map((h) => (
            <li key={h.text} className="flex gap-2 text-[13px] leading-5 text-ink-600">
              {h.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
              {h.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
