import { useState } from 'react';
import { Check, HelpCircle, Pencil, RotateCcw, X } from 'lucide-react';
import { allCountries } from '@/data/allCountries';
import { countryName } from '@/lib/pageLayout';
import { ANSWERABLE, REQUIREMENT_LABEL, type Requirement } from '@/data/visa';
import { STATUS_COPY, type Answer, type RouteStatus, useDestinationProfile } from '@/lib/destinationEligibility';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CompanyLogo } from '@/components/common/CompanyLogo';

const TONE: Record<'good' | 'ok' | 'neutral' | 'bad', { light: string; dark: string; dot: string }> = {
  good: { light: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dark: 'bg-emerald-400/20 text-emerald-100 ring-emerald-300/40', dot: 'bg-emerald-500' },
  ok: { light: 'bg-sky-50 text-sky-700 ring-sky-200', dark: 'bg-sky-300/20 text-sky-50 ring-sky-200/40', dot: 'bg-sky-500' },
  neutral: { light: 'bg-ink-100 text-ink-600 ring-ink-200', dark: 'bg-white/15 text-white ring-white/25', dot: 'bg-ink-400' },
  bad: { light: 'bg-amber-50 text-amber-800 ring-amber-200', dark: 'bg-amber-300/20 text-amber-50 ring-amber-200/40', dot: 'bg-amber-500' },
};

export function StatusBadge({ status, onDark = false, className = '' }: { status: RouteStatus; onDark?: boolean; className?: string }) {
  const { label, tone } = STATUS_COPY[status];
  const t = TONE[tone];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold ring-1 ${onDark ? t.dark : t.light} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/** Horizontal share bar (0–100) in MadeVisa blue. */
export function RateBar({ value, className = '' }: { value: number | null; className?: string }) {
  return (
    <span className={`block h-2 overflow-hidden rounded-full bg-[#1D4ED8]/10 ${className}`}>
      <span className="block h-full rounded-full bg-[#1D4ED8] transition-[width] duration-700 ease-out" style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
    </span>
  );
}

export function CompanyMark({ name, logoUrl, size = 36 }: { name: string; logoUrl: string | null; size?: number }) {
  if (!logoUrl) return <CompanyLogo name={name} size={size} />;
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-200 bg-white p-1" style={{ width: size, height: size }}>
      <img src={logoUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
    </span>
  );
}

const QUESTION: Record<Requirement, string> = {
  degree: 'University degree',
  'job-offer': 'Job offer abroad',
  experience: '3+ years experience',
  'remote-income': 'Remote income',
  funds: 'Savings for 6–12 months',
  admission: 'University admission',
  business: 'Business or startup plan',
  'salary-threshold': '',
  points: '',
  endorsement: '',
  'recent-graduate': '',
  'employer-transfer': '',
};

/**
 * "Your profile" — name, passport and yes/no answers. Everything the
 * destination pages personalise on. Guests' answers stay in this browser.
 */
export function ProfileCard({ compact = false }: { compact?: boolean }) {
  const p = useDestinationProfile();
  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState(p.name);

  const saveName = () => {
    p.setName(draft.trim());
    setEditingName(false);
  };

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold tracking-tight text-ink-950">Your profile</h2>
          <p className="mt-0.5 text-[13px] text-ink-600">
            {p.nameFromAccount ? 'Name from your account. ' : ''}Answers stay in this browser and personalise every destination.
          </p>
        </div>
        {p.answeredCount > 0 && (
          <button onClick={p.reset} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-ink-500 hover:bg-ink-50 hover:text-ink-800">
            <RotateCcw className="h-3.5 w-3.5" /> Clear answers
          </button>
        )}
      </div>

      <div className={`mt-5 grid gap-4 ${compact ? 'lg:grid-cols-[minmax(0,260px)_minmax(0,260px)_minmax(0,1fr)]' : 'sm:grid-cols-2'}`}>
        <label className="block min-w-0">
          <span className="text-[13px] font-medium text-ink-600">Name</span>
          {p.nameFromAccount || (!editingName && p.name) ? (
            <span className="mt-1.5 flex h-11 items-center justify-between gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 text-[15px] font-semibold text-ink-900">
              <span className="truncate">{p.name}</span>
              {!p.nameFromAccount && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(p.name);
                    setEditingName(true);
                  }}
                  className="grid h-7 w-7 place-items-center rounded-md text-ink-500 hover:bg-white hover:text-ink-900"
                  aria-label="Edit name"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ) : (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              autoFocus={editingName}
              maxLength={60}
              placeholder="What should we call you?"
              className="mt-1.5 h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-[15px] font-medium text-ink-900 outline-none placeholder:text-ink-400 focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15"
            />
          )}
        </label>

        <label className="block min-w-0">
          <span className="text-[13px] font-medium text-ink-600">Passport</span>
          <span className="mt-1.5 flex h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white pl-3 focus-within:border-[#1D4ED8] focus-within:ring-2 focus-within:ring-[#1D4ED8]/15">
            <CircleFlag countryCode={p.citizenship} label={countryName(p.citizenship)} size={20} />
            <select
              value={p.citizenship ?? ''}
              onChange={(e) => p.setCitizenship(e.target.value || null)}
              className="h-full min-w-0 flex-1 cursor-pointer bg-transparent pr-2 text-[15px] font-medium text-ink-900 outline-none"
            >
              <option value="">Choose your passport</option>
              {allCountries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </span>
        </label>

        <div className={compact ? 'min-w-0' : 'sm:col-span-2'}>
          <span className="text-[13px] font-medium text-ink-600">Do you have…</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {ANSWERABLE.map((r) => (
              <AnswerChip key={r} label={QUESTION[r]} title={REQUIREMENT_LABEL[r]} value={p.answers[r] ?? null} onChange={(v) => p.setAnswer(r, v)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Tap to cycle: not answered → yes → no → not answered. */
function AnswerChip({ label, title, value, onChange }: { label: string; title: string; value: Answer; onChange: (v: Answer) => void }) {
  const next: Answer = value === null ? true : value === true ? false : null;
  const cls =
    value === true
      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
      : value === false
        ? 'border-ink-300 bg-ink-100 text-ink-500 line-through decoration-ink-400'
        : 'border-ink-200 bg-white text-ink-700 hover:border-[#1D4ED8]/40';
  const Icon = value === true ? Check : value === false ? X : HelpCircle;
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      title={`${title} — ${value === true ? 'yes' : value === false ? 'no' : 'not answered'}. Tap to change.`}
      aria-label={`${title}: ${value === true ? 'yes' : value === false ? 'no' : 'not answered'}`}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors ${cls}`}
    >
      <Icon className={`h-3.5 w-3.5 ${value === true ? 'text-emerald-600' : value === false ? 'text-ink-400' : 'text-ink-400'}`} />
      {label}
    </button>
  );
}
