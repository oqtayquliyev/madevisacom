import { useEffect, useState } from 'react';
import { Briefcase, Pencil, Shield } from 'lucide-react';
import type { View } from '@/types';
import { useAuth } from '@/lib/auth';
import { fetchPublicProfileByUsername, type PublicProfile } from '@/lib/username';
import { TravelerAvatar } from '@/components/common/TravelerAvatar';
import { LinkedInLogo } from '@/components/common/LinkedInLogo';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { useSeo } from '@/lib/seo';
import { applicationListingPath, fetchPublicApplications, type PublicApplication } from '@/lib/companies';

const orgTypeLabel: Record<string, string> = {
  agency: 'Agency',
  company: 'Company',
  government: 'Government institution',
  expert: 'Independent expert',
};

export function PublicProfilePage({ username, go, onAuth }: { username: string; go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void }) {
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [apps, setApps] = useState<PublicApplication[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    fetchPublicProfileByUsername(username).then(setProfile);
    fetchPublicApplications(username).then(setApps);
  }, [username]);

  useSeo({
    title: profile ? `${profile.full_name ?? profile.username} on MadeVisa` : 'Profile',
    description: profile ? `View ${profile.full_name ?? profile.username}'s MadeVisa profile.` : 'MadeVisa profile.',
    path: `/u/${username}`,
    noindex: !profile,
  });

  if (profile === undefined) {
    return (
      <div className="min-h-screen bg-[#f8fafc]">
        <LandingHeader go={go} onAuth={onAuth} active="home" />
        <div className="mx-auto max-w-lg px-5 py-24 text-center text-sm text-ink-400">Loading…</div>
        <LandingFooter go={go} onAuth={onAuth} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#f8fafc]">
        <LandingHeader go={go} onAuth={onAuth} active="home" />
        <div className="mx-auto max-w-lg px-5 py-24 text-center">
          <h1 className="text-xl font-bold text-ink-900">Profile not found</h1>
          <p className="mt-2 text-sm text-ink-500">There's no MadeVisa profile at this link.</p>
          <button onClick={() => go('home')} className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Back to MadeVisa
          </button>
        </div>
        <LandingFooter go={go} onAuth={onAuth} />
      </div>
    );
  }

  const isVerifiedPublisher = profile.publisher_name && profile.publisher_verification_status === 'verified';

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="home" />

      <main className="mx-auto max-w-2xl px-5 py-14 sm:px-8">
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-white">
          <div className="h-24 bg-gradient-to-r from-brand-600 via-indigo-600 to-brand-700" />
          <div className="px-6 pb-6">
            <div className="-mt-10 w-fit rounded-md bg-white p-1 shadow-md">
              <TravelerAvatar avatarUrl={profile.avatar_url} size={80} />
            </div>

            <h1 className="mt-3 flex items-center gap-2 text-xl font-bold text-ink-950">
              {profile.full_name ?? profile.username}
              {profile.linkedin_url && (
                <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer me" aria-label="LinkedIn profile" className="transition-opacity hover:opacity-80">
                  <LinkedInLogo size={22} />
                </a>
              )}
            </h1>
            <p className="text-sm text-ink-400">@{profile.username}</p>

            {user?.id === profile.id && (
              <button
                onClick={() => go('profile')}
                className="mt-3 flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit profile
              </button>
            )}

            {isVerifiedPublisher && (
              <div className="mt-3 flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                <Shield className="h-4 w-4" />
                {orgTypeLabel[profile.publisher_org_type ?? ''] ?? 'Publisher'} · {profile.publisher_name}
              </div>
            )}
          </div>
        </div>

        {(apps.length > 0 || user?.id === profile.id) && (
          <section className="mt-6">
            <h2 className="text-base font-bold text-ink-950">Application tracker</h2>
            <p className="mt-0.5 text-xs text-ink-500">Applications {profile.full_name?.split(' ')[0] ?? profile.username} chose to share, and whether the company replied.</p>
            {apps.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-ink-300 bg-white px-4 py-5 text-sm text-ink-500">
                Nothing shared yet. Turn on “Show on my public profile” for an application in your dashboard to show it here.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {apps.map((a) => (
                  <PublicAppRow key={a.id} a={a} />
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

const REPLY_LABEL: Record<string, string> = {
  responded: 'Got a reply',
  viewed: 'Got a reply',
  interview: 'Interview invite',
  offer: 'Interview invite',
  rejected: 'Rejection email',
  no_response_week: 'No reply in week 1',
  no_response: 'Never heard back',
};

function PublicAppRow({ a }: { a: PublicApplication }) {
  const DAY = 86_400_000;
  const replied = Boolean(a.responded_at);
  const day = Math.max(0, Math.floor(((replied ? new Date(a.responded_at!).getTime() : Date.now()) - new Date(a.applied_at).getTime()) / DAY));
  const caption = REPLY_LABEL[a.status] ?? 'No response yet';
  const company = a.company_name ?? 'Company';
  return (
    <li className={`flex items-center gap-3 rounded-md border bg-white p-3.5 ${replied ? 'border-emerald-300' : 'border-ink-200'}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded border border-ink-100">
        {a.company_logo_url ? <img src={a.company_logo_url} alt="" className="h-full w-full object-contain p-1" /> : <Briefcase className="h-4 w-4 text-ink-300" />}
      </span>
      <div className="min-w-0 flex-1">
        <a href={applicationListingPath(a, company)} className="line-clamp-2 text-sm font-bold text-ink-950 hover:text-[#2563EB]">
          {a.listing_title ?? 'Application'}
        </a>
        <p className="text-xs text-ink-500">
          {company} · applied {new Date(a.applied_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-slab font-bold tabular-nums leading-none ${replied ? 'text-emerald-700' : 'text-ink-900'}`}>
          <span className="text-xs text-ink-500">Day </span>
          <span className="text-2xl">{String(day).padStart(2, '0')}</span>
        </p>
        <p className={`mt-1 text-[11px] font-semibold ${replied ? 'text-emerald-700' : 'text-amber-700'}`}>{caption}</p>
      </div>
    </li>
  );
}
