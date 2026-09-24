export const DISCOVERY_CATEGORIES = ['Technology', 'Design', 'Engineering', 'Healthcare', 'Finance', 'Marketing', 'Business', 'Education'];

// Real source category text ("Legal & Public Affairs", "IT Services",
// "Product") will rarely exact-match one of the fixed discovery buckets
// above — companies phrase departments however they like. This
// classifies by keyword instead of exact equality, so filtering/
// backfilling actually catches real jobs rather than only ones whose
// source happened to use our exact wording. A job can match more than
// one bucket (e.g. "Software Engineer" is both Technology and
// Engineering) or none — "none" jobs still show up under "All
// categories" and are left alone by the backfill rather than forced
// into a wrong bucket.
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Technology: ['engineer', 'software', 'developer', 'it ', ' it', 'data', 'security', 'devops', 'technology', 'infrastructure', 'qa', 'quality assurance'],
  Design: ['design', 'ux', 'ui'],
  Engineering: ['engineer', 'engineering', 'manufacturing', 'r&d', 'r & d'],
  Healthcare: ['health', 'medical', 'clinical', 'pharma', 'nursing'],
  Finance: ['finance', 'financial', 'accounting', 'tax'],
  Marketing: ['marketing', 'communications', 'brand', 'pr'],
  Business: ['business', 'sales', 'commercial', 'strategy', 'operations', 'legal', 'compliance', 'hr', 'human resources', 'procurement', 'supply chain', 'product'],
  Education: ['education', 'training', 'learning', 'academic'],
};

export function matchesDiscoveryCategory(rawCategory: string, bucket: string): boolean {
  if (!rawCategory) return false;
  const s = ` ${rawCategory.toLowerCase()} `;
  const keywords = CATEGORY_KEYWORDS[bucket];
  if (!keywords) return s.includes(bucket.toLowerCase());
  return keywords.some((k) => s.includes(k));
}

/** Used by the admin backfill tool (src/lib/admin.ts) to derive a job_function for existing jobs that never got one from their source — classifies from the job title, the one field every job reliably has. Returns the first bucket it matches, or null when nothing matches (left alone rather than forced into a wrong bucket). */
export function classifyJobFunctionFromTitle(title: string): string | null {
  for (const bucket of DISCOVERY_CATEGORIES) {
    if (matchesDiscoveryCategory(title, bucket)) return bucket;
  }
  return null;
}

/** Employment-type values that carry no real information (e.g. ATS imports that default to "Other") and shouldn't be shown as a chip. */
const EMPTY_JOB_TYPES = new Set(['', 'other', 'n/a', 'na', 'unknown', 'not specified']);

export function isMeaningfulJobType(type: string | null | undefined): boolean {
  return !EMPTY_JOB_TYPES.has((type ?? '').trim().toLowerCase());
}

/**
 * Category label to show for a job: the real department/function from
 * the source when there is one, otherwise the /jobs discovery bucket
 * (Technology, Design, ...) it falls under by title — the same
 * matching the /jobs category tabs use. Null when nothing matches.
 */
export function displayJobCategory(job: { category?: string | null; title: string }): string | null {
  const raw = (job.category ?? '').trim();
  // Placeholder values some importers store ("All", "Various") aren't a category.
  if (raw && !/^(?:other|all|any|various|n\/?a|none|-)$/i.test(raw)) return DEPARTMENT_TRANSLATIONS[raw.toLowerCase()] ?? raw;
  return classifyJobFunctionFromTitle(job.title);
}

// German (and a few other) department names career sites use, shown in
// English so "Personal" doesn't read as "personal".
const DEPARTMENT_TRANSLATIONS: Record<string, string> = {
  personal: 'Human Resources',
  personalwesen: 'Human Resources',
  'personal & organisation': 'Human Resources',
  einkauf: 'Procurement',
  beschaffung: 'Procurement',
  vertrieb: 'Sales',
  verkauf: 'Sales',
  finanzen: 'Finance',
  'finanzen & controlling': 'Finance & Controlling',
  rechnungswesen: 'Accounting',
  produktion: 'Production',
  fertigung: 'Manufacturing',
  logistik: 'Logistics',
  qualität: 'Quality',
  qualitätsmanagement: 'Quality Management',
  'forschung und entwicklung': 'Research and Development',
  'forschung & entwicklung': 'Research and Development',
  entwicklung: 'Development',
  informationstechnologie: 'Information Technology',
  recht: 'Legal',
  kommunikation: 'Communications',
  verwaltung: 'Administration',
  instandhaltung: 'Maintenance',
  technik: 'Engineering',
  kundenservice: 'Customer Service',
  'marketing & vertrieb': 'Marketing & Sales',
};

// Words for student / intern / trainee roles across the languages our
// sources post in. Word-bounded so "internal" or "international" never
// match "intern", and "stage" only counts in its French/Dutch sense.
const STUDENT_INTERN_RE = new RegExp(
  [
    '\\bintern(?:s|ship|ships)?\\b',
    '\\bco-?op\\b',
    '\\btrainee(?:ship)?s?\\b',
    '\\bgraduate (?:program(?:me)?|scheme|trainee|intern)',
    '\\bnew grad',
    '\\bsummer (?:analyst|associate|student)',
    '\\b(?:working |student |university )?students?\\b',
    '\\bthesis\\b',
    '\\bapprentice(?:ship)?s?\\b',
    // German
    'werkstudent',
    'praktik(?:um|ant|antin)',
    'duales? studium',
    'dual(?:e|er|es)? student',
    '\\bausbildung',
    '\\bazubi',
    '(?:bachelor|master|abschluss)arbeit',
    'studentische',
    // French / Dutch / Spanish / Italian / Portuguese
    '\\bstagiaire',
    '\\bstage (?:de|d\'|en|bij)\\b',
    '\\balternance',
    '\\bapprenti(?:e|ssage)?\\b',
    '\\b[eé]tudiant',
    '\\bstagiair',
    '\\bafstudeer',
    'pr[aá]cticas',
    '\\bbecari[oa]',
    '\\bestudiante',
    '\\btirocin',
    '\\bstagista',
    '\\bstudente',
    '\\best[aá]gi[oá]',
    '\\bestagi[aá]ri',
    // Central / Eastern European, Turkish
    '[sš]tudent(?:ka|ský|ská)?\\b',
    '\\bst[aá][zž]',
    '\\bsta[zż]',
    '\\bpraktykant',
    '\\bgyakornok',
    '\\bstajyer',
    '\\bstagiu',
  ].join('|'),
  'i'
);

/** True for internships, working-student, apprenticeship, dual-study and trainee roles, detected in many languages. */
export function isStudentOrInternJob(job: { title: string; type?: string | null; experienceLevel?: string | null }): boolean {
  if (/^(?:internship|apprenticeship)$/i.test((job.type ?? '').trim())) return true;
  if (/\b(?:student|intern|apprentice|trainee|graduate)s?\b/i.test(job.experienceLevel ?? '')) return true;
  // Staff roles that serve students ("Student Success Manager") aren't student jobs.
  const title = job.title.replace(STUDENT_STAFF_RE, ' ');
  return STUDENT_INTERN_RE.test(title);
}

const STUDENT_STAFF_RE = /\bstudents?\s+(?:success|services?|affairs|experience|recruit\w*|advis\w*|counsel\w*|support|engagement|enrol\w*|admissions?|life|loans?|finance|housing|records|mobility officer)\b/gi;
