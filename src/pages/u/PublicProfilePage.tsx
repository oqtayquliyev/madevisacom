import { useEffect, useState } from 'react';
import { Pencil, Shield, UserRound } from 'lucide-react';
import type { View } from '@/types';
import { useAuth } from '@/lib/auth';
import { fetchPublicProfileByUsername, type PublicProfile } from '@/lib/username';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { useSeo } from '@/lib/seo';

const orgTypeLabel: Record<string, string> = {
  agency: 'Agency',
  company: 'Company',
  government: 'Government institution',
  expert: 'Independent expert',
};

export function PublicProfilePage({ username, go, onAuth }: { username: string; go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void }) {
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const { user } = useAuth();

  useEffect(() => {
    fetchPublicProfileByUsername(username).then(setProfile);
  }, [username]);

  useSeo({
    title: profile ? `${profile.full_name ?? profile.username} on MadeVisa` : 'Profile',
    description: profile ? `View ${profile.full_name ?? profile.username}'s MadeVisa profile.` : 'MadeVisa profile.',
    path: `/u/${username}`,
    noindex: !profile,
  });

  if (profile === undefined) {
    return (
      <div className="min-h-screen bg-[#f8fafc] dark:bg-ink-950">
        <LandingHeader go={go} onAuth={onAuth} active="home" />
        <div className="mx-auto max-w-lg px-5 py-24 text-center text-sm text-ink-400">Loading…</div>
        <LandingFooter go={go} onAuth={onAuth} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#f8fafc] dark:bg-ink-950">
        <LandingHeader go={go} onAuth={onAuth} active="home" />
        <div className="mx-auto max-w-lg px-5 py-24 text-center">
          <h1 className="text-xl font-bold text-ink-900 dark:text-ink-50">Profile not found</h1>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">There's no MadeVisa profile at this link.</p>
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
    <div className="min-h-screen bg-[#f8fafc] dark:bg-ink-950 text-ink-900 dark:text-ink-50">
      <LandingHeader go={go} onAuth={onAuth} active="home" />

      <main className="mx-auto max-w-2xl px-5 py-14 sm:px-8">
        <div className="overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900">
          <div className="h-24 bg-gradient-to-r from-brand-600 via-indigo-600 to-brand-700" />
          <div className="px-6 pb-6">
            <div className="-mt-10 rounded-full bg-white dark:bg-ink-900 p-1 shadow-md w-fit">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <span className="grid h-20 w-20 place-items-center rounded-full bg-ink-100 dark:bg-ink-800 text-ink-400">
                  <UserRound className="h-8 w-8" />
                </span>
              )}
            </div>

            <h1 className="mt-3 text-xl font-bold text-ink-950 dark:text-ink-50">{profile.full_name ?? profile.username}</h1>
            <p className="text-sm text-ink-400">@{profile.username}</p>

            {user?.id === profile.id && (
              <button
                onClick={() => go('profile')}
                className="mt-3 flex items-center gap-1.5 rounded-lg border border-ink-200 dark:border-ink-700 px-3 py-1.5 text-xs font-semibold text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-800"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit profile
              </button>
            )}

            {isVerifiedPublisher && (
              <div className="mt-3 flex items-center gap-1.5 rounded-md bg-emerald-50 dark:bg-emerald-900/30 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                <Shield className="h-4 w-4" />
                {orgTypeLabel[profile.publisher_org_type ?? ''] ?? 'Publisher'} · {profile.publisher_name}
              </div>
            )}
          </div>
        </div>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
