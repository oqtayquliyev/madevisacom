import { useEffect, useState } from 'react';
import { ArrowUpRight, BadgeCheck, Briefcase, Building2, Check, Copy, ExternalLink, Eye, Info, Laptop, MapPin, Quote, ShieldCheck, UserRound } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { LinkedInLogo } from '@/components/common/LinkedInLogo';
import { SoftCard, SoftPanel } from '@/components/charts/SoftCharts';
import { CANDIDATE_COVER_THIRD_PERSON, destinationPath } from '@/data/visa';
import {
  BRIEF_STATUS_CHOICES,
  BRIEF_STATUS_LABEL,
  briefMessage,
  briefUrl,
  fetchBrief,
  fetchBriefProof,
  findRoute,
  recordBriefView,
  updateBriefStatus,
  withdrawBrief,
  type BriefProof,
  type BriefStatus,
  type PublicBrief,
} from '@/lib/briefs';
import { WRAP, nav } from '@/lib/pageLayout';

type Props = { shareId: string; go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

export function BriefPage({ shareId, go, onAuth }: Props) {
  const [brief, setBrief] = useState<PublicBrief | null | undefined>(undefined);
  const [proof, setProof] = useState<BriefProof | null>(null);

  useEffect(() => {
    let alive = true;
    setBrief(undefined);
    fetchBrief(shareId).then((b) => {
      if (!alive) return;
      setBrief(b);
      if (!b) return;
      if (!b.is_owner) recordBriefView(shareId);
      fetchBriefProof(b.country_code, b.job_function).then((p) => alive && setProof(p));
    });
    return () => {
      alive = false;
    };
  }, [shareId]);

  useSeo({
    title: brief ? `${brief.candidate_name} for ${brief.job_title} at ${brief.company_name}` : 'Hiring brief',
    description: 'A hiring brief prepared by a candidate on MadeVisa.',
    path: `/brief/${shareId}`,
    noindex: true,
  });

  if (brief === undefined) {
    return (
      <div className="min-h-screen bg-white">
        <LandingHeader go={go} onAuth={onAuth} />
        <div className="bg-brand-700">
          <div className={`${WRAP} py-12`}>
            <div className="h-9 w-2/3 max-w-xl rounded-md bg-white/15" />
            <div className="mt-4 h-5 w-1/2 max-w-md rounded-md bg-white/10" />
          </div>
        </div>
      </div>
    );
  }
  if (!brief) return <NotFoundPage go={go} onAuth={onAuth} />;

  const found = findRoute(brief.country_code, brief.route_id);
  const guide = found?.guide;
  const route = found?.route;
  const employer = route?.employer;
  const first = brief.candidate_name.split(/\s+/)[0];
  const place = [brief.job_city, guide?.name].filter(Boolean).join(', ');
  const requiredSteps = employer?.steps.filter((s) => !s.optional).length ?? 0;

  return (
    <div className="min-h-screen bg-white text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />

      {brief.is_owner && <OwnerBar brief={brief} onChange={(status) => setBrief({ ...brief, status })} />}

      {/* HEADER */}
      <section className="bg-brand-700 text-white">
        <div className={`${WRAP} pb-10 pt-8 sm:pb-12`}>
          <p className="text-[14px] font-semibold text-white/75">Hiring brief · prepared by the candidate</p>
          <h1 className="mt-2 max-w-4xl text-[28px] font-bold leading-tight tracking-tight sm:text-[38px]">
            Hiring {first} as {brief.job_title}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[16px] text-white/85">
            <span className="flex items-center gap-1.5">
              <Building2 className="h-[18px] w-[18px] text-white/60" /> {brief.company_name}
            </span>
            {place && (
              <span className="flex items-center gap-1.5">
                <CircleFlag countryCode={brief.country_code} label={guide?.name} size={18} /> {place}
              </span>
            )}
          </p>
          {route && employer && (
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <HeroPill label="Route" value={route.name} />
              <HeroPill label="Sponsor licence" value={employer.licenceNeeded ? 'Needed' : 'Not needed'} />
              <HeroPill label="Steps on your side" value={String(requiredSteps)} />
            </div>
          )}
        </div>
      </section>

      <div className={`${WRAP} grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_320px]`}>
        <main className="min-w-0 space-y-6">
          {!route || !employer || !guide ? (
            <SoftPanel title="Visa route">
              <p className="text-[15px] text-ink-600">The visa details for this brief are being updated. {first} can explain the route directly.</p>
            </SoftPanel>
          ) : (
            <>
              <SoftPanel
                title="What you'd do"
                sub={employer.licenceNeeded ? 'This route needs a sponsor licence on your side.' : 'No sponsor licence is needed for this route.'}
              >
                {employer.licenceNote && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2.5 text-[14px] leading-6 text-amber-900">{employer.licenceNote}</p>}
                <ol className="space-y-3">
                  {employer.steps.map((st, i) => (
                    <li key={i} className="flex gap-4">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-bold ${st.optional ? 'bg-[#1D4ED8]/10 text-[#1D4ED8]' : 'bg-[#1D4ED8] text-white'}`}>{i + 1}</span>
                      <div className="min-w-0 pt-1">
                        <p className="text-[15px] leading-6 text-ink-800">{st.text}</p>
                        <p className="mt-1 flex flex-wrap gap-2 text-[13px]">
                          {st.effort && <span className="rounded-md bg-[#1D4ED8]/5 px-2 py-0.5 font-semibold text-[#1D4ED8]">{st.effort}</span>}
                          {st.optional && <span className="rounded-md bg-ink-100 px-2 py-0.5 font-semibold text-ink-600">Optional</span>}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <SoftCard>
                    <p className="text-[14px] font-bold text-ink-950">Timeline</p>
                    <p className="mt-1 text-[14px] leading-6 text-ink-600">{employer.timeline}</p>
                  </SoftCard>
                  {employer.employerCosts && (
                    <SoftCard>
                      <p className="text-[14px] font-bold text-ink-950">Costs on your side</p>
                      <p className="mt-1 text-[14px] leading-6 text-ink-600">{employer.employerCosts}</p>
                    </SoftCard>
                  )}
                </div>
              </SoftPanel>

              <SoftPanel title={`What ${first} covers`}>
                {brief.covers.length === 0 && !brief.remote_first ? (
                  <p className="text-[15px] text-ink-600">{first} hasn't listed costs they'll cover.</p>
                ) : (
                  <ul className="grid gap-2.5 sm:grid-cols-2">
                    {brief.covers.map((c) => (
                      <li key={c} className="flex items-start gap-2.5 rounded-lg bg-emerald-50/70 px-3 py-2.5 text-[14px] font-medium text-ink-800">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        {CANDIDATE_COVER_THIRD_PERSON[c]}
                      </li>
                    ))}
                  </ul>
                )}
                {brief.remote_first && (
                  <div className="mt-4 flex gap-3 rounded-lg border border-[#1D4ED8]/20 bg-[#1D4ED8]/5 p-4">
                    <Laptop className="mt-0.5 h-5 w-5 shrink-0 text-[#1D4ED8]" />
                    <div>
                      <p className="text-[15px] font-bold text-ink-950">Open to starting remotely first</p>
                      <p className="mt-1 text-[14px] leading-6 text-ink-600">
                        {first} can start as a contractor or through an Employer of Record from their current country, then relocate once it works for both sides. No visa
                        is needed to begin.
                      </p>
                    </div>
                  </div>
                )}
              </SoftPanel>

              {brief.note && (
                <div className="flex gap-3 rounded-xl border border-ink-200 bg-white p-5">
                  <Quote className="h-5 w-5 shrink-0 text-[#1D4ED8]" />
                  <div>
                    <p className="whitespace-pre-line text-[15px] leading-7 text-ink-800">{brief.note}</p>
                    <p className="mt-2 text-[13px] font-semibold text-ink-500">— {brief.candidate_name}</p>
                  </div>
                </div>
              )}

              <SoftPanel title={`The visa route: ${route.name}`}>
                <p className="text-[15px] leading-7 text-ink-700">{route.summary}</p>
                <dl className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-[#1D4ED8]/5 p-3 text-[13px] sm:grid-cols-3">
                  <div>
                    <dt className="text-ink-500">Valid for</dt>
                    <dd className="mt-0.5 font-semibold text-ink-900">{route.validity}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Counts toward residence</dt>
                    <dd className="mt-0.5 font-semibold text-ink-900">{route.leadsToPR ? 'Yes' : 'No'}</dd>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <dt className="text-ink-500">Official source</dt>
                    <dd className="mt-0.5">
                      <a href={route.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#1D4ED8] hover:text-brand-800">
                        Government page <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </dd>
                  </div>
                </dl>
                {route.note && <p className="mt-3 text-[13px] leading-5 text-ink-500">{route.note}</p>}
                <a
                  href={destinationPath(guide)}
                  onClick={(e) => {
                    e.preventDefault();
                    nav(destinationPath(guide));
                  }}
                  className="mt-4 inline-flex items-center gap-1 text-[14px] font-semibold text-[#1D4ED8] hover:text-brand-800"
                >
                  All visa routes for {guide.name} <ArrowUpRight className="h-4 w-4" />
                </a>
              </SoftPanel>

              {proof && proof.companies > 0 && (
                <SoftPanel title="Other employers already do this">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ProofStat value={proof.companies} label={`companies offered visa sponsorship in ${guide.name} in the last 90 days`} />
                    {brief.job_function && proof.function_companies > 0 ? (
                      <ProofStat value={proof.function_companies} label={`of them for ${brief.job_function} roles`} />
                    ) : (
                      <ProofStat value={proof.jobs} label="visa-sponsored jobs they posted" />
                    )}
                  </div>
                  <p className="mt-3 text-[12px] text-ink-500">From job listings on MadeVisa.</p>
                </SoftPanel>
              )}
            </>
          )}

          <p className="flex items-start gap-2 rounded-lg bg-ink-50 px-4 py-3 text-[13px] leading-6 text-ink-600">
            <Info className="mt-1 h-4 w-4 shrink-0 text-ink-400" />
            Prepared by the candidate using MadeVisa's visa guides. It's general information, not legal advice. Please confirm the details with the official source or an
            immigration professional before acting on it.
          </p>
        </main>

        {/* CANDIDATE */}
        <aside className="lg:sticky lg:top-[96px] lg:self-start">
          <div className="rounded-xl border border-ink-200 bg-white p-5">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[#1D4ED8]/10 text-[#1D4ED8]">
              <UserRound className="h-7 w-7" />
            </span>
            <p className="mt-3 flex items-center gap-2 text-[20px] font-bold leading-tight text-ink-950">
              {brief.candidate_name}
              {brief.candidate_linkedin && (
                <a href={brief.candidate_linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn profile" className="shrink-0 hover:opacity-80">
                  <LinkedInLogo size={20} />
                </a>
              )}
            </p>
            {brief.candidate_headline && <p className="mt-1 text-[14px] leading-6 text-ink-600">{brief.candidate_headline}</p>}
            <ul className="mt-4 space-y-2 border-t border-ink-100 pt-4 text-[14px] text-ink-700">
              <li className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-ink-400" /> Applying for {brief.job_title}
              </li>
              {place && (
                <li className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-ink-400" /> {place}
                </li>
              )}
            </ul>
            <div className="mt-5 space-y-2">
              {brief.candidate_linkedin && (
                <a
                  href={brief.candidate_linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-800"
                >
                  Message on LinkedIn
                </a>
              )}
              {brief.candidate_username && (
                <a
                  href={`/u/${brief.candidate_username}`}
                  onClick={(e) => {
                    e.preventDefault();
                    nav(`/u/${brief.candidate_username}`);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink-200 px-4 py-2.5 text-[15px] font-semibold text-ink-800 hover:border-[#1D4ED8]/40 hover:text-[#1D4ED8]"
                >
                  View MadeVisa profile
                </a>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-ink-50 p-4 text-[13px] leading-5 text-ink-600">
            <ShieldCheck className="mb-1.5 h-4 w-4 text-ink-400" />
            Want someone to handle the paperwork? Verified immigration experts are listed in the{' '}
            <a
              href="/network?tab=experts"
              onClick={(e) => {
                e.preventDefault();
                nav('/network?tab=experts');
              }}
              className="font-semibold text-[#1D4ED8] hover:text-brand-800"
            >
              MadeVisa Network
            </a>
            .
          </div>
        </aside>
      </div>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function HeroPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-white">
      {label}
      <span className="rounded-md bg-white px-2 py-0.5 text-[15px] font-bold text-brand-700">{value}</span>
    </span>
  );
}

function ProofStat({ value, label }: { value: number; label: string }) {
  return (
    <SoftCard>
      <p className="text-[32px] font-bold leading-none tabular-nums text-ink-950">{value.toLocaleString()}</p>
      <p className="mt-2 text-[14px] leading-5 text-ink-600">{label}</p>
    </SoftCard>
  );
}

/** Only the candidate sees this: share tools, views and the outcome they report. */
function OwnerBar({ brief, onChange }: { brief: PublicBrief; onChange: (s: BriefStatus) => void }) {
  const [copied, setCopied] = useState<'link' | 'message' | null>(null);
  const [saving, setSaving] = useState(false);
  const url = briefUrl(brief.share_id);

  const copy = async (what: 'link' | 'message') => {
    await navigator.clipboard.writeText(what === 'link' ? url : briefMessage(brief, url));
    setCopied(what);
    window.setTimeout(() => setCopied(null), 2000);
    // Copying is the best signal it's being sent.
    if (brief.status === 'created') {
      onChange('sent');
      updateBriefStatus(brief.share_id, 'sent');
    }
  };

  const setStatus = async (s: BriefStatus) => {
    setSaving(true);
    const res = await updateBriefStatus(brief.share_id, s);
    setSaving(false);
    if (res.ok) onChange(s);
  };

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className={`${WRAP} flex flex-col gap-3 py-3 lg:flex-row lg:items-center`}>
        <p className="text-[14px] font-semibold text-amber-900">This is your brief. Only you see this bar.</p>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[14px] font-semibold text-ink-700 ring-1 ring-amber-200">
            <Eye className="h-4 w-4 text-ink-400" /> {brief.view_count ?? 0} {brief.view_count === 1 ? 'view' : 'views'}
          </span>
          <label className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-[14px] ring-1 ring-amber-200">
            <span className="text-ink-500">Status</span>
            <select
              value={brief.status ?? 'created'}
              disabled={saving}
              onChange={(e) => setStatus(e.target.value as BriefStatus)}
              className="bg-transparent font-semibold text-ink-900 outline-none"
            >
              {BRIEF_STATUS_CHOICES.map((s) => (
                <option key={s} value={s}>
                  {BRIEF_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => copy('link')} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[14px] font-semibold text-ink-800 ring-1 ring-amber-200 hover:bg-amber-100">
            {copied === 'link' ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} {copied === 'link' ? 'Copied' : 'Copy link'}
          </button>
          <button onClick={() => copy('message')} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-2 text-[14px] font-semibold text-white hover:bg-brand-800">
            {copied === 'message' ? <Check className="h-4 w-4" /> : <BadgeCheck className="h-4 w-4" />} {copied === 'message' ? 'Message copied' : 'Copy message with link'}
          </button>
          <button
            onClick={async () => {
              if (!window.confirm('Withdraw this brief? The link will stop working.')) return;
              const res = await withdrawBrief(brief.share_id);
              if (res.ok) nav('/profile');
            }}
            className="rounded-lg px-3 py-2 text-[14px] font-semibold text-ink-500 hover:text-rose-600"
          >
            Withdraw
          </button>
        </div>
      </div>
    </div>
  );
}
