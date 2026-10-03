import { useEffect, useState } from 'react';
import { ScanSearch, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { fetchMyBriefForJob } from '@/lib/briefs';
import type { JobMatch } from '@/lib/cv/checks';
import { Row, SponsorDocRow } from '@/components/cv/MatchBits';

// ---------------------------------------------------------------------------
// "Your application to Acme" — shown once the person has pressed Apply:
// what they are sending (their CV, and how well it matches) and what is
// missing (the sponsorship document). This is where the document is offered.
//
// It never gets in the way of applying: Apply opens the employer's site as
// before, and this is waiting when they come back to the tab.
//  - once per job;
//  - not when nothing is missing;
//  - after 3 "Not now" it stays quiet for two weeks.
// ---------------------------------------------------------------------------

const KEY = 'mv:applySheet';
type Store = { jobs: string[]; notNow: number[] };
const QUIET_MS = 14 * 86_400_000;

function read(): Store {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Store | null;
    if (v && Array.isArray(v.jobs) && Array.isArray(v.notNow)) return v;
  } catch {
    /* ignore */
  }
  return { jobs: [], notNow: [] };
}
function write(s: Store) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ jobs: s.jobs.slice(-300), notNow: s.notNow.slice(-3) }));
  } catch {
    /* ignore */
  }
}
function mayShow(jobKey: string): boolean {
  const s = read();
  if (s.jobs.includes(jobKey)) return false;
  return !(s.notNow.length >= 3 && Date.now() - s.notNow[s.notNow.length - 1] < QUIET_MS);
}

type Props = {
  jobKey: string;
  company: string;
  match: JobMatch;
  /** Set when a sponsorship document makes sense for this job (not a local job). */
  doc?: { jobId: string; country?: string | null; visaOffered: boolean } | null;
  /** True once Apply was pressed on this page. */
  armed: boolean;
  onAuth?: (p: 'login' | 'register') => void;
};

export function ApplySheet({ jobKey, company, match, doc, armed, onAuth }: Props) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!armed || !mayShow(jobKey)) return;
    let alive = true;
    let timer = 0;
    const show = async () => {
      if (!alive || !mayShow(jobKey)) return;
      const hasDoc = doc && session ? Boolean(await fetchMyBriefForJob(doc.jobId)) : false;
      if (!alive) return;
      // Nothing to add: CV checked, document made (or not needed).
      if (match.result && (!doc || hasDoc)) return;
      const s = read();
      write({ ...s, jobs: [...s.jobs, jobKey] });
      setOpen(true);
    };
    // Back from the employer's site → show. If they never left, after a moment.
    const onVisible = () => document.visibilityState === 'visible' && void show();
    document.addEventListener('visibilitychange', onVisible);
    timer = window.setTimeout(() => document.visibilityState === 'visible' && void show(), 2500);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, jobKey, session]);

  if (!open) return null;

  const close = (notNow: boolean) => {
    if (notNow) {
      const s = read();
      write({ ...s, notNow: [...s.notNow, Date.now()] });
    }
    setOpen(false);
  };
  const toMatch = () => {
    setOpen(false);
    document.getElementById('cv-match')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (match.cv && !match.result) void match.check();
  };

  return (
    <div role="dialog" aria-label={`Your application to ${company}`} className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-lg rounded-2xl bg-white p-4 shadow-soft-xl ring-1 ring-ink-200 sm:bottom-6 sm:p-5">
      <button onClick={() => close(false)} aria-label="Close" className="absolute right-3 top-3 rounded-full p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
        <X className="h-4 w-4" />
      </button>
      <p className="pr-8 text-[16px] font-bold leading-snug text-ink-950">Your application to {company}</p>
      <p className="mt-0.5 text-[13px] text-ink-500">What you’re sending, and what would make it stronger.</p>

      <div className="mt-2 divide-y divide-ink-100">
        {match.result ? (
          <Row compact ok title="CV" status={`${match.result.score}% match`} text={`${match.cv?.name ?? 'Your CV'} — ${match.result.label.toLowerCase()} for this job.`} />
        ) : (
          <Row
            compact
            ok={false}
            title="CV"
            status={match.cv ? 'Not checked' : 'Not on MadeVisa'}
            text={match.cv ? 'See how well it matches this job before you send it — free.' : 'Upload your CV to see how well it matches this job — free.'}
            action={
              <button onClick={toMatch} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
                <ScanSearch className="h-4 w-4" /> {match.cv ? 'Check my match' : 'Upload CV'}
              </button>
            }
          />
        )}
        {doc && <SponsorDocRow compact jobId={doc.jobId} company={company} country={doc.country} visaOffered={doc.visaOffered} onAuth={onAuth} />}
      </div>

      <div className="mt-2 flex justify-end">
        <button onClick={() => close(true)} className="rounded-full px-3 py-2 text-[13px] font-semibold text-ink-500 hover:text-ink-800">
          Not now
        </button>
      </div>
    </div>
  );
}
