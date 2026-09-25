import { useEffect, useRef, useState } from 'react';
import { SoonChip } from '@/components/common/SoonChip';
import { ApplicantReport } from '@/components/dashboard/ApplicantReport';
import { jobPath } from '@/lib/jobUrl';
import {
  ArrowRight,
  Award,
  Briefcase,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  Copy,
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
  Share2,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { isEmailVerified, useAuth, type Profile } from '@/lib/auth';
import { VerifyEmailCard } from '@/components/common/VerifyEmailCard';
import { TwoFactorSettings } from '@/components/auth/TwoFactorSettings';
import { supabase } from '@/lib/supabase';
import {
  createPublisherProfile,
  fetchMyPrograms,
  fetchMyPublisherProfile,
  resubmitPublisherProfile,
  updateMyProgram,
  PUBLISHING_CONTACT_EMAIL,
  type OrgType,
  type RepresentativeRole,
  type ProgramPublisher,
  type SponsoredProgram,
} from '@/lib/programs';
import { fetchMySponsoredJobs, updateMySponsoredJob, type SponsoredJob } from '@/lib/sponsoredJobs';
import { getRecentlyViewedJobs, type ViewedJobSnapshot } from '@/lib/viewedJobs';
import { uploadListingImage } from '@/lib/uploadImage';
import { deleteMyAccount } from '@/lib/accountDeletion';
import { OriginCountryProvider, useOriginCountry } from '@/lib/originCountry';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { TravelerAvatar } from '@/components/common/TravelerAvatar';
import { PhoneInput } from '@/components/common/PhoneInput';
import { ImageUploadField } from '@/components/common/ImageUploadField';
import { LinkedInLogo } from '@/components/common/LinkedInLogo';
import { AutoGrowTextarea, ChipsInput, FIELD_LIMITS, LimitedLabel, cleanText } from '@/components/common/LimitedFields';
import { useSeo } from '@/lib/seo';
import { isUsernameAvailable, normalizeLinkedInUrl, suggestUsername, updateMyLinkedIn, updateMyUsername } from '@/lib/username';
import type { View } from '@/types';

type ProfilePageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

type CountryOption = { id: string; name: string; flag_emoji: string | null; iso_code: string };
type Tab = 'dashboard' | 'partner' | 'settings';

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
  const { countryName: originName } = useOriginCountry();

  const [tab, setTab] = useState<Tab>(() => {
    // Deep link: /profile?tab=partner|settings (old ?tab=saved links land on the dashboard)
    const t = new URLSearchParams(window.location.search).get('tab');
    return t === 'partner' || t === 'settings' ? t : 'dashboard';
  });
  const [countries, setCountries] = useState<CountryOption[]>([]);

  // Personal info form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryId, setCountryId] = useState('');
  const [nationalityId, setNationalityId] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [occupation, setOccupation] = useState('');
  const [education, setEducation] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [experience, setExperience] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const [publisher, setPublisher] = useState<ProgramPublisher | null>(null);
  const [publisherLoading, setPublisherLoading] = useState(true);

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
    if (!profile) return;
    setFullName(profile.full_name ?? '');
    setPhone(profile.phone ?? '');
    setCountryId(profile.country_id ?? '');
    setNationalityId(profile.nationality_country_id ?? '');
    setLanguages((profile.languages ?? []).slice(0, FIELD_LIMITS.languageItems));
    setOccupation(profile.occupation ?? '');
    setEducation(profile.education ?? '');
    setSpecialization(profile.specialization ?? '');
    setExperience(profile.experience ?? '');
  }, [profile]);

  // Client-only — read from localStorage once on mount.
  const [recentlyViewedJobs, setRecentlyViewedJobs] = useState<ViewedJobSnapshot[]>([]);
  useEffect(() => {
    setRecentlyViewedJobs(getRecentlyViewedJobs());
  }, []);

  if (!profile) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8fafc]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const residenceCountry = countries.find((c) => c.id === countryId);
  const isEmailConfirmed = isEmailVerified(profile, user);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    const name = fullName.trim();
    const phoneDigits = phone.replace(/\D/g, '');
    if (!name) {
      setSaving(false);
      setError('Enter your name.');
      return;
    }
    if (phone.trim() && (phoneDigits.length < 6 || phoneDigits.length > 15)) {
      setSaving(false);
      setError('Enter a valid phone number (6–15 digits), or leave it empty.');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: name,
        phone: phone.trim() || null,
        country_id: countryId || null,
        nationality_country_id: nationalityId || null,
        languages: languages.length ? languages : null,
        occupation: occupation.trim() || null,
        education: education.trim() || null,
        specialization: specialization.trim() || null,
        experience: experience.trim() || null,
      })
      .eq('id', profile.id);

    setSaving(false);

    if (error) {
      setError(/input_limits/.test(error.message) ? 'One of the fields is too long or has characters that aren’t allowed.' : error.message);
      return;
    }

    await refreshProfile();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
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
        linkedin_url: profile.linkedin_url ?? null,
      },
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

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="home" />

      <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        {/* HEADER — compact */}
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-ink-200 bg-white p-5">
          <span className="rounded-md p-[3px] ring-[3px] ring-[#2563EB]">
            <TravelerAvatar avatarUrl={profile.avatar_url} size={64} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight text-ink-950 sm:text-2xl">{profile.full_name || 'Your profile'}</h1>
              <LinkedInConnect userId={profile.id} url={profile.linkedin_url ?? null} onSaved={refreshProfile} />
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
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-ink-400" />
                {profileCountry?.name ?? originName ?? 'Location not set'}
              </span>
              {profile.occupation && (
                <span className="flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5 text-ink-400" />
                  {profile.occupation}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.username ? (
              <>
                <button
                  onClick={async () => {
                    const url = `${window.location.origin}/u/${profile.username}`;
                    if (navigator.share) {
                      try {
                        await navigator.share({ title: `${profile.full_name ?? profile.username} on MadeVisa`, url });
                        return;
                      } catch {
                        /* cancelled — fall back to copying */
                      }
                    }
                    await navigator.clipboard.writeText(url);
                    setShareMsg('Link copied');
                    window.setTimeout(() => setShareMsg(null), 2000);
                  }}
                  className="flex items-center gap-1.5 rounded border border-ink-200 px-3.5 py-2 text-xs font-semibold text-ink-700 transition-colors hover:border-brand-300 hover:text-[#2563EB]"
                >
                  {shareMsg ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Share2 className="h-3.5 w-3.5" />}
                  {shareMsg ?? 'Share profile'}
                </button>
                <a
                  href={`/u/${profile.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded border border-ink-200 px-3.5 py-2 text-xs font-semibold text-ink-700 transition-colors hover:border-brand-300 hover:text-[#2563EB]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View as visitor
                </a>
              </>
            ) : (
              <button
                onClick={() => {
                  setTab('settings');
                  window.setTimeout(() => document.getElementById('profile-link')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                }}
                className="flex items-center gap-1.5 rounded border border-ink-200 px-3.5 py-2 text-xs font-semibold text-ink-700 transition-colors hover:border-brand-300 hover:text-[#2563EB]"
              >
                <Share2 className="h-3.5 w-3.5" />
                Create a shareable profile link
              </button>
            )}
            {canPost && (
              <button
                onClick={() => go('company')}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Post a job
              </button>
            )}
            <button onClick={() => setTab('settings')} className="rounded-lg border border-ink-200 px-3.5 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50">
              Edit profile
            </button>
          </div>
        </div>

        {!isEmailConfirmed && profile.email && <VerifyEmailCard email={profile.email} className="mt-4" />}

        {/* TABS */}
        <div className="mt-6 flex gap-2 overflow-x-auto border-b border-ink-200 pb-3 [scrollbar-width:none]">
          <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon={Sparkles} label="Dashboard" />
          <TabButton active={tab === 'partner'} onClick={() => setTab('partner')} icon={Award} label={publisher ? 'Organization' : 'For organizations'} />
          <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} icon={SettingsIcon} label="Settings" />
        </div>

        {/* DASHBOARD — applications at a glance + recently viewed */}
        {tab === 'dashboard' && (
          <div className="mt-6 space-y-8">
            <ApplicantReport viewedCount={recentlyViewedJobs.length} hasPublicProfile={Boolean(profile.username)} />
            <RecentlyViewedSection items={recentlyViewedJobs} onBrowse={() => go('jobs')} />
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
            emailVerified={isEmailConfirmed}
            onCreated={setPublisher}
            onPost={() => go('company')}
          />
        )}

        {/* SETTINGS */}
        {tab === 'settings' && (
          <div className="mt-6 space-y-6">
            <TwoFactorSettings isAdmin={profile.role === 'admin'} />
            <div className="border border-ink-200 bg-white p-6">
              <h2 className="text-sm font-bold text-ink-900">Profile photo</h2>
              <div className="mt-4 flex items-center gap-4">
                <TravelerAvatar avatarUrl={profile.avatar_url} size={64} />
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
                  <LimitedLabel label="Full name" value={fullName} max={FIELD_LIMITS.fullName} htmlFor="pf-name" />
                  <input
                    id="pf-name"
                    value={fullName}
                    maxLength={FIELD_LIMITS.fullName}
                    autoComplete="name"
                    onChange={(e) => setFullName(cleanText(e.target.value.replace(/[0-9<>{}[\]@#$%^*=_|\\~`]/g, ''), FIELD_LIMITS.fullName))}
                    className={inputClass}
                  />
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
                  <label className={labelClass} htmlFor="pf-languages">
                    Languages (optional)
                  </label>
                  <ChipsInput
                    id="pf-languages"
                    values={languages}
                    onChange={setLanguages}
                    maxItems={FIELD_LIMITS.languageItems}
                    maxLength={FIELD_LIMITS.languageLength}
                    placeholder="e.g. English"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <LimitedLabel label="Occupation (optional)" value={occupation} max={FIELD_LIMITS.occupation} htmlFor="pf-occupation" />
                    <input
                      id="pf-occupation"
                      value={occupation}
                      maxLength={FIELD_LIMITS.occupation}
                      onChange={(e) => setOccupation(cleanText(e.target.value, FIELD_LIMITS.occupation))}
                      placeholder="e.g. Product designer"
                      className={inputClass}
                    />
                  </div>
                  <div className="min-w-0">
                    <LimitedLabel label="Education (optional)" value={education} max={FIELD_LIMITS.education} htmlFor="pf-education" />
                    <input
                      id="pf-education"
                      value={education}
                      maxLength={FIELD_LIMITS.education}
                      onChange={(e) => setEducation(cleanText(e.target.value, FIELD_LIMITS.education))}
                      placeholder="e.g. BSc Computer Science"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <LimitedLabel label="Specialization (optional)" value={specialization} max={FIELD_LIMITS.specialization} htmlFor="pf-spec" />
                  <input
                    id="pf-spec"
                    value={specialization}
                    maxLength={FIELD_LIMITS.specialization}
                    onChange={(e) => setSpecialization(cleanText(e.target.value, FIELD_LIMITS.specialization))}
                    className={inputClass}
                  />
                </div>

                <div>
                  <LimitedLabel label="Experience (optional)" value={experience} max={FIELD_LIMITS.experience} htmlFor="pf-exp" />
                  <AutoGrowTextarea
                    id="pf-exp"
                    value={experience}
                    onChange={setExperience}
                    max={FIELD_LIMITS.experience}
                    placeholder="A brief summary of your work or study experience"
                    className={textareaClass}
                  />
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

