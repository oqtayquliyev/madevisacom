import { useState } from 'react';
import { CheckCircle2, ChevronDown, Globe2, MapPin, Sparkles } from 'lucide-react';
import { usePersonalization } from '@/lib/personalization';
import type { EligibilityResult } from '@/lib/personalization';
import { allCountries } from '@/data/allCountries';
import { CircleFlag } from '@/components/common/CircleFlag';

/**
 * Compact "who are you" row shown above the search bar on the Jobs,
 * Programs and Study pages. Citizenship and current location are
 * pre-filled from the visitor's detected country (see
 * lib/personalization) and can be changed with a flag dropdown.
 * Everything stays on this device; listing cards use it to compute
 * the fit badge.
 */
export function PersonalizationBar({ tone = 'light', variant = 'full' }: { tone?: 'light' | 'dark'; variant?: 'full' | 'location' } = {}) {
  const { profile, updateProfile } = usePersonalization();
  const onBlue = tone === 'dark';

  // Jobs page: just where the person is, nothing about citizenship.
  if (variant === 'location') {
    return (
      <div
        className={`flex flex-wrap items-center gap-2 text-xs font-medium ${onBlue ? 'text-white/80' : 'text-ink-500'}`}
        title="Kept on this device only."
      >
        <MapPin className={`h-3.5 w-3.5 ${onBlue ? 'text-white' : 'text-brand-600'}`} />
        Your location
        <CountryPicker code={profile.currentLocation} onSelect={(code) => updateProfile({ currentLocation: code })} />
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-medium ${onBlue ? 'text-white/80' : 'text-ink-500'}`}
      title="Kept on this device only. Used to show whether each listing fits you."
    >
      <span className="flex items-center gap-1.5">
        <Sparkles className={`h-3.5 w-3.5 ${onBlue ? 'text-white' : 'text-brand-600'}`} />
        Showing what fits you:
      </span>
      <span className="flex items-center gap-1.5">
        Citizen of
        <CountryPicker code={profile.citizenship} onSelect={(code) => updateProfile({ citizenship: code })} />
      </span>
      <span className="flex items-center gap-1.5">
        based in
        <CountryPicker code={profile.currentLocation} onSelect={(code) => updateProfile({ currentLocation: code })} />
      </span>
    </div>
  );
}

function CountryPicker({ code, onSelect }: { code: string | null; onSelect: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const country = allCountries.find((c) => c.code === code);
  const filtered = allCountries.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1.5 rounded-full border border-ink-200 bg-white pl-1.5 pr-2.5 text-xs font-semibold text-ink-800 transition hover:border-brand-300"
      >
        {country ? (
          <CircleFlag countryCode={country.code} label={country.name} size={20} />
        ) : (
          <span className="grid h-5 w-5 place-items-center rounded-full bg-ink-100 text-ink-400">
            <Globe2 className="h-3 w-3" />
          </span>
        )}
        {country?.name ?? 'Select'}
        <ChevronDown className={`h-3.5 w-3.5 text-ink-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <button type="button" aria-label="Close" onClick={close} className="fixed inset-0 z-30 cursor-default" />
          <div className="absolute left-0 top-full z-40 mt-2 w-64 rounded-md border border-ink-200 bg-white p-2 shadow-xl">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search countries…"
              className="mb-1 h-9 w-full rounded-md border border-ink-200 px-2 text-sm font-normal text-ink-900 outline-none focus:border-brand-500"
            />
            <div className="max-h-64 overflow-auto">
              {filtered.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    onSelect(c.code);
                    close();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-ink-700 hover:bg-ink-50"
                >
                  <CircleFlag countryCode={c.code} label={c.name} size={20} />
                  <span className="flex-1 truncate">{c.name}</span>
                  {c.code === code && <CheckCircle2 className="h-4 w-4 text-brand-600" />}
                </button>
              ))}
              {filtered.length === 0 && <p className="px-2 py-3 text-xs text-ink-400">No matching country</p>}
            </div>
          </div>
        </>
      )}
    </span>
  );
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
