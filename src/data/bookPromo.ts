// The book promotion: profession insights, the six reviews, the rating and how often promos show.
// These are the DEFAULTS. Admin → Book edits a copy saved in the database (book_promo table,
// migration 20261231290000); the site uses that copy when it exists (src/lib/bookPromo.ts).
// No imports and no browser code: the server-rendered /book page (api/seo.ts) reads it too.

export type BookReview = { id: string; name: string; profession: string; text: string; rating: number; published: boolean };
export type ProfessionInsight = { id: string; label: string; keywords: string[]; insight: string };
export type BookPromoContent = {
  rating: number;
  ratingCount: number;
  reviews: BookReview[];
  insights: ProfessionInsight[];
  /** Days between two showings of the same promo for one visitor (after a dismissal too). */
  frequencyDays: number;
  /** Where the career outlook card may appear. */
  placements: { jobs: boolean; home: boolean; dashboard: boolean; popup: boolean };
};

export const BOOK_INSIDE: string[] = [
  'AI’s impact across 40+ industries',
  'Changing responsibilities and professional roles',
  'Human judgment and accountability in the AI era',
  'Remote work and international opportunities',
  'Freelancing and independent income',
  'Building and selling digital products',
  'Practical workflows, tools and action plans',
];

export const GENERAL_INSIGHT =
  'AI is taking over repeatable tasks in almost every profession. What keeps its value is judgment, responsibility for results, and the ability to work with people and tools across borders. The guide looks at what is changing in 40+ industries and where new opportunities are opening.';

export const DEFAULT_BOOK_PROMO: BookPromoContent = {
  rating: 4.5,
  ratingCount: 6,
  frequencyDays: 3,
  placements: { jobs: true, home: true, dashboard: true, popup: true },
  reviews: [
    { id: 'r1', name: 'J*** A***', profession: 'Graphic Designer', rating: 5, published: true, text: 'I was worried AI tools would make my work pointless. The chapter on creative roles showed me where clients still need a designer: direction, brand thinking, owning the final result. I changed how I pitch my services.' },
    { id: 'r2', name: 'M*** K***', profession: 'Software Developer', rating: 5, published: true, text: 'Good reality check. Writing code is the part getting cheaper; architecture, security and being accountable for production are not. It pushed me to spend less time on tutorials and more on system design.' },
    { id: 'r3', name: 'A*** H***', profession: 'Marketing Specialist', rating: 4, published: true, text: 'Practical, not hype. The section on strategy and experimentation in an AI-driven market gave me three ideas I tested the same month. Wish it had a few more examples from B2B.' },
    { id: 'r4', name: 'S*** R***', profession: 'Freelancer', rating: 5, published: true, text: 'The freelancing part is the most useful thing I have read on getting first clients. Pricing by outcome instead of by hour alone was worth the price of the book.' },
    { id: 'r5', name: 'N*** M***', profession: 'Job Seeker', rating: 4, published: true, text: 'I am looking for remote and international roles and the book explained where those jobs actually get posted. Together with the MadeVisa membership it saved me a lot of searching.' },
    { id: 'r6', name: 'R*** T***', profession: 'Operations Manager', rating: 5, published: true, text: 'I liked that it goes industry by industry instead of making big predictions. Short chapters, clear actions at the end of each one. Easy to read on the phone.' },
  ],
  insights: [
    { id: 'graphic-design', label: 'Graphic Designer', keywords: ['graphic', 'visual', 'illustrat', 'brand design'], insight: 'AI can now produce layouts, visual assets, presentations and marketing materials in seconds. But a designer’s value was never only the pixels. Understanding business goals, setting creative direction, judging usability, working with clients and taking responsibility for the final experience are becoming the core of the job.' },
    { id: 'software', label: 'Software Developer', keywords: ['developer', 'software', 'engineer', 'programmer', 'frontend', 'backend', 'full stack', 'devops'], insight: 'AI writes more and more of the code. What it doesn’t own is the architecture, the security decisions, debugging real systems, integrating them with everything else, and responsibility when production breaks. Developers who move toward those parts become harder to replace, not easier.' },
    { id: 'accounting', label: 'Accountant', keywords: ['account', 'bookkeep', 'audit', 'finance', 'tax'], insight: 'Bookkeeping and standard reports are being automated quickly. The work that grows is interpreting the numbers, applying regulatory judgment to messy real cases, advising decision-makers, and signing off with accountability that software cannot carry.' },
    { id: 'marketing', label: 'Marketing Specialist', keywords: ['marketing', 'seo', 'content', 'social media', 'growth', 'brand'], insight: 'AI can generate campaigns, copy and visuals at scale, so output is no longer scarce. Positioning, understanding customers, designing experiments and owning performance are. The marketers who win are the ones who decide what is worth producing.' },
    { id: 'recruiting', label: 'Recruiter', keywords: ['recruit', 'talent', 'hr', 'human resources', 'sourcing'], insight: 'Sourcing and first screening are increasingly automated. Assessment quality, reading people, advising hiring managers and being accountable for a hiring decision remain human work — and matter more as candidate volumes grow.' },
    { id: 'healthcare', label: 'Healthcare Professional', keywords: ['nurse', 'doctor', 'health', 'medical', 'clinical', 'care', 'pharma'], insight: 'AI is taking on documentation and supporting diagnostics. Clinical judgment, communicating with patients, and responsibility for their care stay with people. Professionals who use the tools well get more time for the parts only they can do.' },
    { id: 'ux', label: 'UX Designer', keywords: ['ux', 'ui', 'product design', 'user experience', 'interaction'], insight: 'AI can draft interfaces in minutes. The real experience still depends on research, usability, accessibility, product strategy and someone responsible for how it works for actual users. That is where UX careers are moving.' },
    { id: 'sales', label: 'Sales & Customer Success', keywords: ['sales', 'account manager', 'business development', 'customer success', 'support'], insight: 'Outreach, follow-ups and first-line support are being automated. Trust, complex negotiation, understanding a client’s business and owning the relationship are what customers still pay people for.' },
    { id: 'teaching', label: 'Teacher & Trainer', keywords: ['teacher', 'teach', 'tutor', 'trainer', 'education', 'lecturer'], insight: 'AI can explain almost anything on demand. Teaching shifts toward motivation, assessment, mentoring and designing learning that works — and many educators are turning their knowledge into courses and digital products.' },
    { id: 'logistics', label: 'Logistics & Operations', keywords: ['logistic', 'operations', 'supply chain', 'warehouse', 'procurement'], insight: 'Planning, routing and reporting are increasingly done by software. Handling exceptions, coordinating people and suppliers, and responsibility for what actually arrives on time remain the valuable part of the role.' },
  ],
};

/** The insight for a job title or search, if one of the professions matches. */
export function matchProfession(text: string | null | undefined, insights: ProfessionInsight[]): ProfessionInsight | null {
  const t = (text ?? '').toLowerCase();
  if (!t.trim()) return null;
  return insights.find((p) => p.keywords.some((k) => t.includes(k.toLowerCase()))) ?? null;
}
