import { useEffect, useMemo, useState } from 'react';
import { ApplicationTracker } from '@/components/dashboard/ApplicationTracker';
import {
  ArrowRight,
  Briefcase,
  Compass,
  ExternalLink,
  GraduationCap,
  MapPin,
  Trash2,
} from 'lucide-react';
import type { View } from '@/types';
import { useAuth } from '@/lib/auth';
import { OriginCountryProvider, useOriginCountry } from '@/lib/originCountry';
import { getApplications, removeApplication, type SavedApplication } from '@/lib/applications';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { TravelerAvatar } from '@/components/common/TravelerAvatar';

type DashboardPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

export function DashboardPage({ go, onAuth }: DashboardPageProps) {
  return (
    <OriginCountryProvider>
      <DashboardPageInner go={go} onAuth={onAuth} />
    </OriginCountryProvider>
  );
}

function DashboardPageInner({ go, onAuth }: DashboardPageProps) {
  const { profile } = useAuth();
  const { countryCode: originCode, countryName: originName } = useOriginCountry();
  const [applications, setApplications] = useState<SavedApplication[]>([]);

  useEffect(() => {
    setApplications(getApplications());
  }, []);

  const jobs = useMemo(() => applications.filter((a) => a.kind === 'job'), [applications]);
  const programs = useMemo(() => applications.filter((a) => a.kind === 'program'), [applications]);

  // Every distinct destination the visitor has saved a job/program in —
  // used for the "your journey" overview below.
  const destinations = useMemo(() => {
    const map = new Map<string, { country: string; countryCode: string; count: number }>();
    for (const app of applications) {
      const existing = map.get(app.countryCode);
      if (existing) existing.count += 1;
      else map.set(app.countryCode, { country: app.country, countryCode: app.countryCode, count: 1 });
    }
    return Array.from(map.values());
  }, [applications]);

  const handleRemove = (app: SavedApplication) => {
    removeApplication(app.kind, app.refId);
    setApplications((current) => current.filter((a) => a.id !== app.id));
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="profile" />

      <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {profile && <TravelerAvatar seed={profile.id} avatarUrl={profile.avatar_url} size={56} />}
            <div>
              <p className="text-sm text-ink-500">Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</p>
              <h1 className="text-2xl font-bold tracking-tight text-ink-950">Your dashboard</h1>
            </div>
          </div>
          <button
            onClick={() => go('profile')}
            className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
          >
            Edit profile
          </button>
        </div>

        {/* YOUR JOURNEY: origin -> destinations overview */}
        <section className="mt-8 border border-ink-200 bg-white p-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand-600">
            <Compass className="h-4 w-4" />
            Your journey
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2">
              <MapPin className="h-4 w-4 text-ink-400" />
              <span className="text-xs text-ink-500">Currently in</span>
              {originCode ? (
                <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                  <CircleFlag countryCode={originCode} label={originName ?? undefined} size={18} />
                  {originName}
                </span>
              ) : (
                <span className="text-sm text-ink-400">Not detected</span>
              )}
            </div>

            {destinations.length > 0 && (
              <>
                <ArrowRight className="h-4 w-4 text-ink-300" />
                <div className="flex flex-wrap gap-2">
                  {destinations.map((d) => (
                    <span
                      key={d.countryCode}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700"
                    >
                      <CircleFlag countryCode={d.countryCode} label={d.country} size={18} />
                      {d.country}
                      {d.count > 1 && <span className="text-xs font-normal text-brand-500">×{d.count}</span>}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {destinations.length === 0 && (
            <p className="mt-3 text-xs text-ink-400">
              Save a job or program below and its destination will show up here.
            </p>
          )}
        </section>

        <ApplicationTracker />

        {/* SAVED JOBS */}
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-ink-400" />
              <h2 className="text-lg font-bold text-ink-950">Saved jobs</h2>
              <span className="text-xs text-ink-400">({jobs.length})</span>
            </div>
            <button onClick={() => go('jobs')} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              Browse more jobs
            </button>
          </div>

          {jobs.length === 0 ? (
            <EmptyState label="No saved jobs yet" cta="Browse jobs" onClick={() => go('jobs')} />
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {jobs.map((job) => (
                <SavedCard key={job.id} item={job} onRemove={() => handleRemove(job)} />
              ))}
            </div>
          )}
        </section>

        {/* SAVED PROGRAMS */}
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-ink-400" />
              <h2 className="text-lg font-bold text-ink-950">Saved programs</h2>
              <span className="text-xs text-ink-400">({programs.length})</span>
            </div>
            <button onClick={() => go('programs')} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              Browse more programs
            </button>
          </div>

          {programs.length === 0 ? (
            <EmptyState label="No saved programs yet" cta="Browse programs" onClick={() => go('programs')} />
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {programs.map((program) => (
                <SavedCard key={program.id} item={program} onRemove={() => handleRemove(program)} />
              ))}
            </div>
          )}
        </section>

        <p className="mt-10 text-[11px] text-ink-400">
          Saved items are kept on this device only. Sign in from another device and they won't follow yet — ask
          about turning this into an account-wide list if you'd like that.
        </p>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function SavedCard({ item, onRemove }: { item: SavedApplication; onRemove: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border border-ink-200 bg-white p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-ink-400">
          <CircleFlag countryCode={item.countryCode} label={item.country} size={14} />
          {item.country}
        </div>
        <h3 className="mt-1 truncate text-sm font-bold text-ink-900">{item.title}</h3>
        <p className="truncate text-xs text-ink-500">{item.organization}</p>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            View original
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <button
        onClick={onRemove}
        aria-label="Remove"
        className="shrink-0 rounded-lg p-1.5 text-ink-300 hover:bg-rose-50 hover:text-rose-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function EmptyState({ label, cta, onClick }: { label: string; cta: string; onClick: () => void }) {
  return (
    <div className="mt-4 flex flex-col items-center gap-3 border border-dashed border-ink-200 bg-white px-6 py-10 text-center">
      <p className="text-sm text-ink-500">{label}</p>
      <button onClick={onClick} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">
        {cta}
      </button>
    </div>
  );
}
