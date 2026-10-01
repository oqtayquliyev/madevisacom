import { useEffect, useState } from 'react';
import { FileSignature, X } from 'lucide-react';
import { nav } from '@/lib/pageLayout';
import { useAuth } from '@/lib/auth';
import { fetchMyBriefForJob, newOfferPath } from '@/lib/briefs';
import { useOfferCredits } from '@/lib/sponsorOffer';

// ---------------------------------------------------------------------------
// "Applying? Attach a sponsorship offer." — the right moment to explain it:
// the person just clicked Apply on a job that doesn't offer a visa.
//
// Never a nag:
//  - once per job, ever;
//  - at most once a day and 3 times a week across all jobs;
//  - after 3 "No thanks" it never shows again;
//  - not if they already made a document for this job;
//  - shown when they come back to the tab (Apply opens the employer's site
//    in a new tab), never on top of the page they're reading.
// ---------------------------------------------------------------------------

const KEY = 'mv:applyNudge';
type Store = { jobs: string[]; shown: number[]; noThanks: number };

function read(): Store {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Store | null;
    if (v && Array.isArray(v.jobs) && Array.isArray(v.shown)) return v;
  } catch {
    /* ignore */
  }
  return { jobs: [], shown: [], noThanks: 0 };
}
function write(s: Store) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ jobs: s.jobs.slice(-200), shown: s.shown.slice(-20), noThanks: s.noThanks }));
  } catch {
    /* ignore */
  }
}

/** May we show the nudge for this job right now? */
function canNudge(jobId: string): boolean {
  const s = read();
  const now = Date.now();
  if (s.noThanks >= 3 || s.jobs.includes(jobId)) return false;
  if (s.shown.some((t) => now - t < 86_400_000)) return false;
  if (s.shown.filter((t) => now - t < 7 * 86_400_000).length >= 3) return false;
  return true;
}

export function ApplyNudge({ jobId, company, country, armed }: { jobId: string; company: string; country?: string | null; armed: boolean }) {
  const { session } = useAuth();
  const credits = useOfferCredits();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!armed || !canNudge(jobId)) return;
    let alive = true;
    let timer = 0;
    const show = async () => {
      if (!alive || !canNudge(jobId)) return;
      if (session && (await fetchMyBriefForJob(jobId))) return; // already has one
      if (!alive) return;
      const s = read();
      write({ ...s, jobs: [...s.jobs, jobId], shown: [...s.shown, Date.now()] });
      setOpen(true);
    };
    // Back from the employer's site → show. If they never left, show after a moment.
    const onVisible = () => document.visibilityState === 'visible' && void show();
    document.addEventListener('visibilitychange', onVisible);
    timer = window.setTimeout(() => document.visibilityState === 'visible' && void show(), 2500);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [armed, jobId, session]);

  if (!open) return null;

  const close = (noThanks: boolean) => {
    if (noThanks) {
      const s = read();
      write({ ...s, noThanks: s.noThanks + 1 });
    }
    setOpen(false);
  };
  const href = `${newOfferPath(jobId)}${country ? `&country=${country}` : ''}`;

  return (
    <div role="dialog" aria-label="Sponsorship offer" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl bg-white p-4 shadow-soft-lg ring-1 ring-ink-200 sm:bottom-6">
      <button onClick={() => close(false)} aria-label="Close" className="absolute right-3 top-3 rounded-full p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
        <X className="h-4 w-4" />
      </button>
      <p className="pr-6 text-[15px] font-bold text-ink-950">Applied to {company}? Make the visa easy to say yes to.</p>
      <p className="mt-1 text-[13px] leading-5 text-ink-600">
        This job doesn’t mention sponsorship. Send them a one-page plan: the legal route, their few steps, and which costs you share.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            setOpen(false);
            nav(href);
          }}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#1D4ED8] px-4 py-2.5 text-[14px] font-bold text-white hover:bg-brand-800"
        >
          <FileSignature className="h-4 w-4" /> {!session ? 'Make it — first one free' : credits && credits.left > 0 ? `Make it — ${credits.left} left` : 'Make it'}
        </a>
        <button onClick={() => close(true)} className="rounded-full px-3 py-2.5 text-[13px] font-semibold text-ink-500 hover:text-ink-800">
          No thanks
        </button>
      </div>
    </div>
  );
}
