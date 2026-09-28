import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { resolveCountry } from '@/lib/geolocation';

/**
 * Lightweight, guest-friendly "who are you" profile used to compute
 * eligibility fit for jobs, programs and other opportunities.
 *
 * This is intentionally separate from the Supabase auth profile: most
 * visitors will use the Jobs/Programs boards before ever creating an
 * account, so we keep this in localStorage and let them fill it in
 * from a small inline bar the first time it matters.
 */
export type Personalization = {
  /** ISO-ish country code of citizenship / passport, e.g. "AZ" */
  citizenship: string | null;
  /** ISO-ish country code of where the person currently lives */
  currentLocation: string | null;
  /** Age in years */
  age: number | null;
};

const STORAGE_KEY = 'madevisa.personalization.v1';

const empty: Personalization = {
  citizenship: null,
  currentLocation: null,
  age: null,
};

function load(): Personalization {
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    // Age is no longer collected; ignore any previously stored value so
    // it can't silently affect eligibility badges.
    return { ...empty, ...parsed, age: null };
  } catch {
    return empty;
  }
}

type PersonalizationContextValue = {
  profile: Personalization;
  setProfile: (next: Personalization) => void;
  updateProfile: (patch: Partial<Personalization>) => void;
  isComplete: boolean;
  clear: () => void;
};

const PersonalizationContext = createContext<PersonalizationContextValue | null>(null);

export function PersonalizationProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<Personalization>(load);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  }, [profile]);

  // Pre-fill citizenship and "currently based in" from the visitor's
  // detected country (same cookie/IP lookup the landing page uses).
  // Only fills empty fields — never overrides what the visitor picked.
  useEffect(() => {
    if (profile.citizenship && profile.currentLocation) return;
    let cancelled = false;
    resolveCountry().then((code) => {
      if (cancelled || !code) return;
      setProfileState((current) => ({
        ...current,
        citizenship: current.citizenship ?? code,
        currentLocation: current.currentLocation ?? code,
      }));
    });
    return () => {
      cancelled = true;
    };
    // Runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Your location" changed on the site → use it as the passport and
  // current location too (visitors can still pick a different passport on
  // the visa pages).
  useEffect(() => {
    const onOrigin = (e: Event) => {
      const code = (e as CustomEvent<string>).detail;
      if (typeof code === 'string' && code) setProfileState((current) => ({ ...current, citizenship: code, currentLocation: code }));
    };
    window.addEventListener('madevisa:origin-country', onOrigin);
    return () => window.removeEventListener('madevisa:origin-country', onOrigin);
  }, []);

  const setProfile = (next: Personalization) => setProfileState(next);
  const updateProfile = (patch: Partial<Personalization>) =>
    setProfileState((current) => ({ ...current, ...patch }));
  const clear = () => setProfileState(empty);

  const isComplete = Boolean(profile.citizenship && profile.currentLocation);

  const value = useMemo(
    () => ({ profile, setProfile, updateProfile, isComplete, clear }),
    [profile, isComplete]
  );

  return (
    <PersonalizationContext.Provider value={value}>
      {children}
    </PersonalizationContext.Provider>
  );
}

export function usePersonalization() {
  const ctx = useContext(PersonalizationContext);
  if (!ctx) {
    throw new Error('usePersonalization must be used within a PersonalizationProvider');
  }
  return ctx;
}

/** ---- Eligibility engine shared by Jobs, Programs and future boards ---- */

export type EligibilityCriteria = {
  /** Country codes eligible, or 'any' */
  citizenship: string[] | 'any';
  /** Country codes this listing is closed to (overrides citizenship "any") */
  excludedCitizenship?: string[];
  minAge?: number;
  maxAge?: number;
  /**
   * Where the applicant must currently be based to apply.
   * 'any' = no restriction, 'destination-country' = must already be in
   * the listing's country, otherwise a list of allowed country codes.
   */
  currentLocation?: 'any' | 'destination-country' | string[];
};

export type EligibilityResult = {
  status: 'fit' | 'partial' | 'not-fit' | 'unknown';
  reasons: string[];
};

/**
 * Compares a listing's eligibility rules against the visitor's
 * personalization profile. Returns "unknown" until the visitor has
 * filled in enough of their profile to judge.
 */
export function computeEligibility(
  criteria: EligibilityCriteria,
  profile: Personalization,
  destinationCountryCode?: string
): EligibilityResult {
  const reasons: string[] = [];
  const hasAnyProfile = Boolean(profile.citizenship || profile.currentLocation || profile.age);

  if (!hasAnyProfile) {
    return { status: 'unknown', reasons: ['Add your profile to see your fit'] };
  }

  let fails = 0;
  let checks = 0;

  if (profile.citizenship) {
    checks += 1;
    const blocked = criteria.excludedCitizenship?.includes(profile.citizenship);
    const allowed =
      criteria.citizenship === 'any' || criteria.citizenship.includes(profile.citizenship);

    if (blocked || !allowed) {
      fails += 1;
      reasons.push('Not open to your citizenship');
    } else {
      reasons.push('Citizenship matches');
    }
  }

  if (profile.age !== null && (criteria.minAge || criteria.maxAge)) {
    checks += 1;
    const tooYoung = criteria.minAge ? profile.age < criteria.minAge : false;
    const tooOld = criteria.maxAge ? profile.age > criteria.maxAge : false;

    if (tooYoung || tooOld) {
      fails += 1;
      reasons.push(
        `Outside age range${criteria.minAge ? ` (${criteria.minAge}${criteria.maxAge ? `–${criteria.maxAge}` : '+'})` : ''}`
      );
    } else {
      reasons.push('Age fits');
    }
  }

  if (profile.currentLocation && criteria.currentLocation && criteria.currentLocation !== 'any') {
    checks += 1;
    const requiresDestination = criteria.currentLocation === 'destination-country';
    const allowedList = Array.isArray(criteria.currentLocation) ? criteria.currentLocation : null;

    const ok = requiresDestination
      ? destinationCountryCode
        ? profile.currentLocation === destinationCountryCode
        : true
      : allowedList
      ? allowedList.includes(profile.currentLocation)
      : true;

    if (!ok) {
      fails += 1;
      reasons.push(
        requiresDestination
          ? 'Usually requires applying from inside the country'
          : 'Not available from your current location'
      );
    } else {
      reasons.push('Location works');
    }
  }

  if (checks === 0) return { status: 'unknown', reasons: ['Add your profile to see your fit'] };
  if (fails === 0) return { status: 'fit', reasons: reasons.filter((r) => !r.includes('fits') ? true : true) };
  if (fails < checks) return { status: 'partial', reasons };
  return { status: 'not-fit', reasons };
}
