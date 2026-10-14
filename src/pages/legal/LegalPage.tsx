import { ArrowRight, Mail, MapPin, Phone } from 'lucide-react';
import type { View } from '@/types';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { legalPages, LEGAL_LAST_UPDATED } from '@/data/legalContent';
import { CONTACT } from '@/lib/contact';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { useSeo } from '@/lib/seo';
import { slugify } from '@/lib/jobUrl';
import { AppLink, Faq } from '@/pages/info/InfoPage';

type LegalPageProps = {
  slug: string;
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

export function LegalPage({ slug, go, onAuth }: LegalPageProps) {
  const content = legalPages[slug];

  useSeo({
    title: content ? content.title : 'Page not found',
    description: content?.description ?? 'MadeVisa policies.',
    path: `/${slug}`,
    noindex: !content,
  });

  if (!content) return <NotFoundPage go={go} onAuth={onAuth} />;

  const anchor = (h: string) => slugify(h.replace(/^\d+\.\s*/, ''), 60);
  const showToc = content.sections.length >= 5;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />

      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
          <p className="text-sm font-semibold text-brand-700">MadeVisa policies</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink-950 sm:text-4xl">{content.title}</h1>
          <p className="mt-3 max-w-2xl text-[16px] leading-7 text-ink-600">{content.intro ?? content.description}</p>
          <p className="mt-3 text-xs text-ink-400">Last updated {LEGAL_LAST_UPDATED}</p>
        </div>
      </header>

      <div className={`mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14 ${showToc ? 'lg:grid lg:grid-cols-[220px_1fr] lg:gap-12' : ''}`}>
        {showToc && (
          <nav aria-label="On this page" className="mb-8 lg:mb-0">
            <div className="lg:sticky lg:top-24">
              <p className="text-xs font-semibold text-ink-500">On this page</p>
              <ol className="mt-3 space-y-1.5 border-l border-ink-200 text-sm">
                {content.sections.map((s) => (
                  <li key={s.heading}>
                    <a href={`#${anchor(s.heading)}`} className="-ml-px block border-l border-transparent pl-3 text-ink-600 hover:border-brand-500 hover:text-brand-700">
                      {s.heading.replace(/^\d+\.\s*/, '')}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        )}

        <main className="max-w-3xl">
          {content.slug === 'contact' && (
            <address className="mb-6 grid gap-3 rounded-xl border border-ink-200 bg-white p-5 not-italic sm:grid-cols-3 sm:p-6">
              <span className="flex items-start gap-2.5 text-[15px] leading-6 text-ink-800">
                <MapPin className="mt-1 h-4 w-4 shrink-0 text-brand-600" aria-hidden /> {CONTACT.address}
              </span>
              <a href={`tel:${CONTACT.tel}`} className="flex items-start gap-2.5 text-[15px] font-semibold leading-6 text-brand-700 hover:underline">
                <Phone className="mt-1 h-4 w-4 shrink-0" aria-hidden /> {CONTACT.phone}
              </a>
              <a href={`mailto:${CONTACT.email}`} className="flex items-start gap-2.5 text-[15px] font-semibold leading-6 text-brand-700 hover:underline">
                <Mail className="mt-1 h-4 w-4 shrink-0" aria-hidden /> {CONTACT.email}
              </a>
            </address>
          )}
          {content.summary && (
            <section className="rounded-xl border border-brand-200 bg-brand-50/60 p-5 sm:p-6">
              <h2 className="text-sm font-bold text-brand-800">At a glance</h2>
              <ul className="mt-3 space-y-2">
                {content.summary.map((s) => (
                  <li key={s} className="flex gap-2.5 text-[15px] leading-6 text-ink-800">
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden />
                    {s}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-10 space-y-10">
            {content.sections.map((section) => (
              <section key={section.heading} id={anchor(section.heading)} className="scroll-mt-24">
                <h2 className="text-xl font-bold text-ink-950">{section.heading}</h2>
                <div className="mt-3 space-y-3">
                  {section.paragraphs.map((p, i) => (
                    <p key={i} className="text-[15px] leading-7 text-ink-700">
                      {p}
                    </p>
                  ))}
                  {section.bullets && (
                    <ul className="space-y-2.5">
                      {section.bullets.map((b) => (
                        <li key={b} className="flex gap-3 text-[15px] leading-7 text-ink-700">
                          <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-400" aria-hidden />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            ))}
          </div>

          {content.faq && (
            <section className="mt-12">
              <h2 className="text-xl font-bold text-ink-950">Common questions</h2>
              <div className="mt-4">
                <Faq items={content.faq} />
              </div>
            </section>
          )}

          <section className="mt-12 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center rounded-xl border border-ink-200 bg-white p-5 sm:p-6">
            <div>
              <p className="font-semibold text-ink-950">Questions about this page?</p>
              <p className="mt-1 text-sm text-ink-600">We reply on working days.</p>
            </div>
            <a href="mailto:hello@madevisa.com" className="inline-flex items-center gap-2 rounded-lg bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-800">
              <Mail className="h-4 w-4" /> hello@madevisa.com
            </a>
          </section>

          {content.related && content.related.length > 0 && (
            <section className="mt-10">
              <h2 className="text-sm font-semibold text-ink-500">Related</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {content.related
                  .map((r) => legalPages[r])
                  .filter(Boolean)
                  .map((r) => (
                    <AppLink key={r.slug} href={`/${r.slug}`} className="group rounded-lg border border-ink-200 bg-white p-4 hover:border-brand-300">
                      <p className="flex items-center justify-between text-sm font-semibold text-ink-900 group-hover:text-brand-700">
                        {r.title} <ArrowRight className="h-3.5 w-3.5" />
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-500">{r.description}</p>
                    </AppLink>
                  ))}
              </div>
            </section>
          )}
        </main>
      </div>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
