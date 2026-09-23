import { Globe2 } from 'lucide-react';
import { CircleFlag } from '@/components/common/CircleFlag';
import { matchCountriesFromOfficeNames } from '@/lib/officeLocations';

const WORLDWIDE_THRESHOLD = 5;

export function MultiCountryBadge({ officeNames, size = 18 }: { officeNames: string[] | null | undefined; size?: number }) {
  if (!officeNames || officeNames.length < 2) return null;

  const countries = matchCountriesFromOfficeNames(officeNames);
  if (countries.length < 2) return null;

  if (countries.length >= WORLDWIDE_THRESHOLD) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
        <Globe2 className="h-3.5 w-3.5" />
        Worldwide — {countries.length} countries
      </span>
    );
  }

  const shown = countries.slice(0, 4);
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
      <span className="flex -space-x-1.5">
        {shown.map((c) => (
          <CircleFlag key={c.code} countryCode={c.code} label={c.name} size={size} className="ring-2 ring-white" />
        ))}
      </span>
      {countries.length > 4 ? `+${countries.length - 4} more offices` : 'Multiple offices'}
    </span>
  );
}
