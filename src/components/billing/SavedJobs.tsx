import { useEffect, useState } from 'react';
import { Bookmark, BookmarkCheck, Loader2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { rememberAuthIntent } from '@/lib/authIntent';
import { jobPath } from '@/lib/jobUrl';
import { handleNavClick } from '@/lib/navLink';
import { nav } from '@/lib/pageLayout';
import { useMyPlan } from '@/lib/plans';
import { loadSavedJobs, saveJob, unsaveJob, useIsSaved, type SavedJob } from '@/lib/billing';
import { UpgradePrompt } from '@/components/pro/UpgradePrompt';

// "Save job" (Free: 5 jobs; Starter and Pro: no limit — save_job() in the
// database applies the limit) and the list of saved jobs on the dashboard.

export function SaveJobButton({ jobId, onAuth, className = '' }: { jobId: string; onAuth?: (p: 'login' | 'register') => void; className?: string }) {
  const { session } = useAuth();
  const saved = useIsSaved(jobId, Boolean(session));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; limit: boolean } | null>(null);

  const toggle = async () => {
    if (!session) {
      rememberAuthIntent({ reason: 'save', next: window.location.pathname });
      return onAuth?.('register');
    }
    setBusy(true);
    setMsg(null);
    if (saved) await unsaveJob(jobId);
    else {
      const r = await saveJob(jobId);
      if (!r.ok) setMsg({ text: r.message, limit: r.limit });
    }
    setBusy(false);
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={Boolean(saved)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : saved ? <BookmarkCheck className="h-4 w-4 text-brand-600" aria-hidden /> : <Bookmark className="h-4 w-4" aria-hidden />}
        {saved ? 'Saved' : 'Save job'}
      </button>
      {msg && (
        <div className="mt-2 max-w-md">
          {msg.limit ? (
            <UpgradePrompt id="saved_jobs_limit" plan="starter" source="saved_jobs_limit" text={`${msg.text} Starter saves as many jobs as you like, and adds the full CV match report on every job.`} />
          ) : (
            <p className="text-[13px] text-rose-700">{msg.text}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function SavedJobsSection() {
  const my = useMyPlan();
  const [rows, setRows] = useState<SavedJob[] | null>(null);
  useEffect(() => {
    let alive = true;
    void loadSavedJobs().then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, []);
  if (!rows || !rows.length) return null;
  const limit = my.limit('saved_jobs');
  const remove = async (id: string) => {
    await unsaveJob(id);
    setRows((r) => (r ?? []).filter((x) => x.id !== id));
  };
  return (
    <section aria-labelledby="saved-title" className="rounded-xl bg-white p-4 ring-1 ring-ink-200 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Bookmark className="h-4 w-4 text-ink-400" aria-hidden />
        <h2 id="saved-title" className="text-lg font-bold text-ink-950">
          Saved jobs
        </h2>
        <span className="text-xs text-ink-400">{limit == null ? `(${rows.length})` : `(${rows.length} of ${limit})`}</span>
      </div>
      <ul className="mt-3 divide-y divide-ink-100">
        {rows.map((j) => {
          const href = jobPath({ id: `sponsored-${j.id}`, title: j.title, company: j.company ?? '' });
          return (
            <li key={j.id} className="flex items-center gap-3 py-2.5">
              {j.logo ? <img src={j.logo} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-md border border-ink-100 object-contain" /> : <span className="h-7 w-7 shrink-0 rounded-md bg-ink-100" />}
              <a href={href} onClick={(e) => handleNavClick(e, () => nav(href))} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900 hover:text-brand-700">{j.title}</span>
                <span className="block truncate text-xs text-ink-500">{[j.company, j.city, j.country].filter(Boolean).join(' · ')}{j.open ? '' : ' · closed'}</span>
              </a>
              <button type="button" onClick={() => void remove(j.id)} className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label={`Remove ${j.title} from saved jobs`}>
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
