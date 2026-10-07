// From a match to what the application decision needs to know about it.

import type { CvProfile } from '@/lib/cv/cvProfile';
import type { JobProfile } from '@/lib/cv/jobProfile';
import type { MatchResult } from '@/lib/cv/match';
import type { TopMatch } from '@/lib/cv/topMatches';
import type { JobFacts, MatchQ } from '@/lib/apply/types';

/** The parts of a match an application decision looks at. */
export function matchQ(m: MatchResult, job: JobProfile, cv: CvProfile): MatchQ {
  const part = (k: string) => m.parts.find((p) => p.key === k)?.score ?? null;
  const missingLanguage = job.languages.some((l) => l.required && !cv.languages.some((c) => c.code === l.code));
  return {
    skills: part('skills'),
    role: part('role'),
    experience: part('experience'),
    wording: part('wording'),
    languages: part('languages'),
    education: part('education'),
    asked: m.skills.asked,
    must: m.skills.missing.filter((s) => s.required).length,
    gap: job.seniority != null ? Math.max(0, job.seniority - cv.seniority) : 0,
    capped: Boolean(m.capReason) && missingLanguage,
  };
}

export function factsOf(t: TopMatch): JobFacts {
  return {
    id: t.id,
    title: t.title,
    company: t.company,
    publisherId: t.publisherId ?? null,
    cc: t.cc,
    country: t.country,
    remote: t.remote,
    arrangement: t.arrangement ?? (t.remote ? 'remote' : null),
    role: t.role ?? null,
    score: t.score,
    q: t.q ?? null,
    visa: t.visa,
    postedAt: t.postedAt,
    payUsdYear: t.payUsdYear,
  };
}
