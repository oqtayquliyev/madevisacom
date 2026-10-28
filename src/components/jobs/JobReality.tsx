import { useState } from 'react';
import { AlertTriangle, BadgeCheck, ChevronDown, ShieldAlert, ShieldCheck } from 'lucide-react';
import { REALITY_LABEL, type Reality } from '@/lib/jobReality';

// The Job Reality Score on the job page: a pill in the hero (what we checked, and when),
// and — only when the ad shows warning signs — a clear warning above the ad.

export function RealityPill({ reality }: { reality: Reality }) {
  const [open, setOpen] = useState(false);
  if (reality.level === 'closed') return null;
  const tone =
    reality.level === 'verified'
      ? 'bg-emerald-400/20 text-emerald-50 ring-emerald-300/40'
      : reality.level === 'real'
        ? 'bg-white/15 text-white ring-white/30'
        : 'bg-amber-300 text-ink-950 ring-amber-200';
  const Icon = reality.level === 'verified' ? BadgeCheck : reality.level === 'real' ? ShieldCheck : ShieldAlert;
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold ring-1 ${tone}`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {REALITY_LABEL[reality.level]}
        {(reality.flags[0]?.label ?? reality.reasons[0]) && <span className="hidden font-semibold opacity-90 sm:inline">· {reality.level === 'careful' && reality.flags[0] ? reality.flags[0].label : reality.reasons[0]}</span>}
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="mt-2 max-w-md rounded-xl bg-white p-3.5 text-[13px] leading-5 text-ink-700 shadow-lg">
          <p className="font-bold text-ink-950">How we checked this job ({reality.score}/100)</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            {reality.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
            {reality.flags.map((f) => (
              <li key={f.id} className="font-semibold text-rose-700">
                {f.label}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-ink-500">MadeVisa re-checks imported jobs on the company’s own careers page and takes them down when they disappear. Real employers never charge you to apply.</p>
        </div>
      )}
    </div>
  );
}

/** Above the ad, only when something looks wrong. */
export function ScamWarning({ reality }: { reality: Reality }) {
  if (!reality.flags.length) return null;
  const high = reality.flags.some((f) => f.level === 'high');
  return (
    <div role="alert" className={`mb-5 rounded-xl p-4 ring-1 ${high ? 'bg-rose-50 ring-rose-200' : 'bg-amber-50 ring-amber-200'}`}>
      <p className={`flex items-center gap-2 text-[15px] font-bold ${high ? 'text-rose-900' : 'text-amber-900'}`}>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> Be careful with this ad
      </p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-6 text-[14px] text-ink-800">
        {reality.flags.map((f) => (
          <li key={f.id}>{f.label}</li>
        ))}
      </ul>
      <p className="mt-2 text-[13px] leading-5 text-ink-600">
        Real employers never ask you to pay to apply, for training or for a visa, and they hire through an interview. Don’t send money or your passport before you’ve verified the company. If this looks like a scam, report it below and we’ll check it.
      </p>
    </div>
  );
}
