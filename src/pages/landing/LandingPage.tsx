import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BellRing, ChevronRight, History, Search, X } from 'lucide-react';
import { useNotifications } from '@/lib/notifications';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { SEO_META } from '@/lib/seoMeta';
import { nav } from '@/lib/pageLayout';
import { handleNavClick } from '@/lib/navLink';
import { readRecent } from '@/lib/lastSearch';
import { Logo } from '@/components/layout/Logo';
import { LandingHeader } from './components/LandingHeader';

type LandingProps = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

// The homepage, as plain as a search engine: the logo, one search box, one line under it.
// Enter (or the keyboard's Search key on a phone) opens /jobs with that search.

const FOOTER_LINKS = [
  { label: 'Jobs', href: '/jobs' },
  { label: 'CV match', href: '/cv-match' },
  { label: 'Company Insights', href: '/companies' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
];

export function LandingPage({ go, onAuth }: LandingProps) {
  useSeo({ ...SEO_META.home, path: '/' });
  const [q, setQ] = useState('');
  const [recent] = useState(readRecent);
  // Signed in: the jobs we last sent them (job-alert notifications), right under the search.
  const { items: notes } = useNotifications(40);
  const forYou = notes.filter((n) => (n.kind === 'job_alert' || n.kind === 'for_you') && n.link).slice(0, 4);
  const input = useRef<HTMLInputElement>(null);

  // Desktop: ready to type, like a search engine. Phones: no keyboard popping up on arrival.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) input.current?.focus();
  }, []);

  const searchFor = (text: string, country?: string | null) => {
    const p = new URLSearchParams();
    if (text.trim()) p.set('q', text.trim());
    if (country) p.set('country', country);
    const qs = p.toString();
    nav(`/jobs${qs ? `?${qs}` : ''}`);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    input.current?.blur();
    searchFor(q);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="home" />

      <main className="flex flex-1 flex-col items-center px-5 pb-16 pt-[14vh] sm:pt-[18vh]">
        <h1 className="sr-only">MadeVisa — find jobs abroad with visa sponsorship</h1>
        <Logo style={{ height: 52 }} className="select-none" />

        <form role="search" onSubmit={submit} className="mt-8 w-full max-w-[640px]">
          <div className="group flex h-14 items-center gap-3 rounded-full bg-white px-5 ring-1 ring-ink-200 transition hover:shadow-[0_1px_8px_rgba(32,33,36,0.18)] focus-within:shadow-[0_1px_8px_rgba(32,33,36,0.18)] focus-within:ring-ink-200">
            <Search className="h-5 w-5 shrink-0 text-ink-400" aria-hidden />
            <input
              ref={input}
              type="search"
              enterKeyHint="search"
              inputMode="search"
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search jobs abroad"
              aria-label="Search jobs"
              className="h-full w-full min-w-0 bg-transparent text-[16px] text-ink-950 outline-none placeholder:text-ink-400 [&::-webkit-search-cancel-button]:hidden"
            />
            {q && (
              <button type="button" onClick={() => (setQ(''), input.current?.focus())} aria-label="Clear" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-ink-50 hover:text-ink-700">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="mt-6 flex justify-center gap-3">
            <button type="submit" className="rounded-lg bg-ink-50 px-5 py-2.5 text-[14px] font-semibold text-ink-800 ring-1 ring-transparent transition hover:ring-ink-200">
              Search jobs
            </button>
            <button
              type="button"
              onClick={() => searchFor('', null)}
              className="rounded-lg bg-ink-50 px-5 py-2.5 text-[14px] font-semibold text-ink-800 ring-1 ring-transparent transition hover:ring-ink-200"
            >
              Newest jobs
            </button>
          </div>
        </form>

        {/* The one line about what's different. */}
        <p className="mt-8 flex max-w-[640px] items-center gap-2 text-center text-[14px] text-ink-600">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 rotate-45 text-[#2563EB]" aria-hidden fill="currentColor">
            <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
          </svg>
          <span>
            <strong className="font-semibold text-ink-900">Unique jobs</strong> straight from company career pages — not listed on LinkedIn or Indeed.
          </span>
        </p>

        {recent.length > 0 && (
          <div className="mt-6 flex max-w-[640px] flex-wrap justify-center gap-2">
            {recent.slice(0, 4).map((r) => (
              <button
                key={`${r.q}|${r.country ?? ''}`}
                type="button"
                onClick={() => searchFor(r.q, r.country)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50 hover:text-ink-900"
              >
                <History className="h-3.5 w-3.5 text-ink-400" aria-hidden />
                {r.q}
                {r.country ? <span className="text-ink-400">· {r.country}</span> : null}
              </button>
            ))}
          </div>
        )}
        {forYou.length > 0 && (
          <section className="mt-10 w-full max-w-[640px]" aria-labelledby="for-you-title">
            <h2 id="for-you-title" className="mb-2 text-[13px] font-bold uppercase tracking-wide text-ink-400">
              Recommended for you
            </h2>
            <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl ring-1 ring-ink-200">
              {forYou.map((n) => (
                <li key={n.id}>
                  <a
                    href={n.link!}
                    onClick={(e) => handleNavClick(e, () => nav(n.link!))}
                    className="flex items-center gap-3 px-4 py-3 text-left hover:bg-ink-50"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                      <BellRing className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold text-ink-950">{n.body || n.title}</span>
                      <span className="block truncate text-[12.5px] text-ink-500">{n.title}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="border-t border-ink-100 bg-ink-50/60">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-5 py-4 text-[13px] text-ink-500">
          {FOOTER_LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={(e) => handleNavClick(e, () => nav(l.href))} className="hover:text-ink-900">
              {l.label}
            </a>
          ))}
        </nav>
      </footer>
    </div>
  );
}
