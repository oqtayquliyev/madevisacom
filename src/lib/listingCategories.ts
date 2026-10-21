export const JOB_CATEGORIES = [
  'Full time',
  'Part time',
  'Internship',
  'Seasonal work',
  'Contract / Freelance',
  'Volunteer',
  'Apprenticeship',
  'Sponsored job',
  'Other',
] as const;
export type JobCategory = (typeof JOB_CATEGORIES)[number];

export const PROGRAM_CATEGORIES = [
  'Scholarship',
  'University / Education',
  'Language course',
  'Exchange program',
  'Government program',
  'Immigration / Visa program',
  'Relocation program',
  'Business / Investment program',
  'Travel program',
  'Internship / Training',
  'Au pair',
  'Volunteer program',
  'Housing / Accommodation',
  'Other',
] as const;
export type ProgramCategory = (typeof PROGRAM_CATEGORIES)[number];

/**
 * 8-state workflow. The 3 legacy values (pending/published/rejected)
 * keep their original meaning; the rest are new checkpoints in the
 * "user submits basics → admin fills in the rest → publish" flow.
 */
export const LISTING_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending review' },
  { value: 'needs_information', label: 'Needs information' },
  { value: 'under_review', label: 'Under review' },
  { value: 'verified', label: 'Verified' },
  { value: 'published', label: 'Published' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number]['value'];

export const SALARY_STATUSES = [
  { value: 'disclosed', label: 'Salary available' },
  { value: 'not_disclosed', label: 'Salary not disclosed' },
  { value: 'volunteer', label: 'Volunteer / unpaid' },
  { value: 'negotiable', label: 'Salary negotiable' },
] as const;
export type SalaryStatus = (typeof SALARY_STATUSES)[number]['value'];

