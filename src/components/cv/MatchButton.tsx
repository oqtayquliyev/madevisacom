import { Loader2, Lock, ScanSearch } from 'lucide-react';
import type { JobMatch } from '@/lib/cv/checks';
import { MatchRing } from '@/components/cv/MatchBits';
import { useMyPlan } from '@/lib/plans';

const toPanel = () => document.getElementById('cv-match')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

/**
 * "Check your match" — next to Apply on every job page. Pressed once per
 * job; after that it shows the score and jumps to the report.
 */
export function MatchButton({ match, variant, disabled = false }: { match: JobMatch; variant: 'hero' | 'body'; disabled?: boolean }) {
  const hero = variant === 'hero';
  const { cv, result, busy } = match;
  // CV match is part of Starter and Pro: everyone else is taken to the panel, which says so.
  const { isPaid } = useMyPlan();

  const click = () => {
    toPanel();
    // With a CV on file, pressing the button is the check itself.
    if (isPaid && cv && !result && !busy) void match.check();
  };

  return (
    <button
      type="button"
      onClick={click}
      disabled={disabled}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 ${
        hero ? 'text-white ring-1 ring-white/50 hover:bg-white/10 focus-visible:outline-white' : 'text-brand-700 ring-1 ring-brand-600/40 hover:bg-brand-50 focus-visible:outline-brand-600'
      }`}
    >
      {!isPaid ? (
        <>
          <Lock className="h-4 w-4" /> Check your match
        </>
      ) : busy ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" /> Checking…
        </>
      ) : result ? (
        <>
          <span className="-my-1.5 -ml-1.5">
            <MatchRing score={result.score} size={34} onDark={hero} />
          </span>
          {result.label}
        </>
      ) : (
        <>
          <ScanSearch className="h-4 w-4" /> Check your match
        </>
      )}
    </button>
  );
}
