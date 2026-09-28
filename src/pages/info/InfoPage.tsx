import { ArrowRight, BarChart3, Building2, CalendarCheck, CheckCircle2, ChevronDown, Gauge, Gift, Globe, Landmark, ListChecks, Lock, Plane, Radar, Scale, Search, Send, ShieldCheck, Stamp, User, X } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { nav, WRAP } from '@/lib/pageLayout';
import { handleNavClick } from '@/lib/navLink';
import { useInsights } from '@/lib/insights';
import { infoPages, type InfoBlock, type InfoIcon } from '@/data/infoContent';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';

type Props = { slug: 'about' | 'how-it-works'; go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const ICONS: Record<InfoIcon, typeof Radar> = {
  source: Radar,
  score: Gauge,
  chart: BarChart3,
  passport: Stamp,
  shield: ShieldCheck,
  calendar: CalendarCheck,
  scale: Scale,
  lock: Lock,
  gift: Gift,
  user: User,
  globe: Globe,
  building: Building2,
  landmark: Landmark,
  check: CheckCircle2,
  search: Search,
  send: Send,
  track: ListChecks,
  plane: Plane,
};

const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString());

/** Internal link that moves inside the app (new tab still works). */
export function AppLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <a href={href} className={className} onClick={(e) => handleNavClick(e, () => nav(href))}>
      {children}
    </a>
  );
}

