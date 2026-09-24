import { BadgeCheck } from 'lucide-react';

/**
 * "Directly on MadeVisa by <Company>" — shown on jobs/programs the
 * organization posted itself (origin = 'direct'), as opposed to listings
 * MadeVisa imported from a careers page. `origin` can only be set by
 * the database for real submissions, so this badge can't be faked.
 */
export function DirectListingBadge({ company, compact = false }: { company: string; compact?: boolean }) {
  return (
    <span
      title={`${company} posted this directly on MadeVisa`}
      className={`inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-50 font-semibold text-emerald-700 ring-1 ring-emerald-200 ${
        compact ? 'px-1.5 py-[2px] text-[10px]' : 'px-2 py-0.5 text-[11px]'
      }`}
    >
      <BadgeCheck className={compact ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'} strokeWidth={2.5} />
      <span className="truncate">Directly on MadeVisa by {company}</span>
    </span>
  );
}
