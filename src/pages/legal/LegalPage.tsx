import type { View } from '@/types';
import { legalPages } from '@/data/legalContent';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { useSeo } from '@/lib/seo';

type LegalPageProps = {
  slug: string;
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

export function LegalPage({ slug, go, onAuth }: LegalPageProps) {
  const content = legalPages[slug];

  useSeo({
    title: content ? content.title : 'Page not found',
    description: content?.intro ?? `${content?.title ?? 'Legal information'} for MadeVisa.`,
    path: `/${slug}`,
  });

  if (!content) {
    return (
      <div className="min-h-screen bg-[#f8fafc]">
        <LandingHeader go={go} onAuth={onAuth} active="home" />
        <div className="mx-auto max-w-lg px-5 py-24 text-center">
          <h1 className="text-xl font-bold text-ink-900">Page not found</h1>
          <button onClick={() => go('home')} className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Back to MadeVisa
          </button>
        </div>
        <LandingFooter go={go} onAuth={onAuth} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="home" />

      <main className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-ink-950 sm:text-4xl">{content.title}</h1>
        {content.intro && <p className="mt-4 text-base leading-7 text-ink-600">{content.intro}</p>}

        <div className="mt-10 space-y-8">
          {content.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-bold text-ink-900">{section.heading}</h2>
              <div className="mt-2 space-y-3">
                {section.paragraphs.map((p, i) => (
                  <p key={i} className="text-sm leading-6 text-ink-600">{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
