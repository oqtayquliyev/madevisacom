import { useEffect, useState } from 'react';
import { ScanSearch } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useCv } from '@/lib/cv/store';
import { AuthCard } from '@/components/auth/AuthUI';
import { CvUpload } from '@/components/cv/CvUpload';

// ---------------------------------------------------------------------------
// A CV is part of creating a job-seeker account.
//
//   • Sign-up page: the last step is "Upload your CV" — no skip.
//   • Signed up another way (Google, a sign-in dialog on a job page): the
//     same step appears as a dialog on the next page.
//   • Accounts that existed before this was required are reminded, and can
//     put it off until later that day.
//   • People who are here to hire (employers, recruiters, agencies, admins)
//     say so once and are never asked again.
// ---------------------------------------------------------------------------

/** Accounts younger than this must add a CV; older ones are reminded. */
const REQUIRED_FOR_DAYS = 7;
const HIRING_KEY = (id: string) => `mv:hiring:${id}`;
const LATER_KEY = 'mv:cvLater';

function saidHiring(userId: string, meta: Record<string, unknown> | undefined): boolean {
  if (meta?.cv_exempt === true) return true;
  try {
    return window.localStorage.getItem(HIRING_KEY(userId)) === '1';
  } catch {
    return false;
  }
}

export type CvRequirement = {
  /** Still working out whether one is needed (CV loading). */
  loading: boolean;
  /** This person should be asked for a CV now. */
  needed: boolean;
  /** No "later": the account is new. */
  must: boolean;
  /** "I'm here to hire" — never ask again. */
  markHiring: () => Promise<void>;
  /** Put it off until tomorrow (older accounts only). */
  later: () => void;
};

export function useCvRequirement(): CvRequirement {
  const { user, profile } = useAuth();
  const { cv, ready } = useCv();
  const [tick, setTick] = useState(0);

  const created = Date.parse(user?.created_at ?? '');
  const isNew = Number.isFinite(created) && Date.now() - created < REQUIRED_FOR_DAYS * 86_400_000;
  const seeker = Boolean(user && profile && (profile.role === 'customer' || profile.role == null));
  const hiring = user ? saidHiring(user.id, user.user_metadata) : false;
  let snoozed = false;
  try {
    snoozed = !isNew && window.localStorage.getItem(LATER_KEY) === new Date().toISOString().slice(0, 10);
  } catch {
    /* ignore */
  }
  void tick;

  return {
    loading: Boolean(user) && (!ready || !profile),
    needed: seeker && !cv && ready && !hiring && !snoozed,
    must: isNew,
    markHiring: async () => {
      if (!user) return;
      try {
        window.localStorage.setItem(HIRING_KEY(user.id), '1');
      } catch {
        /* ignore */
      }
      setTick((n) => n + 1);
      // Remembered with the account too, so it holds on other devices.
      await supabase.auth.updateUser({ data: { cv_exempt: true } }).catch(() => undefined);
    },
    later: () => {
      try {
        window.localStorage.setItem(LATER_KEY, new Date().toISOString().slice(0, 10));
      } catch {
        /* ignore */
      }
      setTick((n) => n + 1);
    },
  };
}

const POINTS = ['Your match score on every job, free', 'The skills each ad asks for that your CV doesn’t show', 'New jobs that fit you, by email — never the same job twice'];

function Body({ req, onDone }: { req: CvRequirement; onDone?: () => void }) {
  return (
    <>
      <ul className="mb-4 space-y-1.5">
        {POINTS.map((p) => (
          <li key={p} className="flex gap-2 text-[13.5px] leading-5 text-ink-700">
            <ScanSearch className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> {p}
          </li>
        ))}
      </ul>
      <CvUpload compact onDone={() => onDone?.()} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-ink-100 pt-3 text-[13px]">
        <button type="button" onClick={() => void req.markHiring().then(() => onDone?.())} className="font-medium text-ink-500 hover:text-ink-800">
          I’m here to hire, not to find a job
        </button>
        {!req.must && (
          <button
            type="button"
            onClick={() => {
              req.later();
              onDone?.();
            }}
            className="font-medium text-ink-500 hover:text-ink-800"
          >
            Later
          </button>
        )}
      </div>
    </>
  );
}

/** The last step of creating an account on /register (and of signing in without a CV). */
export function AddCvStep({ req }: { req: CvRequirement }) {
  return (
    <AuthCard title="Upload your CV" subtitle="Last step. It’s how MadeVisa shows you how well you fit each job.">
      {/* No navigation here: once there is a CV (or "I'm here to hire"), App moves on by itself. */}
      <Body req={req} />
    </AuthCard>
  );
}

const QUIET = /^\/(?:brief|employers|company|admin|submit-job|login|register|reset-password|verify-email|alerts|terms|privacy|cookies|u\/)/;

/**
 * The same step as a dialog, for people who signed up without passing the
 * sign-up page (Google, a dialog on a job page) and for older accounts
 * with no CV. Mounted once, in the site header.
 */
export function CvRequiredDialog() {
  const req = useCvRequirement();
  const [ready, setReady] = useState(false);
  // Let the page settle first (and the CV finish loading) — never flash it.
  useEffect(() => {
    if (!req.needed) return setReady(false);
    const t = window.setTimeout(() => setReady(true), req.must ? 600 : 2500);
    return () => window.clearTimeout(t);
  }, [req.needed, req.must]);

  if (!req.needed || !ready || QUIET.test(window.location.pathname)) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="cv-required" className="fixed inset-0 z-[70] grid place-items-center bg-ink-950/50 p-4">
      <div className="menu-pop max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id="cv-required" className="text-[22px] font-bold leading-tight tracking-tight text-ink-950">
          {req.must ? 'One last step: upload your CV' : 'Add your CV to see how well you match'}
        </h2>
        <p className="mb-4 mt-1.5 text-[14px] leading-6 text-ink-600">
          {req.must ? 'Your account is ready. Your CV is what lets every job show how well you fit it.' : 'Every job on MadeVisa can now show how well your CV fits it.'}
        </p>
        <Body req={req} />
      </div>
    </div>
  );
}
