import { useEffect, useState } from 'react';
import { Briefcase, MapPin } from 'lucide-react';
import { fetchShowcaseJobs, type ShowcaseJob } from '@/lib/sponsoredJobs';
import { CircleFlag } from '@/components/common/CircleFlag';

/**
 * Two rows of real, recent jobs — one per company, and each row shows
 * different companies — drifting sideways under the sign-in and register
 * forms. Deliberately not clickable so nobody gets pulled away from
 * finishing sign-up. Hovering a row pauses it so a card can be read.
 * Decorative only (hidden from screen readers); desktop/tablet only.
 */
export function JobTicker() {
  const [jobs, setJobs] = useState<ShowcaseJob[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchShowcaseJobs(24).then((j) => alive && setJobs(j));
    return () => {
      alive = false;
    };
  }, []);

  if (jobs === null) {
    return (
      <div className="marquee-mask flex gap-3 overflow-hidden" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[92px] w-[240px] shrink-0 rounded-md bg-white/10 sm:w-[260px]" />
        ))}
      </div>
    );
  }
  if (jobs.length < 6) return null;

  // Alternate so both rows get a spread of companies, none repeated across rows.
  // Short rows are repeated so one copy is always wider than the screen (no gap mid-loop).
  const fill = (row: ShowcaseJob[]) => {
    let out = row;
    while (out.length < 7) out = [...out, ...row];
    return out;
  };
  const rows = [fill(jobs.filter((_, i) => i % 2 === 0)), fill(jobs.filter((_, i) => i % 2 === 1))];

  return (
    <div className="space-y-3" aria-hidden="true">
      {rows.map((row, i) => (
        <div key={i} className="marquee-mask marquee-pause cursor-default select-none overflow-hidden">
          <div
            className={`marquee-track flex w-max gap-3 ${i === 1 ? 'reverse' : ''}`}
            style={{ ['--marquee-duration' as string]: `${row.length * 5}s` }}
          >
            {/* The row twice, so the loop is seamless. */}
            {[...row, ...row].map((job, k) => (
              <TickerCard key={`${job.id}-${k}`} job={job} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TickerCard({ job }: { job: ShowcaseJob }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const place = job.remote ? 'Remote' : [job.city, job.country].filter(Boolean).join(', ');
  return (
    <div className="flex h-[92px] w-[240px] shrink-0 items-start gap-3 rounded-md bg-white p-3.5 shadow-sm sm:w-[260px]">
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded border border-ink-100 bg-white">
        {job.logoUrl && !logoFailed ? (
          <img src={job.logoUrl} alt="" loading="lazy" onError={() => setLogoFailed(true)} className="h-full w-full object-contain p-1" />
        ) : (
          <Briefcase className="h-4 w-4 text-ink-300" />
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-ink-500">{job.company}</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] font-bold leading-snug text-ink-950">{job.title}</p>
        {place && (
          <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-ink-500">
            {job.countryCode && !job.remote ? (
              <CircleFlag countryCode={job.countryCode} label={job.country ?? ''} size={12} />
            ) : (
              <MapPin className="h-3 w-3 text-ink-400" />
            )}
            <span className="truncate">{place}</span>
          </p>
        )}
      </div>
    </div>
  );
}
