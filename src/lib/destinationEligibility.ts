// Personal eligibility for /destinations.
//
// Passport comes from the shared personalization profile (the same one
// the Jobs board uses), so a visitor sets it once. The extra yes/no
// answers and a display name for guests live in their own localStorage
// key; signed-in users' names come from their account.
//
// This is a first-pass check, not legal advice: it only compares what a
// route asks for with what the visitor told us, and says "Likely" when a
// route also has conditions a short profile can't judge (salary
// thresholds, points tests, endorsements).

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { usePersonalization } from '@/lib/personalization';
import {
  ANSWERABLE,
  COMMON_TRAVEL_AREA,
  FREE_MOVEMENT,
  REQUIREMENT_LABEL,
  type Requirement,
  type VisaGuide,
  type VisaRoute,
} from '@/data/visa';

export type Answer = boolean | null;
export type Answers = Partial<Record<Requirement, Answer>>;

type Stored = { name: string; answers: Answers };

const KEY = 'madevisa.destinationProfile.v1';
const EVENT = 'madevisa:destination-profile';

function read(): Stored {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { name: typeof p.name === 'string' ? p.name : '', answers: p.answers && typeof p.answers === 'object' ? p.answers : {} };
    }
  } catch {
    // storage unavailable (private mode) — fall through to empty
  }
  return { name: '', answers: {} };
}

function write(next: Stored) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Everything the destination pages need about the visitor, kept in sync across components. */
export function useDestinationProfile() {
  const { profile: account } = useAuth();
  const { profile: personal, updateProfile } = usePersonalization();
  const [stored, setStored] = useState<Stored>(read);

  useEffect(() => {
    const sync = () => setStored(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const accountName = account?.full_name?.trim() || '';
  const name = accountName || stored.name.trim();
  const firstName = name.split(/\s+/)[0] ?? '';

  const setName = useCallback((n: string) => write({ ...read(), name: n }), []);
  const setAnswer = useCallback((r: Requirement, v: Answer) => {
    const cur = read();
    write({ ...cur, answers: { ...cur.answers, [r]: v } });
  }, []);
  const reset = useCallback(() => write({ name: '', answers: {} }), []);

  return {
    name,
    firstName,
    nameFromAccount: Boolean(accountName),
    setName,
    citizenship: personal.citizenship,
    setCitizenship: (code: string | null) => updateProfile({ citizenship: code }),
    answers: stored.answers,
    setAnswer,
    answeredCount: ANSWERABLE.filter((r) => stored.answers[r] != null).length,
    reset,
  };
}

// ---------------------------------------------------------------------------

export type RouteStatus = 'citizen' | 'free' | 'eligible' | 'likely' | 'check' | 'unknown' | 'missing';

export type RouteVerdict = {
  status: RouteStatus;
  /** Requirements the visitor said they don't meet. */
  missing: Requirement[];
  /** Answerable requirements they haven't answered yet. */
  unanswered: Requirement[];
  /** Conditions a profile can't judge — confirm on the official site. */
  toConfirm: Requirement[];
};

/** Citizens of EU/EEA/CH (or UK↔Ireland) don't need a permit for this country at all. */
export function needsNoPermit(guide: VisaGuide, citizenship: string | null): 'citizen' | 'free' | null {
  if (!citizenship) return null;
  if (citizenship === guide.code) return 'citizen';
  if (guide.freeMovement && FREE_MOVEMENT.has(citizenship)) return 'free';
  if (COMMON_TRAVEL_AREA.has(guide.code) && COMMON_TRAVEL_AREA.has(citizenship)) return 'free';
  return null;
}

export function routeVerdict(route: VisaRoute, guide: VisaGuide, citizenship: string | null, answers: Answers): RouteVerdict {
  const exempt = needsNoPermit(guide, citizenship);
  if (exempt) return { status: exempt, missing: [], unanswered: [], toConfirm: [] };

  const missing: Requirement[] = [];
  const unanswered: Requirement[] = [];
  const toConfirm: Requirement[] = [];
  for (const r of route.requires) {
    if (!ANSWERABLE.includes(r)) {
      toConfirm.push(r);
      continue;
    }
    const a = answers[r];
    if (a === false) missing.push(r);
    else if (a == null) unanswered.push(r);
  }
  // A route with nothing we can check from the profile (e.g. an intracompany
  // transfer) can't be called "likely" — it only says "check the details".
  const checkable = route.requires.some((r) => ANSWERABLE.includes(r));
  const status: RouteStatus = missing.length ? 'missing' : unanswered.length ? 'unknown' : !checkable ? 'check' : toConfirm.length ? 'likely' : 'eligible';
  return { status, missing, unanswered, toConfirm };
}

const RANK: Record<RouteStatus, number> = { citizen: 0, free: 1, eligible: 2, likely: 3, check: 4, unknown: 5, missing: 6 };

export type CountryVerdict = {
  status: RouteStatus;
  /** Best routes first. */
  routes: { route: VisaRoute; verdict: RouteVerdict }[];
  openCount: number;
};

export function countryVerdict(guide: VisaGuide, citizenship: string | null, answers: Answers): CountryVerdict {
  const routes = guide.routes
    .map((route) => ({ route, verdict: routeVerdict(route, guide, citizenship, answers) }))
    .sort(
      (a, b) =>
        RANK[a.verdict.status] - RANK[b.verdict.status] ||
        a.verdict.missing.length + a.verdict.unanswered.length - (b.verdict.missing.length + b.verdict.unanswered.length) ||
        Number(b.route.leadsToPR) - Number(a.route.leadsToPR),
    );
  const best = routes[0]?.verdict.status ?? 'unknown';
  const openCount = routes.filter((r) => r.verdict.status === 'eligible' || r.verdict.status === 'likely' || r.verdict.status === 'free' || r.verdict.status === 'citizen').length;
  return { status: best, routes, openCount };
}

export const STATUS_COPY: Record<RouteStatus, { label: string; tone: 'good' | 'ok' | 'neutral' | 'bad' }> = {
  citizen: { label: 'Your country', tone: 'good' },
  free: { label: 'No visa needed', tone: 'good' },
  eligible: { label: 'Eligible', tone: 'good' },
  likely: { label: 'Likely eligible', tone: 'ok' },
  check: { label: 'Check details', tone: 'neutral' },
  unknown: { label: 'Answer to check', tone: 'neutral' },
  missing: { label: 'Not yet eligible', tone: 'bad' },
};

/** One plain sentence explaining a verdict. */
export function verdictReason(v: RouteVerdict, guide: VisaGuide): string {
  switch (v.status) {
    case 'citizen':
      return `You're a citizen of ${guide.name}.`;
    case 'free':
      return `Your passport lets you live and work in ${guide.name} without a permit.`;
    case 'eligible':
      return 'You meet everything this route asks for.';
    case 'likely':
      return `You meet the basics. Confirm: ${v.toConfirm.map((r) => REQUIREMENT_LABEL[r].toLowerCase()).join(', ')}.`;
    case 'check':
      return `Depends on things we can't check here: ${v.toConfirm.map((r) => REQUIREMENT_LABEL[r].toLowerCase()).join(', ')}.`;
    case 'unknown':
      return `Answer ${v.unanswered.length === 1 ? 'one question' : `${v.unanswered.length} questions`} in your profile to check.`;
    case 'missing':
      return `Needs: ${v.missing.map((r) => REQUIREMENT_LABEL[r].toLowerCase()).join(', ')}.`;
  }
}
