import { Sparkles } from 'lucide-react';

/** A company counts as new on MadeVisa for this long after it was added. */
export const NEW_COMPANY_MS = 24 * 60 * 60 * 1000;

/** True while the company was added to MadeVisa less than 24 hours ago. */
export function isNewCompany(addedAt: string | null | undefined, now = Date.now()): boolean {
  if (!addedAt) return false;
  const t = Date.parse(addedAt);
  return Number.isFinite(t) && now - t >= 0 && now - t < NEW_COMPANY_MS;
}

/**
 * "New on MadeVisa" — the company joined MadeVisa in the last 24 hours
 * (found by the pipeline or registered). Hidden automatically afterwards.
 */
export function NewCompanyBadge({ addedAt, variant = 'card' }: { addedAt: string | null | undefined; variant?: 'card' | 'hero' }) {
  if (!isNewCompany(addedAt)) return null;
  return (
    <span
      title="This company was added to MadeVisa in the last 24 hours"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-bold uppercase tracking-wide ${
        variant === 'hero' ? 'bg-amber-300 px-2 py-0.5 text-[10.5px] text-ink-950' : 'bg-amber-100 px-1.5 py-[2px] text-[10px] text-amber-900 ring-1 ring-amber-200'
      }`}
    >
      <Sparkles className="h-3 w-3" strokeWidth={2.5} />
      New on MadeVisa
    </span>
  );
}
