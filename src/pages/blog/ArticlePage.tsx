import { useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronRight, Clock, Link2, Loader2 } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { WRAP } from '@/lib/pageLayout';
import { articlePath, CATEGORY_LABEL, fetchArticle, fetchArticles, purifyArticleHtml, type Article, type ArticleCard } from '@/lib/articles';
import { visaGuideByCode, destinationPath } from '@/data/visa';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { AppLink } from '@/pages/info/InfoPage';
import { ArticleTile, fmtDate } from '@/pages/blog/BlogPage';

type Props = { slug: string; go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

// Article body typography (no plugin needed).
const PROSE =
  'text-[17px] leading-8 text-ink-800 [&_a]:font-medium [&_a]:text-brand-700 [&_a]:underline [&_a]:decoration-brand-200 [&_a]:underline-offset-2 hover:[&_a]:decoration-brand-600 ' +
  '[&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-brand-500 [&_blockquote]:bg-brand-50/50 [&_blockquote]:px-5 [&_blockquote]:py-3 [&_blockquote]:text-ink-700 ' +
  '[&_h2]:mb-3 [&_h2]:mt-12 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-ink-950 [&_h3]:mb-2 [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-ink-950 ' +
  '[&_hr]:my-10 [&_hr]:border-ink-200 [&_img]:my-6 [&_img]:rounded-xl [&_li]:my-1.5 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-5 [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-6 ' +
  '[&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[15px] [&_td]:border-b [&_td]:border-ink-100 [&_td]:px-3 [&_td]:py-2 [&_th]:border-b-2 [&_th]:border-ink-200 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-sm [&_th]:font-semibold [&_th]:text-ink-600 ' +
  '[&_.stat-grid]:my-8 [&_.stat-grid]:grid [&_.stat-grid]:grid-cols-2 [&_.stat-grid]:gap-3 sm:[&_.stat-grid]:grid-cols-4 [&_.stat]:rounded-xl [&_.stat]:border [&_.stat]:border-ink-200 [&_.stat]:bg-white [&_.stat]:p-4 ' +
  '[&_.stat_strong]:block [&_.stat_strong]:text-2xl [&_.stat_strong]:tabular-nums [&_.stat_strong]:text-ink-950 [&_.stat_small]:text-sm [&_.stat_small]:text-ink-500 ' +
  '[&_.note]:rounded-xl [&_.note]:bg-ink-100 [&_.note]:p-4 [&_.note]:text-[15px] [&_.note]:leading-6 [&_.note]:text-ink-700';

export function ArticlePage({ slug, go, onAuth }: Props) {
  const [article, setArticle] = useState<Article | null | undefined>(undefined);
  const [related, setRelated] = useState<ArticleCard[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setArticle(undefined);
    fetchArticle(slug).then((a) => {
      if (!alive) return;
      setArticle(a);
      if (a) fetchArticles({ category: a.category, limit: 4 }).then((r) => alive && setRelated(r.filter((x) => x.id !== a.id).slice(0, 3)));
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  useSeo({
    title: article ? article.title : 'MadeVisa Blog',
    description: article?.excerpt || 'Hiring reports, visa guides and job-search advice from MadeVisa.',
    path: `/blog/${slug}`,
    noindex: article === null,
    ogImage: article?.cover_url ?? undefined,
  });

  if (article === null) return <NotFoundPage go={go} onAuth={onAuth} />;

  const guide = article?.country_code ? visaGuideByCode.get(article.country_code) : undefined;
  const isDraft = article && (article.status !== 'published' || (article.publish_at && Date.parse(article.publish_at) > Date.now()));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />

      {!article ? (
        <p className={`${WRAP} flex items-center gap-2 py-20 text-sm text-ink-500`}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : (
        <>
          <header className="border-b border-ink-200 bg-white">
            <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
              <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-ink-500">
                <AppLink href="/blog" className="hover:text-brand-700">
                  Blog
                </AppLink>
                <ChevronRight className="h-3.5 w-3.5" />
                <AppLink href={`/blog?c=${article.category}`} className="hover:text-brand-700">
                  {CATEGORY_LABEL[article.category]}
                </AppLink>
              </nav>
              {isDraft && <p className="mt-4 inline-block rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">Preview — not public yet</p>}
              <h1 className="mt-4 font-title text-3xl font-semibold leading-tight tracking-tight text-ink-950 sm:text-[44px] sm:leading-[1.12]">{article.title}</h1>
              {article.excerpt && <p className="mt-5 text-lg leading-8 text-ink-600">{article.excerpt}</p>}
              <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-500">
                <span className="font-medium text-ink-800">{article.author_name}</span>
                <span aria-hidden>·</span>
                <time dateTime={article.publish_at ?? undefined}>{fmtDate(article.publish_at)}</time>
                {article.updated_at && article.publish_at && Date.parse(article.updated_at) - Date.parse(article.publish_at) > 86_400_000 && (
                  <>
                    <span aria-hidden>·</span>
                    <span>Updated {fmtDate(article.updated_at)}</span>
                  </>
                )}
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {article.reading_minutes} min read
                </span>
                <button onClick={() => void copy()} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy link'}
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-12">
            {article.cover_url && <img src={article.cover_url} alt="" className="mb-8 aspect-[2/1] w-full rounded-xl object-cover" />}
            <article className={PROSE} dangerouslySetInnerHTML={{ __html: purifyArticleHtml(article.body_html) }} />

            <aside className="mt-14 grid gap-4 sm:grid-cols-2">
              <AppLink href="/jobs" className="group rounded-xl border border-ink-200 bg-white p-5 hover:border-brand-300">
                <p className="text-sm font-semibold text-ink-950">Browse live jobs</p>
                <p className="mt-1 text-sm text-ink-600">Straight from company career pages, updated through the day.</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                  Explore jobs <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </AppLink>
              {guide ? (
                <AppLink href={destinationPath(guide)} className="group rounded-xl border border-ink-200 bg-white p-5 hover:border-brand-300">
                  <p className="text-sm font-semibold text-ink-950">Visas for {guide.name}</p>
                  <p className="mt-1 text-sm text-ink-600">Routes, fees and years to residence — with the official source.</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                    See the routes <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </AppLink>
              ) : (
                <AppLink href="/companies" className="group rounded-xl border border-ink-200 bg-white p-5 hover:border-brand-300">
                  <p className="text-sm font-semibold text-ink-950">Which companies reply?</p>
                  <p className="mt-1 text-sm text-ink-600">Reply rates from real applicants, before you apply.</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                    Company Scores <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </AppLink>
              )}
            </aside>
          </main>

          {related.length > 0 && (
            <section className="border-t border-ink-200 bg-white">
              <div className={`${WRAP} py-12`}>
                <h2 className="text-xl font-bold text-ink-950">More {CATEGORY_LABEL[article.category].toLowerCase()}</h2>
                <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {related.map((a) => (
                    <ArticleTile key={a.id} a={a} />
                  ))}
                </div>
                <AppLink href="/blog" className="mt-6 inline-flex text-sm font-semibold text-brand-700 hover:underline">
                  All articles
                </AppLink>
              </div>
            </section>
          )}
        </>
      )}

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

export { articlePath };
