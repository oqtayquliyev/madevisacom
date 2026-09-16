import { useState } from 'react';
import { CheckCircle2, ChevronDown, Sparkles, UserRound, X } from 'lucide-react';
import { nationalities } from '@/data';
import { usePersonalization } from '@/lib/personalization';
import type { EligibilityResult } from '@/lib/personalization';

/**
 * Inline "tell us about you" bar shown at the top of the Jobs and
 * Programs boards. Everything is stored locally (see lib/personalization)
 * so it works for signed-out visitors, and every listing card below can
 * immediately compute a fit badge from it.
 */
export function PersonalizationBar() {
  const { profile, updateProfile, isComplete, clear } = usePersonalization();
  const [expanded, setExpanded] = useState(!isComplete);

  return (
    <div className="border border-brand-200 bg-brand-50/60">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
            <UserRound className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-ink-900">
              {isComplete ? 'Showing results personalized for you' : 'See what you actually qualify for'}
            </p>
            <p className="text-xs text-ink-500">
              {isComplete
                ? `${labelFor(profile.citizenship)} citizen · based in ${labelFor(profile.currentLocation)} · age ${profile.age}`
                : 'Add your citizenship, current location and age — takes 10 seconds'}
            </p>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-brand-100 bg-white px-4 py-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px_auto] sm:items-end">
            <Field label="Citizenship">
              <select
                value={profile.citizenship ?? ''}
                onChange={(event) => updateProfile({ citizenship: event.target.value || null })}
                className="h-11 w-full appearance-none rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              >
                <option value="">Select</option>
                {nationalities.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Currently based in">
              <select
                value={profile.currentLocation ?? ''}
                onChange={(event) => updateProfile({ currentLocation: event.target.value || null })}
                className="h-11 w-full appearance-none rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              >
                <option value="">Select</option>
                {nationalities.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Age">
              <input
                type="number"
                min={16}
                max={90}
                value={profile.age ?? ''}
                onChange={(event) =>
                  updateProfile({ age: event.target.value ? Number(event.target.value) : null })
                }
                placeholder="e.g. 28"
                className="h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </Field>

            <div className="flex items-center gap-2">
              {isComplete && (
                <button
                  type="button"
                  onClick={clear}
                  className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-xs font-semibold text-ink-500 hover:bg-ink-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Reset
                </button>
              )}
              {isComplete && (
                <span className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Saved
                </span>
              )}
            </div>
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-400">
            <Sparkles className="h-3.5 w-3.5 text-brand-500" />
            Kept on this device only — used to flag whether each listing fits you.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-ink-500">{label}</label>
      {children}
    </div>
  );
}

function labelFor(code: string | null) {
  if (!code) return '—';
  return nationalities.find((c) => c.code === code)?.name ?? code;
}

const statusStyles: Record<EligibilityResult['status'], string> = {
  fit: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  'not-fit': 'bg-rose-50 text-rose-700 border-rose-200',
  unknown: 'bg-ink-50 text-ink-500 border-ink-200',
};

const statusLabels: Record<EligibilityResult['status'], string> = {
  fit: 'You likely qualify',
  partial: 'Partial match',
  'not-fit': 'Unlikely to qualify',
  unknown: 'Add your profile',
};

/** Small badge rendered on each opportunity card showing computed fit. */
export function EligibilityBadge({ result }: { result: EligibilityResult }) {
  return (
    <span
      title={result.reasons.join(' · ')}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold ${statusStyles[result.status]}`}
    >
      {result.status === 'fit' && <CheckCircle2 className="h-3 w-3" />}
      {statusLabels[result.status]}
    </span>
  );
}
