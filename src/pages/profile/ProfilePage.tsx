import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Briefcase,
  Building2,
  Camera,
  CheckCircle2,
  Compass,
  Download,
  ExternalLink,
  GraduationCap,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  Save,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Trash2,
  UserRound,
  Users2,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  createPublisherProfile,
  fetchMyPublisherProfile,
  resubmitPublisherProfile,
  PUBLISHING_CONTACT_EMAIL,
  type OrgType,
  type ProgramPublisher,
} from '@/lib/programs';
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

const roleLabel: Record<string, string> = {
  customer: 'Traveler',
  agency: 'Agency account',
  admin: 'Admin',
};

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
  const { user, profile, refreshProfile } = useAuth();
  const { countryCode: originCode, countryName: originName } = useOriginCountry();

  const [tab, setTab] = useState<Tab>('overview');
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

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="home" />

      <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        {/* HEADER */}
        <div className="flex flex-wrap items-start justify-between gap-6 border border-ink-200 bg-white p-6">
          <div className="flex items-center gap-4">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <TravelerAvatar seed={profile.id} size={64} />
            )}
            <div>
              <h1 className="text-xl font-bold tracking-tight text-ink-950">{profile.full_name || 'Your profile'}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                <span className="flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5 text-brand-600" />
                  {roleLabel[profile.role ?? 'customer']}
                </span>
                {isEmailConfirmed && (
                  <span className="flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Email verified
                  </span>
                )}
                {partnerBadge && (
                  <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${partnerBadge.className}`}>
                    {orgTypeLabel[publisher!.org_type]} · {partnerBadge.label}
                  </span>
                )}
              </div>
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
            label={`Saved (${applications.length})`}
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
            <SavedSection
              icon={Briefcase}
              title="Saved jobs"
              items={jobs}
              emptyLabel="No saved jobs yet"
              cta="Browse jobs"
              onBrowse={() => go('jobs')}
              onRemove={handleRemove}
            />
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
              onBrowse={() => go('agencies')}
              onRemove={handleRemove}
            />
            <SavedSection
              icon={UserRound}
              title="Saved experts"
              items={savedExperts}
              emptyLabel="No saved experts yet"
              cta="Browse experts"
              onBrowse={() => go('agencies')}
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
            go={go}
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
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
                ) : (
                  <TravelerAvatar seed={profile.id} size={64} />
                )}
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

            <div className="border border-ink-200 bg-white p-6">
              <h2 className="text-sm font-bold text-ink-900">Personal information</h2>
              <p className="mt-1 text-xs text-ink-500">Some of this stays private; none of it is shown publicly today.</p>

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
  go,
  publisher,
  loading,
  countries,
  userId,
  userEmail,
  onCreated,
}: {
  go: (view: View) => void;
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
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => go('submit-program')}
              className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Submit a program
            </button>
            <button
              onClick={() => go('submit-program')}
              className="rounded-lg border border-ink-200 px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
            >
              Submit a job
            </button>
          </div>
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
