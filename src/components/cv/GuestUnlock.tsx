import { useState } from 'react';
import { Lock } from 'lucide-react';
import { MatchRing } from '@/components/cv/MatchBits';
import { QuickSignup } from '@/components/cv/QuickSignup';
import type { StoredCv } from '@/lib/cv/store';
import type { TopResult } from '@/lib/cv/topMatches';

/**
 * /cv-match for someone without an account: the results are ready but blurred.
 * One field — the email from their CV, already filled in — and a 6-digit code.
 * The code signs them in (a free account is made the first time), the CV they
 * uploaded is attached to it, and the page shows their matches like any account.
 */
export function GuestUnlock({ cv, result }: { cv: StoredCv; result: TopResult | null }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const items = result?.items ?? [];
  return (
    <section className="mx-auto max-w-2xl space-y-3">
      <div className="rounded-3xl bg-white px-6 py-6 ring-2 ring-brand-200 sm:px-8">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-700">
          <Lock className="h-3 w-3" aria-hidden /> Results ready
        </p>
        <h2 className="mt-3 text-[24px] font-bold leading-tight tracking-tight text-ink-950">
          {items.length ? `${items.length} ${items.length === 1 ? 'job' : 'jobs'} found for your CV` : 'Your matches are ready'}
        </h2>
        <p className="mt-1 text-[14.5px] text-ink-600">{step === 'email' ? 'Get your code to see them.' : 'Enter your code to see them.'}</p>

        <div className="mt-1">
          <QuickSignup cv={cv} onStep={setStep} />
        </div>
      </div>
      {/* What's waiting: the scores, the rest blurred until the code is in. */}
      <div aria-hidden className="space-y-3">
        {(items.length ? items.slice(0, 3) : [null, null, null]).map((m, i) => (
          <div key={m?.id ?? i} className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-ink-200 sm:p-5">
            <MatchRing score={m?.score ?? null} size={56} pending={!m} />
            <div className="pointer-events-none min-w-0 flex-1 select-none blur-[6px]">
              <span className="block h-3 w-1/3 rounded bg-ink-200" />
              <span className="mt-2 block h-4 w-3/4 rounded bg-ink-300" />
              <span className="mt-2 block h-3 w-1/2 rounded bg-ink-200" />
            </div>
          </div>
        ))}
      </div>

    </section>
  );
}
