import { useState } from 'react';
import { CheckCircle2, ChevronDown, Loader2, MapPin, X } from 'lucide-react';
import { allCountries } from '@/data/allCountries';
import { useOriginCountry } from '@/lib/originCountry';
import { CircleFlag } from '@/components/common/CircleFlag';

/**
 * Shows a small "we think you're in X" banner on first load (from
 * cookie + IP auto-detection — see lib/geolocation.ts), with a
 * dropdown to switch to ANY country, each rendered with the same
 * circular flag icon style (no emoji).
 *
 * Mount this once, near the top of the landing page.
 */
export function CountrySwitcher() {
  const { countryCode, countryName, loading, isAutoDetected, setCountry } = useOriginCountry();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const filtered = allCountries.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
  });

  return (
    <div className="border-b border-brand-100 bg-brand-50/70">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-5 py-2.5 text-sm sm:px-8">
        {loading ? (
          <span className="flex items-center gap-2 text-ink-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Detecting your location…
          </span>
        ) : countryCode ? (
          <span className="flex items-center gap-2 text-ink-700">
            <MapPin className="h-3.5 w-3.5 text-brand-600" />
            {isAutoDetected ? (
              <>
                Showing options for <CircleFlag countryCode={countryCode} label={countryName ?? undefined} size={18} />
                <span className="font-semibold">{countryName}</span>
              </>
            ) : (
              <>
                Browsing as <CircleFlag countryCode={countryCode} label={countryName ?? undefined} size={18} />
                <span className="font-semibold">{countryName}</span>
              </>
            )}
          </span>
        ) : (
          <span className="text-ink-500">Where are you applying from?</span>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
          >
            {countryCode ? 'Not you? Change' : 'Choose your country'}
            <ChevronDown className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <>
              <button type="button" aria-label="close" onClick={() => setOpen(false)} className="fixed inset-0 z-30" />
              <div className="absolute left-0 top-full z-40 mt-1 w-72 border border-ink-200 bg-white p-2 shadow-xl">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search countries"
                  className="mb-1 h-9 w-full rounded-md border border-ink-200 px-3 text-sm outline-none focus:border-brand-500"
                />
                <div className="max-h-64 overflow-y-auto">
                  {filtered.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => {
                        setCountry(c.code);
                        setOpen(false);
                        setQuery('');
                      }}
                      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-ink-50 ${
                        c.code === countryCode ? 'bg-brand-50' : ''
                      }`}
                    >
                      <CircleFlag countryCode={c.code} label={c.name} size={20} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">{c.name}</span>
                      {c.code === countryCode && <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" />}
                    </button>
                  ))}
                  {filtered.length === 0 && (
                    <p className="px-3 py-4 text-center text-xs text-ink-400">No matches</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="ml-auto text-ink-400 hover:text-ink-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
