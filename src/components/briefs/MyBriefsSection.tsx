import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Eye, FileSignature } from 'lucide-react';
import { useAuth, type Profile } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { CATEGORIES_BY_GROUP } from '@/lib/jobTaxonomy';
import { EXPERIENCE_OPTIONS } from '@/lib/plans';
import { OfferSteps } from '@/components/briefs/OfferDemo';
import { CircleFlag } from '@/components/common/CircleFlag';
import { formatRelativeTime } from '@/lib/dates';
import { nav } from '@/lib/pageLayout';
import { useMyPlan } from '@/lib/plans';
import { BRIEF_STATUS_LABEL, briefPath, fetchMyBriefs, type MyBrief } from '@/lib/briefs';
import { DOC_PRICE, fetchOfferCredits, PRO_MONTHLY_DOCS, SIGNUP_CREDIT, usd, useOfferCredits, type OfferCredits } from '@/lib/sponsorOffer';
import { CreditMeter, OfferFlags, OfferInfo } from '@/components/briefs/OfferBits';

const STATUS_TONE: Record<string, string> = {
  created: 'bg-ink-100 text-ink-600',
  sent: 'bg-sky-50 text-sky-700',
  replied: 'bg-emerald-50 text-emerald-700',
  interview: 'bg-emerald-50 text-emerald-700',
  offer: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-ink-100 text-ink-600',
  no_reply: 'bg-amber-50 text-amber-800',
};

/**
 * "Your sponsorship documents" — top of the dashboard. Credit, the details
 * that go on every document (editable here), and the documents made.
 */
