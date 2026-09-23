import { useEffect, useState } from 'react';
import { destinationInfo } from '@/data/destinationInfo';
import { CircleFlag } from '@/components/common/CircleFlag';
import { supabase } from '@/lib/supabase';

const ORBIT_COUNT = 10;
const GLOBE_RADIUS = 92; // px — flags sit right on this circle's rim
const ORBIT_DURATION = 40; // seconds — slow, restrained motion

export function AuthSidePanel() {
  const orbitDestinations = destinationInfo.slice(0, ORBIT_COUNT);

  return (
    <div className="hidden h-full flex-col justify-between overflow-hidden bg-ink-950 px-10 py-12 text-white lg:flex">
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

      <GlobeIllustration destinations={orbitDestinations} />
    </div>
  );
}

function useCountryCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('countries')
      .select('id', { count: 'exact', head: true })
      .then(({ count: c }) => {
        if (!cancelled) setCount(c ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}

function GlobeIllustration({ destinations }: { destinations: typeof destinationInfo }) {
  const countryCount = useCountryCount();
  const size = GLOBE_RADIUS * 2;
  const containerSize = size + 64; // room for flags sitting on the rim

  return (
    <div className="flex flex-col items-center">
      <style>{`
        @keyframes auth-globe-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes auth-globe-orbit-counter { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        .auth-globe-ring { animation: auth-globe-orbit ${ORBIT_DURATION}s linear infinite; }
        .auth-globe-counter { animation: auth-globe-orbit-counter ${ORBIT_DURATION}s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .auth-globe-ring, .auth-globe-counter { animation: none; }
        }
      `}</style>

      <div className="relative" style={{ width: containerSize, height: containerSize }}>
        {/* Wireframe globe — line art, not a stock icon */}
        <svg
          viewBox="0 0 200 200"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: size, height: size }}
        >
          <circle cx="100" cy="100" r="98" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
          {/* Latitude lines */}
          <ellipse cx="100" cy="100" rx="98" ry="34" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
          <ellipse cx="100" cy="100" rx="98" ry="68" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
          <line x1="2" y1="100" x2="198" y2="100" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
          {/* Longitude lines */}
          <ellipse cx="100" cy="100" rx="34" ry="98" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
          <ellipse cx="100" cy="100" rx="68" ry="98" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
          <line x1="100" y1="2" x2="100" y2="198" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
          {/* A few scattered dots to suggest landmasses, kept sparse and subtle */}
          <circle cx="72" cy="66" r="2" fill="rgba(255,255,255,0.35)" />
          <circle cx="130" cy="58" r="1.5" fill="rgba(255,255,255,0.3)" />
          <circle cx="146" cy="102" r="2" fill="rgba(255,255,255,0.3)" />
          <circle cx="60" cy="128" r="1.5" fill="rgba(255,255,255,0.3)" />
          <circle cx="108" cy="142" r="2" fill="rgba(255,255,255,0.35)" />
          <circle cx="88" cy="96" r="1.5" fill="rgba(255,255,255,0.25)" />
        </svg>

        {/* Flags arranged directly on the globe's rim */}
        <div className="auth-globe-ring absolute inset-0">
          {destinations.map((d, i) => {
            const angle = (360 / destinations.length) * i;
            return (
              <div
                key={d.countryCode}
                className="absolute left-1/2 top-1/2 h-0 w-0"
                style={{ transform: `rotate(${angle}deg) translateX(${GLOBE_RADIUS}px)` }}
              >
                <div className="auth-globe-counter">
                  <div className="-translate-x-1/2 -translate-y-1/2">
                    <CircleFlag
                      countryCode={d.countryCode}
                      label={d.countryName}
                      size={22}
                      className="ring-2 ring-ink-950 dark:ring-white/10"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 text-center">
        {countryCount !== null && (
          <p className="text-3xl font-bold tracking-tight text-white">{countryCount}+</p>
        )}
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-white/40">
          Countries covered worldwide
        </p>
      </div>
    </div>
  );
}
