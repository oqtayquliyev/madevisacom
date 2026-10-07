// Auto Apply — the words every part of it shares.
//
// What Auto Apply is: MadeVisa looks at the jobs your CV matches, decides
// which are worth applying to, prepares each application (a CV tailored to
// that ad, a cover letter when one is useful, your saved answers), and
// either sends it — where the employer takes applications through MadeVisa —
// or hands it to you ready to send on the employer's own site.
//
// Two rules hold everywhere:
//   1. Nothing is invented. Every line of a tailored CV and every answer
//      comes from the CV or from what the person has saved.
//   2. "Submitted" means submitted. An application is only called that once
//      MadeVisa has a delivery confirmation, or the person says they sent it.

/** Where one application stands. */
export type AppStatus =
  | 'queued'
  | 'preparing'
  | 'needs_answer'
  | 'submitting'
  | 'submitted'
  | 'failed'
  | 'skipped'
  | 'already_applied'
  | 'expired'
  | 'review_required';

/** What MadeVisa recommends doing with a matched job. */
export type Decision = 'auto' | 'review' | 'skip';

/** Order in the queue: strong first. */
export type Priority = 'strong' | 'good' | 'backup';

/** What is known about visa sponsorship for this person and this job. */
export type SponsorState = 'not_needed' | 'likely' | 'unclear' | 'not_indicated' | 'not_compatible';

/**
 * How an application reaches the employer.
 *   madevisa       the employer takes applications through MadeVisa — sent by us, with a confirmation
 *   employer_site  the employer's own form — prepared by us, sent by the person
 */
export type Channel = 'madevisa' | 'employer_site';

export type Arrangement = 'remote' | 'hybrid' | 'onsite';

/** Where the job is, for this person. */
export type PlaceKind = 'here' | 'free' | 'abroad' | 'unknown';

/** The parts of a match score an application decision looks at (0–100, null = the ad doesn't ask). */
export type MatchQ = {
  skills: number | null;
  role: number | null;
  experience: number | null;
  wording: number | null;
  languages: number | null;
  education: number | null;
  /** Skills the ad names. */
  asked: number;
  /** Skills the ad lists as required that the CV doesn't show. */
  must: number;
  /** Levels the job's title is above the CV (0 = same or below). */
  gap: number;
  /** The score is held down by a required language the CV doesn't list. */
  capped: boolean;
};

/** A matched job, as the decision engine sees it. */
export type JobFacts = {
  id: string;
  title: string;
  company: string;
  publisherId: string | null;
  cc: string | null;
  country: string | null;
  remote: boolean;
  arrangement: Arrangement | null;
  /** MadeVisa job category ("Data Analyst"), when the title could be classified. */
  role: string | null;
  score: number;
  q: MatchQ | null;
  visa: 'offered' | 'not_offered' | null;
  postedAt: string | null;
  payUsdYear: number | null;
};

/** What only the server knows about a job for this person. */
export type ServerFacts = {
  channel: Channel;
  /** Already applied (tracked on MadeVisa), or already in an Auto Apply queue. */
  applied: boolean;
  /** Same company and same title as a job already applied to. */
  twin: boolean;
  /** Closed or taken down since the search. */
  closed: boolean;
  /** The employer's application page. */
  url: string | null;
  /** The company is on a public register of visa sponsors. */
  knownSponsor: boolean;
};

export type QuestionKey =
  | 'full_name'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'city'
  | 'country'
  | 'linkedin'
  | 'website'
  | 'work_authorization'
  | 'sponsorship'
  | 'salary_expectation'
  | 'notice_period'
  | 'availability'
  | 'relocation'
  | 'years_experience'
  | 'education'
  | 'languages'
  | 'current_title'
  | 'source'
  | 'consent'
  | 'demographic';