function RecentlyViewedSection({ items }: { items: ViewedJobSnapshot[]; onBrowse?: () => void }) {
  // Short by default (like the job description's "Read more"): the last
  // rows fade out, and "Show more" reveals the next batch.
  const STEP = 6;
  const [limit, setLimit] = useState(STEP);
  if (items.length === 0) return null;
  const shown = items.slice(0, limit);
  const hasMore = items.length > limit;

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
      <div className="relative mt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((item) => (
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
        {hasMore && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#f8fafc] via-[#f8fafc]/80 to-transparent" />}
      </div>
      {(hasMore || limit > STEP) && (
        <div className="mt-3 flex justify-center gap-2">
          {hasMore && (
            <button
              onClick={() => setLimit((n) => n + STEP * 2)}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-800 transition hover:border-brand-300 hover:text-brand-700"
            >
              Show more ({items.length - limit})
            </button>
          )}
          {limit > STEP && (
            <button onClick={() => setLimit(STEP)} className="rounded-full px-4 py-2 text-sm font-semibold text-ink-500 hover:text-ink-800">
              Show less
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const ROLE_OPTIONS: { value: RepresentativeRole; label: string; detail: string }[] = [
  { value: 'owner', label: 'I own or run the company', detail: 'Founder, owner, director or managing partner.' },
  { value: 'authorized', label: "I'm authorized to represent it", detail: 'Allowed by the company to publish its jobs.' },
  { value: 'hr', label: 'I work in HR or recruiting', detail: 'People team, talent acquisition or recruiter.' },
];

const roleLabel: Record<RepresentativeRole, string> = {
  owner: 'Owner',
  authorized: 'Authorized representative',
  hr: 'HR / recruiting',
};

function PartnerSection({
  publisher,
  loading,
  countries,
  userId,
  userEmail,
  emailVerified,
  onCreated,
  onPost,
}: {
  publisher: ProgramPublisher | null;
  loading: boolean;
  countries: CountryOption[];
  userId: string | undefined;
  userEmail: string;
  emailVerified: boolean;
  onCreated: (p: ProgramPublisher) => void;
  onPost: () => void;
}) {
  const [applying, setApplying] = useState<'government' | 'company' | null>(null);
  const [resubmitting, setResubmitting] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [website, setWebsite] = useState('');
  const [countryId, setCountryId] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [role, setRole] = useState<RepresentativeRole | null>(null);
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
      <div className="mt-6 space-y-6">
        <div className="rounded-md border border-ink-200 bg-white p-6">
          <h2 className="text-sm font-bold text-ink-900">Your organization</h2>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-md bg-ink-50 p-4">
            <div className="flex items-center gap-3">
              {publisher.logo_url ? (
                <img src={publisher.logo_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded bg-white text-ink-500">
                  <Icon className="h-4 w-4" />
                </span>
              )}
              <div>
                <p className="text-sm font-semibold text-ink-900">{publisher.name}</p>
                <p className="text-xs text-ink-500">
                  {orgTypeLabel[publisher.org_type]}
                  {publisher.representative_role ? ` · ${roleLabel[publisher.representative_role]}` : ''}
                </p>
              </div>
            </div>
            <span className={`rounded border px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
          </div>
          {publisher.verification_status === 'pending' && (
            <p className="mt-3 text-xs text-ink-500">We'll email you once this is reviewed. Questions — {PUBLISHING_CONTACT_EMAIL}.</p>
          )}
          {publisher.verification_status === 'verified' && (
            <>
              <button
                onClick={onPost}
                className="mt-4 inline-flex items-center gap-1.5 rounded bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Post a job
              </button>
              <MyListingsSection publisherId={publisher.id} />
            </>
          )}
          {canReapply && (
            <div className="mt-4">
              <p className="text-xs text-ink-500">
                {publisher.verification_status === 'suspended'
                  ? "This organization was suspended, but you're welcome to send another request."
                  : "This request wasn't approved, but you're welcome to try again."}
              </p>
              <button
                onClick={() => {
                  setOrgName(publisher.name);
                  setWebsite(publisher.website ?? '');
                  setCountryId(publisher.country_id ?? '');
                  setLogoUrl(publisher.logo_url ?? '');
                  setRole(publisher.representative_role ?? null);
                  setApplying(publisher.org_type === 'government' ? 'government' : 'company');
                  setResubmitting(true);
                }}
                className="mt-2 rounded bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
              >
                Send another request
              </button>
            </div>
          )}
        </div>
        <PostingInfo />
      </div>
    );
  }

  const submit = async () => {
    if (!orgName.trim()) {
      setError(applying === 'government' ? 'Enter the name of the government body.' : 'Enter the company name.');
      return;
    }
    if (applying === 'company' && !role) {
      setError('Choose how you’re connected to the company.');
      return;
    }
    const site = normalizeWebsite(website);
    if (website.trim() && !site) {
      setError('Enter the official website, like https://company.com');
      return;
    }
    setSubmitting(true);
    setError(null);
    const representativeRole = applying === 'company' ? role : null;

    if (resubmitting && publisher) {
      const updated = await resubmitPublisherProfile(publisher.id, {
        orgType: applying ?? undefined,
        name: orgName.trim(),
        website: site ?? '',
        countryId,
        logoUrl,
        representativeRole,
      });
      setSubmitting(false);
      if (updated) {
        onCreated(updated);
        setResubmitting(false);
      } else setError('Something went wrong — please try again.');
      return;
    }

    if (!userId || !applying) {
      setSubmitting(false);
      return;
    }
    const created = await createPublisherProfile({
      ownerId: userId,
      orgType: applying,
      name: orgName.trim(),
      website: site ?? '',
      countryId,
      contactEmail: userEmail,
      logoUrl,
      representativeRole,
    });
    setSubmitting(false);
    if (created) onCreated(created);
    else setError('Something went wrong — please try again.');
  };

  // Registering an organization needs a verified email (the database enforces it too).
  if (!emailVerified && !resubmitting) {
    return (
      <div className="mt-6 space-y-6">
        <VerifyEmailCard email={userEmail} reason="Before you register a company or government body, please verify your email." />
        <PostingInfo />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {!resubmitting && !applying && <PostingInfo />}

      <div className="rounded-md border border-ink-200 bg-white p-6">
        <h2 className="text-sm font-bold text-ink-900">
          {resubmitting ? 'Send another request' : applying ? `Set up your ${applying === 'government' ? 'government body' : 'company'}` : 'Who are you posting for?'}
        </h2>
        {!resubmitting && !applying && <p className="mt-1 text-xs text-ink-500">Every organization is reviewed before anything goes public.</p>}

        {!applying ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <PartnerTypeCard type="company" onClick={() => setApplying('company')} title="Company" detail="You own it, are authorized to represent it, or work in its HR team." />
            <PartnerTypeCard type="government" onClick={() => setApplying('government')} title="Government" detail="A ministry, agency or public body promoting official programs." />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {applying === 'company' && (
              <fieldset>
                <legend className={labelClass}>How are you connected to the company?</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {ROLE_OPTIONS.map((o) => (
                    <label
                      key={o.value}
                      className={`flex cursor-pointer flex-col rounded-md border p-3 text-left transition-colors ${
                        role === o.value ? 'border-[#2563EB] bg-brand-50' : 'border-ink-200 hover:border-brand-300'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs font-semibold text-ink-900">
                        <input
                          type="radio"
                          name="representative-role"
                          checked={role === o.value}
                          onChange={() => setRole(o.value)}
                          className="h-3.5 w-3.5 accent-[#2563EB]"
                        />
                        {o.label}
                      </span>
                      <span className="mt-1 pl-5 text-[11px] leading-4 text-ink-500">{o.detail}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div>
              <LimitedLabel label={applying === 'government' ? 'Government body' : 'Company name'} value={orgName} max={FIELD_LIMITS.orgName} htmlFor="org-name" />
              <input
                id="org-name"
                value={orgName}
                maxLength={FIELD_LIMITS.orgName}
                onChange={(e) => setOrgName(cleanText(e.target.value.replace(/[<>{}]/g, ''), FIELD_LIMITS.orgName))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="org-site">
                Official website {applying === 'company' ? '(helps us verify you faster)' : '(optional)'}
              </label>
              <input
                id="org-site"
                type="url"
                inputMode="url"
                value={website}
                maxLength={FIELD_LIMITS.website}
                onChange={(e) => setWebsite(e.target.value.replace(/\s/g, ''))}
                onBlur={() => {
                  const n = normalizeWebsite(website);
                  if (n) setWebsite(n);
                }}
                placeholder="https://company.com"
                className={inputClass}
              />
              {website.trim() && !normalizeWebsite(website) && (
                <p className="mt-1 text-[11px] font-medium text-rose-600">That doesn't look like a website address.</p>
              )}
            </div>
            <div>
              <label className={labelClass}>Country</label>
              <select value={countryId} onChange={(e) => setCountryId(e.target.value)} className={inputClass}>
                <option value="">Select</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.flag_emoji ?? ''} {c.name}
                  </option>
                ))}
              </select>
            </div>
            {userId && <ImageUploadField userId={userId} value={logoUrl} onChange={setLogoUrl} label="Official logo (optional)" />}
            {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={submit}
                disabled={submitting}
                className="flex items-center gap-2 rounded bg-[#2563EB] px-4 py-2.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Submit for review
              </button>
              <button
                onClick={() => {
                  setApplying(null);
                  setResubmitting(false);
                  setError(null);
                }}
                className="text-xs font-semibold text-ink-500 hover:text-[#2563EB]"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** "company.com/careers" → "https://company.com/careers". Null if it isn't a real web address. */
function normalizeWebsite(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol) || !/\.[a-z]{2,}$/i.test(url.hostname)) return null;
    const out = url.toString().replace(/\/$/, '');
    return out.length <= FIELD_LIMITS.website ? out : null;
  } catch {
    return null;
  }
}

/** What organizations can post on MadeVisa, and who to email. */
function PostingInfo() {
  return (
    <section className="rounded-md border border-ink-200 bg-white p-6">
      <h2 className="text-lg font-bold tracking-tight text-ink-950">Post jobs and programs on MadeVisa</h2>
      <p className="mt-1 text-sm text-ink-500">Reach people who are actively planning a move for work or study.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-md bg-ink-50 p-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-white text-[#2563EB]">
            <Briefcase className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-ink-900">Jobs</p>
            <p className="mt-0.5 text-xs leading-5 text-ink-500">Open roles, including ones offering visa sponsorship or relocation. Shown next to jobs from company career pages.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-md bg-ink-50 p-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-white text-ink-400">
            <GraduationCap className="h-4 w-4" />
          </span>
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-ink-500">Programs <SoonChip /></p>
            <p className="mt-0.5 text-xs leading-5 text-ink-500">Government schemes, scholarships, training and relocation programs, with requirements and deadlines.</p>
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ink-100 pt-4 text-sm">
        <span className="text-ink-600">Questions before you start?</span>
        <a
          href={`mailto:${PUBLISHING_CONTACT_EMAIL}?subject=${encodeURIComponent('Posting on MadeVisa')}`}
          className="inline-flex items-center gap-1.5 font-semibold text-[#2563EB] hover:text-brand-700"
        >
          <Mail className="h-4 w-4" />
          {PUBLISHING_CONTACT_EMAIL}
        </a>
      </div>
    </section>
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

/** Next to the name: the LinkedIn logo linking to the profile, or a "Connect LinkedIn" button. */
function LinkedInConnect({ userId, url, onSaved }: { userId: string; url: string | null; onSaved: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: string | null) => {
    setError(null);
    const normalized = next === null ? null : normalizeLinkedInUrl(next);
    if (next !== null && !normalized) {
      setError('Paste your LinkedIn profile link, like linkedin.com/in/your-name');
      return;
    }
    setSaving(true);
    const res = await updateMyLinkedIn(userId, normalized);
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not save.');
      return;
    }
    await onSaved();
    setOpen(false);
  };

  return (
    <span className="relative inline-flex items-center gap-1">
      {url ? (
        <>
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn profile" title="LinkedIn profile" className="transition-opacity hover:opacity-80">
            <LinkedInLogo size={22} />
          </a>
          <button
            type="button"
            onClick={() => {
              setValue(url);
              setOpen((v) => !v);
            }}
            aria-label="Edit LinkedIn link"
            className="grid h-6 w-6 place-items-center rounded text-ink-400 hover:bg-ink-50 hover:text-[#2563EB]"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded border border-ink-200 py-0.5 pl-0.5 pr-2 text-[11px] font-semibold text-ink-600 transition-colors hover:border-[#0A66C2] hover:text-[#0A66C2]"
        >
          <LinkedInLogo size={18} />
          Connect LinkedIn
        </button>
      )}

      {open && (
        <>
          <button type="button" aria-label="Close" tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default" />
          <div className="menu-pop absolute left-0 top-full z-40 mt-2 w-[min(20rem,80vw)] rounded-md border border-ink-200 bg-white p-3 shadow-xl" style={{ transformOrigin: 'top left' }}>
            <label className="text-xs font-semibold text-ink-700" htmlFor="linkedin-url">
              Your LinkedIn profile link
            </label>
            <input
              id="linkedin-url"
              autoFocus
              value={value}
              maxLength={FIELD_LIMITS.linkedin}
              onChange={(e) => setValue(e.target.value.replace(/\s/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && save(value)}
              placeholder="linkedin.com/in/your-name"
              className="mt-1.5 h-9 w-full rounded border border-ink-200 px-2.5 text-sm text-ink-900 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-brand-100"
            />
            {error && <p className="mt-1.5 text-[11px] font-medium text-rose-600">{error}</p>}
            <p className="mt-1.5 text-[11px] text-ink-400">Shown as a LinkedIn logo next to your name, here and on your public profile.</p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => save(value)}
                disabled={saving}
                className="flex items-center gap-1.5 rounded bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                Save
              </button>
              {url && (
                <button type="button" onClick={() => save(null)} disabled={saving} className="text-xs font-semibold text-ink-500 hover:text-rose-600">
                  Remove
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="ml-auto text-xs text-ink-400 hover:text-ink-700">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </span>
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
    <div id="profile-link" className="scroll-mt-24 border border-ink-200 bg-white p-6">
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
              onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, FIELD_LIMITS.username))}
              maxLength={FIELD_LIMITS.username}
              placeholder="your-name"
              className="h-10 flex-1 rounded-lg border border-ink-200 px-3 text-sm font-medium text-ink-900 outline-none focus:border-brand-500"
            />
          </div>
          <div className="mt-1.5 text-xs">
            {checking && <span className="text-ink-400">Checking availability…</span>}
            {!checking && available === true && value.length >= 3 && <span className="font-medium text-emerald-600">Available</span>}
            {!checking && available === false && <span className="font-medium text-rose-600">Already taken</span>}
            {!checking && value.length > 0 && value.length < 3 && <span className="text-ink-400">At least 3 characters</span>}
            <span className="float-right text-ink-400">
              {value.length} / {FIELD_LIMITS.username} · letters, numbers, - and _
            </span>
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
      className="group flex items-start gap-3 rounded-md border border-ink-200 p-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-brand-50 text-[#2563EB]">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-bold text-ink-900 group-hover:text-[#2563EB]">{title}</p>
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
          <li>• Your Applicant Response Report is deleted.</li>
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
