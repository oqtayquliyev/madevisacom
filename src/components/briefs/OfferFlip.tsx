import { ArrowRight, Building2, User, X, Check } from 'lucide-react';

/**
 * The idea in one glance: who makes the sponsorship move.
 * Most visitors expect "companies offer sponsorship", so they misread the
 * product. Showing the old way next to the new way fixes that before any
 * explanation text is read.
 */
export function OfferFlip({ light = false, className = '' }: { light?: boolean; className?: string }) {
  const card = light ? 'bg-white/10 ring-1 ring-white/20' : 'bg-white ring-1 ring-ink-200';
  const muted = light ? 'text-white/70' : 'text-ink-500';
  const strong = light ? 'text-white' : 'text-ink-950';
  return (
    <div className={`grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch ${className}`}>
      <div className={`rounded-xl p-4 ${card}`}>
        <p className={`text-[12px] font-bold uppercase tracking-wide ${muted}`}>The usual way</p>
        <p className={`mt-2 flex items-center gap-2 text-[15px] font-bold ${strong}`}>
          <Building2 className="h-4 w-4" /> The company decides about the visa
        </p>
        <ul className={`mt-2 space-y-1 text-[13.5px] ${muted}`}>
          {['You apply and hope', 'Recruiter guesses the visa is slow and costly', 'CV skipped — no one asks'].map((t) => (
            <li key={t} className="flex items-start gap-1.5">
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" /> {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="hidden items-center md:flex" aria-hidden>
        <ArrowRight className={`h-6 w-6 ${light ? 'text-white/60' : 'text-ink-300'}`} />
      </div>
      <div className={`rounded-xl p-4 ring-2 ${light ? 'bg-white text-ink-950 ring-emerald-300' : 'bg-emerald-50 ring-emerald-400'}`}>
        <p className="text-[12px] font-bold uppercase tracking-wide text-emerald-700">With MadeVisa</p>
        <p className="mt-2 flex items-center gap-2 text-[15px] font-bold text-ink-950">
          <User className="h-4 w-4" /> You bring the visa plan to them
        </p>
        <ul className="mt-2 space-y-1 text-[13.5px] text-ink-700">
          {['Attach a one-page offer to your application', 'It shows the legal route, their steps and the real cost', 'You choose which costs you share — they just say yes'].map((t) => (
            <li key={t} className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
