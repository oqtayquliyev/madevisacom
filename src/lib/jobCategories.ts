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
