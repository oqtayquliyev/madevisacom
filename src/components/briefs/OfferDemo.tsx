import { useState } from 'react';
import { Briefcase, ChevronRight, FileDown, Paperclip, SlidersHorizontal } from 'lucide-react';
import { DragSlider } from '@/components/common/DragSlider';
import { buildTerms, OFFER_ITEM_LABEL, PAYER_LABEL, splitWord } from '@/lib/sponsorOffer';
import type { CandidateCover } from '@/data/visa';

const ALL: CandidateCover[] = ['visa-fee', 'relocation', 'translations', 'recognition', 'own-adviser'];

const STEPS = [
  { icon: Briefcase, label: 'Pick a job' },
  { icon: SlidersHorizontal, label: 'Drag the terms' },
  { icon: FileDown, label: 'Save PDF' },
  { icon: Paperclip, label: 'Attach & apply' },
];

const CHIP: Record<string, string> = {
  employer: 'bg-[#1D4ED8] text-white',
  shared: 'bg-[#1D4ED8]/15 text-[#1D4ED8]',
  candidate: 'bg-ink-100 text-ink-700',
};

/** Four steps in a row. `active` highlights one. */
export function OfferSteps({ active, light = false }: { active?: number; light?: boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="How a sponsor offer works">
      {STEPS.map(({ icon: Icon, label }, i) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold ${
              active === i ? (light ? 'bg-white text-brand-700' : 'bg-[#1D4ED8] text-white') : light ? 'bg-white/10 text-white ring-1 ring-white/20' : 'bg-white text-ink-700 ring-1 ring-ink-200'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </span>
          {i < STEPS.length - 1 && <ChevronRight className={`h-4 w-4 ${light ? 'text-white/50' : 'text-ink-300'}`} aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

/** A small live document: drag the bar, watch the rows change. */
export function OfferDemo() {
  const [split, setSplit] = useState(35);
  const t = buildTerms(split, ALL);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)] lg:items-center">
      <div className="rounded-sm bg-white p-5 font-serif text-ink-900 shadow-soft-lg ring-1 ring-ink-100 sm:p-7" aria-live="polite">
        <div className="flex items-end justify-between border-b-2 border-ink-900 pb-2 font-sans">
          <span className="text-[14px] font-extrabold tracking-tight">
            made<span className="text-[#1D4ED8]">visa</span>
          </span>
          <span className="text-[11px] text-ink-500">Sponsor offer</span>
        </div>
        <p className="mt-4 text-[20px] font-semibold leading-tight tracking-tight">Sponsorship cost-sharing offer</p>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-ink-100">
          <span className="bg-[#1D4ED8] transition-[width] duration-300" style={{ width: `${100 - t.candidateShare}%` }} />
          <span className="bg-[#1D4ED8]/25 transition-[width] duration-300" style={{ width: `${t.candidateShare}%` }} />
        </div>
        <table className="mt-3 w-full font-sans text-[13px]">
          <tbody>
            {t.items.map((it) => (
              <tr key={it.key} className="border-b border-ink-100 last:border-0">
                <td className="py-2 pr-2 text-ink-700">{OFFER_ITEM_LABEL[it.key]}</td>
                <td className="py-2 text-right">
                  <span key={it.payer} className={`offer-flash inline-flex rounded px-2 py-0.5 text-[12px] font-semibold ${CHIP[it.payer]}`}>
                    {PAYER_LABEL[it.payer]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 grid grid-cols-2 gap-6 font-sans text-[11px] text-ink-400">
          <span className="border-t border-ink-400 pt-1">Candidate</span>
          <span className="border-t border-ink-400 pt-1">Employer</span>
        </div>
      </div>
      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-[#1D4ED8]/25">
        <p className="text-[15px] font-bold text-ink-950">Try it</p>
        <DragSlider
          value={split}
          onChange={setSplit}
          label="Try the offer slider"
          valueText={splitWord(split)}
          bubble={`${splitWord(split)} · you ${t.candidateShare}%`}
          left="Better for you"
          right="Better for the company"
        />
      </div>
    </div>
  );
}
