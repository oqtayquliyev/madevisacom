import { CalendarPlus, Clock, Flame } from 'lucide-react';
import { jobTime } from '@/lib/jobTime';

const HOUR = 3_600_000;

/** How old a posting is, in the words the badge shows. */
export function jobAge(iso: string | null | undefined): { text: string; tier: 'fresh' | 'recent' | 'older' } | null {
  if (!iso) return null;
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  const hours = Math.max(0, (Date.now() - t) / HOUR);
  if (hours < 1) {
    const mins = Math.max(1, Math.floor(hours * 60));
    return { text: mins <= 1 ? 'Just now' : `${mins} min ago`, tier: 'fresh' };
  }
  if (hours < 24) {
    const h = Math.floor(hours);
    return { text: `${h} hour${h === 1 ? '' : 's'} ago`, tier: 'fresh' };
  }
  if (hours < 48) return { text: '1 day ago', tier: 'recent' };
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return { text: `${dd}/${mm}/${d.getFullYear()}`, tier: 'older' };
}

/**
 * Posting-age pill: green (35%) for jobs the source published today,
 * yellow (35%) for yesterday, grey date after that. Jobs whose source
 * shows no date get a grey "Added today" (the day MadeVisa added them).
 */
export function JobAgeBadge({
  iso,
  source,
  synced,
  className = '',
}: {
  /** Any single date (programs) — shown as before. */
  iso?: string | null;
  /** Jobs: the date on the company's careers page (null when it shows none)… */
  source?: string | null;
  /** …and when the job went live on MadeVisa. With these, "x min ago" only shows for jobs the source published today. */
  synced?: string | null;
  className?: string;
}) {
  const isJob = source !== undefined || synced !== undefined;
  const t = isJob ? jobTime(source, synced) : null;
  const a = isJob ? t : jobAge(iso);
  if (!a) return null;
  if (t && t.tier === 'added') {
    return (
      <span title="The company's page shows no posting date — this is when it was added to MadeVisa." className={`inline-flex items-center gap-1 rounded px-1.5 py-[3px] text-[10px] font-semibold tracking-wide bg-ink-100 text-ink-600 ${className}`}>
        <CalendarPlus className="h-3 w-3" />
        {t.text}
      </span>
    );
  }
  const base = `inline-flex items-center gap-1 rounded px-1.5 py-[3px] text-[10px] font-bold tracking-wide ${className}`;
  if (a.tier === 'fresh') {
    return (
      <span className={`${base} bg-emerald-500/35 text-emerald-900`}>
        <Flame className="h-3 w-3" strokeWidth={2.5} />
        {a.text}
      </span>
    );
  }
  if (a.tier === 'recent') return <span className={`${base} bg-amber-400/35 text-amber-900`}>{a.text}</span>;
  return (
    <span className={`${base} bg-ink-100 font-semibold text-ink-600`}>
      <Clock className="h-3 w-3" />
      {a.text}
    </span>
  );
}
