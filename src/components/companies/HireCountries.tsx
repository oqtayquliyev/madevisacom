import { CircleFlag } from '@/components/common/CircleFlag';

export type HireCountry = { code: string; name: string; n?: number };

/**
 * "Hires in 🇩🇪 Germany 🇬🇧 United Kingdom +4" — the countries a company has
 * open jobs in, shown under its name (directory cards + company page).
 */
export function HireCountries({
  countries,
  total,
  max = 3,
  tone = 'light',
  size = 16,
  className = '',
}: {
  countries: HireCountry[];
  /** All countries with open jobs (for "+N"); defaults to the list length. */
  total?: number;
  max?: number;
  tone?: 'light' | 'dark';
  size?: number;
  className?: string;
}) {
  if (!countries.length) return null;
  const shown = countries.slice(0, max);
  const more = Math.max(0, (total ?? countries.length) - shown.length);
  const dark = tone === 'dark';
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 ${className}`}>
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${dark ? 'text-white/60' : 'text-ink-400'}`}>Hires in</span>
      {shown.map((c) => (
        <span
          key={c.code}
          title={c.n != null ? `${c.name} · ${c.n.toLocaleString()} open` : c.name}
          className={`flex min-w-0 items-center gap-1.5 ${dark ? 'text-white/90' : 'text-ink-700'}`}
          style={{ fontSize: size <= 16 ? 12 : 14 }}
        >
          <CircleFlag countryCode={c.code} label={c.name} size={size} />
          <span className="truncate">{c.name}</span>
        </span>
      ))}
      {more > 0 && (
        <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${dark ? 'bg-white/15 text-white' : 'bg-[#1D4ED8]/10 text-[#1D4ED8]'}`}>+{more}</span>
      )}
    </div>
  );
}
