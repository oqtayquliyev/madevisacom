import { useState } from 'react';
import { Briefcase, ChevronDown, Mail } from 'lucide-react';
import { QuickSignup } from '@/components/cv/QuickSignup';
import { CATEGORIES_BY_GROUP } from '@/lib/jobTaxonomy';
import { rememberAlertWish } from '@/lib/jobAlerts';

const clean = (label: string) => label.replace(/\s*\(other\)/i, '').trim();

/**
 * /cv-match without a CV: email + field of work is enough. The 6-digit code makes the free account,
 * and a job alert for that field is created right after sign-in (useAlertWishAfterSignIn in App),
 * so the jobs abroad arrive by email.
 */
export function NoCvSignup() {
  const [field, setField] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mx-auto flex w-full max-w-xl items-center gap-3 rounded-2xl bg-white/10 px-5 py-4 text-left text-white ring-1 ring-white/25 transition hover:bg-white/15"
      >
        <Mail className="h-5 w-5 shrink-0 text-white/80" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">You don’t have a CV / Resume? No worries!</span>
          <span className="mt-0.5 block text-[13px] text-white/75">Get sponsored jobs abroad by email</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[13px] font-bold text-brand-700">
          Start <ChevronDown className="h-4 w-4" aria-hidden />
        </span>
      </button>
    );
  }

  return (
    <section className="mx-auto max-w-xl animate-fade-up rounded-3xl bg-white px-5 py-6 text-left text-ink-900 shadow-soft ring-1 ring-ink-200 motion-reduce:animate-none sm:px-7">
      <h2 className="flex items-center gap-2 text-[19px] font-bold leading-tight tracking-tight text-ink-950">
        <Mail className="h-5 w-5 text-brand-600" aria-hidden />
        {step === 'code' ? 'Write your code to get your jobs abroad' : 'No CV / Resume? No worries!'}
      </h2>
      {step === 'email' && <p className="mt-1 text-[14px] text-ink-600">Tell us your field — we’ll send you sponsored jobs abroad.</p>}

      {step === 'email' && (
        <label className="mt-4 block">
          <span className="text-[13px] font-semibold text-ink-700">Your field of work</span>
          <span className="relative mt-1.5 block">
            <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="h-12 w-full appearance-none rounded-xl border border-ink-200 bg-white pl-9 pr-8 text-[15px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Choose your field…</option>
              {CATEGORIES_BY_GROUP.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {[...new Set(g.labels.map(clean))].map((l) => (
                    <option key={`${g.group}:${l}`} value={l}>
                      {l}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </span>
        </label>
      )}

      <QuickSignup
        onStep={setStep}
        back="/jobs"
        sendLabel="Send me jobs"
        beforeSend={() => {
          if (!field) return 'Choose your field of work first.';
          rememberAlertWish({ keywords: field, country: null });
          return null;
        }}
      />
    </section>
  );
}