/** How Auto Apply should choose and pace applications. */
export type ApplyPrefs = {
  /** Jobs at or above this score can be applied to without a look from the person. */
  minScore: number;
  /** MadeVisa job categories to stay within; empty = any. */
  roles: string[];
  /** Country codes to stay within; empty = any. */
  countries: string[];
  /** Empty = any. */
  arrangements: Arrangement[];
  /** Lowest yearly pay worth applying for, in `salaryCurrency`; null = no floor. */
  salaryMin: number | null;
  salaryCurrency: string;
  /** auto = worked out per job from passport and country. */
  sponsorship: 'auto' | 'need' | 'no_need';
  relocate: boolean;
  maxPerDay: number;
  /** Questions MadeVisa must never answer without asking. */
  alwaysAsk: QuestionKey[];
};

export const DEFAULT_PREFS: ApplyPrefs = {
  minScore: 75,
  roles: [],
  countries: [],
  arrangements: [],
  salaryMin: null,
  salaryCurrency: 'USD',
  sponsorship: 'auto',
  relocate: true,
  maxPerDay: 20,
  alwaysAsk: ['salary_expectation', 'consent'],
};

/** Saved, verified answers: the canonical ones by key, anything else by the question's own words. */
export type SavedAnswer = { value: string; askEachTime: boolean; source: 'you' | 'cv' | 'account'; question?: string; updatedAt?: string };
export type ApplyProfile = {
  answers: Partial<Record<QuestionKey, SavedAnswer>>;
  /** Other questions, keyed by `questionId(label)`. */
  custom: Record<string, SavedAnswer>;
};
export const EMPTY_PROFILE: ApplyProfile = { answers: {}, custom: {} };

export type Question = {
  /** Stable id within one application form. */
  id: string;
  label: string;
  required: boolean;
  kind: 'text' | 'long' | 'select' | 'multi' | 'file' | 'yesno';
  options?: string[];
};

export type Answered = { id: string; label: string; value: string; source: SavedAnswer['source'] | 'madevisa'; key: QuestionKey | null };
export type Needed = { id: string; label: string; key: QuestionKey | null; kind: Question['kind']; options?: string[]; why: string };

export type Quality = {
  /** 0–100, or null when too little is known to say. */
  score: number | null;
  band: 'strong' | 'good' | 'weak' | 'unknown';
  /** Each part 0–100, or null = unknown (left out, the others share its weight). */
  parts: Record<QualityPart, number | null>;
  unknown: QualityPart[];
};
export type QualityPart = 'cv' | 'experience' | 'keywords' | 'required' | 'seniority' | 'location' | 'sponsorship' | 'completeness' | 'confidence';

export type ReasonCode =
  | 'strong'
  | 'below_min'
  | 'near_min'
  | 'too_low'
  | 'missing_required'
  | 'more_senior'
  | 'language'
  | 'old_ad'
  | 'no_sponsorship'
  | 'outside_roles'
  | 'outside_countries'
  | 'arrangement'
  | 'below_salary'
  | 'no_relocation'
  | 'already_applied'
  | 'same_role'
  | 'duplicate_listing'
  | 'closed';

export type Assessment = {
  decision: Decision;
  /** One plain line for the person. */
  reason: string;
  codes: ReasonCode[];
  priority: Priority;
  /** For ordering the queue: higher goes first. */
  rank: number;
  sponsorship: { state: SponsorState; why: string };
  quality: Quality;
  channel: Channel;
};

/** One application in a queue. */
export type Application = {
  id: string;
  jobId: string;
  title: string;
  company: string;
  cc: string | null;
  country: string | null;
  score: number;
  status: AppStatus;
  priority: Priority;
  rank: number;
  channel: Channel;
  sponsorship: SponsorState;
  url: string | null;
  /** Human reason for failed / skipped / review_required. */
  reason: string | null;
  reasonCode: string | null;
  needs: Needed[];
  /** True only with a delivery confirmation from the channel. */
  verified: boolean;
  confirmation: { kind: 'email' | 'self' | 'site'; id?: string; at: string } | null;
  cvName: string | null;
  coverLetter: boolean;
  submittedAt: string | null;
  updatedAt: string;
};

export type QueueState = 'running' | 'paused' | 'stopped' | 'done';
export type PauseReason = 'you' | 'daily_limit' | 'allowance' | 'offline' | null;