function Block({ block }: { block: InfoBlock }) {
  if (block.kind === 'text') {
    return (
      <section className="mx-auto max-w-3xl">
        <h2 className="text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{block.heading}</h2>
        <div className="mt-4 space-y-4">
          {block.paragraphs.map((p, i) => (
            <p key={i} className="text-[16px] leading-7 text-ink-700">
              {p}
            </p>
          ))}
        </div>
      </section>
    );
  }

  if (block.kind === 'contrast') {
    return (
      <section>
        <h2 className="text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{block.heading}</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-ink-200 bg-white p-6">
            <p className="text-sm font-semibold text-ink-500">{block.before.title}</p>
            <ul className="mt-4 space-y-3">
              {block.before.points.map((p) => (
                <li key={p} className="flex gap-3 text-[15px] leading-6 text-ink-600">
                  <X className="mt-1 h-4 w-4 shrink-0 text-rose-400" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-6">
            <p className="text-sm font-semibold text-brand-700">{block.after.title}</p>
            <ul className="mt-4 space-y-3">
              {block.after.points.map((p) => (
                <li key={p} className="flex gap-3 text-[15px] leading-6 text-ink-800">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    );
  }

  if (block.kind === 'cards') {
    return (
      <section>
        <h2 className="text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{block.heading}</h2>
        {block.intro && <p className="mt-2 max-w-2xl text-[15px] leading-6 text-ink-600">{block.intro}</p>}
        <div className={`mt-6 grid gap-4 sm:grid-cols-2 ${block.items.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
          {block.items.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <div key={item.title} className="rounded-xl border border-ink-200 bg-white p-5">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-[16px] font-bold text-ink-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-600">{item.text}</p>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (block.kind === 'steps') {
    return (
      <section>
        <h2 className="text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{block.heading}</h2>
        {block.intro && <p className="mt-2 max-w-2xl text-[15px] leading-6 text-ink-600">{block.intro}</p>}
        <ol className="relative mt-8 space-y-6 before:absolute before:bottom-4 before:left-5 before:top-4 before:w-px before:bg-brand-200">
          {block.items.map((item, i) => {
            const Icon = ICONS[item.icon];
            return (
              <li key={item.title} className="relative flex gap-5">
                <span className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-700 text-white ring-4 ring-[#f8fafc]">
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <div className="rounded-xl border border-ink-200 bg-white p-5 sm:flex-1">
                  <p className="text-xs font-semibold tabular-nums text-brand-600">Step {i + 1}</p>
                  <h3 className="mt-1 text-[17px] font-bold text-ink-950">{item.title}</h3>
                  <p className="mt-2 text-[15px] leading-6 text-ink-600">{item.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  // audiences
  return (
    <section>
      <h2 className="text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{block.heading}</h2>
      {block.intro && <p className="mt-2 max-w-2xl text-[15px] leading-6 text-ink-600">{block.intro}</p>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {block.items.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <div key={item.title} className="flex flex-col rounded-xl border border-ink-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink-100 text-ink-700">
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <h3 className="text-[17px] font-bold text-ink-950">{item.title}</h3>
              </div>
              <ul className="mt-4 flex-1 space-y-2">
                {item.points.map((p) => (
                  <li key={p} className="flex gap-2.5 text-sm leading-6 text-ink-700">
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
              {item.cta && (
                <AppLink href={item.cta.href} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
                  {item.cta.label} <ArrowRight className="h-4 w-4" />
                </AppLink>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-ink-200 rounded-xl border border-ink-200 bg-white">
      {items.map((f) => (
        <details key={f.q} className="group px-5 py-4 sm:px-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-ink-900 [&::-webkit-details-marker]:hidden">
            {f.q}
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-400 transition group-open:rotate-180" aria-hidden />
          </summary>
          <p className="mt-3 text-[15px] leading-6 text-ink-600">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function InfoPage({ slug, go, onAuth }: Props) {
  const page = infoPages[slug];
  useSeo({ title: page.title, description: page.description, path: `/${slug}` });
  const { insights } = useInsights();

  const stats = insights
    ? [
        { n: fmt(insights.live_jobs), label: 'live jobs' },
        { n: fmt(insights.companies), label: 'companies hiring' },
        { n: fmt(insights.countries), label: 'countries' },
        { n: fmt(insights.new_7d), label: 'new this week' },
      ]
    : null;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />

      <section className="bg-brand-700 text-white">
        <div className={`${WRAP} py-12 sm:py-16`}>
          <p className="text-sm font-semibold text-brand-100">{page.eyebrow}</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl sm:leading-[1.1]">{page.heroTitle}</h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-7 text-brand-50/90">{page.heroSub}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <AppLink href={page.cta.primary.href} className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
              {page.cta.primary.label} <ArrowRight className="h-4 w-4" />
            </AppLink>
            {page.cta.secondary && (
              <AppLink href={page.cta.secondary.href} className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10">
                {page.cta.secondary.label}
              </AppLink>
            )}
          </div>
          {stats && (
            <dl className="mt-10 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-4 border-t border-white/15 pt-6 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd className="text-2xl font-bold tabular-nums sm:text-3xl">{s.n}</dd>
                  <p className="text-sm text-brand-100">{s.label}</p>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      <main className={`${WRAP} space-y-16 py-14 sm:space-y-20 sm:py-20`}>
        {page.blocks.map((b) => (
          <Block key={b.heading} block={b} />
        ))}

        <section className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">Questions people ask</h2>
          <div className="mt-6">
            <Faq items={page.faq} />
          </div>
        </section>

        <section className="rounded-2xl bg-ink-950 px-6 py-10 text-white sm:px-10 sm:py-12">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{page.cta.title}</h2>
              <p className="mt-2 text-[15px] leading-6 text-ink-300">{page.cta.text}</p>
            </div>
            <AppLink href={page.cta.primary.href} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-ink-950 hover:bg-ink-100">
              {page.cta.primary.label} <ArrowRight className="h-4 w-4" />
            </AppLink>
          </div>
        </section>

        <nav aria-label="More about MadeVisa" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {[
            ['/about', 'About'],
            ['/how-it-works', 'How it works'],
            ['/job-market', 'Job market insights'],
            ['/blog', 'Blog'],
            ['/companies', 'Company Scores'],
            ['/destinations', 'Visas by country'],
          ]
            .filter(([href]) => href !== `/${slug}`)
            .map(([href, label]) => (
              <AppLink key={href} href={href} className="font-medium text-brand-700 hover:underline">
                {label}
              </AppLink>
            ))}
        </nav>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
