import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Briefcase, Home, Plane, Search } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { handleNavClick } from '@/lib/navLink';
import { supabase } from '@/lib/supabase';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';

type Kind = 'page' | 'job' | 'program' | 'company' | 'profile';

const COPY: Record<Kind, { title: string; text: string; status: string }> = {
  job: {
    title: 'This job is no longer available',
    text: 'The company has filled or closed this role, or the link has expired. Plenty of others are open right now.',
    status: 'Closed',
  },
  program: {
    title: 'This program is no longer available',
    text: "It may have closed or the link has changed. Here's where to look next.",
    status: 'Closed',
  },
  company: {
    title: "We couldn't find this company",
    text: 'The link may be broken, or the company page has moved.',
    status: 'Not found',
  },
  profile: {
    title: "This profile doesn't exist",
    text: 'The username may have changed, or the profile was removed.',
    status: 'Not found',
  },
  page: {
    title: "This page doesn't exist",
    text: 'The link may be broken or the page has moved. Let’s get you back on track.',
    status: 'Not found',
  },
};

function nav(href: string) {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

/** "mongodb" / "block-inc" (from a job URL) → "Mongodb" / "Block Inc". */
function companyFromSlug(slug?: string | null): string | null {
  if (!slug || /^[0-9a-f-]{8,}$/i.test(slug)) return null;
  const words = slug.split('-').filter(Boolean);
  if (!words.length) return null;
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Friendly "not found" page: removed or expired jobs, unknown links, and
 * missing programs / companies / profiles. Styled as a boarding pass whose
 * flight didn't go ahead, with a way back to jobs and the homepage.
 */
export function NotFoundPage({
  kind = 'page',
  go,
  onAuth,
  companySlug,
}: {
  kind?: Kind;
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
  /** For jobs: the company part of the old URL, to offer "More jobs at …". */
  companySlug?: string | null;
}) {
  const copy = COPY[kind];
  useSeo({ title: copy.title, description: copy.text, path: window.location.pathname, noindex: true });
  const [q, setQ] = useState('');
  const [openJobs, setOpenJobs] = useState<number | null>(null);
  const company = kind === 'job' ? companyFromSlug(companySlug) : null;

  useEffect(() => {
    supabase
      .from('sponsored_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .then(({ count }) => setOpenJobs(count ?? null));
  }, []);

  const search = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim().slice(0, 80);
    nav(term ? `/jobs?q=${encodeURIComponent(term)}` : '/jobs');
  };

  const path = window.location.pathname;
  const shownPath = path.length > 34 ? `${path.slice(0, 31)}…` : path;

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active={kind === 'job' ? 'jobs' : undefined} />

      <main className="flex-1 px-4 pb-20 pt-12 sm:pt-16">
        <div className="mx-auto max-w-3xl">
          {/* Boarding pass */}
          <div className="relative overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft-lg">
            <div className="flex items-center justify-between bg-brand-700 px-5 py-3 text-white sm:px-8">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">Boarding pass</span>
              <span className="flex items-center gap-2 text-xs font-semibold">
                madevisa<Plane className="h-3.5 w-3.5 -rotate-45" />
              </span>
            </div>

            <div className="grid sm:grid-cols-[1fr_auto]">
              <div className="px-5 py-7 sm:px-8 sm:py-9">
                <div className="flex items-end gap-4">
                  <p className="font-slab text-[88px] font-bold leading-[0.8] tracking-tight text-brand-700 sm:text-[128px]">404</p>
                  <span className="mb-1 rounded-md border-2 border-rose-500 px-2 py-1 text-xs font-extrabold uppercase tracking-widest text-rose-600 [transform:rotate(-8deg)]">
                    {copy.status}
                  </span>
                </div>
                <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{copy.title}</h1>
                <p className="mt-2 max-w-lg text-sm leading-6 text-ink-600">{copy.text}</p>

                <dl className="mt-6 grid max-w-md grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-ink-400">From</dt>
                    <dd className="truncate font-mono text-ink-700" title={path}>
                      {shownPath}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-ink-400">To</dt>
                    <dd className="font-semibold text-ink-900">Your next job abroad</dd>
                  </div>
                </dl>
              </div>

              {/* Stub */}
              <div className="relative border-t-2 border-dashed border-ink-200 px-5 py-6 sm:w-60 sm:border-l-2 sm:border-t-0 sm:px-6 sm:py-9">
                <span className="absolute -left-3 -top-3 hidden h-6 w-6 rounded-full bg-[#f8fafc] sm:block" />
                <span className="absolute -bottom-3 -left-3 hidden h-6 w-6 rounded-full bg-[#f8fafc] sm:block" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400">Next departure</p>
                {openJobs ? (
                  <>
                    <p className="mt-1 font-slab text-3xl font-bold leading-none text-ink-950">{openJobs.toLocaleString()}</p>
                    <p className="mt-1 text-xs text-ink-500">open jobs right now</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm font-semibold text-ink-900">Thousands of jobs open right now</p>
                )}
                <a
                  href="/jobs"
                  onClick={(e) => handleNavClick(e, () => go('jobs'))}
                  className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700"
                >
                  <Briefcase className="h-4 w-4" /> Browse jobs
                </a>
                <a
                  href="/"
                  onClick={(e) => handleNavClick(e, () => go('home'))}
                  className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
                >
                  <Home className="h-4 w-4" /> Homepage
                </a>
              </div>
            </div>
          </div>

          {/* Search + more */}
          <form onSubmit={search} className="mt-6 flex gap-2 rounded-xl border border-ink-200 bg-white p-2 shadow-sm">
            <Search className="ml-2 mt-3 h-4 w-4 shrink-0 text-ink-400" />
            <input
              value={q}
              maxLength={80}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search jobs by title, skill, company or city"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
            />
            <button type="submit" className="shrink-0 rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800">
              Search
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {company && (
              <a
                href={`/jobs?q=${encodeURIComponent(company)}`}
                onClick={(e) => handleNavClick(e, () => nav(`/jobs?q=${encodeURIComponent(company)}`))}
                className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 font-semibold text-brand-700 hover:bg-brand-100"
              >
                More jobs at {company} <ArrowRight className="h-3.5 w-3.5" />
              </a>
            )}
            <a
              href="/companies"
              onClick={(e) => handleNavClick(e, () => go('companies'))}
              className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 font-medium text-ink-700 hover:border-ink-300"
            >
              Companies hiring
            </a>
            <a href="/contact" className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 font-medium text-ink-700 hover:border-ink-300">
              Report a broken link
            </a>
          </div>
        </div>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
