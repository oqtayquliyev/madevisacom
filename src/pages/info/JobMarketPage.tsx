import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, Loader2 } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { WRAP } from '@/lib/pageLayout';
import { useInsights } from '@/lib/insights';
import { companyPath } from '@/lib/companies';
import { articlePath, fetchArticles, type ArticleCard } from '@/lib/articles';
import { visaGuideByCode, destinationPath } from '@/data/visa';
import { CircleFlag } from '@/components/common/CircleFlag';
import { TrendChart } from '@/components/charts/SoftCharts';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { AppLink, Faq } from '@/pages/info/InfoPage';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const fmt = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString());
const pct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n)}%`);

function Panel({ title, sub, children, right }: { title: string; sub?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-200 bg-white p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-bold tracking-tight text-ink-950">{title}</h2>
          {sub && <p className="mt-0.5 text-sm text-ink-500">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Bars({ items, unit = 'jobs' }: { items: { label: string; n: number; href?: string }[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            {i.href ? (
              <AppLink href={i.href} className="truncate font-medium text-ink-800 hover:text-brand-700">
                {i.label}
              </AppLink>
            ) : (
              <span className="truncate font-medium text-ink-800">{i.label}</span>
            )}
            <span className="shrink-0 tabular-nums text-ink-500">
              {fmt(i.n)} {unit}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(2, (i.n / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const ago = (iso: string | null) => {
  if (!iso) return null;
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 2 ? 'just now' : m < 60 ? `${m} minutes ago` : `${Math.round(m / 60)} hours ago`;
};

export function JobMarketPage({ go, onAuth }: Props) {
  const { insights: d, computedAt, loading } = useInsights();
  const [reports, setReports] = useState<ArticleCard[]>([]);
  const [countrySort, setCountrySort] = useState<'jobs' | 'visa' | 'remote'>('jobs');

  useSeo({
    title: 'Job market insights — who’s hiring, where and how, updated hourly',
    description: d
      ? `${fmt(d.live_jobs)} live jobs from ${fmt(d.companies)} companies in ${fmt(d.countries)} countries. See who’s hiring this week, the most in-demand roles, remote work and visa sponsorship — updated every hour.`
      : 'Live hiring data from company career pages: who is hiring this week, the most in-demand roles, remote work, salary transparency and visa sponsorship by country.',
    path: '/job-market',
  });

  useEffect(() => {
    fetchArticles({ category: 'insights', limit: 6 }).then(setReports);
  }, []);

  const trend = useMemo(() => {
    const days = d?.daily_new ?? [];
    return {
      values: days.map((x) => x.jobs),
      labels: days.map((x) => new Date(x.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })),
    };
  }, [d]);

  const countries = useMemo(() => {
    const list = [...(d?.by_country ?? [])];
    const share = (c: { jobs: number; visa: number; remote: number }, k: 'visa' | 'remote') => (c.jobs ? c[k] / c.jobs : 0);
    if (countrySort === 'visa') list.sort((a, b) => share(b, 'visa') - share(a, 'visa'));
    else if (countrySort === 'remote') list.sort((a, b) => share(b, 'remote') - share(a, 'remote'));
    return list.slice(0, 15);
  }, [d, countrySort]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />

      <section className="bg-brand-700 text-white">
        <div className={`${WRAP} py-12 sm:py-14`}>
          <p className="text-sm font-semibold text-brand-100">Job market insights</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl sm:leading-[1.1]">The job market, live.</h1>
          <p className="mt-4 max-w-2xl text-[17px] leading-7 text-brand-50/90">
            Who is hiring this week, where, for which roles — and how much of it is remote, pays transparently or sponsors visas. Straight from company career pages, updated every hour.
          </p>
          <dl className="mt-9 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/15 pt-6 sm:grid-cols-5">
            {[
              { n: fmt(d?.live_jobs), l: 'live jobs' },
              { n: fmt(d?.new_24h), l: 'new in 24 hours' },
              { n: fmt(d?.new_7d), l: 'new this week' },
              { n: fmt(d?.companies), l: 'companies hiring' },
              { n: fmt(d?.countries), l: 'countries' },
            ].map((s) => (
              <div key={s.l}>
                <dd className="text-2xl font-bold tabular-nums sm:text-3xl">{loading ? '…' : s.n}</dd>
                <dt className="text-sm text-brand-100">{s.l}</dt>
              </div>
            ))}
          </dl>
          {computedAt && <p className="mt-5 text-xs text-brand-100/80">Updated {ago(computedAt)}.</p>}
        </div>
      </section>

      <main className={`${WRAP} space-y-6 py-10 sm:py-14`}>
        {loading && (
          <p className="flex items-center gap-2 text-sm text-ink-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the latest numbers…
          </p>
        )}
        {!loading && !d && <p className="text-sm text-ink-500">The numbers are being prepared — check back in a few minutes.</p>}

        {d && (
          <>
            <Panel title="New jobs, day by day" sub="Roles added to MadeVisa over the last 30 days">
              {trend.values.length > 1 ? (
                <TrendChart series={[{ name: 'New jobs', values: trend.values, fill: true }]} labels={trend.labels} height={240} unit={['', ' jobs']} />
              ) : (
                <p className="text-sm text-ink-500">Not enough days yet.</p>
              )}
            </Panel>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <Panel
                title="Where the jobs are"
                sub="Live jobs by country"
                right={
                  <div className="flex rounded-lg bg-ink-100 p-0.5 text-xs font-semibold" role="tablist" aria-label="Sort countries">
                    {(
                      [
                        ['jobs', 'Most jobs'],
                        ['visa', 'Visa sponsorship'],
                        ['remote', 'Remote'],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        role="tab"
                        aria-selected={countrySort === k}
                        onClick={() => setCountrySort(k)}
                        className={`rounded-md px-2.5 py-1.5 ${countrySort === k ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-ink-100 text-left text-xs text-ink-500">
                        <th className="py-2 pr-3 font-medium">Country</th>
                        <th className="py-2 pr-3 text-right font-medium">Live jobs</th>
                        <th className="py-2 pr-3 text-right font-medium">New this week</th>
                        <th className="py-2 pr-3 text-right font-medium">Visa sponsorship</th>
                        <th className="py-2 text-right font-medium">Remote</th>
                      </tr>
                    </thead>
                    <tbody>
                      {countries.map((c) => {
                        const guide = visaGuideByCode.get(c.iso);
                        return (
                          <tr key={c.iso} className="border-b border-ink-50 last:border-0">
                            <td className="py-2.5 pr-3">
                              <span className="flex items-center gap-2">
                                <CircleFlag countryCode={c.iso} size={18} />
                                {guide ? (
                                  <AppLink href={destinationPath(guide)} className="font-medium text-ink-900 hover:text-brand-700">
                                    {c.name}
                                  </AppLink>
                                ) : (
                                  <span className="font-medium text-ink-900">{c.name}</span>
                                )}
                              </span>
                            </td>
                            <td className="py-2.5 pr-3 text-right tabular-nums">{fmt(c.jobs)}</td>
                            <td className="py-2.5 pr-3 text-right tabular-nums text-ink-600">{fmt(c.new_7d)}</td>
                            <td className="py-2.5 pr-3 text-right tabular-nums text-ink-600">{pct(c.jobs ? (100 * c.visa) / c.jobs : 0)}</td>
                            <td className="py-2.5 text-right tabular-nums text-ink-600">{pct(c.jobs ? (100 * c.remote) / c.jobs : 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="Who’s hiring this week" sub="Most new roles in the last 7 days">
                <ul className="space-y-3">
                  {d.top_companies_7d.slice(0, 10).map((c, i) => (
                    <li key={c.id} className="flex items-center gap-3">
                      <span className="w-5 text-right text-xs tabular-nums text-ink-400">{i + 1}</span>
                      {c.logo ? (
                        <img src={c.logo} alt="" className="h-8 w-8 rounded-md border border-ink-100 object-contain" loading="lazy" />
                      ) : (
                        <span className="grid h-8 w-8 place-items-center rounded-md bg-ink-100 text-xs font-bold text-ink-500">{c.name.slice(0, 2).toUpperCase()}</span>
                      )}
                      <AppLink href={companyPath(c)} className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900 hover:text-brand-700">
                        {c.name}
                      </AppLink>
                      <span className="shrink-0 text-right text-xs text-ink-500">
                        <strong className="text-sm tabular-nums text-ink-900">+{fmt(c.new_7d)}</strong> · {fmt(c.live)} live
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Most in-demand roles" sub="Live jobs by function">
                <Bars items={d.functions.slice(0, 10).map((f) => ({ label: f.name, n: f.jobs }))} />
              </Panel>

              <div className="space-y-6">
                <Panel title="How people work" sub="Among jobs that state it">
                  <div className="flex h-4 overflow-hidden rounded-full" aria-hidden>
                    <div className="bg-brand-700" style={{ width: `${d.work.onsite}%` }} />
                    <div className="bg-brand-400" style={{ width: `${d.work.hybrid}%` }} />
                    <div className="bg-brand-200" style={{ width: `${d.work.remote}%` }} />
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                    {[
                      ['On-site', d.work.onsite, 'bg-brand-700'],
                      ['Hybrid', d.work.hybrid, 'bg-brand-400'],
                      ['Remote', d.work.remote, 'bg-brand-200'],
                    ].map(([label, v, color]) => (
                      <div key={label as string}>
                        <dt className="flex items-center gap-1.5 text-ink-500">
                          <span className={`h-2.5 w-2.5 rounded-sm ${color}`} /> {label}
                        </dt>
                        <dd className="mt-0.5 text-xl font-bold tabular-nums text-ink-950">{pct(v as number)}</dd>
                      </div>
                    ))}
                  </dl>
                </Panel>

                <div className="grid gap-6 sm:grid-cols-2">
                  <Panel title="Visa sponsorship" sub="Jobs that say they sponsor">
                    <p className="text-4xl font-bold tabular-nums text-ink-950">{pct(d.visa_share)}</p>
                    <p className="mt-2 text-sm leading-6 text-ink-600">Most ads don’t say either way — ask the employer, and check your routes.</p>
                    <AppLink href="/destinations" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                      Visas by country <ArrowRight className="h-3.5 w-3.5" />
                    </AppLink>
                  </Panel>
                  <Panel title="Salary shown" sub="Jobs that state pay">
                    <p className="text-4xl font-bold tabular-nums text-ink-950">{pct(d.salary_share)}</p>
                    <p className="mt-2 text-sm leading-6 text-ink-600">Pay transparency varies widely by country and company.</p>
                  </Panel>
                </div>
              </div>
            </div>

            {d.experience.length > 0 && (
              <Panel title="Experience asked for" sub="Among jobs that state it">
                <Bars items={d.experience.map((e) => ({ label: e.name, n: e.jobs }))} />
              </Panel>
            )}
          </>
        )}

        {reports.length > 0 && (
          <section className="pt-4">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-2xl font-bold tracking-tight text-ink-950">Weekly hiring reports</h2>
              <AppLink href="/blog?c=insights" className="text-sm font-semibold text-brand-700 hover:underline">
                All reports
              </AppLink>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {reports.map((a) => (
                <AppLink key={a.id} href={articlePath(a)} className="group rounded-xl border border-ink-200 bg-white p-5 transition hover:border-brand-300">
                  <p className="text-xs font-semibold text-brand-700">Hiring report</p>
                  <h3 className="mt-2 text-[16px] font-bold leading-6 text-ink-950 group-hover:text-brand-700">{a.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-600">{a.excerpt}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                    Read <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </AppLink>
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-6 pt-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-ink-950">About these numbers</h2>
            <p className="mt-3 text-[15px] leading-7 text-ink-600">
              They describe the live jobs on MadeVisa — roles published on employers’ own career pages and by companies that post with us — refreshed every hour. Shares such as remote work or visa
              sponsorship count only jobs whose ad states it. They show where hiring is happening, not the whole labour market.
            </p>
          </div>
          <Faq
            items={[
              { q: 'How often is this updated?', a: 'Every hour. Weekly country reports are published on the blog.' },
              { q: 'Can I use these numbers?', a: 'Yes — please credit “MadeVisa job market data” with a link to this page. For custom cuts, email hello@madevisa.com.' },
              { q: 'Why is visa sponsorship so low?', a: 'Most job ads don’t mention sponsorship at all. The figure counts only ads that say they sponsor, so the real share is higher.' },
            ]}
          />
        </section>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
