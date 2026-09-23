import { useMemo, useState } from 'react';
import { Bookmark, BookmarkCheck, ExternalLink, Landmark, Megaphone, Search } from 'lucide-react';
import type { View } from '@/types';
import { destinationInfo } from '@/data/destinationInfo';
import { isApplied, markApplied, removeApplication, type ApplicationKind } from '@/lib/applications';
import { useSeo } from '@/lib/seo';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';

type DestinationsPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

export function DestinationsPage({ go, onAuth }: DestinationsPageProps) {
  useSeo({
    title: 'Destinations — Official Immigration Portals by Country',
    description: 'Official government and ministry immigration portals for popular destinations — verified sources, not third-party guesswork.',
    path: '/destinations',
  });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return destinationInfo;
    return destinationInfo.filter(
      (d) => d.countryName.toLowerCase().includes(q) || d.region.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="destinations" />

      <section className="border-b border-ink-200 bg-white px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-semibold text-brand-600">Where you can go</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-[-0.03em] text-ink-950 sm:text-5xl">
            Destinations.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-ink-500">
            Official government and ministry immigration portals for popular destinations — verified sources, not
            third-party guesswork.
          </p>

          <div className="mt-8 flex h-12 max-w-md items-center gap-2 rounded-lg border border-ink-200 bg-white px-3">
            <Search className="h-4 w-4 shrink-0 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country or region"
              className="h-full w-full bg-transparent text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400"
            />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((dest) => (
            <article key={dest.countryCode} className="flex flex-col border border-ink-200 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg">
              <div className="flex items-center gap-3">
                <CircleFlag countryCode={dest.countryCode} label={dest.countryName} size={36} />
                <div>
                  <h3 className="text-base font-bold text-ink-950">{dest.countryName}</h3>
                  <p className="text-xs text-ink-400">{dest.region}</p>
                </div>
              </div>

              <p className="mt-3 flex-1 text-sm leading-6 text-ink-500">{dest.blurb}</p>

              <div className="mt-4 space-y-2 border-t border-ink-100 pt-4">
                {dest.officialLinks.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1">{link.label}</span>
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                  </a>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-2">
                <SaveButton
                  kind="destination"
                  refId={dest.countryCode}
                  title={dest.countryName}
                  organization={dest.region}
                  country={dest.countryName}
                  countryCode={dest.countryCode}
                />
                <button
                  onClick={() => go('sponsored-programs')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink-50 px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-100"
                >
                  <Megaphone className="h-3.5 w-3.5" />
                  View sponsored programs
                </button>
              </div>
            </article>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="border border-ink-200 bg-white px-6 py-16 text-center">
            <Search className="mx-auto h-8 w-8 text-ink-300" />
            <h3 className="mt-4 text-lg font-bold text-ink-900">No destinations found</h3>
            <p className="mt-2 text-sm text-ink-500">Try a different country or region.</p>
          </div>
        )}

        <div className="mt-10 flex items-start gap-2 rounded-lg bg-ink-50 px-4 py-3 text-xs text-ink-500">
          <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
          Links above go directly to official government sources. MadeVisa doesn't process visas on your behalf —
          use a listed{' '}
          <button onClick={() => go('agencies')} className="font-semibold text-brand-600 hover:text-brand-700">
            verified expert or agency
          </button>{' '}
          if you'd like hands-on help with your application.
        </div>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function SaveButton({
  kind,
  refId,
  title,
  organization,
  country,
  countryCode,
  url,
}: {
  kind: ApplicationKind;
  refId: string;
  title: string;
  organization: string;
  country: string;
  countryCode: string;
  url?: string;
}) {
  const [saved, setSaved] = useState(() => isApplied(kind, refId));

  return (
    <button
      type="button"
      onClick={() => {
        if (saved) {
          removeApplication(kind, refId);
        } else {
          markApplied({ kind, refId, title, organization, country, countryCode, url });
        }
        setSaved(!saved);
      }}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
        saved ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-ink-200 text-ink-500 hover:bg-ink-50'
      }`}
    >
      {saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
      {saved ? 'Saved' : 'Save'}
    </button>
  );
}
