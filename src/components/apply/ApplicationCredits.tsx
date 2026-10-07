import { ArrowRight } from 'lucide-react';
import { nav } from '@/lib/pageLayout';
import type { ApplyStatus } from '@/lib/apply/store';

/**
 * The month's applications: how many come with the plan, how many are left.
 * Nothing is sold here — it is part of the existing Free and Pro plans.
 */
export function ApplicationCredits({ status, asking = 0, className = '' }: { status: ApplyStatus; asking?: number; className?: string }) {
  if (!status.signedIn) {
    return (
      <p className={`text-[12.5px] leading-5 text-ink-500 ${className}`}>
        {status.freeMonthly} applications a month with a free account, {status.proMonthly} with MadeVisa Pro. One that fails or is skipped uses nothing.
      </p>
    );
  }
  const short = asking > status.left;
  const resets = status.resetsAt ? new Date(status.resetsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] leading-5 ${short ? 'text-amber-800' : 'text-ink-500'} ${className}`}>
      <span>
        <strong className="font-bold tabular-nums text-ink-800">{status.left}</strong> of {status.monthly} applications left this month{status.pro ? ' with Pro' : ''}
        {short ? `. MadeVisa will stop after ${status.left}${resets ? `; the rest wait until ${resets}` : ''}.` : '. One that fails or is skipped uses nothing.'}
      </span>
      {!status.pro && (
        <a
          href="/pricing#pro"
          onClick={(e) => {
            e.preventDefault();
            nav('/pricing#pro');
          }}
          className="inline-flex items-center gap-1 font-bold text-brand-700 hover:underline"
        >
          {status.proMonthly} a month with Pro <ArrowRight className="h-3 w-3" />
        </a>
      )}
    </p>
  );
}