export function MyBriefsSection() {
  const { profile, refreshProfile } = useAuth();
  const credits = useOfferCredits();
  const [briefs, setBriefs] = useState<MyBrief[] | null | undefined>(undefined);
  useEffect(() => {
    fetchMyBriefs().then(setBriefs);
  }, []);

  if (briefs === null || !profile) return null; // table missing (migration not run)

  const list = briefs ?? [];
  const sent = list.filter((b) => b.status !== 'created').length;
  const viewed = list.filter((b) => b.view_count > 0).length;

  return (
    <section aria-labelledby="docs-title" className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      {/* Header: what it is + your money */}
      <div className="flex flex-col gap-4 bg-brand-700 px-4 py-4 text-white sm:flex-row sm:items-center sm:gap-6 sm:px-6">
        <div className="min-w-0 sm:flex-1">
          <div className="flex items-center gap-1.5">
            <FileSignature className="h-[18px] w-[18px] shrink-0" aria-hidden />
            <h2 id="docs-title" className="text-[17px] font-bold leading-snug">
              Your sponsorship documents
            </h2>
            <OfferInfo light />
          </div>
          <p className="mt-1 text-[13px] leading-5 text-white/80">Attach one to an application so the employer sees exactly how to sponsor you.</p>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-white/15 pt-3 sm:justify-end sm:border-0 sm:pt-0">
          <div className="sm:text-right">
            <p className="text-[22px] font-bold leading-none tabular-nums">{credits ? usd(credits.balance) : '…'}</p>
            <p className="mt-1 text-[12px] text-white/75">
              credit · {usd(DOC_PRICE)} per document{credits?.pro ? ` · Pro ${credits.proLeft}/${PRO_MONTHLY_DOCS} left` : ''}
            </p>
          </div>
          <a href="/pricing#offers" onClick={(e) => (e.preventDefault(), nav('/pricing#offers'))} className="shrink-0 rounded-lg bg-white px-3.5 py-2 text-[13px] font-bold text-brand-700 hover:bg-brand-50">
            Add credit
          </a>
        </div>
      </div>

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <DocumentDetails profile={profile} onSaved={refreshProfile} />

        <div>
          <p className="text-[15px] font-bold text-ink-950">How it works</p>
          <div className="mt-2">
            <OfferSteps />
          </div>

          <div className="mt-5 flex items-baseline justify-between gap-2">
            <p className="text-[15px] font-bold text-ink-950">Documents</p>
            {list.length > 0 && (
              <p className="text-[12px] text-ink-500">
                {list.length} made · {sent} sent · {viewed} opened by the company
              </p>
            )}
          </div>
          {briefs === undefined ? (
            <p className="mt-2 text-[13px] text-ink-400">Loading…</p>
          ) : list.length === 0 ? (
            <div className="mt-2 flex flex-col items-start gap-3 rounded-lg bg-[#1D4ED8]/5 p-4">
              <OfferFlags size={22} />
              <p className="text-[14px] leading-6 text-ink-700">Open any job and press “Sponsorship offer”. Your first document is covered by your {usd(SIGNUP_CREDIT)} credit.</p>
              <a href="/offers" onClick={(e) => (e.preventDefault(), nav('/offers'))} className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-800">
                Pick a job
              </a>
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {list.map((b) => (
                <li key={b.id}>
                  <a
                    href={briefPath(b.share_id)}
                    onClick={(e) => (e.preventDefault(), nav(briefPath(b.share_id)))}
                    className="flex items-center gap-3 rounded-lg bg-[#1D4ED8]/5 px-3 py-3 transition-colors hover:bg-[#1D4ED8]/10"
                  >
                    <CircleFlag countryCode={b.country_code} size={22} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-ink-900">{b.job_title}</span>
                      <span className="block truncate text-[12px] text-ink-500">
                        {b.company_name} · {formatRelativeTime(b.created_at, '')}
                      </span>
                    </span>
                    <span className="hidden items-center gap-1 text-[12px] text-ink-500 sm:flex" title="Opens by anyone other than you">
                      <Eye className="h-3.5 w-3.5" /> {b.view_count}
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[b.status] ?? STATUS_TONE.created}`}>{BRIEF_STATUS_LABEL[b.status]}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/** Name, role, specialization, experience, LinkedIn — what every document shows about you. */
function DocumentDetails({ profile, onSaved }: { profile: Profile; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(profile.full_name ?? '');
  const [role, setRole] = useState(profile.occupation ?? '');
  const [spec, setSpec] = useState(profile.specialization ?? '');
  const [exp, setExp] = useState(EXPERIENCE_OPTIONS.includes(profile.experience ?? '') ? (profile.experience as string) : '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | string>('idle');
  const knownRole = CATEGORIES_BY_GROUP.some((g) => g.labels.includes(role));
  const longExperience = Boolean(profile.experience && !EXPERIENCE_OPTIONS.includes(profile.experience));

  const checks = [
    { ok: name.trim().length > 1, t: 'Full name' },
    { ok: Boolean(role.trim()), t: 'Role' },
    { ok: Boolean(spec.trim()), t: 'Specialization' },
    { ok: Boolean(exp), t: 'Experience' },
    { ok: Boolean(profile.linkedin_url), t: 'LinkedIn (optional)' },
  ];
  const done = checks.filter((c) => c.ok).length;
  const dirty = name !== (profile.full_name ?? '') || role !== (profile.occupation ?? '') || spec !== (profile.specialization ?? '') || (exp && exp !== profile.experience);

  const save = async () => {
    setState('saving');
    const patch: Record<string, string | null> = {
      full_name: name.trim() || null,
      occupation: role.trim().slice(0, 80) || null,
      specialization: spec.trim().slice(0, 120) || null,
    };
    // Don't overwrite a written experience summary unless a level was picked.
    if (exp) patch.experience = exp;
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id);
    if (error) return setState(error.message);
    await onSaved();
    setState('saved');
    window.setTimeout(() => setState('idle'), 1800);
  };

  const input = 'mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[14px] text-ink-900 outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15';
  const headline = [[role, spec].filter(Boolean).join(', '), exp].filter(Boolean).join(' · ');

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[15px] font-bold text-ink-950">On every document</p>
        <span className="text-[12px] font-semibold text-ink-500">{done} of {checks.length} ready</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
        <span className="block h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${(done / checks.length) * 100}%` }} />
      </div>

      <label className="mt-4 block">
        <span className="text-[13px] font-semibold text-ink-800">Full name</span>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} className={input} />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[13px] font-semibold text-ink-800">Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={input}>
            <option value="">Choose…</option>
            {role && !knownRole && <option value={role}>{role}</option>}
            {CATEGORIES_BY_GROUP.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.labels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[13px] font-semibold text-ink-800">Experience</span>
          <select value={exp} onChange={(e) => setExp(e.target.value)} className={input}>
            <option value="">{longExperience ? 'Pick a level' : 'Choose…'}</option>
            {EXPERIENCE_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 block">
        <span className="text-[13px] font-semibold text-ink-800">Specialization</span>
        <input value={spec} onChange={(e) => setSpec(e.target.value.slice(0, 120))} placeholder="e.g. Building management systems, Siemens Desigo" className={input} />
      </label>

      <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px] sm:grid-cols-3">
        {checks.map((c) => (
          <li key={c.t} className={`flex items-center gap-1.5 ${c.ok ? 'text-ink-800' : 'text-ink-400'}`}>
            {c.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4" />}
            {c.t}
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-lg bg-ink-50 px-3 py-2.5 text-[13px]">
        <span className="text-ink-500">Shown as </span>
        <span className="font-semibold text-ink-900">{name.trim() || 'Your name'}</span>
        {headline && <span className="text-ink-700"> — {headline}</span>}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={!dirty || state === 'saving'} className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-800 disabled:opacity-50">
          {state === 'saving' ? 'Saving…' : 'Save details'}
        </button>
        {state === 'saved' && <span className="text-[12px] font-semibold text-emerald-600">Saved</span>}
        {state !== 'idle' && state !== 'saving' && state !== 'saved' && <span className="text-[12px] text-rose-600">{state}</span>}
        {!profile.linkedin_url && <span className="text-[12px] text-ink-500">Add LinkedIn in Settings.</span>}
      </div>
    </div>
  );
}

/** Plan + offer credits, in the profile sidebar. */
export function PlanCard() {
  const { isPro, sub, loading } = useMyPlan();
  const [credits, setCredits] = useState<OfferCredits | null>(null);
  useEffect(() => {
    fetchOfferCredits().then(setCredits);
  }, []);
  if (loading) return null;
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-ink-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-ink-500">Your plan</p>
        <a href="/pricing" onClick={(e) => (e.preventDefault(), nav('/pricing'))} className="text-[13px] font-semibold text-[#1D4ED8] hover:underline">
          {isPro ? 'Manage' : 'Upgrade'}
        </a>
      </div>
      <p className="mt-0.5 text-[17px] font-bold text-ink-950">{isPro ? 'MadeVisa Pro' : 'Free'}</p>
      {isPro && sub?.current_period_end && <p className="text-[12px] text-ink-500">Until {new Date(sub.current_period_end).toLocaleDateString()}</p>}
      <div className="mt-3 border-t border-ink-100 pt-3">
        <div className="flex items-center gap-1">
          <p className="text-[13px] font-semibold text-ink-800">Sponsor offers</p>
          <OfferInfo />
        </div>
        <div className="mt-1.5">{credits ? <CreditMeter credits={credits} /> : <span className="text-[13px] text-ink-400">…</span>}</div>
        {credits && credits.left === 0 && (
          <a href="/pricing#offers" onClick={(e) => (e.preventDefault(), nav('/pricing#offers'))} className="mt-2 inline-block text-[13px] font-semibold text-[#1D4ED8] hover:underline">
            Top up credit
          </a>
        )}
      </div>
    </div>
  );
}
