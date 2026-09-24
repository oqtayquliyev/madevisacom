import { useEffect, useMemo, useRef, useState } from 'react';
import { ApplicationTracker } from '@/components/dashboard/ApplicationTracker';
import { jobPath } from '@/lib/jobUrl';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Briefcase,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  Copy,
  Compass,
  Download,
  ExternalLink,
  GraduationCap,
  Landmark,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Plus,
  Save,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Trash2,
  UserRound,
  Users2,
  X,
} from 'lucide-react';
import { useAuth, type Profile } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  createPublisherProfile,
  fetchMyPrograms,
  fetchMyPublisherProfile,
  resubmitPublisherProfile,
  updateMyProgram,
  PUBLISHING_CONTACT_EMAIL,
  type OrgType,
  type ProgramPublisher,
  type SponsoredProgram,
} from '@/lib/programs';
import { fetchMySponsoredJobs, updateMySponsoredJob, type SponsoredJob } from '@/lib/sponsoredJobs';
import { getRecentlyViewedJobs, type ViewedJobSnapshot } from '@/lib/viewedJobs';
import { uploadListingImage } from '@/lib/uploadImage';
import { deleteMyAccount } from '@/lib/accountDeletion';
import { OriginCountryProvider, useOriginCountry } from '@/lib/originCountry';
import {
  getApplications,
  removeApplication,
  type SavedApplication,
} from '@/lib/applications';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { TravelerAvatar } from '@/components/common/TravelerAvatar';
import { PhoneInput } from '@/components/common/PhoneInput';
import { ImageUploadField } from '@/components/common/ImageUploadField';
import { useSeo } from '@/lib/seo';
import { isUsernameAvailable, suggestUsername, updateMyUsername } from '@/lib/username';
import type { View } from '@/types';

type ProfilePageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

type CountryOption = { id: string; name: string; flag_emoji: string | null; iso_code: string };
type Tab = 'overview' | 'journey' | 'saved' | 'partner' | 'settings';

const inputClass =
  'h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const textareaClass =
  'w-full rounded-lg border border-ink-200 bg-white p-3 text-sm font-medium text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const labelClass = 'mb-1.5 block text-xs font-semibold text-ink-500';

const orgTypeLabel: Record<OrgType, string> = {
  agency: 'Agency',
  company: 'Company',
  government: 'Government',
  expert: 'Independent expert',
};

const orgTypeIcon: Record<OrgType, typeof Building2> = {
  agency: Building2,
  company: Building2,
  government: Landmark,
  expert: UserRound,
};

