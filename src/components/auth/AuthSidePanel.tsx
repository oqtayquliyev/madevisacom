import { useEffect, useState } from 'react';
import { Building2, Landmark, ShieldCheck, UserRound } from 'lucide-react';
import { destinationInfo } from '@/data/destinationInfo';
import { fetchAllVerifiedPublisherNames, type OrgType, type VerifiedPublisherName } from '@/lib/programs';
import { CircleFlag } from '@/components/common/CircleFlag';

const orgIcon: Record<OrgType, typeof Building2> = {
  agency: Building2,
  company: Building2,
  government: Landmark,
  expert: UserRound,
};

export function AuthSidePanel() {
  const [partners, setPartners] = useState<VerifiedPublisherName[] | null>(null);

  useEffect(() => {
    fetchAllVerifiedPublisherNames().then(setPartners);
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

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/40">Explore destinations</p>
        <div className="grid grid-cols-5 gap-3">
          {destinationInfo.map((d) => (
            <div
              key={d.countryCode}
              title={d.countryName}
              className="group flex flex-col items-center gap-1.5 rounded-xl bg-white/5 py-3 transition duration-200 hover:-translate-y-1 hover:bg-white/10 hover:shadow-lg"
            >
              <CircleFlag countryCode={d.countryCode} label={d.countryName} size={28} />
              <span className="truncate text-[10px] font-medium text-white/50 transition group-hover:text-white/80">
                {d.countryCode}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/40">Verified partners</p>

        {partners === null ? (
          <div className="flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 w-12 animate-pulse rounded-xl bg-white/10" />
            ))}
          </div>
        ) : partners.length === 0 ? (
          <p className="max-w-xs text-xs leading-5 text-white/40">
            Governments, agencies and companies appear here once they're registered, verified, and have shared their
            official logo — with their permission, after review.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {partners.slice(0, 10).map((p) => {
              const Icon = orgIcon[p.org_type];
              return (
                <div
                  key={p.id}
                  title={p.name}
                  className="group flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 transition duration-200 hover:-translate-y-1 hover:bg-white/10"
                >
                  {p.logo_url ? (
                    <img src={p.logo_url} alt={p.name} className="h-full w-full rounded-xl object-cover" />
                  ) : (
                    <Icon className="h-5 w-5 text-white/40 transition group-hover:text-white/70" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-semibold text-white/80">Verified &amp; secured opportunities</span>
        </div>
      </div>
    </div>
  );
}
