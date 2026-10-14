import { Check, Lock, X } from 'lucide-react';
import { MatchRing, PartBar, Row } from '@/components/cv/MatchBits';

/**
 * What a checked job looks like — an illustrative example with made-up
 * numbers, clearly labelled, for the landing and the CV match page.
 */
export function MatchExample({ className = '' }: { className?: string }) {
  const missing = [
    { name: 'Terraform', required: true },
    { name: 'Kafka', required: true },
    { name: 'gRPC', required: false },
  ];
  const parts: [string, number, number][] = [
    ['Skills', 78, 40],
    ['Role fit', 100, 20],
    ['Experience', 100, 15],
    ['Wording', 64, 10],
    ['Languages', 60, 8],
  ];
  return (
    <figure className={`overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft-lg ${className}`} aria-label="Example of a CV match result">
      <figcaption className="flex items-center justify-between gap-3 border-b border-ink-100 bg-ink-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-500">
        <span>Example</span>
        <span className="truncate font-semibold normal-case tracking-normal text-ink-600">Senior Backend Engineer · Berlin</span>
      </figcaption>
      <div className="grid gap-5 p-5 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex items-center gap-4 sm:flex-col sm:items-start sm:gap-2">
          <MatchRing score={82} size={104} />
          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-700">Strong match</span>
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            <p className="text-[13px] text-ink-600">
              <strong className="text-ink-950">9 of 12</strong> skills the ad names are covered
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {missing.map((m) => (
                <li key={m.name} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${m.required ? 'bg-amber-100 text-amber-900' : 'bg-ink-100 text-ink-700'}`}>
                  {m.required && <X className="h-3 w-3" strokeWidth={3} />}
                  {m.name}
                  {!m.required && <span className="font-normal text-ink-500">· nice to have</span>}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            {parts.map(([name, score, weight]) => (
              <PartBar key={name} name={name} score={score} weight={weight} />
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-ink-200 bg-ink-50/60 px-5 py-2">
        <div className="divide-y divide-ink-200/70">
          <Row compact ok title="CV" status="82% match" text="The file you send on the employer’s own site." />
          <Row compact ok={false} title="Sponsorship document" status="Missing" text="The ad doesn’t mention visa sponsorship. One page shows the employer how to sponsor you." />
        </div>
      </div>
    </figure>
  );
}

const LEVELS: { who: string; items: { ok: boolean; text: string }[]; tone: string }[] = [
  {
    who: 'Free',
    tone: 'border-ink-200',
    items: [
      { ok: true, text: 'Every job, search and filters' },
      { ok: true, text: '5 sponsorship documents' },
      { ok: false, text: 'CV match' },
    ],
  },
  {
    who: 'Starter',
    tone: 'border-brand-600 ring-1 ring-brand-600',
    items: [
      { ok: true, text: 'Match score on every job' },
      { ok: true, text: 'Missing skills and experience wanted' },
      { ok: true, text: 'Full report + 10 documents a month' },
    ],
  },
  {
    who: 'Pro',
    tone: 'border-ink-200',
    items: [
      { ok: true, text: 'Everything in Starter' },
      { ok: true, text: 'Auto Apply' },
      { ok: true, text: '50 sponsorship documents a month' },
    ],
  },
];

/** Three small cards: what each level sees. */
export function MatchLevels({ className = '' }: { className?: string }) {
  return (
    <ul className={`grid gap-3 sm:grid-cols-3 ${className}`}>
      {LEVELS.map((l) => (
        <li key={l.who} className={`rounded-xl border bg-white p-4 ${l.tone}`}>
          <p className="text-[13px] font-bold text-ink-950">{l.who}</p>
          <ul className="mt-2 space-y-1.5">
            {l.items.map((i) => (
              <li key={i.text} className={`flex gap-2 text-[13px] leading-5 ${i.ok ? 'text-ink-700' : 'text-ink-400'}`}>
                {i.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                {i.text}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