const statusCopy: Record<ProgramPublisher['verification_status'], { label: string; className: string }> = {
  pending: { label: 'Pending review', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  verified: { label: 'Verified', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Not approved', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  suspended: { label: 'Suspended', className: 'bg-ink-100 text-ink-500 border-ink-200' },
};

export function ProfilePage({ go, onAuth }: ProfilePageProps) {
  return (
    <OriginCountryProvider>
      <ProfilePageInner go={go} onAuth={onAuth} />
    </OriginCountryProvider>
  );
}

function ProfilePageInner({ go, onAuth }: ProfilePageProps) {
  useSeo({ title: 'Your profile', description: 'Manage your MadeVisa profile.', path: '/profile', noindex: true });

  const { user, profile, refreshProfile } = useAuth();
  const { countryCode: originCode, countryName: originName } = useOriginCountry();

  const [tab, setTab] = useState<Tab>(() => {
    // Deep link: /profile?tab=saved (e.g. from a company page's "report back" link)
    const t = new URLSearchParams(window.location.search).get('tab');
    return t === 'saved' || t === 'journey' || t === 'partner' || t === 'settings' ? t : 'overview';
  });
  const [countries, setCountries] = useState<CountryOption[]>([]);

  // Personal info form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryId, setCountryId] = useState('');
  const [nationalityId, setNationalityId] = useState('');
  const [languagesText, setLanguagesText] = useState('');
  const [occupation, setOccupation] = useState('');
  const [education, setEducation] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [experience, setExperience] = useState('');
  const [preferredDestinationId, setPreferredDestinationId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const [publisher, setPublisher] = useState<ProgramPublisher | null>(null);
  const [publisherLoading, setPublisherLoading] = useState(true);

  const [applications, setApplications] = useState<SavedApplication[]>([]);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchMyPublisherProfile(user.id).then((p) => {
      setPublisher(p);
      setPublisherLoading(false);
    });
  }, [user]);

  useEffect(() => {
    supabase.from('countries').select('id, name, flag_emoji, iso_code').order('name').then(({ data }) => {
      if (data) setCountries(data as CountryOption[]);
    });
  }, []);

  useEffect(() => {
    setApplications(getApplications());
  }, []);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? '');
    setPhone(profile.phone ?? '');
    setCountryId(profile.country_id ?? '');
    setNationalityId(profile.nationality_country_id ?? '');
    setLanguagesText((profile.languages ?? []).join(', '));
    setOccupation(profile.occupation ?? '');
    setEducation(profile.education ?? '');
    setSpecialization(profile.specialization ?? '');
    setExperience(profile.experience ?? '');
    setPreferredDestinationId(profile.preferred_destination_country_id ?? '');
  }, [profile]);

  const jobs = useMemo(() => applications.filter((a) => a.kind === 'job'), [applications]);
  const programs = useMemo(() => applications.filter((a) => a.kind === 'program'), [applications]);
  const savedAgencies = useMemo(() => applications.filter((a) => a.kind === 'agency'), [applications]);
  const savedExperts = useMemo(() => applications.filter((a) => a.kind === 'expert'), [applications]);
  const savedDestinations = useMemo(() => applications.filter((a) => a.kind === 'destination'), [applications]);

  // Client-only, same as "Saved" — reads straight from localStorage,
  // loaded once on mount since the tab switch itself doesn't remount
  // this component.
  const [recentlyViewedJobs, setRecentlyViewedJobs] = useState<ViewedJobSnapshot[]>([]);
  useEffect(() => {
    setRecentlyViewedJobs(getRecentlyViewedJobs());
  }, []);

  const journeyDestinations = useMemo(() => {
    const map = new Map<string, { country: string; countryCode: string; count: number }>();
    for (const app of applications) {
      if (!app.countryCode) continue;
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

  if (!profile) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8fafc]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const residenceCountry = countries.find((c) => c.id === countryId);
  const isEmailConfirmed = Boolean(user?.email_confirmed_at);

  // Profile completion — a fixed, honest set of fields; no invented weighting.
  const completionFields = [
    Boolean(fullName),
    Boolean(phone),
    Boolean(countryId),
    Boolean(nationalityId),
    Boolean(profile.avatar_url),
    Boolean(occupation),
    Boolean(education),
    Boolean(specialization),
    Boolean(languagesText.trim()),
    Boolean(preferredDestinationId),
  ];
  const completionPct = Math.round((completionFields.filter(Boolean).length / completionFields.length) * 100);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    const languages = languagesText
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        phone: phone || null,
        country_id: countryId || null,
        nationality_country_id: nationalityId || null,
        languages: languages.length ? languages : null,
        occupation: occupation || null,
        education: education || null,
        specialization: specialization || null,
        experience: experience || null,
        preferred_destination_country_id: preferredDestinationId || null,
      })
      .eq('id', profile.id);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    await refreshProfile();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleResendConfirmation = async () => {
    if (!profile.email) return;
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: profile.email });
    setResending(false);
    if (!error) {
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    }
  };

  const handleAvatarFile = async (file: File) => {
    if (!user) return;
    setAvatarUploading(true);
    setAvatarError(null);
    const result = await uploadListingImage(file, user.id);
    if (!result.url) {
      setAvatarUploading(false);
      setAvatarError(result.error ?? 'Upload failed — please try again.');
      return; // keep existing photo on failure
    }
    // Only touch the DB once the new photo is confirmed uploaded.
    const { error } = await supabase.from('profiles').update({ avatar_url: result.url }).eq('id', profile.id);
    setAvatarUploading(false);
    if (error) {
      setAvatarError(error.message);
      return;
    }
    await refreshProfile();
  };

  const handleRemoveAvatar = async () => {
    setAvatarUploading(true);
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id);
    setAvatarUploading(false);
    if (!error) await refreshProfile();
  };

  const handleExportData = () => {
    const payload = {
      profile: {
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        occupation: profile.occupation,
        education: profile.education,
        specialization: profile.specialization,
        experience: profile.experience,
        languages: profile.languages,
      },
      savedItems: applications,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'madevisa-my-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const partnerBadge = publisher ? statusCopy[publisher.verification_status] : null;
  const profileCountry = countries.find((c) => c.id === profile.country_id);
  const canPost = publisher?.verification_status === 'verified';
  const availabilityLine = publisher
    ? `${orgTypeLabel[publisher.org_type]} · ${partnerBadge?.label ?? ''}`
    : 'Looking for opportunities abroad';

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="home" />

      <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        {/* HEADER */}
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-white">
          {/* Cover banner */}
          <div className="h-28 bg-gradient-to-r from-brand-600 via-indigo-600 to-brand-700 sm:h-36" />

          <div className="px-6 pb-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="-mt-12 flex items-end gap-4 sm:-mt-14">
                <div className="rounded-full bg-white p-1 shadow-md">
                  <TravelerAvatar seed={profile.id} avatarUrl={profile.avatar_url} size={96} />
                </div>
              </div>

              {canPost && (
                <div className="flex flex-wrap gap-2 pb-1">
                  <button
                    onClick={() => go('submit-program')}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
                  >
                    <Plus className="h-4 w-4" />
                    Post a job
                  </button>
                  <button
                    onClick={() => go('submit-program')}
                    className="flex items-center gap-1.5 rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-ink-800"
                  >
                    <Plus className="h-4 w-4" />
                    Post a program
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-ink-950">{profile.full_name || 'Your profile'}</h1>
                  {isEmailConfirmed && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      Verified
                    </span>
                  )}
                  {partnerBadge && (
                    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${partnerBadge.className}`}>
                      {orgTypeLabel[publisher!.org_type]} · {partnerBadge.label}
                    </span>
                  )}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-brand-700">
                  <Shield className="h-4 w-4" />
                  {availabilityLine}
                </p>

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-600">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-ink-400" />
                    {profileCountry?.name ?? 'Add your location'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4 text-ink-400" />
                    {profile.occupation || 'Add your occupation'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <button
                  onClick={() => setTab('settings')}
                  className="rounded-lg border border-ink-200 px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
                >
                  Edit profile
                </button>
                <div className="flex items-center gap-2 text-[11px] text-ink-400">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${completionPct}%` }} />
                  </div>
                  {completionPct}% complete
                </div>
              </div>
            </div>

            {/* Soft info card */}
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-ink-50 px-4 py-3 text-xs text-ink-600">
              <span><span className="font-semibold text-ink-800">Education:</span> {profile.education || '—'}</span>
              <span><span className="font-semibold text-ink-800">Specialization:</span> {profile.specialization || '—'}</span>
              <span><span className="font-semibold text-ink-800">Languages:</span> {profile.languages?.length ? profile.languages.join(', ') : '—'}</span>
            </div>
          </div>
        </div>

        {!isEmailConfirmed && (
          <div className="mt-4 flex items-start gap-3 border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900">Email not confirmed</p>
              <p className="mt-1 text-xs leading-5 text-amber-700">
                We sent a confirmation link to {profile.email}. Some features may be limited until you confirm it.
              </p>
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={resending}
                className="mt-2 text-xs font-semibold text-amber-800 underline hover:text-amber-900 disabled:opacity-50"
              >
                {resent ? 'Sent — check your inbox' : resending ? 'Sending…' : 'Resend confirmation email'}
              </button>
            </div>
          </div>
        )}

        {/* TABS */}
        <div className="mt-6 flex flex-wrap gap-2 border-b border-ink-200 pb-3">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={Sparkles} label="Overview" />
          <TabButton active={tab === 'journey'} onClick={() => setTab('journey')} icon={Compass} label="My journey" />
          <TabButton
            active={tab === 'saved'}
            onClick={() => setTab('saved')}
            icon={Briefcase}
            label={`Applications & saved (${applications.length})`}
          />
          <TabButton
            active={tab === 'partner'}
            onClick={() => setTab('partner')}
            icon={Award}
            label={publisher ? 'Partner workspace' : 'Become a partner'}
          />
          <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} icon={SettingsIcon} label="Settings" />
        </div>

        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <SummaryCard
              icon={Briefcase}
              title="Saved items"
              value={String(applications.length)}
              detail={`${jobs.length} jobs · ${programs.length} programs · ${savedAgencies.length + savedExperts.length} experts/agencies`}
              onClick={() => setTab('saved')}
            />
            <SummaryCard
              icon={Compass}
              title="Your journey"
              value={originName ?? 'Not detected'}
              detail={journeyDestinations.length > 0 ? `Exploring ${journeyDestinations.length} destination${journeyDestinations.length === 1 ? '' : 's'}` : 'Save something to start your journey'}
              onClick={() => setTab('journey')}
            />
            <SummaryCard
              icon={Award}
              title={publisher ? 'Partner status' : 'Become a partner'}
              value={publisher ? statusCopy[publisher.verification_status].label : 'Not applied'}
              detail={publisher ? orgTypeLabel[publisher.org_type] : 'Publish jobs, programs, or list as an expert'}
              onClick={() => setTab('partner')}
            />
            <SummaryCard
              icon={UserRound}
              title="Profile completion"
              value={`${completionPct}%`}
              detail={completionPct < 100 ? 'Fill in more details in Settings' : "You're all set"}
              onClick={() => setTab('settings')}
            />
          </div>
        )}

        {/* JOURNEY */}
        {tab === 'journey' && (
          <section className="mt-6 border border-ink-200 bg-white p-6">
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
                    <CircleFlagInline countryCode={originCode} />
                    {originName}
                  </span>
                ) : (
                  <span className="text-sm text-ink-400">Not detected</span>
                )}
              </div>

              {journeyDestinations.length > 0 && (
                <>
                  <ArrowRight className="h-4 w-4 text-ink-300" />
                  <div className="flex flex-wrap gap-2">
                    {journeyDestinations.map((d) => (
                      <span
                        key={d.countryCode}
                        className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700"
                      >
                        <CircleFlagInline countryCode={d.countryCode} />
                        {d.country}
                        {d.count > 1 && <span className="text-xs font-normal text-brand-500">×{d.count}</span>}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {journeyDestinations.length === 0 && (
              <p className="mt-3 text-xs text-ink-400">Save a job, program or destination and it'll show up here.</p>
            )}

            <div className="mt-6 border-t border-ink-100 pt-5">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Your path</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {['Discover', 'Compare', 'Choose', 'Apply', 'Prepare', 'Move'].map((stage, i) => (
                  <div key={stage} className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1.5 font-semibold ${
                        i === 0 ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-400'
                      }`}
                    >
                      {stage}
                    </span>
                    {i < 5 && <ArrowRight className="h-3 w-3 text-ink-300" />}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-ink-400">
                Full journey tracking (documents, deadlines, next steps) is on the roadmap — this shows where the
                feature is headed.
              </p>
            </div>
          </section>
        )}

        {/* SAVED */}
        {tab === 'saved' && (
          <div className="mt-6 space-y-10">
            {/* Applications started through MadeVisa — updating the outcome here builds company response stats */}
            <ApplicationTracker />
            <SavedSection
              icon={Briefcase}
              title="Saved jobs"
              items={jobs}
              emptyLabel="No saved jobs yet"
              cta="Browse jobs"
              onBrowse={() => go('jobs')}
              onRemove={handleRemove}
            />
            <RecentlyViewedSection items={recentlyViewedJobs} onBrowse={() => go('jobs')} />
            <SavedSection
              icon={GraduationCap}
              title="Saved programs"
              items={programs}
              emptyLabel="No saved programs yet"
              cta="Browse programs"
              onBrowse={() => go('sponsored-programs')}
              onRemove={handleRemove}
            />
            <SavedSection
              icon={Building2}
              title="Saved agencies"
              items={savedAgencies}
              emptyLabel="No saved agencies yet"
              cta="Browse agencies"
              onBrowse={() => go('experts')}
              onRemove={handleRemove}
            />
            <SavedSection
              icon={UserRound}
              title="Saved experts"
              items={savedExperts}
              emptyLabel="No saved experts yet"
              cta="Browse experts"
              onBrowse={() => go('experts')}
              onRemove={handleRemove}
            />
            <SavedSection
              icon={MapPin}
              title="Saved destinations"
              items={savedDestinations}
              emptyLabel="No saved destinations yet"
              cta="Browse destinations"
              onBrowse={() => go('destinations')}
              onRemove={handleRemove}
            />

            <div className="border border-ink-200 bg-white p-5">
              <h3 className="text-sm font-bold text-ink-900">Applications</h3>
              <p className="mt-2 text-xs leading-5 text-ink-500">
                No applications yet. This will track the real status of visa/job/program applications you submit
                through MadeVisa — coming soon.
              </p>
            </div>

            <p className="text-[11px] text-ink-400">
              Saved items are kept on this device only. Sign in from another device and they won't follow yet.
            </p>
          </div>
        )}

        {/* PARTNER */}
        {tab === 'partner' && (
          <PartnerSection
            publisher={publisher}
            loading={publisherLoading}
            countries={countries}
            userId={user?.id}
            userEmail={user?.email ?? ''}
            onCreated={setPublisher}
          />
        )}

        {/* SETTINGS */}
        {tab === 'settings' && (
          <div className="mt-6 space-y-6">
            <div className="border border-ink-200 bg-white p-6">
              <h2 className="text-sm font-bold text-ink-900">Profile photo</h2>
              <div className="mt-4 flex items-center gap-4">
                <TravelerAvatar seed={profile.id} avatarUrl={profile.avatar_url} size={64} />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
                  >
                    {avatarUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                    {profile.avatar_url ? 'Replace' : 'Upload'}
                  </button>
                  {profile.avatar_url && (
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      disabled={avatarUploading}
                      className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAvatarFile(file);
                    e.target.value = '';
                  }}
                />
              </div>
              {avatarError && <p className="mt-2 text-xs font-medium text-rose-600">{avatarError}</p>}
              <p className="mt-2 text-[11px] text-ink-400">JPEG, PNG or WebP. Max 5MB.</p>
            </div>

            <UsernameCard profile={profile} onSaved={refreshProfile} />

            <div className="border border-ink-200 bg-white p-6">
              <h2 className="text-sm font-bold text-ink-900">Personal information</h2>
              <p className="mt-1 text-xs text-ink-500">
                {profile.username ? 'Your name and photo are visible on your public profile link above. The rest stays private.' : 'None of this is shown publicly unless you set up a profile link above.'}
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label className={labelClass}>Email</label>
                  <div className="flex h-11 items-center gap-2 rounded-lg border border-ink-100 bg-ink-50 px-3 text-sm text-ink-500">
                    <Mail className="h-4 w-4 text-ink-400" />
                    {profile.email}
                    {isEmailConfirmed && <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-600" />}
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Full name</label>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Country you're in</label>
                    <select value={countryId} onChange={(e) => setCountryId(e.target.value)} className={inputClass}>
                      <option value="">Select</option>
                      {countries.map((c) => (
                        <option key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Citizenship</label>
                    <select value={nationalityId} onChange={(e) => setNationalityId(e.target.value)} className={inputClass}>
                      <option value="">Select</option>
                      {countries.map((c) => (
                        <option key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <PhoneInput countryIsoCode={residenceCountry?.iso_code} value={phone} onChange={setPhone} />

                <div>
                  <label className={labelClass}>Languages (optional)</label>
                  <input
                    value={languagesText}
                    onChange={(e) => setLanguagesText(e.target.value)}
                    placeholder="e.g. English, Azerbaijani, Turkish"
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Occupation (optional)</label>
                    <input value={occupation} onChange={(e) => setOccupation(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Education (optional)</label>
                    <input value={education} onChange={(e) => setEducation(e.target.value)} className={inputClass} />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Specialization (optional)</label>
                  <input value={specialization} onChange={(e) => setSpecialization(e.target.value)} className={inputClass} />
                </div>

                <div>
                  <label className={labelClass}>Experience (optional)</label>
                  <textarea
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    rows={3}
                    placeholder="A brief summary of your work or study experience"
                    className={textareaClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Preferred destination (optional)</label>
                  <select value={preferredDestinationId} onChange={(e) => setPreferredDestinationId(e.target.value)} className={inputClass}>
                    <option value="">Select</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}

              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save changes
                </button>
                {saved && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Saved
                  </span>
                )}
              </div>
            </div>

            <div className="border border-ink-200 bg-white p-6">
              <h2 className="text-sm font-bold text-ink-900">Account</h2>
              <div className="mt-4 space-y-3">
                <button
                  onClick={handleExportData}
                  className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-brand-600"
                >
                  <Download className="h-4 w-4" />
                  Export my data
                </button>
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-brand-600"
                >
                  <ArrowRight className="h-4 w-4" />
                  Sign out
                </button>
                <button
                  onClick={() => setDeleteOpen(true)}
                  className="flex items-center gap-2 text-sm font-medium text-rose-600 hover:text-rose-700"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete my account
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <LandingFooter go={go} onAuth={onAuth} />

      {deleteOpen && <DeleteAccountDialog onClose={() => setDeleteOpen(false)} hasPublisher={Boolean(publisher)} />}
    </div>
  );
}

function CircleFlagInline({ countryCode }: { countryCode: string }) {
  return (
    <img
      src={`https://hatscripts.github.io/circle-flags/flags/${countryCode.toLowerCase()}.svg`}
      alt=""
      className="h-[18px] w-[18px] rounded-full object-cover"
    />
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Sparkles; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition ${
        active ? 'bg-ink-900 text-white' : 'text-ink-500 hover:bg-ink-100'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  value,
  detail,
  onClick,
}: {
  icon: typeof Sparkles;
  title: string;
  value: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start border border-ink-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg"
    >
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-3 text-xs font-semibold text-ink-500">{title}</p>
      <p className="mt-0.5 text-lg font-bold text-ink-950">{value}</p>
      <p className="mt-1 text-xs text-ink-400">{detail}</p>
    </button>
  );
}

function RecentlyViewedSection({ items }: { items: ViewedJobSnapshot[]; onBrowse?: () => void }) {
  // Deliberately no "empty state" card here (unlike Saved) — an empty
  // recent-views list is the normal, unremarkable case for most
  // visits, not something worth a dedicated call-to-action block.
  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-ink-400" />
          <h2 className="text-lg font-bold text-ink-950">Recently viewed</h2>
          <span className="text-xs text-ink-400">({items.length})</span>
        </div>
        <span className="text-xs text-ink-400">Clears after 48 hours</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <a
            key={item.id}
            href={jobPath({ id: item.id, title: item.title, company: item.organization })}
            className="flex items-start justify-between gap-3 border border-ink-200 bg-white p-4 transition hover:border-brand-300"
          >
            <div className="min-w-0">
              {item.countryCode && (
                <div className="flex items-center gap-1.5 text-xs text-ink-400">
                  <CircleFlagInline countryCode={item.countryCode} />
                  {item.country}
                </div>
              )}
              <h3 className="mt-1 truncate text-sm font-bold text-ink-900">{item.title}</h3>
              <p className="truncate text-xs text-ink-500">{item.organization}</p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function SavedSection({
  icon: Icon,
  title,
  items,
  emptyLabel,
  cta,
  onBrowse,
  onRemove,
}: {
  icon: typeof Briefcase;
  title: string;
  items: SavedApplication[];
  emptyLabel: string;
  cta: string;
  onBrowse: () => void;
  onRemove: (item: SavedApplication) => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-ink-400" />
          <h2 className="text-lg font-bold text-ink-950">{title}</h2>
          <span className="text-xs text-ink-400">({items.length})</span>
        </div>
        <button onClick={onBrowse} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
          {cta}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 border border-dashed border-ink-200 bg-white px-6 py-10 text-center">
          <p className="text-sm text-ink-500">{emptyLabel}</p>
          <button onClick={onBrowse} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">
            {cta}
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 border border-ink-200 bg-white p-4">
              <div className="min-w-0">
                {item.countryCode && (
                  <div className="flex items-center gap-1.5 text-xs text-ink-400">
                    <CircleFlagInline countryCode={item.countryCode} />
                    {item.country}
                  </div>
                )}
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
                onClick={() => onRemove(item)}
                aria-label="Remove"
                className="shrink-0 rounded-lg p-1.5 text-ink-300 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PartnerSection({
  publisher,
  loading,
  countries,
  userId,
  userEmail,
  onCreated,
}: {
  publisher: ProgramPublisher | null;
  loading: boolean;
  countries: CountryOption[];
  userId: string | undefined;
  userEmail: string;
  onCreated: (p: ProgramPublisher) => void;
}) {
  const [applying, setApplying] = useState<OrgType | null>(null);
  const [resubmitting, setResubmitting] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [website, setWebsite] = useState('');
  const [countryId, setCountryId] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="mt-6 flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-ink-300" />
      </div>
    );
  }

  const canReapply = publisher && (publisher.verification_status === 'rejected' || publisher.verification_status === 'suspended');

  if (publisher && !resubmitting) {
    const Icon = orgTypeIcon[publisher.org_type];
    const status = statusCopy[publisher.verification_status];
    return (
      <div className="mt-6 border border-ink-200 bg-white p-6">
        <h2 className="text-sm font-bold text-ink-900">Partner workspace</h2>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-ink-50 p-4">
          <div className="flex items-center gap-3">
            {publisher.logo_url ? (
              <img src={publisher.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-ink-500">
                <Icon className="h-4 w-4" />
              </span>
            )}
            <div>
              <p className="text-sm font-semibold text-ink-900">{publisher.name}</p>
              <p className="text-xs text-ink-500">{orgTypeLabel[publisher.org_type]}</p>
            </div>
          </div>
          <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
        </div>
        {publisher.verification_status === 'pending' && (
          <p className="mt-3 text-xs text-ink-500">
            We'll email you once this is reviewed. Questions — {PUBLISHING_CONTACT_EMAIL}.
          </p>
        )}
        {publisher.verification_status === 'verified' && (
          <>
            <p className="mt-3 text-xs text-ink-500">
              Use the "Post a job" and "Post a program" buttons at the top of your profile to submit a new listing.
            </p>
            <MyListingsSection publisherId={publisher.id} />
          </>
        )}
        {canReapply && (
          <div className="mt-4">
            <p className="text-xs text-ink-500">
              {publisher.verification_status === 'suspended'
                ? "This partner account was suspended, but you're welcome to send another request."
                : "This request wasn't approved, but you're welcome to try again."}
            </p>
            <button
              onClick={() => {
                setOrgName(publisher.name);
                setWebsite(publisher.website ?? '');
                setCountryId(publisher.country_id ?? '');
                setLogoUrl(publisher.logo_url ?? '');
                setResubmitting(true);
              }}
              className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Send another request
            </button>
          </div>
        )}
      </div>
    );
  }

  const submit = async () => {
    if (!orgName.trim()) {
      setError('Organization name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);

    if (resubmitting && publisher) {
      const updated = await resubmitPublisherProfile(publisher.id, { orgType: applying ?? publisher.org_type, name: orgName, website, countryId, logoUrl });
      setSubmitting(false);
      if (updated) { onCreated(updated); setResubmitting(false); }
      else setError('Something went wrong — please try again.');
      return;
    }

    if (!userId || !applying) {
      setSubmitting(false);
      return;
    }
    const created = await createPublisherProfile({ ownerId: userId, orgType: applying, name: orgName, website, countryId, contactEmail: userEmail, logoUrl });
    setSubmitting(false);
    if (created) onCreated(created);
    else setError('Something went wrong — please try again.');
  };

  return (
    <div className="mt-6">
      {!resubmitting && !applying && (
        <div className="mb-6 border border-ink-200 bg-gradient-to-br from-ink-950 to-ink-800 p-8 text-white">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-brand-300">
            <Users2 className="h-4 w-4" />
            Become a MadeVisa Partner
          </div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight">Reach people actively looking for opportunities abroad.</h2>
        </div>
      )}

      <div className="border border-ink-200 bg-white p-6">
        <h2 className="text-sm font-bold text-ink-900">{resubmitting ? 'Send another request' : 'Choose your partner type'}</h2>
        {!resubmitting && (
          <p className="mt-1 text-xs text-ink-500">
            Reviewed before anything goes public. Questions — {PUBLISHING_CONTACT_EMAIL}.
          </p>
        )}

        {!applying ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <PartnerTypeCard type="agency" onClick={() => setApplying('agency')} title="Agency" detail="Publish visa, immigration and relocation services." />
            <PartnerTypeCard type="company" onClick={() => setApplying('company')} title="Company" detail="Publish jobs and reach international talent." />
            <PartnerTypeCard type="government" onClick={() => setApplying('government')} title="Government" detail="Promote official programs, pathways and initiatives." />
            <PartnerTypeCard type="expert" onClick={() => setApplying('expert')} title="Independent expert" detail="Offer professional expertise and consultations." />
            {resubmitting && (
              <button
                onClick={() => setResubmitting(false)}
                className="col-span-full text-center text-xs font-semibold text-ink-500 hover:text-ink-800"
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <label className={labelClass}>{applying === 'expert' ? 'Your professional name' : 'Organization name'}</label>
              <input value={orgName} onChange={(e) => setOrgName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Website (optional)</label>
              <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Country</label>
              <select value={countryId} onChange={(e) => setCountryId(e.target.value)} className={inputClass}>
                <option value="">Select</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name}</option>
                ))}
              </select>
            </div>
            {userId && (
              <ImageUploadField
                userId={userId}
                value={logoUrl}
                onChange={setLogoUrl}
                label={applying === 'expert' ? 'Your photo (optional)' : 'Official logo (optional)'}
              />
            )}
            {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={submit}
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Submit for review
              </button>
              <button
                onClick={() => { setApplying(null); setResubmitting(false); }}
                className="text-xs font-semibold text-ink-500 hover:text-ink-800"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-[11px] text-ink-400">
        More partner types (universities, education providers, recruitment and relocation companies) are planned —
        the architecture here is built to support them without another rebuild.
      </p>
    </div>
  );
}

function MyListingsSection({ publisherId }: { publisherId: string }) {
  const [programs, setPrograms] = useState<SponsoredProgram[] | null>(null);
  const [jobs, setJobs] = useState<SponsoredJob[] | null>(null);

  const load = () => {
    Promise.all([fetchMyPrograms(publisherId), fetchMySponsoredJobs(publisherId)]).then(([p, j]) => {
      setPrograms(p);
      setJobs(j);
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publisherId]);

  const total = (programs?.length ?? 0) + (jobs?.length ?? 0);
  if (programs === null || jobs === null) return null;
  if (total === 0) return null;

  return (
    <div className="mt-4 border-t border-ink-100 pt-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">My listings ({total})</p>
      <div className="mt-2 divide-y divide-ink-100 rounded-lg border border-ink-200 bg-white">
        {jobs.map((j) => (
          <MyJobListingRow key={j.id} job={j} onChange={load} />
        ))}
        {programs.map((p) => (
          <MyProgramListingRow key={p.id} program={p} onChange={load} />
        ))}
      </div>
    </div>
  );
}

function MyProgramListingRow({ program, onChange }: { program: SponsoredProgram; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(program.title);
  const [description, setDescription] = useState(program.description ?? '');
  const [fundingText, setFundingText] = useState(program.funding_text ?? '');
  const [officialUrl, setOfficialUrl] = useState(program.official_url ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const result = await updateMyProgram(program.id, {
      title,
      description: description || null,
      funding_text: fundingText || null,
      official_url: officialUrl || null,
    });
    setSaving(false);
    if (result.ok) { setEditing(false); onChange(); }
  };

  return (
    <div className="p-3">
      {editing ? (
        <div className="space-y-1.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="h-8 w-full rounded-md border border-ink-200 px-2 text-sm font-semibold text-ink-900 outline-none focus:border-brand-500" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={2} className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-500" />
          <input value={fundingText} onChange={(e) => setFundingText(e.target.value)} placeholder="Funding / stipend" className="h-8 w-full max-w-xs rounded-md border border-ink-200 px-2 text-xs text-ink-700 outline-none focus:border-brand-500" />
          <input value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="Official URL" className="h-8 w-full rounded-md border border-ink-200 px-2 text-xs text-ink-700 outline-none focus:border-brand-500" />
          <p className="text-[11px] text-ink-400">Saving sends this back for admin review before it's live again.</p>
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Save</button>
            <button onClick={() => setEditing(false)} className="text-xs text-ink-400 hover:text-ink-700">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900">{program.title}</p>
            <p className="text-xs text-ink-500">Program · {program.status}</p>
          </div>
          <button onClick={() => setEditing(true)} className="flex shrink-0 items-center gap-1 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-50">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

function MyJobListingRow({ job, onChange }: { job: SponsoredJob; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(job.title);
  const [description, setDescription] = useState(job.description ?? '');
  const [compensationText, setCompensationText] = useState(job.compensation_text ?? '');
  const [officialUrl, setOfficialUrl] = useState(job.official_url ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const result = await updateMySponsoredJob(job.id, {
      title,
      description: description || null,
      compensation_text: compensationText || null,
      official_url: officialUrl || null,
    });
    setSaving(false);
    if (result.ok) { setEditing(false); onChange(); }
  };

  return (
    <div className="p-3">
      {editing ? (
        <div className="space-y-1.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="h-8 w-full rounded-md border border-ink-200 px-2 text-sm font-semibold text-ink-900 outline-none focus:border-brand-500" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={2} className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-500" />
          <input value={compensationText} onChange={(e) => setCompensationText(e.target.value)} placeholder="Salary" className="h-8 w-full max-w-xs rounded-md border border-ink-200 px-2 text-xs text-ink-700 outline-none focus:border-brand-500" />
          <input value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="Official URL" className="h-8 w-full rounded-md border border-ink-200 px-2 text-xs text-ink-700 outline-none focus:border-brand-500" />
          <p className="text-[11px] text-ink-400">Saving sends this back for admin review before it's live again.</p>
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Save</button>
            <button onClick={() => setEditing(false)} className="text-xs text-ink-400 hover:text-ink-700">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900">{job.title}</p>
            <p className="text-xs text-ink-500">Job · {job.status}</p>
          </div>
          <button onClick={() => setEditing(true)} className="flex shrink-0 items-center gap-1 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-50">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

function UsernameCard({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [editing, setEditing] = useState(!profile.username);
  const [value, setValue] = useState(profile.username ?? suggestUsername(profile.full_name));
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl = profile.username ? `${window.location.origin}/u/${profile.username}` : '';

  useEffect(() => {
    if (!editing || !value.trim()) { setAvailable(null); return; }
    setChecking(true);
    const timeout = window.setTimeout(() => {
      isUsernameAvailable(value.trim().toLowerCase(), profile.id).then((ok) => {
        setAvailable(ok);
        setChecking(false);
      });
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [value, editing, profile.id]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await updateMyUsername(value);
    setSaving(false);
    if (result.ok) {
      setEditing(false);
      onSaved();
    } else {
      setError(result.error ?? 'Could not save username.');
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="border border-ink-200 bg-white p-6">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
        <Link2 className="h-4 w-4 text-ink-400" />
        Shareable profile link
      </h2>
      <p className="mt-1 text-xs text-ink-500">
        A public link showing your name, photo, and — if you're a verified partner — your organization.
      </p>

      {!editing ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="flex-1 truncate rounded-lg bg-ink-50 px-3 py-2 text-sm font-medium text-ink-800">{shareUrl}</code>
          <button
            type="button"
            onClick={copyLink}
            className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
          >
            {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(true); setValue(profile.username ?? ''); }}
            className="rounded-lg border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-400">madevisa.com/u/</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder="your-name"
              className="h-10 flex-1 rounded-lg border border-ink-200 px-3 text-sm font-medium text-ink-900 outline-none focus:border-brand-500"
            />
          </div>
          <div className="mt-1.5 text-xs">
            {checking && <span className="text-ink-400">Checking availability…</span>}
            {!checking && available === true && value.length >= 3 && <span className="font-medium text-emerald-600">Available</span>}
            {!checking && available === false && <span className="font-medium text-rose-600">Already taken</span>}
            {!checking && value.length > 0 && value.length < 3 && <span className="text-ink-400">At least 3 characters</span>}
          </div>
          {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || available === false || value.length < 3}
              className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {profile.username && (
              <button type="button" onClick={() => setEditing(false)} className="text-xs text-ink-500 hover:text-ink-700">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PartnerTypeCard({ type, onClick, title, detail }: { type: OrgType; onClick: () => void; title: string; detail: string }) {
  const Icon = orgTypeIcon[type];
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 rounded-lg border border-ink-200 p-4 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-bold text-ink-900">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-ink-500">{detail}</p>
      </div>
    </button>
  );
}

function DeleteAccountDialog({ onClose, hasPublisher }: { onClose: () => void; hasPublisher: boolean }) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDelete = confirmText.trim().toUpperCase() === 'DELETE';

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    const result = await deleteMyAccount();
    if (!result.ok) {
      setDeleting(false);
      setError(result.error ?? 'Something went wrong — please try again.');
      return;
    }
    localStorage.removeItem('madevisa.applications.v1');
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-2 text-rose-600">
          <Trash2 className="h-5 w-5" />
          <h2 className="text-base font-bold">Delete your account</h2>
        </div>

        <p className="mt-4 text-xs leading-5 text-ink-600">This permanently deletes your account. Here's what happens:</p>
        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-ink-500">
          <li>• Your profile and login are deleted immediately and can't be recovered.</li>
          <li>• Saved jobs/programs on this device are cleared.</li>
          <li>• There's no application history to delete yet — that feature isn't built.</li>
          {hasPublisher && (
            <li>
              • Your partner profile and anything you've published stay live but become unowned — reach{' '}
              {PUBLISHING_CONTACT_EMAIL} if you'd like it removed instead.
            </li>
          )}
        </ul>

        <label className="mt-4 block text-xs font-semibold text-ink-500">
          Type DELETE to confirm
        </label>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="mt-1.5 h-11 w-full rounded-lg border border-ink-200 px-3 text-sm font-medium outline-none focus:border-rose-400"
          placeholder="DELETE"
        />

        {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}

        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Permanently delete
          </button>
          <button onClick={onClose} className="text-xs font-semibold text-ink-500 hover:text-ink-800">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
