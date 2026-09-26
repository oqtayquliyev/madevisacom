import { useEffect, useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { Briefcase, Building2, MessageSquare, Pencil, Route, Shield } from 'lucide-react';
import { Roadmap, ScoreStat, SoftCard, SoftPanel, StepFlow, TrendChart, TrendLegend, weekLabels, weeklyCounts, type RoadmapStage } from '@/components/charts/SoftCharts';
import type { View } from '@/types';
import { useAuth } from '@/lib/auth';
import { fetchPublicProfileByUsername, type PublicProfile } from '@/lib/username';
import { INTENT_LABEL, ROLE_LABEL } from '@/lib/network';
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      <div className="min-h-screen bg-white">
        <LandingHeader go={go} onAuth={onAuth} active="home" />
        <div className="mx-auto max-w-lg px-5 py-24 text-center text-sm text-ink-400">Loading…</div>
        <LandingFooter go={go} onAuth={onAuth} />
      </div>
    );
  }

  if (!profile) {
    return <NotFoundPage kind="profile" go={go} onAuth={onAuth} />;
  }

  const isVerifiedPublisher = profile.publisher_name && profile.publisher_verification_status === 'verified';
  const firstName = profile.full_name?.split(' ')[0] ?? profile.username;
  const isMe = user?.id === profile.id;

  // Figures from the applications this person chose to share.
  const DAY = DAY_MS;
  const replied = apps.filter((a) => a.responded_at);
  const interviews = apps.filter((a) => a.status === 'interview' || a.status === 'offer').length;
  const offers = apps.filter((a) => a.status === 'offer').length;
  const replyRate = apps.length ? Math.round((replied.length / apps.length) * 100) : null;
  const avgReplyDays = replied.length
    ? Math.round(replied.reduce((sum, a) => sum + (new Date(a.responded_at!).getTime() - new Date(a.applied_at).getTime()) / DAY, 0) / replied.length)
    : null;
  const companies = new Set(apps.map((a) => a.company_name ?? a.id)).size;
  const weeks = 12;
  const appliedWeekly = weeklyCounts(apps.map((a) => a.applied_at), weeks);
  const repliedWeekly = weeklyCounts(replied.map((a) => a.responded_at), weeks);

  const selected = apps.find((a) => a.id === selectedId) ?? apps[0] ?? null;

  return (
    <div className="min-h-screen bg-white text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="home" />

      <div className="relative">
        {/* Blue band behind the top of both columns */}
        <div className="absolute inset-x-0 top-0 h-[200px] bg-brand-700 lg:h-[230px]" aria-hidden="true" />

        <main className="relative mx-auto grid w-full max-w-7xl gap-8 px-5 pb-12 pt-10 sm:px-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:pt-12">
          {/* LEFT — the person */}
          <aside className="lg:sticky lg:top-[96px] lg:self-start">
            <div className="rounded-xl bg-white p-5 shadow-xl shadow-brand-900/10 ring-1 ring-ink-200">
              <div className="w-fit rounded-lg p-[3px] ring-[3px] ring-[#1D4ED8] transition-transform duration-300 hover:scale-[1.03]">
                <TravelerAvatar avatarUrl={profile.avatar_url} size={88} />
              </div>
              <h1 className="mt-4 flex items-center gap-2 text-[24px] font-bold leading-tight text-ink-950">
                <span className="min-w-0 break-words">{profile.full_name ?? profile.username}</span>
                {profile.linkedin_url && (
                  <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer me" aria-label="LinkedIn profile" className="shrink-0 transition-opacity hover:opacity-80">
                    <LinkedInLogo size={22} />
                  </a>
                )}
              </h1>
              <p className="text-[15px] text-ink-500">@{profile.username}</p>
              {profile.network_headline && <p className="mt-2 text-[15px] leading-6 text-ink-700">{profile.network_headline}</p>}
              {(profile.network_intent || profile.network_role || profile.has_sponsored) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {profile.network_intent && (
                    <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${profile.network_intent === 'hiring' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>
                      {INTENT_LABEL[profile.network_intent]}
                    </span>
                  )}
                  {profile.network_role && <span className="rounded-full bg-[#1D4ED8]/10 px-2.5 py-1 text-[12px] font-bold text-[#1D4ED8]">{ROLE_LABEL[profile.network_role]}</span>}
                  {profile.has_sponsored && (
                    <span title="Self-reported" className="rounded-full bg-ink-100 px-2.5 py-1 text-[12px] font-bold text-ink-700">
                      Has sponsored visas
                    </span>
                  )}
                </div>
              )}

              {isVerifiedPublisher && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[14px] font-semibold text-emerald-700">
                  <Shield className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    {orgTypeLabel[profile.publisher_org_type ?? ''] ?? 'Publisher'} · {profile.publisher_name}
                  </span>
                </div>
              )}

              <dl className="mt-5 space-y-3 border-t border-ink-100 pt-4 text-[15px]">
                <InfoRow icon={Briefcase} label="Applications" value={apps.length.toString()} />
                <InfoRow icon={Building2} label="Companies" value={companies.toString()} />
                <InfoRow icon={MessageSquare} label="Replies" value={replied.length.toString()} />
              </dl>

              {isMe && (
                <button
                  onClick={() => go('profile')}
                  className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2.5 text-[14px] font-semibold text-ink-700 transition-colors hover:border-[#1D4ED8]/40 hover:text-[#1D4ED8]"
                >
                  <Pencil className="h-4 w-4" />
                  Edit profile
                </button>
              )}
            </div>
          </aside>

          {/* RIGHT — data */}
          <div className="min-w-0 space-y-6">
            <div className="lg:h-[92px]">
              <h2 className="text-[26px] font-bold text-ink-950 lg:text-white">Application tracker</h2>
              <p className="mt-0.5 text-[15px] text-ink-500 lg:text-white/80">Shared by {firstName}</p>
            </div>

            <SoftPanel className="shadow-xl shadow-brand-900/5">
              <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                <ScoreStat title="Applications" value={apps.length} />
                <ScoreStat title="Reply rate" value={replyRate != null ? `${replyRate}%` : '—'} ring={replyRate} />
                <ScoreStat title="Avg. reply" value={avgReplyDays != null ? `${avgReplyDays}d` : '—'} />
                <ScoreStat title="Interviews" value={interviews} note={offers ? `${offers} offer${offers === 1 ? '' : 's'}` : undefined} />
              </div>

              {apps.length > 0 && (
                <div className="mt-6 grid gap-6 border-t border-ink-100 pt-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-[16px] font-bold text-ink-950">Activity · 3 months</h3>
                      <TrendLegend items={[{ name: 'Applied' }, { name: 'Replies', dashed: true, shade: 1 }]} />
                    </div>
                    <div className="mt-4">
                      <TrendChart
                        labels={weekLabels(weeks)}
                        height={200}
                        unit={['application', 'applications']}
                        series={[
                          { name: 'Applied', values: appliedWeekly },
                          { name: 'Replies', values: repliedWeekly, dashed: true, shade: 1 },
                        ]}
                      />
                    </div>
                  </div>
                  <SoftCard className="p-5">
                    <h3 className="mb-5 text-[16px] font-bold text-ink-950">Funnel</h3>
                    <StepFlow
                      steps={[
                        { label: 'Applied', value: String(apps.length), strength: 1 },
                        { label: 'Replied', value: String(replied.length), strength: apps.length ? replied.length / apps.length : 0 },
                        { label: 'Interview', value: String(interviews), strength: apps.length ? interviews / apps.length : 0 },
                        { label: 'Offer', value: String(offers), strength: apps.length ? offers / apps.length : 0 },
                      ]}
                    />
                  </SoftCard>
                </div>
              )}
            </SoftPanel>

            {selected && <RoadmapPanel key={selected.id} a={selected} />}

            {apps.length === 0 ? (
              <p className="rounded-xl border border-dashed border-ink-300 bg-white px-5 py-6 text-[15px] text-ink-500">
                {isMe ? 'Nothing shared yet. Turn on “Show on my public profile” for an application in your dashboard.' : `${firstName} hasn’t shared any applications yet.`}
              </p>
            ) : (
              <ul className="grid gap-3 xl:grid-cols-2">
                {apps.map((a) => (
                  <PublicAppRow key={a.id} a={a} selected={selected?.id === a.id} onSelect={() => setSelectedId(a.id)} />
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

const DAY_MS = 86_400_000;

function dayOf(a: PublicApplication) {
  const replied = Boolean(a.responded_at);
  return Math.max(0, Math.floor(((replied ? new Date(a.responded_at!).getTime() : Date.now()) - new Date(a.applied_at).getTime()) / DAY_MS));
}

/** The chosen application's journey as a big roadmap. */
function RoadmapPanel({ a }: { a: PublicApplication }) {
  const daysIn = Math.max(0, Math.floor((Date.now() - new Date(a.applied_at).getTime()) / DAY_MS));
  const replyDay = a.responded_at ? Math.max(0, Math.floor((new Date(a.responded_at).getTime() - new Date(a.applied_at).getTime()) / DAY_MS)) : null;
  const st = a.status;
  const stages: RoadmapStage[] = [{ key: 'applied', label: 'Applied', day: 0, state: 'done' }];
  if (replyDay != null) {
    if (st === 'offer') stages.push({ key: 'offer', label: 'Offer', day: replyDay, state: 'done' });
    else if (st === 'interview') {
      stages.push({ key: 'interview', label: 'Interview', day: replyDay, state: 'current' });
      stages.push({ key: 'offer', label: 'Offer', day: null, state: 'todo' });
    } else if (st === 'rejected') stages.push({ key: 'rejected', label: 'Rejected', day: replyDay, state: 'stopped' });
    else {
      stages.push({ key: 'reply', label: 'Reply', day: replyDay, state: 'current' });
      stages.push({ key: 'interview', label: 'Interview', day: null, state: 'todo' }, { key: 'offer', label: 'Offer', day: null, state: 'todo' });
    }
  } else if (st === 'no_response') {
    stages.push({ key: 'none', label: 'No reply', day: daysIn, state: 'stopped' });
  } else {
    stages.push({ key: 'wait', label: st === 'no_response_week' ? 'Still waiting' : 'Waiting', day: daysIn, state: 'current' });
    stages.push({ key: 'reply', label: 'Reply', day: null, state: 'todo' }, { key: 'interview', label: 'Interview', day: null, state: 'todo' });
  }
  const shownDay = replyDay ?? daysIn;
  return (
    <SoftPanel
      className="animate-fade-in"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <Route className="h-5 w-5 shrink-0 text-[#1D4ED8]" />
          <span className="truncate">{a.listing_title ?? 'Application'}</span>
        </span>
      }
      sub={a.company_name ?? undefined}
      right={
        <div className="text-right">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-400">{replyDay != null ? 'Replied on' : 'Day'}</p>
          <p className="text-[34px] font-bold leading-none tabular-nums text-[#1D4ED8]">{String(shownDay).padStart(2, '0')}</p>
        </div>
      }
    >
      <Roadmap stages={stages} daysIn={daysIn} />
    </SoftPanel>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Briefcase; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-ink-600">
        <Icon className="h-4 w-4 text-ink-400" /> {label}
      </dt>
      <dd className="font-semibold tabular-nums text-ink-950">{value}</dd>
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

function PublicAppRow({ a, selected, onSelect }: { a: PublicApplication; selected: boolean; onSelect: () => void }) {
  const replied = Boolean(a.responded_at);
  const day = dayOf(a);
  const caption = REPLY_LABEL[a.status] ?? 'No response yet';
  const company = a.company_name ?? 'Company';
  return (
    <li
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
      className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-4 outline-none transition duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(29,78,216,0.10)] focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${
        selected ? 'border-[#1D4ED8] ring-1 ring-[#1D4ED8]' : 'border-ink-200'
      }`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded border border-ink-100">
        {a.company_logo_url ? <img src={a.company_logo_url} alt="" className="h-full w-full object-contain p-1" /> : <Briefcase className="h-4 w-4 text-ink-300" />}
      </span>
      <div className="min-w-0 flex-1">
        <a href={applicationListingPath(a, company)} onClick={(e) => e.stopPropagation()} className="line-clamp-2 text-[15px] font-semibold text-ink-950 hover:text-[#1D4ED8]">
          {a.listing_title ?? 'Application'}
        </a>
        <p className="mt-0.5 text-[13px] text-ink-500">
          {company} · {new Date(a.applied_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-bold tabular-nums leading-none ${replied ? 'text-[#1D4ED8]' : 'text-ink-900'}`}>
          <span className="text-xs text-ink-500">Day </span>
          <span className="text-2xl">{String(day).padStart(2, '0')}</span>
        </p>
        <p className={`mt-1 text-[11px] font-semibold ${replied ? 'text-emerald-700' : 'text-amber-700'}`}>{caption}</p>
      </div>
    </li>
  );
}
