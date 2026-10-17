import { useMemo } from 'react';
import { Check, Lock, Plus, Sparkles } from 'lucide-react';
import type { StoredCv } from '@/lib/cv/store';
import type { TopResult } from '@/lib/cv/topMatches';
import { cvScore, fixCount } from '@/lib/cv/cvScore';
import { MatchRing } from '@/components/cv/MatchBits';

const scoreVerdict = (score: number) =>
  score >= 80 ? 'Strong — employers can see what you do.' : score >= 65 ? 'Good — a few additions will lift it.' : 'Worth improving — the list below shows where to start.';

/** Shapes where locked content would be — nothing real is in the page until the code is in. */
function Shapes({ rows }: { rows: string[] }) {
  return (
    <span aria-hidden className="pointer-events-none block select-none space-y-2 blur-[3px]">
      {rows.map((w, i) => (
        <span key={i} className="block h-3 rounded bg-ink-200" style={{ width: w }} />
      ))}
    </span>
  );
}

/**
 * The end of /cv-match: how the CV score (in the page header) is made up, and what to add.
 * `locked` (no account yet): the score and its parts are shown; the fixes are counted, one is
 * shown, and the rest wait behind the email code.
 */
export function CvScoreCard({ cv, result, locked = false }: { cv: StoredCv; result: TopResult; locked?: boolean }) {
  const s = useMemo(() => cvScore(cv.profile, result.items), [cv.profile, result.items]);
  const failed = s.checks.filter((c) => !c.ok);
  const passed = s.checks.filter((c) => c.ok);
  const total = fixCount(s);
  const unlock = () => {
    const el = document.querySelector<HTMLInputElement>('input[type="email"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => el?.focus(), 400);
  };

  return (
    <section aria-labelledby="cv-score-title" className="mx-auto max-w-3xl animate-fade-up overflow-hidden rounded-3xl bg-white ring-1 ring-ink-200 motion-reduce:animate-none">
      <div className="flex items-center gap-4 bg-gradient-to-br from-brand-50 to-white p-5 sm:p-6">
        <MatchRing score={s.score} size={76} />
        <div className="min-w-0 flex-1">
          <h2 id="cv-score-title" className="text-[18px] font-bold leading-tight tracking-tight text-ink-950">
            Your CV score · {s.score}/100
          </h2>
          <p className="mt-0.5 text-[14px] text-ink-600">{scoreVerdict(s.score)}</p>
          {total > 0 && (
            <p className="mt-1 text-[13px] font-semibold text-amber-800">
              {total} {total === 1 ? 'thing' : 'things'} to add or fix on your CV
            </p>
          )}
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

          {locked ? (
            <div className="mt-3 space-y-3">
              {/* One real fix as a taste; the rest are shapes. */}
              {failed[0] ? (
                <p className="flex gap-2 text-[13.5px] leading-5 text-ink-700">
                  <Plus className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden /> <span>{failed[0].fix}</span>
                </p>
              ) : s.skills[0] ? (
                <p className="flex gap-2 text-[13.5px] leading-5 text-ink-700">
                  <Plus className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                  <span>
                    <b className="font-semibold text-ink-900">{s.skills[0].name}</b> — {s.skills[0].n} of your matching jobs ask for it.
                  </span>
                </p>
              ) : null}
              {total > 1 && (
                <div className="relative overflow-hidden rounded-xl bg-ink-50 p-4">
                  <Shapes rows={['92%', '70%', '84%', '58%', '76%']} />
                  <div className="absolute inset-0 grid place-items-center bg-white/40 p-3">
                    <button onClick={unlock} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm hover:bg-brand-700">
                      <Lock className="h-3.5 w-3.5" aria-hidden /> See all {total} fixes — get your code
                    </button>
                  </div>
                </div>
              )}
              {total <= 1 && !failed[0] && !s.skills[0] && <p className="text-[13.5px] text-emerald-700">Nothing to add — your CV covers what these jobs ask for.</p>}
            </div>
          ) : (
            <>
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
                {!total && <li className="text-emerald-700">Nothing to add — your CV covers what these jobs ask for.</li>}
              </ul>
              {s.skills.length > 0 && <p className="mt-3 text-[11.5px] text-ink-400">The number after a skill is how many of your matching jobs ask for it.</p>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
