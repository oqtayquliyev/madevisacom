import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Info, XCircle } from 'lucide-react';
import { checkVisaSalary, formatMoney, type SalaryInput } from '@/data/visa/salaryThresholds';

const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * "Does this salary clear the visa minimum?" — one line, details on tap.
 * Renders nothing when we can't judge reliably (no salary, other currency,
 * hourly pay, country not covered).
 */
export function SalaryCheck(props: SalaryInput) {
  const [open, setOpen] = useState(false);
  const v = checkVisaSalary(props);
  if (!v) return null;
  const { t } = v;
  const m = (n: number) => formatMoney(n, t.currency);
  const std = m(t.standard.annual);

  const view = {
    clears: { Icon: CheckCircle2, tone: 'bg-emerald-50 ring-emerald-200 text-emerald-800', text: `Salary clears the ${t.route} minimum (${std} a year)` },
    holiday: { Icon: AlertTriangle, tone: 'bg-amber-50 ring-amber-200 text-amber-900', text: `Clears the ${t.route} minimum (${std}) only if the yearly figure excludes holiday pay` },
    range: { Icon: AlertTriangle, tone: 'bg-amber-50 ring-amber-200 text-amber-900', text: `Depends on the final offer — the ${t.route} minimum is ${std} a year` },
    lower: { Icon: Info, tone: 'bg-sky-50 ring-sky-200 text-sky-900', text: `Below the usual ${t.route} minimum (${std}), but may qualify for some applicants` },
    below: { Icon: XCircle, tone: 'bg-rose-50 ring-rose-200 text-rose-800', text: `Salary is below every ${t.route} minimum` },
  }[v.kind];

  return (
    <div className={`mt-4 rounded-lg px-4 py-3 ring-1 ${view.tone}`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-2 text-left text-[14px] font-semibold" aria-expanded={open}>
        <view.Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="flex-1">{view.text}</span>
        <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 opacity-60 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 pl-6 text-[13px] font-normal leading-5 text-ink-700">
          <p>
            This job advertises <strong>{m(v.annual)}</strong> a year{v.kind === 'range' ? ` (up to ${m(v.top)})` : ''}. The {t.route} needs at least <strong>{std}</strong> for{' '}
            {t.standard.who}.
          </p>
          {t.lower.map((x) => (
            <p key={x.annual}>
              Lower minimum of <strong>{m(x.annual)}</strong> for {x.who}.
            </p>
          ))}
          <p className="text-ink-500">{t.caveat}</p>
          <p className="text-[12px] text-ink-500">
            Source:{' '}
            <a href={t.source.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              {t.source.label}
            </a>{' '}
            · checked {day(t.checkedOn)}. Not legal advice.
          </p>
        </div>
      )}
    </div>
  );
}
