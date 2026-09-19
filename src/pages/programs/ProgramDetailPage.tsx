import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Banknote,
  Building2,
  CalendarClock,
  Check,
  Landmark,
  Loader2,
  Share2,
  UserRound,
  Users,
} from 'lucide-react';
import type { View } from '@/types';
import { fetchProgramById, getApplicationWindowStatus, toEligibilityCriteria, type OrgType, type SponsoredProgram } from '@/lib/programs';
import { computeEligibility, usePersonalization } from '@/lib/personalization';
import { EligibilityBadge } from '@/components/opportunities/PersonalizationBar';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { useSeo } from '@/lib/seo';

type ProgramDetailPageProps = {
  id: string;
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

const orgIcon: Record<OrgType, typeof Building2> = {
  agency: Building2,
  company: Building2,
  government: Landmark,
  expert: UserRound,
};

const windowCopy = {
  open: { label: 'Applications open', className: 'bg-emerald-50 text-emerald-700' },
  upcoming: { label: 'Opens soon', className: 'bg-amber-50 text-amber-700' },
  closed: { label: 'Applications closed', className: 'bg-ink-100 text-ink-500' },
  rolling: { label: 'Rolling applications', className: 'bg-brand-50 text-brand-700' },
};

export function ProgramDetailPage({ id, go, onAuth }: ProgramDetailPageProps) {
  const { profile } = usePersonalization();
  const [program, setProgram] = useState<SponsoredProgram | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchProgramById(id).then(setProgram);
  }, [id]);

  useSeo({
    title: program ? program.title : 'Program',
    description: program?.description
      ? program.description.slice(0, 155)
      : 'View this sponsored program on MadeVisa, including eligibility, requirements and how to apply.',
    path: `/programs/${id}`,
    // Not-yet-loaded or removed programs shouldn't get indexed under this URL.
    noindex: program === null,
  });

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: program?.title, url });
        return;
      } catch {
        // user cancelled — fall through to copy
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (program === undefined) {
    return (
      <div className="min-h-screen bg-[#f8fafc]">
        <LandingHeader go={go} onAuth={onAuth} active="programs" />
        <div className="grid h-96 place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-ink-300" />
        </div>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="min-h-screen bg-[#f8fafc]">
        <LandingHeader go={go} onAuth={onAuth} active="programs" />
        <div className="mx-auto max-w-lg px-5 py-24 text-center">
          <h1 className="text-xl font-bold text-ink-900">Program not found</h1>
          <p className="mt-2 text-sm text-ink-500">It may have been removed or isn't published yet.</p>
          <button onClick={() => go('sponsored-programs')} className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Browse programs
          </button>
        </div>
      </div>
    );
  }

  const Icon = orgIcon[program.publisher?.org_type ?? 'company'];
  const eligibility = computeEligibility(toEligibilityCriteria(program), profile, program.country?.iso_code);
  const windowStatus = windowCopy[getApplicationWindowStatus(program)];

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="programs" />

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <button onClick={() => go('sponsored-programs')} className="flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800">
          <ArrowLeft className="h-3.5 w-3.5" />
          All programs
        </button>

        <div className="mt-5 overflow-hidden border border-ink-200 bg-white">
          {program.image_url ? (
            <img src={program.image_url} alt="" className="h-56 w-full object-cover" />
          ) : (
            <div className="grid h-40 w-full place-items-center bg-gradient-to-br from-brand-50 to-indigo-50">
              <Icon className="h-10 w-10 text-brand-300" />
            </div>
          )}

          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${windowCopy.rolling.className}`}>{program.category}</span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${windowStatus.className}`}>{windowStatus.label}</span>
              <EligibilityBadge result={eligibility} />
            </div>

            <h1 className="mt-3 font-slab text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{program.title}</h1>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink-500">
              <span className="flex items-center gap-1.5">
                <Icon className="h-4 w-4 text-ink-400" />
                {program.publisher?.name}
              </span>
              {program.country && (
                <span className="flex items-center gap-1.5">
                  <CircleFlag countryCode={program.country.iso_code} label={program.country.name} size={16} />
                  {program.country.name}
                </span>
              )}
            </div>

            {program.description && <p className="mt-5 text-sm leading-6 text-ink-600">{program.description}</p>}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {program.funding_text && (
                <InfoRow icon={Banknote} label="Funding" value={program.funding_text} />
              )}
              {program.spots_available != null && (
                <InfoRow icon={Users} label="Spots available" value={String(program.spots_available)} />
              )}
              {(program.applications_open_at || program.applications_close_at) && (
                <InfoRow
                  icon={CalendarClock}
                  label="Application window"
                  value={[
                    program.applications_open_at && `Opens ${program.applications_open_at}`,
                    program.applications_close_at && `Deadline ${program.applications_close_at}`,
                  ].filter(Boolean).join(' · ')}
                />
              )}
            </div>

            {program.requirements && (
              <div className="mt-6 rounded-lg bg-ink-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Requirements &amp; limits</p>
                <p className="mt-1.5 text-sm leading-6 text-ink-700">{program.requirements}</p>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={program.official_url || `mailto:${program.contact_email}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-brand-600 px-8 py-3.5 text-sm font-bold text-white shadow-soft-lg transition hover:-translate-y-0.5 hover:bg-brand-700"
              >
                Apply now
              </a>
              <button
                onClick={share}
                className="flex items-center gap-2 rounded-lg border border-ink-200 px-4 py-3.5 text-sm font-semibold text-ink-700 hover:bg-ink-50"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
                {copied ? 'Link copied' : 'Share'}
              </button>
            </div>
          </div>
        </div>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Banknote; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-ink-50 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
      <div>
        <p className="text-[11px] text-ink-400">{label}</p>
        <p className="text-sm font-semibold text-ink-800">{value}</p>
      </div>
    </div>
  );
}
