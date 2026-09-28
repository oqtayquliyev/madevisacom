import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Clock, Loader2 } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { WRAP } from '@/lib/pageLayout';
import { articlePath, CATEGORY_LABEL, CATEGORY_ORDER, fetchArticles, type ArticleCard, type ArticleCategory } from '@/lib/articles';
import { CircleFlag } from '@/components/common/CircleFlag';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { AppLink } from '@/pages/info/InfoPage';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const CATEGORY_BLURB: Record<ArticleCategory | 'all', string> = {
  all: 'Hiring reports from live data, visa guides by country and practical advice for applying — and hiring — across borders.',
  insights: 'Weekly reports from live jobs: who’s hiring, which roles, remote work and visa sponsorship, country by country.',
  visas: 'Work, talent and job-search visas explained in plain language, with the official source for every route.',
  guides: 'Practical advice for finding roles early, applying well and knowing which companies reply.',
  hiring: 'For employers and recruiters: hiring internationally, sponsorship and being known for replying.',
  news: 'What’s new on MadeVisa and in the world of hiring.',
};

export const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function readCategory(): ArticleCategory | 'all' {
  const c = new URLSearchParams(window.location.search).get('c');
  return c && (CATEGORY_ORDER as string[]).includes(c) ? (c as ArticleCategory) : 'all';
}

export function ArticleTile({ a, big = false }: { a: ArticleCard; big?: boolean }) {
  return (
    <AppLink
      href={articlePath(a)}
      className={`group flex h-full flex-col rounded-xl border border-ink-200 bg-white transition hover:border-brand-300 hover:shadow-sm ${big ? 'p-6 sm:p-8' : 'p-5'}`}
    >
      {a.cover_url && <img src={a.cover_url} alt="" loading="lazy" className={`mb-4 w-full rounded-lg object-cover ${big ? 'aspect-[2/1]' : 'aspect-[16/9]'}`} />}
      <div className="flex items-center gap-2 text-xs font-semibold text-brand-700">
        {a.country_code && <CircleFlag countryCode={a.country_code} size={14} />}
        {CATEGORY_LABEL[a.category]}
      </div>
      <h3 className={`mt-2 font-title font-semibold leading-snug text-ink-950 group-hover:text-brand-700 ${big ? 'text-2xl sm:text-3xl' : 'text-[19px]'}`}>{a.title}</h3>
      {a.excerpt && <p className={`mt-2 flex-1 text-ink-600 ${big ? 'text-[16px] leading-7' : 'line-clamp-3 text-sm leading-6'}`}>{a.excerpt}</p>}
      <p className="mt-4 flex items-center gap-2 text-xs text-ink-500">
        {fmtDate(a.publish_at)}
        <span aria-hidden>·</span>
        <Clock className="h-3 w-3" /> {a.reading_minutes} min read
      </p>
    </AppLink>
  );
}

export function BlogPage({ go, onAuth }: Props) {
  const [category, setCategory] = useState<ArticleCategory | 'all'>(readCategory);
  const [articles, setArticles] = useState<ArticleCard[] | null>(null);

  useSeo({
    title: category === 'all' ? 'MadeVisa Blog — hiring reports, visa guides and job-search advice' : `${CATEGORY_LABEL[category]} | MadeVisa Blog`,
    description: CATEGORY_BLURB[category],
    path: category === 'all' ? '/blog' : `/blog?c=${category}`,
  });

  useEffect(() => {
    const onPop = () => setCategory(readCategory());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    let alive = true;
    setArticles(null);
    fetchArticles({ category: category === 'all' ? null : category, limit: 60 }).then((a) => alive && setArticles(a));
    return () => {
      alive = false;
    };
  }, [category]);

  const pick = (c: ArticleCategory | 'all') => {
    setCategory(c);
    window.history.replaceState({}, '', c === 'all' ? '/blog' : `/blog?c=${c}`);
  };

  const [featured, rest] = useMemo(() => (articles && articles.length ? [articles[0], articles.slice(1)] : [null, []]), [articles]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />

      <section className="border-b border-ink-200 bg-white">
        <div className={`${WRAP} py-10 sm:py-14`}>
          <p className="text-sm font-semibold text-brand-700">The MadeVisa Blog</p>
          <h1 className="mt-2 max-w-3xl font-title text-4xl font-semibold leading-tight tracking-tight text-ink-950 sm:text-5xl">Hiring, from the inside out.</h1>
          <p className="mt-4 max-w-2xl text-[16px] leading-7 text-ink-600">{CATEGORY_BLURB[category]}</p>
          <div className="mt-7 flex flex-wrap gap-2" role="tablist" aria-label="Categories">
            {(['all', ...CATEGORY_ORDER] as const).map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={category === c}
                onClick={() => pick(c)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  category === c ? 'border-ink-950 bg-ink-950 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400'
                }`}
              >
                {c === 'all' ? 'All' : CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className={`${WRAP} py-10 sm:py-14`}>
        {!articles && (
          <p className="flex items-center gap-2 text-sm text-ink-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading articles…
          </p>
        )}
        {articles && !articles.length && (
          <div className="rounded-xl border border-dashed border-ink-300 bg-white p-10 text-center">
            <p className="font-semibold text-ink-900">Nothing here yet.</p>
            <p className="mt-1 text-sm text-ink-500">New reports and guides are published every week.</p>
          </div>
        )}
        {featured && (
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <ArticleTile a={featured} big />
            <div className="grid gap-6">
              {rest.slice(0, 2).map((a) => (
                <ArticleTile key={a.id} a={a} />
              ))}
            </div>
          </div>
        )}
        {rest.length > 2 && (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rest.slice(2).map((a) => (
              <ArticleTile key={a.id} a={a} />
            ))}
          </div>
        )}

        <aside className="mt-14 grid gap-4 rounded-2xl bg-brand-700 p-6 text-white sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
          <div>
            <h2 className="text-xl font-bold">Want the numbers behind the reports?</h2>
            <p className="mt-1 text-sm text-brand-100">Live hiring data by country, company and role, refreshed every hour.</p>
          </div>
          <AppLink href="/job-market" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
            See the job market <ArrowUpRight className="h-4 w-4" />
          </AppLink>
        </aside>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
