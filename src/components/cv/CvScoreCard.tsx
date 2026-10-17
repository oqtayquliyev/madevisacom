import { useMemo } from 'react';
import { Check, Plus, Sparkles } from 'lucide-react';
import type { StoredCv } from '@/lib/cv/store';
import type { TopResult } from '@/lib/cv/topMatches';
import { cvScore } from '@/lib/cv/cvScore';
import { MatchRing } from '@/components/cv/MatchBits';
import { CvAvatar, nameFromCv } from '@/components/cv/CvInsights';

/** The end of /cv-match: one score for the whole CV, how it is made up, and what to add. */
export function CvScoreCard({ cv, result, name }: { cv: StoredCv; result: TopResult; name?: string | null }) {
  const s = useMemo(() => cvScore(cv.profile, result.items), [cv.profile, result.items]);
  const who = (name?.trim() || nameFromCv(cv.text) || '').split(/\s+/)[0] ?? '';
  const failed = s.checks.filter((c) => !c.ok);
  const passed = s.checks.filter((c) => c.ok);
  const verdict = s.score >= 80 ? 'Strong — employers can see what you do.' : s.score >= 65 ? 'Good — a few additions will lift it.' : 'Worth improving — the list below shows where to start.';

  return (
    <section aria-labelledby="cv-score-title" className="mx-auto max-w-3xl animate-fade-up overflow-hidden rounded-3xl bg-white ring-1 ring-ink-200 motion-reduce:animate-none">
      <div className="flex flex-col gap-5 bg-gradient-to-br from-brand-50 to-white p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex items-center gap-4">
          <CvAvatar cv={cv} name={name} size={56} />
          <MatchRing score={s.score} size={92} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold uppercase tracking-wide text-brand-700">Your CV score</p>
          <h2 id="cv-score-title" className="mt-0.5 text-[22px] font-bold leading-tight tracking-tight text-ink-950">
            {who ? `${who}, your CV scores ${s.score} out of 100` : `Your CV scores ${s.score} out of 100`}
          </h2>
          <p className="mt-1 text-[14px] text-ink-600">{verdict}</p>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-2">
        <div>
          <h3 className="text-[14px] font-bold text-ink-950">How it’s made up</h3>
          <ul className="mt-3 space-y-3">
            {s.parts.map((p) => (
              <li key={p.label}>
                <p className="flex justify-between text-[13px] text-ink-700">
                  <span>{p.label}</span>
                  <span className="font-bold tabular-nums text-ink-950">
                    {p.got}/{p.max}
                  </span>
                </p>
                <span className="mt-1 block h-2 overflow-hidden rounded-full bg-ink-100">
                  <span className="block h-full origin-left animate-grow-width rounded-full bg-brand-500 motion-reduce:animate-none" style={{ width: `${(100 * p.got) / p.max}%` }} />
                </span>
              </li>
            ))}
          </ul>
          {passed.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {passed.map((c) => (
                <li key={c.label} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-800">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> {c.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-ink-950">
            <Sparkles className="h-4 w-4 text-brand-600" aria-hidden /> Recommended to add
          </h3>
          <ul className="mt-3 space-y-2.5 text-[13.5px] leading-5 text-ink-700">
            {failed.map((c) => (
              <li key={c.label} className="flex gap-2">
                <Plus className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden /> <span>{c.fix}</span>
              </li>
            ))}
            {s.skills.length > 0 && (
              <li className="flex gap-2">
                <Plus className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <span>
                  Skills your matching jobs ask for — add the ones you have:
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    {s.skills.map((k) => (
                      <span key={k.name} className="rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-900 ring-1 ring-amber-200">
                        {k.name} <span className="font-normal text-amber-700">· {k.n}</span>
                      </span>
                    ))}
                  </span>
                </span>
              </li>
            )}
            {s.experience.length > 0 && (
              <li className="flex gap-2">
                <Plus className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <span>
                  Experience they also want — mention it if you have it: <b className="font-semibold text-ink-900">{s.experience.map((e) => e.name).join(', ')}</b>
                </span>
              </li>
            )}
            {!failed.length && !s.skills.length && !s.experience.length && <li className="text-emerald-700">Nothing to add — your CV covers what these jobs ask for.</li>}
          </ul>
          <p className="mt-3 text-[11.5px] text-ink-400">The number after a skill is how many of your matching jobs ask for it.</p>
        </div>
      </div>
    </section>
  );
}
