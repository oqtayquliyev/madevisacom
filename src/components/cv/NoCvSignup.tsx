import { useState } from 'react';
import { Briefcase, Mail } from 'lucide-react';
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
  return (
    <section className="mx-auto max-w-xl rounded-3xl bg-white px-5 py-6 text-left text-ink-900 shadow-soft ring-1 ring-ink-200 sm:px-7">
      <h2 className="flex items-center gap-2 text-[19px] font-bold leading-tight tracking-tight text-ink-950">
        <Mail className="h-5 w-5 text-brand-600" aria-hidden />
        {step === 'code' ? 'Write your code to get your jobs abroad' : 'No CV / Resume? Get jobs abroad by email'}
      </h2>

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
