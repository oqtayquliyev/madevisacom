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

/**
 * One insight per job-category group (the jobs page's Category list), used when the visitor's
 * category has no profession insight of its own above.
 */
export const GROUP_INSIGHTS: Record<string, string> = {
  'Software & IT': 'AI now writes and reviews a growing share of code. The work that keeps its value is system design, security, integration, debugging real systems and responsibility for what runs in production.',
  'Data & AI': 'Routine reporting and model building are increasingly automated. Framing the right question, judging data quality, explaining results to decision-makers and owning how models behave in the real world matter more each year.',
  'Product & Design': 'AI can draft screens, copy and visuals in minutes. Product judgment, user research, accessibility and responsibility for the experience people actually get are becoming the core of the job.',
  'Engineering': 'Simulation and design tools are getting AI assistants, but engineers still carry the safety decisions, the trade-offs on site and the sign-off. Combining domain depth with new tools is where careers grow.',
  'Science & Research': 'AI speeds up literature review, analysis and even experiment design. Asking original questions, designing sound studies and standing behind the conclusions stay human work.',
  'Healthcare & Medical': 'Documentation and diagnostic support are moving to AI. Clinical judgment, patient communication and responsibility for care remain with people, and demand for skilled staff keeps growing in many countries.',
  'Finance & Accounting': 'Bookkeeping, reconciliations and standard reports are being automated. Interpretation, regulatory judgment, advising decision-makers and accountability for the numbers are where the value moves.',
  'Sales & Business Development': 'Prospecting and follow-ups are increasingly automated. Trust, complex negotiation and understanding a client’s business are what close deals, and they are hard to automate.',
  'Customer Service & Support': 'First-line answers are moving to chatbots. Handling complex cases, calming difficult situations and turning feedback into product improvements are the roles that grow.',
  'Marketing & Communications': 'AI produces campaigns and content at scale, so output is no longer scarce. Positioning, customer insight, experiments and owning results decide who stands out.',
  'Human Resources': 'Screening and admin are increasingly automated. Judging people, building culture, handling sensitive cases and advising leaders keep HR professionals essential.',
  'Operations & Supply Chain': 'Planning, routing and forecasting are done more by software. Handling exceptions, coordinating people and suppliers, and responsibility for delivery stay with people.',
  'Manufacturing & Production': 'Automation and robotics keep spreading on the floor. People who can run, maintain and improve automated lines, and keep quality and safety under control, are in demand.',
  'Skilled Trades': 'Hands-on trades are among the hardest jobs to automate, and shortages are growing in many countries. New tools help with diagnostics and planning, while the craft stays human.',
  'Construction & Architecture': 'Design software and AI speed up drawings and estimates. Site judgment, coordination, safety and responsibility for what gets built remain the valuable part.',
  'Hospitality & Tourism': 'Booking and service tasks are increasingly digital, but guest experience, problem solving and personal service are what people pay for. International mobility in this field remains high.',
  'Education & Training': 'AI can explain almost anything on demand. Teaching shifts toward motivation, mentoring and assessment, and many educators turn their knowledge into courses and digital products.',
  'Legal': 'Research and document review are moving to AI. Legal judgment, negotiation, advising clients and responsibility for the advice stay with lawyers.',
  'Administration & Office': 'Scheduling, data entry and routine correspondence are among the most automated tasks. Coordinating people, managing priorities and running operations are where office roles move.',
  'Media & Creative': 'AI generates images, video and text quickly. Creative direction, taste, storytelling and working with clients are what keep creative careers valuable.',
  'Public Sector & Nonprofit': 'Digital services and automation are reaching public institutions. Policy judgment, working with communities and accountability for public outcomes remain human work.',
  'Security & Defence': 'Monitoring and threat detection are increasingly automated. Judgment under pressure, investigation and responsibility for decisions keep people at the centre.',
  'Consulting & Management': 'AI produces analysis and slides fast. Client trust, change management and responsibility for decisions are what organisations pay advisers and managers for.',
  'Energy & Environment': 'The energy transition is creating new roles faster than many fields. Technical skills in renewables, grids and sustainability, combined with project delivery, are in demand worldwide.',
  'Agriculture & Food': 'Sensors, data and automation are changing farms and food production. People who combine practical know-how with new technology and food-safety responsibility are needed.',
  'Aviation & Maritime': 'Systems get more automated, but safety-critical judgment, licences and responsibility keep skilled professionals in demand, often with strong international mobility.',
  'Beauty, Sports & Wellness': 'These are personal, hands-on services that AI cannot replace. Digital tools help with booking, marketing and building an independent client base.',
  'Transport & Driving': 'Automation is coming to logistics and driving step by step. Safety, handling the unexpected and skills with new vehicles and systems keep drivers and transport staff needed.',
  'Real Estate': 'Listings, valuations and paperwork are increasingly automated. Negotiation, local knowledge and trust with clients are what close deals.',
  'Retail': 'Self-checkout and online shopping change store work. Customer advice, visual merchandising, store management and omnichannel skills are where retail careers grow.',
};
