import { Globe2 } from 'lucide-react';
import { destinationInfo } from '@/data/destinationInfo';
import { CircleFlag } from '@/components/common/CircleFlag';

// How many destination flags to orbit — more than ~10 gets visually
// crowded at this radius, and the full list isn't needed for the effect.
const ORBIT_COUNT = 8;
const ORBIT_RADIUS = 108; // px, distance from center
const ORBIT_DURATION = 26; // seconds per full revolution

export function AuthSidePanel() {
  const orbitDestinations = destinationInfo.slice(0, ORBIT_COUNT);

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

      <OrbitingGlobe destinations={orbitDestinations} />

      <div />
    </div>
  );
}

function OrbitingGlobe({ destinations }: { destinations: typeof destinationInfo }) {
  const size = ORBIT_RADIUS * 2 + 56; // container size, with margin for flag icons at the edge

  return (
    <div className="flex flex-col items-center">
      <style>{`
        @keyframes auth-orbit-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes auth-orbit-counter-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        .auth-orbit-ring {
          animation: auth-orbit-spin ${ORBIT_DURATION}s linear infinite;
        }
        .auth-orbit-counter {
          animation: auth-orbit-counter-spin ${ORBIT_DURATION}s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-orbit-ring, .auth-orbit-counter {
            animation: none;
          }
        }
      `}</style>

      <div className="relative" style={{ width: size, height: size }}>
        {/* Center globe, static */}
        <div className="absolute inset-0 grid place-items-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-brand-500/15 ring-1 ring-brand-400/30">
            <Globe2 className="h-8 w-8 text-brand-300" />
          </div>
        </div>

        {/* Rotating ring holding the flags */}
        <div className="auth-orbit-ring absolute inset-0">
          {destinations.map((d, i) => {
            const angle = (360 / destinations.length) * i;
            return (
              <div
                key={d.countryCode}
                className="absolute left-1/2 top-1/2 h-0 w-0"
                style={{ transform: `rotate(${angle}deg) translateX(${ORBIT_RADIUS}px)` }}
              >
                {/* Counter-rotate so the flag itself always stays upright,
                    regardless of where it currently sits on the ring. */}
                <div className="auth-orbit-counter -translate-x-1/2 -translate-y-1/2">
                  <div
                    title={d.countryName}
                    className="rounded-full bg-white/5 p-1 shadow-lg ring-1 ring-white/10 transition hover:bg-white/15"
                  >
                    <CircleFlag countryCode={d.countryCode} label={d.countryName} size={26} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-center text-xs font-medium text-white/40">
        Opportunities across {destinationInfo.length}+ destinations worldwide
      </p>
    </div>
  );
}
