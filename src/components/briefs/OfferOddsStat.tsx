import { MailCheck } from 'lucide-react';
import { useOutcomes } from '@/lib/cv/outcomes';

// What happened to the sponsorship proposals made on MadeVisa — shown next
// to the pitch on /offers.
//
// Only measured figures appear here: the share of proposals a company opened
// that got a reply, counted by the server from the site's own records
// (brief_outcomes(), migration 20261129090000), and only once there are
// enough of them to mean something. Until then nothing is shown.
//
// There is deliberately no "N× higher chance to be hired" figure: a proposal
// cannot promise a job, a sponsorship or a visa, and a multiplier that isn't
// measured is a claim nobody can back up (and a consumer-protection risk).

export function OfferOddsStat({ light = false, className = '' }: { light?: boolean; className?: string }) {
  const o = useOutcomes();
  if (!o || !o.opened || !o.replied) return null;
  const pct = Math.round((o.replied / o.opened) * 100);
  return (
    <p className={`flex max-w-xl items-center gap-3 ${className}`}>
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 font-slab text-[28px] font-bold leading-none tabular-nums sm:text-[34px] ${
          light ? 'bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/40' : 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
        }`}
      >
        <MailCheck className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} aria-hidden />
        {pct}%
      </span>
      <span className={`text-[15px] leading-snug sm:text-[16px] ${light ? 'text-white/85' : 'text-ink-700'}`}>
        of the proposals a company opened got a reply:{' '}
        <strong className={light ? 'font-bold text-emerald-300' : 'font-bold text-emerald-600'}>
          {o.replied.toLocaleString('en-GB')} of {o.opened.toLocaleString('en-GB')}
        </strong>{' '}
        on MadeVisa so far. A reply is not a job offer.
      </span>
    </p>
  );
}
