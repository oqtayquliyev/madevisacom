// Member feedback for the site: the reviews in supabase/functions/_shared/testimonials.ts
// (shared with the social pipeline), plus the newer member reviews in ./journeys.

import { JOURNEYS } from './journeys';
import { MEMBER_REVIEWS, type Testimonial } from '../../supabase/functions/_shared/testimonials';

export type { Testimonial } from '../../supabase/functions/_shared/testimonials';

export const TESTIMONIALS: Testimonial[] = [...MEMBER_REVIEWS];

// Newer member reviews (src/data/journeys.ts), also used on /cv-match with the visitor's country first.
// Not counted in PRO_TESTIMONIALS: most are Starter members, and they came without a star rating
// (that list is shown as "N Pro members, all 5 stars").
for (const j of JOURNEYS) {
  const id = `${j.name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '')}-${j.from.toLowerCase()}-${j.to.toLowerCase()}`;
  if (TESTIMONIALS.some((t) => t.id === id)) continue;
  TESTIMONIALS.push({ id, headline: j.headline, text: j.line, name: j.name, role: j.role, from: { name: j.fromName, code: j.from }, to: { name: j.toName, code: j.to }, pro: false });
}

// Reviews that talk about the retired Pro plan, Auto Apply or an old price aren't shown:
// there is one membership now, and a review describing another plan would mislead.
const RETIRED = /\bPro\b|Pro'|auto[- ]?apply|\$\s?\d|\d\s?\$/i;
for (let i = TESTIMONIALS.length - 1; i >= 0; i--) {
  const t = TESTIMONIALS[i];
  if (RETIRED.test(`${t.headline} ${t.text} ${t.name}`)) TESTIMONIALS.splice(i, 1);
}

export const PRO_TESTIMONIALS = TESTIMONIALS.filter((t) => t.pro);