export const SALARY_PERIODS = ['hour', 'day', 'week', 'month', 'year'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const COST_STATUSES = [
  { value: 'free', label: 'Free' },
  { value: 'fully_funded', label: 'Fully funded' },
  { value: 'cost_available', label: 'Cost available' },
  { value: 'cost_not_disclosed', label: 'Cost not disclosed' },
  { value: 'contact_provider', label: 'Contact provider' },
] as const;
export type CostStatus = (typeof COST_STATUSES)[number]['value'];

/**
 * Which extra admin-form fields are relevant per category. Fields
 * not listed here for a given category are simply not shown — this
 * is what makes the admin form "dynamic per category" per spec,
 * without a different form component for every single category.
 * Core fields (title, org, description, country, city) always show;
 * this only controls the extra ones.
 */
export const PROGRAM_CATEGORY_FIELDS: Record<ProgramCategory, string[]> = {
  Scholarship: ['cost', 'eligibility', 'deadline', 'benefits'],
  'University / Education': ['cost', 'duration', 'eligibility', 'deadline', 'benefits'],
  'Language course': ['cost', 'duration', 'eligibility'],
  'Exchange program': ['cost', 'duration', 'eligibility', 'deadline'],
  'Government program': ['eligibility', 'benefits', 'deadline'],
  'Immigration / Visa program': ['eligibility', 'requirements', 'deadline'],
  'Relocation program': ['cost', 'benefits', 'duration'],
  'Business / Investment program': ['cost', 'eligibility', 'requirements'],
  'Travel program': ['cost', 'duration', 'benefits'],
  'Internship / Training': ['cost', 'duration', 'eligibility', 'deadline'],
  'Au pair': ['cost', 'duration', 'eligibility', 'benefits'],
  'Volunteer program': ['duration', 'eligibility', 'benefits'],
  'Housing / Accommodation': ['cost', 'duration'],
  Other: ['cost', 'duration', 'eligibility', 'deadline', 'benefits'],
};

export const JOB_CATEGORY_FIELDS: Record<JobCategory, string[]> = {
  'Full time': ['salary', 'visaSponsorship', 'experience', 'education', 'benefits'],
  'Part time': ['salary', 'experience'],
  Internship: ['salary', 'duration', 'education'],
  'Seasonal work': ['salary', 'duration'],
  'Contract / Freelance': ['salary', 'duration', 'experience'],
  Volunteer: ['duration', 'benefits'],
  Apprenticeship: ['salary', 'duration', 'education'],
  'Sponsored job': ['salary', 'visaSponsorship', 'experience', 'education', 'benefits'],
  Other: ['salary', 'visaSponsorship', 'experience', 'education', 'benefits'],
};

/**
 * Renders a job's salary as one clean display string, preferring the
 * structured status/numeric fields over the old free-text field so a
 * newly-submitted "Volunteer / unpaid" job never shows a stray "—".
 * Returns null when there's genuinely nothing to show.
 */
/**
 * True when a salary text actually states an amount. Careers sites often
 * leave placeholder values in hidden salary fields ("0.0", "0", "$0.00",
 * "N/A") that never appear on their own page — those must not be shown.
 */
export function isMeaningfulSalary(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  if (!t || t === '[object Object]') return false;
  if (/^(n\/?a|none|null|undefined|tbd|-+|—)$/i.test(t)) return false;
  return /[1-9]/.test(t);
}

/** Same output as n.toLocaleString(), without building a new formatter for every job (lists have thousands). */
const NUMBER = new Intl.NumberFormat();

export function formatSalary(job: {
  salary_status?: SalaryStatus;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string;
  salary_period?: SalaryPeriod;
  compensation_text?: string | null;
}): string | null {
  // Some importer runs stored a JS object into compensation_text, which
  // then rendered literally as "[object Object]" on cards. Treat that as
  // "no salary text" rather than showing it.
  if (job.compensation_text && !isMeaningfulSalary(job.compensation_text)) {
    job = { ...job, compensation_text: null };
  }
  switch (job.salary_status) {
    case 'volunteer':
      return 'Volunteer / unpaid';
    case 'negotiable':
      return 'Salary negotiable';
    case 'disclosed': {
      if (job.salary_min == null && job.salary_max == null) {
        return job.compensation_text || null;
      }
      const currency = job.salary_currency ?? 'USD';
      const period = job.salary_period ?? 'year';
      const fmt = (n: number) => `${currency} ${NUMBER.format(n)}`;
      const range =
        job.salary_min != null && job.salary_max != null && job.salary_min !== job.salary_max
          ? `${fmt(job.salary_min)}–${fmt(job.salary_max)}`
          : fmt(job.salary_min ?? job.salary_max ?? 0);
      if (!(job.salary_min || job.salary_max)) return job.compensation_text || null; // min/max both 0
      return `${range}/${period}`;
    }
    case 'not_disclosed':
    default:
      return job.compensation_text || null;
  }
}

/** Same idea as formatSalary, for a program's cost/funding. */
export function formatCost(program: {
  cost_status?: CostStatus;
  cost_amount_min?: number | null;
  cost_amount_max?: number | null;
  cost_currency?: string;
  funding_text?: string | null;
}): string | null {
  switch (program.cost_status) {
    case 'free':
      return 'Free';
    case 'fully_funded':
      return 'Fully funded';
    case 'contact_provider':
      return 'Contact provider for cost';
    case 'cost_available': {
      if (program.cost_amount_min == null && program.cost_amount_max == null) {
        return program.funding_text || null;
      }
      const currency = program.cost_currency ?? 'USD';
      const fmt = (n: number) => `${currency} ${NUMBER.format(n)}`;
      if (program.cost_amount_min != null && program.cost_amount_max != null && program.cost_amount_min !== program.cost_amount_max) {
        return `${fmt(program.cost_amount_min)}–${fmt(program.cost_amount_max)}`;
      }
      return fmt(program.cost_amount_min ?? program.cost_amount_max ?? 0);
    }
    case 'cost_not_disclosed':
    default:
      return program.funding_text || null;
  }
}

