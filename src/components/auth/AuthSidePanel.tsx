import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { destinationInfo } from '@/data/destinationInfo';
import { fetchAllVerifiedPublisherNames, fetchVerifiedAgenciesPublic, type VerifiedPublisherName } from '@/lib/programs';
import { CircleFlag } from '@/components/common/CircleFlag';

export function AuthSidePanel() {
  const [names, setNames] = useState<string[] | null>(null);

  useEffect(() => {
    Promise.all([fetchAllVerifiedPublisherNames(), fetchVerifiedAgenciesPublic()]).then(([publishers, agencies]) => {
      const combined = [
        ...publishers.map((p: VerifiedPublisherName) => p.name),
        ...agencies.map((a) => a.name),
      ];
      setNames(Array.from(new Set(combined)));
    });
  }, []);

  return (
    <div className="hidden h-full flex-col justify-between bg-ink-950 px-10 py-12 text-white lg:flex">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-300">Discover your path abroad</p>
        <h2 className="mt-4 max-w-sm text-3xl font-bold leading-tight tracking-tight">
          Real programs, real jobs, real destinations.
        </h2>
        <p className="mt-4 max-w-sm text-sm leading-6 text-white/60">
          Every listing on MadeVisa is reviewed before it goes live — official government links, verified agencies,
          and sponsored opportunities you can trust.
        </p>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {destinationInfo.map((d) => (
          <div
            key={d.countryCode}
            title={d.countryName}
            className="flex flex-col items-center gap-1.5 rounded-xl bg-white/5 py-3 transition hover:bg-white/10"
          >
            <CircleFlag countryCode={d.countryCode} label={d.countryName} size={28} />
            <span className="truncate text-[10px] font-medium text-white/50">{d.countryCode}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/50">
          <ShieldCheck className="h-3.5 w-3.5" />
          Verified on MadeVisa
        </div>
        {names === null ? (
          <div className="mt-3 h-5 w-40 animate-pulse rounded bg-white/10" />
        ) : names.length === 0 ? (
          <p className="mt-3 max-w-xs text-xs leading-5 text-white/40">
            Governments, agencies and companies are reviewed before they're listed here — be one of the first.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {names.slice(0, 8).map((name) => (
              <span key={name} className="text-sm font-semibold text-white/70">{name}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
