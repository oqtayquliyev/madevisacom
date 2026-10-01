import { useState } from 'react';
import { Check, Gift, Link2 } from 'lucide-react';
import { inviteUrl, useMyReferral } from '@/lib/referrals';

/**
 * One line, one button. The reward is paid only when an invited friend
 * buys (see migration 20261116090000), so there's nothing to farm.
 */
export function InviteCard() {
  const r = useMyReferral();
  const [copied, setCopied] = useState(false);
  if (!r) return null;
  const url = inviteUrl(r.code);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-ink-200">
      <p className="flex min-w-0 items-start gap-2 text-[13.5px] leading-5 text-ink-700">
        <Gift className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <span>
          <strong className="text-ink-950">Invite a friend who’s moving abroad.</strong> Their first document is free; you get <strong>2 credits</strong> when they buy a plan.
          {r.joined > 0 && (
            <span className="text-ink-500">
              {' '}
              · {r.joined} joined{r.credits > 0 ? ` · ${r.credits} credits earned` : ''}
            </span>
          )}
        </span>
      </p>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          } catch {
            window.prompt('Copy your invite link:', url);
          }
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-[13px] font-semibold text-ink-800 hover:border-[#1D4ED8]/40 hover:text-[#1D4ED8]"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />} {copied ? 'Copied' : 'Copy invite link'}
      </button>
    </div>
  );
}
