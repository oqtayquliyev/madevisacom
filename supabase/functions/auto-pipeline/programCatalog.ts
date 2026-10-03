// The social content program — what MadeVisa posts, and why.
//
// One file, no imports: the auto-pipeline (Deno) plans and writes posts from
// it, and the admin panel (src/pages/admin/social/*) shows the same list as
// "Content ideas". Add a format here + a builder in programFormats.ts and it
// appears everywhere.
//
// The strategy in one paragraph: vacancies alone make a feed people mute.
// So every network gets a mix of seven pillars — fresh jobs, market numbers,
// visa knowledge, "your application" (how well a CV matches a job, what is
// missing from it, and the sponsorship document), proof from real applicants,
// community posts and news — and never the same kind of post twice in a row. Every post links back to the page on
// madevisa.com that holds the full answer.

export type Platform = 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'telegram';
export const ALL_PLATFORMS: Platform[] = ['instagram', 'facebook', 'linkedin', 'tiktok', 'telegram'];

export type Pillar = 'jobs' | 'market' | 'visa' | 'plan' | 'proof' | 'community' | 'news';
export type DayPart = 'early' | 'morning' | 'lunch' | 'afternoon' | 'evening' | 'night';

export const PILLARS: Record<Pillar, { name: string; why: string; share: number; color: string }> = {
  jobs: { name: 'Fresh jobs', why: 'The reason people follow: roles that opened today, straight from career pages.', share: 26, color: '#2563EB' },
  market: { name: 'Who is hiring', why: 'Countries, companies and roles by the numbers — the posts people share.', share: 17, color: '#0891B2' },
  visa: { name: 'Visa know-how', why: 'Routes, salary rules and timelines with the official source — the posts people save.', share: 17, color: '#7C3AED' },
  plan: { name: 'Your application', why: 'What MadeVisa does for the applicant: how well a CV matches the job, what is missing from it, and the sponsorship document that goes with it.', share: 16, color: '#DB2777' },
  proof: { name: 'Real outcomes', why: 'What actually happened to applicants: replies, silence, interviews. Builds trust.', share: 8, color: '#059669' },
  community: { name: 'Community', why: 'Questions, tips, follow and comment prompts. Grows the account and starts conversations.', share: 10, color: '#D97706' },
  news: { name: 'News', why: 'New programs, rule changes and new articles — timely posts with a source.', share: 6, color: '#DC2626' },
};
export const PILLAR_ORDER: Pillar[] = ['jobs', 'market', 'visa', 'plan', 'proof', 'community', 'news'];

/** Local time windows, in minutes from midnight. */
export const DAY_PARTS: Record<DayPart, { from: number; to: number; label: string }> = {
  early: { from: 6 * 60 + 40, to: 8 * 60 + 20, label: 'Early morning' },
  morning: { from: 8 * 60 + 40, to: 10 * 60 + 50, label: 'Morning' },
  lunch: { from: 11 * 60 + 40, to: 13 * 60 + 30, label: 'Lunch' },
  afternoon: { from: 14 * 60 + 20, to: 16 * 60 + 40, label: 'Afternoon' },
  evening: { from: 17 * 60 + 30, to: 19 * 60 + 50, label: 'Evening' },
  night: { from: 20 * 60 + 20, to: 22 * 60 + 20, label: 'Late evening' },
};
export const DAY_PART_ORDER: DayPart[] = ['early', 'morning', 'lunch', 'afternoon', 'evening', 'night'];

/**
 * Starting rhythm per network (editable in the admin panel). `parts` is the
 * order of preference: each day the planner picks from the first few, a
 * different set than the day before, at a different minute.
 */
export const RHYTHM: Record<Platform, { perDay: number; weekend: number; max: number; parts: DayPart[]; note: string }> = {
  instagram: { perDay: 3, weekend: 2, max: 6, parts: ['lunch', 'evening', 'morning', 'night', 'afternoon', 'early'], note: 'Carousels and saves. Lunch and evenings do best.' },
  facebook: { perDay: 2, weekend: 2, max: 6, parts: ['morning', 'afternoon', 'evening', 'lunch', 'night', 'early'], note: 'Links are clickable. Mornings and after work.' },
  linkedin: { perDay: 2, weekend: 1, max: 4, parts: ['morning', 'lunch', 'afternoon', 'early', 'evening'], note: 'Working hours on weekdays, one post at weekends.' },
  tiktok: { perDay: 2, weekend: 2, max: 4, parts: ['evening', 'night', 'lunch', 'afternoon', 'morning'], note: 'Photo posts. Evenings and late.' },
  telegram: { perDay: 5, weekend: 3, max: 12, parts: ['morning', 'lunch', 'afternoon', 'evening', 'early', 'night'], note: 'A channel feed: more posts, spread through the day.' },
};

export type FormatDef = {
  key: string;
  pillar: Pillar;
  name: string;
  /** What the post is, in one or two sentences (shown in the admin panel). */
  idea: string;
  /** A sample opening line, so the idea is easy to picture. */
  example: string;
  /** Where the facts come from on MadeVisa. */
  source: string;
  /** The page the post sends people to. */
  link: string;
  /** What gets drawn. */
  visual: string;
  platforms: Platform[];
  /** Times of day it suits best. */
  parts: DayPart[];
  /** Relative frequency inside its pillar. */
  weight: number;
  /** Minimum hours before the same format returns on one network. */
  cooldown: number;
  /** Weekdays it may run (0 = Sunday). Missing = any day. */
  days?: number[];
  /** Fresh formats are written about 2 hours before they go out (jobs must be new); the rest a day ahead. */
  fresh?: boolean;
  /** A Reel: a short vertical video (text over city footage), rendered by scripts/render-reels.mjs. */
  video?: boolean;
  /** Off until switched on in the admin panel. */
  off?: boolean;
  /** Something the admin should know before turning it on. */
  needs?: string;
};

const FEED: Platform[] = ['instagram', 'facebook', 'linkedin', 'tiktok', 'telegram'];
const VISUAL: Platform[] = ['instagram', 'facebook', 'linkedin', 'tiktok'];
const PRO: Platform[] = ['linkedin', 'facebook'];

export const FORMATS: FormatDef[] = [
  // --- Fresh jobs -----------------------------------------------------------
  {
    key: 'jobs_fresh', pillar: 'jobs', name: 'New today',
    idea: 'Three to five roles that went live in the last 24 hours, one per company, each with its own link.',
    example: 'Four roles that opened this morning. No reposts.',
    source: 'Jobs published on MadeVisa in the last 24 hours', link: '/jobs', visual: 'Job list or job cards (alternates)',
    platforms: FEED, parts: ['early', 'morning', 'lunch'], weight: 3, cooldown: 5, fresh: true,
  },
  {
    key: 'jobs_country', pillar: 'jobs', name: 'New roles in one country',
    idea: 'Fresh roles from a single country, a different country each time. The country comes from where most new jobs were posted.',
    example: 'Germany, today: 4 new roles worth a look.',
    source: 'Fresh jobs filtered by country', link: '/jobs?country=…', visual: 'Job cards with the country in the headline',
    platforms: FEED, parts: ['morning', 'lunch', 'afternoon'], weight: 3, cooldown: 8, fresh: true,
  },
  {
    key: 'jobs_visa', pillar: 'jobs', name: 'Sponsorship stated in the ad',
    idea: 'Only roles whose ad says visa sponsorship is available — the posts job seekers abroad look for first.',
    example: 'These ads say it in writing: visa sponsorship available.',
    source: 'Jobs where the ad offers visa sponsorship', link: '/jobs?visa=1', visual: 'Job list',
    platforms: FEED, parts: ['morning', 'lunch', 'evening'], weight: 3, cooldown: 10, fresh: true,
  },
  {
    key: 'jobs_remote', pillar: 'jobs', name: 'Remote and hybrid',
    idea: 'Remote-friendly roles, framed as a first step before a move.',
    example: 'Work for a company abroad before you move there.',
    source: 'Jobs marked remote or hybrid', link: '/jobs?remote=1', visual: 'Job cards',
    platforms: FEED, parts: ['lunch', 'evening', 'night'], weight: 2, cooldown: 12, fresh: true,
  },
  {
    key: 'jobs_student', pillar: 'jobs', name: 'Internships and first jobs',
    idea: 'Student, graduate and internship roles from the last day.',
    example: 'First job or internship? These opened today.',
    source: 'Internship, graduate and junior roles', link: '/jobs?students=1', visual: 'Job list',
    platforms: FEED, parts: ['afternoon', 'evening', 'night'], weight: 2, cooldown: 14, fresh: true,
  },
  {
    key: 'jobs_uk_sponsors', pillar: 'jobs', name: 'UK employers with a sponsor licence',
    idea: 'UK roles at companies on the Home Office register of licensed sponsors — checked against today’s register.',
    example: 'Hiring in the UK, and already licensed to sponsor.',
    source: 'UK Home Office register, matched to companies on MadeVisa', link: '/jobs?country=United Kingdom', visual: 'Job list',
    platforms: FEED, parts: ['morning', 'lunch'], weight: 2, cooldown: 20, fresh: true,
  },
  {
    key: 'jobs_salary', pillar: 'jobs', name: 'Salary in the ad',
    idea: 'Only roles that show the pay. People stop scrolling for a number.',
    example: 'Roles that tell you the salary before you apply.',
    source: 'Jobs with a disclosed salary', link: '/jobs?salary=1', visual: 'Job cards with the salary on the right',
    platforms: FEED, parts: ['lunch', 'afternoon', 'evening'], weight: 2, cooldown: 12, fresh: true,
  },
  {
    key: 'job_spotlight', pillar: 'jobs', name: 'Role of the day',
    idea: 'One role, one company. The image shows only the company; the caption explains the role in a few lines.',
    example: 'One role today, and why it caught our eye.',
    source: 'The newest role with a salary and a logo', link: 'The job page', visual: 'Company image',
    platforms: FEED, parts: ['morning', 'evening'], weight: 1.5, cooldown: 18, fresh: true,
  },

  // --- Who is hiring ----------------------------------------------------------
  {
    key: 'country_hiring', pillar: 'market', name: '“X is hiring”',
    idea: 'One country as the headline: open roles, new this week, how many ads mention sponsorship, top cities and roles. A different country each time.',
    example: 'The Netherlands is hiring: 1,240 open roles, 310 new this week.',
    source: 'Live job-market numbers by country', link: '/destinations/<country>', visual: 'Country photo or flag, big number, 3 facts (carousel)',
    platforms: FEED, parts: ['morning', 'lunch', 'evening'], weight: 3, cooldown: 20,
  },
  {
    key: 'country_ranking', pillar: 'market', name: 'Where the jobs are this week',
    idea: 'Top five countries by new roles in the last seven days.',
    example: 'Where companies posted the most jobs this week.',
    source: 'Live job-market numbers', link: '/job-market', visual: 'Ranked bars with flags',
    platforms: FEED, parts: ['morning', 'lunch'], weight: 2, cooldown: 150,
  },
  {
    key: 'sponsor_ranking', pillar: 'market', name: 'Where ads mention sponsorship most',
    idea: 'Countries ranked by the share of job ads that state visa sponsorship.',
    example: 'In which country do job ads mention visa sponsorship most often?',
    source: 'Live job-market numbers (countries with enough ads)', link: '/destinations', visual: 'Ranked bars with flags',
    platforms: FEED, parts: ['lunch', 'evening'], weight: 2, cooldown: 150,
  },
  {
    key: 'top_companies', pillar: 'market', name: 'Who hired most this week',
    idea: 'The five companies that added the most roles in seven days, with logos.',
    example: 'Five companies that opened the most roles this week.',
    source: 'Live job-market numbers', link: '/companies', visual: 'Ranked list with logos',
    platforms: FEED, parts: ['morning', 'afternoon'], weight: 2, cooldown: 150,
  },
  {
    key: 'roles_in_demand', pillar: 'market', name: 'Roles in demand',
    idea: 'Which job functions have the most open roles right now.',
    example: 'What companies are hiring for most right now.',
    source: 'Live job-market numbers', link: '/job-market', visual: 'Ranked bars',
    platforms: FEED, parts: ['lunch', 'afternoon'], weight: 1.5, cooldown: 150,
  },
  {
    key: 'market_pulse', pillar: 'market', name: 'The week in numbers',
    idea: 'A weekly recap: new roles, companies hiring, countries, share that is remote. Runs at the end and the start of the week.',
    example: 'This week on MadeVisa, in four numbers.',
    source: 'Live job-market numbers', link: '/job-market', visual: 'Four-number grid',
    platforms: FEED, parts: ['morning', 'evening'], weight: 2, cooldown: 60, days: [0, 1, 5],
  },
  {
    key: 'remote_share', pillar: 'market', name: 'How much is really remote',
    idea: 'Of the ads that say where you work: the split between on-site, hybrid and fully remote.',
    example: 'How many jobs are actually remote? We counted.',
    source: 'Live job-market numbers', link: '/jobs?remote=1', visual: 'One big number',
    platforms: FEED, parts: ['lunch', 'evening', 'night'], weight: 1, cooldown: 144,
  },
  {
    key: 'milestone', pillar: 'market', name: 'How big the board is',
    idea: 'Live jobs, companies and countries on MadeVisa today — a plain progress post.',
    example: 'Live right now: 18,400 jobs from 620 companies.',
    source: 'Site statistics', link: '/jobs', visual: 'One big number',
    platforms: FEED, parts: ['morning', 'afternoon'], weight: 0.6, cooldown: 240,
  },

  // --- Visa know-how ------------------------------------------------------------
  {
    key: 'visa_route', pillar: 'visa', name: 'Visa route spotlight',
    idea: 'One visa route explained: who it is for, how long it lasts, the fee, what it asks for, whether it leads to residence. Links to the official source.',
    example: 'Germany’s Opportunity Card: move first, find the job after.',
    source: 'Visa guides (21 countries, 70+ routes)', link: '/destinations/<country>', visual: 'Cover + fact card (carousel)',
    platforms: FEED, parts: ['lunch', 'evening', 'night'], weight: 3, cooldown: 20,
  },
  {
    key: 'visa_jobsearch', pillar: 'visa', name: 'No job offer needed',
    idea: 'Countries with a job-search visa: you can move first and look for work there.',
    example: 'Countries that let you move before you have a job.',
    source: 'Visa guides — job-search routes', link: '/destinations', visual: 'List with flags',
    platforms: FEED, parts: ['evening', 'night'], weight: 1.5, cooldown: 168,
  },
  {
    key: 'visa_nomad', pillar: 'visa', name: 'Remote-work visas',
    idea: 'Countries with a visa for people who work remotely for a company elsewhere.',
    example: 'Keep your job, change your country.',
    source: 'Visa guides — remote-work routes', link: '/destinations', visual: 'List with flags',
    platforms: FEED, parts: ['evening', 'night', 'lunch'], weight: 1.5, cooldown: 168,
  },
  {
    key: 'visa_pr', pillar: 'visa', name: 'Years to permanent residence',
    idea: 'Countries ranked by how many years until you can stay for good.',
    example: 'How long until you can stay permanently?',
    source: 'Visa guides', link: '/destinations', visual: 'Ranked list with flags',
    platforms: FEED, parts: ['evening', 'night'], weight: 1.5, cooldown: 168,
  },
  {
    key: 'visa_salary', pillar: 'visa', name: 'The salary a visa needs',
    idea: 'The minimum yearly pay for the main skilled-work route in one country, with the lower tiers and the official source.',
    example: 'The salary you need for a UK Skilled Worker visa.',
    source: 'Visa salary thresholds (checked against official sources)', link: '/destinations/<country>', visual: 'One big number',
    platforms: FEED, parts: ['lunch', 'evening'], weight: 2, cooldown: 96,
  },
  {
    key: 'visa_compare', pillar: 'visa', name: 'Country vs country',
    idea: 'Two countries side by side: years to residence, years to citizenship, dual citizenship, language.',
    example: 'Germany or the Netherlands? The four facts that matter.',
    source: 'Visa guides', link: '/destinations', visual: 'Two flags, fact rows',
    platforms: FEED, parts: ['evening', 'night', 'lunch'], weight: 2, cooldown: 72,
  },
  {
    key: 'visa_myth', pillar: 'visa', name: 'Myth vs fact',
    idea: 'A common belief about working abroad, corrected with a fact from the visa guides.',
    example: 'Myth: you need a job offer before you can move.',
    source: 'Visa guides', link: '/destinations', visual: 'Myth / fact card',
    platforms: FEED, parts: ['lunch', 'evening', 'night'], weight: 2, cooldown: 60,
  },
  {
    key: 'visa_checklist', pillar: 'visa', name: 'Documents checklist',
    idea: 'The documents almost every long-stay visa asks for. Built to be saved.',
    example: 'Save this before you start any visa application.',
    source: 'Visa guides — common documents', link: '/destinations/<country>', visual: 'Checklist card',
    platforms: FEED, parts: ['evening', 'night'], weight: 1, cooldown: 240,
  },

  // --- Your application: CV match first, then the sponsorship document -----------
  {
    key: 'match_check', pillar: 'plan', name: 'How well does your CV match?',
    idea: 'The new button next to Apply: one press compares your CV with the ad and gives a score. The score is free on every job.',
    example: 'Before you apply: how well does your CV actually match this ad?',
    source: 'CV match', link: '/cv-match', visual: 'Photo with one line, then a card',
    platforms: FEED, parts: ['lunch', 'evening', 'night'], weight: 3, cooldown: 40,
  },
  {
    key: 'match_parts', pillar: 'plan', name: 'Where the score comes from',
    idea: 'The six things the match looks at and what each is worth: skills 40, role 20, experience 15, wording 10, languages 8, education 7.',
    example: 'What a recruiter’s search sees in your CV, in six parts.',
    source: 'CV match — how the score works', link: '/cv-match', visual: 'Numbered steps (carousel)',
    platforms: FEED, parts: ['evening', 'night', 'lunch'], weight: 2, cooldown: 120,
  },
  {
    key: 'match_missing', pillar: 'plan', name: 'The skill your CV forgot',
    idea: 'Why a skill you have but didn’t write down counts as missing — for the match score and for a recruiter’s search. Free accounts see their missing skills on 3 jobs a day.',
    example: 'You know Excel. Your CV doesn’t say so. To a recruiter’s search, you don’t.',
    source: 'CV match — missing skills', link: '/cv-match', visual: 'Big statement',
    platforms: FEED, parts: ['morning', 'lunch', 'evening'], weight: 2.5, cooldown: 60,
  },
  {
    key: 'cv_fix', pillar: 'plan', name: 'CV fix of the day',
    idea: 'One concrete thing the CV check looks for — dates on every role, numbers, a skills section, the ad’s own words, a language level — and how to fix it. A different one each time.',
    example: 'No dates on your roles? Nobody can count your experience.',
    source: 'CV match — checks on the CV itself', link: '/cv-match', visual: 'Tip card',
    platforms: FEED, parts: ['morning', 'evening', 'night'], weight: 2.5, cooldown: 30,
  },
  {
    key: 'match_free', pillar: 'plan', name: 'What’s free, what’s Pro',
    idea: 'Plainly: the score is free on every job; missing skills on 3 jobs a day with a free account; the full report and 50 sponsorship documents a month in Pro.',
    example: 'What you get without paying, and what the plan adds.',
    source: 'Pricing', link: '/pricing', visual: 'Fact card',
    platforms: FEED, parts: ['lunch', 'evening'], weight: 1, cooldown: 240,
  },
  {
    key: 'plan_flip', pillar: 'plan', name: 'You make the offer',
    idea: 'The core idea in one line: don’t wait for a company to offer sponsorship — hand them a plan that makes it easy to say yes.',
    example: 'Stop asking “do you sponsor visas?”. Send the plan instead.',
    source: 'Visa Plan', link: '/offers', visual: 'Big statement',
    platforms: FEED, parts: ['lunch', 'evening', 'night'], weight: 1.5, cooldown: 72,
  },
  {
    key: 'plan_steps', pillar: 'plan', name: 'How a Visa Plan works',
    idea: 'Three steps: check your match on the job, choose which costs you’ll share, attach the one-page plan to your application. Part of MadeVisa Pro.',
    example: 'A cover letter for the visa. Here’s how it works.',
    source: 'Visa Plan', link: '/offers', visual: 'Numbered steps (carousel)',
    platforms: FEED, parts: ['evening', 'night', 'lunch'], weight: 1, cooldown: 168,
  },
  {
    key: 'plan_employer', pillar: 'plan', name: 'What the employer has to do',
    idea: 'For one country and route: the employer’s actual steps and effort. Most people — and most employers — think it is harder than it is.',
    example: 'What a German employer has to do to hire you: two steps.',
    source: 'Visa guides — the employer’s side of each route', link: '/offers', visual: 'Numbered steps',
    platforms: FEED, parts: ['morning', 'lunch', 'evening'], weight: 1.5, cooldown: 72,
  },
  {
    key: 'plan_costs', pillar: 'plan', name: 'Who pays what',
    idea: 'Which visa costs a candidate may offer to cover, and which the law puts on the employer.',
    example: 'Which visa costs can you offer to pay yourself?',
    source: 'Visa guides — costs per route', link: '/offers', visual: 'Fact card',
    platforms: FEED, parts: ['lunch', 'evening'], weight: 1, cooldown: 168,
  },
  {
    key: 'jobs_plan', pillar: 'plan', name: 'No visa line in the ad',
    idea: 'Real roles whose ad doesn’t mention visas: check your match first, then the sponsorship document is the missing piece of the application.',
    example: 'The ad doesn’t mention a visa. That isn’t a no.',
    source: 'Fresh jobs with no visa statement', link: '/jobs', visual: 'Company image',
    platforms: FEED, parts: ['morning', 'lunch', 'evening'], weight: 1.5, cooldown: 36, fresh: true,
  },

  // --- Real outcomes -----------------------------------------------------------------
  {
    key: 'feedback_stats', pillar: 'proof', name: 'What happened to applications',
    idea: 'Outcomes people tracked on MadeVisa: how many heard nothing, got a reply, an interview, an offer. Only posts once there are enough reports.',
    example: 'We asked what happened after people applied.',
    source: 'Hiring Feedback (tracked applications + shared experiences)', link: '/feedback', visual: 'Four-number grid',
    platforms: FEED, parts: ['lunch', 'evening'], weight: 2, cooldown: 120,
  },
  {
    key: 'responsive_companies', pillar: 'proof', name: 'Companies that reply',
    idea: 'Companies where most applicants heard back. Listed only when at least three different people reported.',
    example: 'Companies that actually answer applications.',
    source: 'Company Scores', link: '/companies', visual: 'Ranked list with logos',
    platforms: FEED, parts: ['morning', 'lunch'], weight: 2, cooldown: 144,
  },
  {
    key: 'ghosting_stat', pillar: 'proof', name: 'The silence number',
    idea: 'One number: the share of tracked applications that never got an answer.',
    example: 'How often does an application get no answer at all?',
    source: 'Hiring Feedback', link: '/companies', visual: 'One big number',
    platforms: FEED, parts: ['evening', 'night'], weight: 1.5, cooldown: 168,
  },
  {
    key: 'principle', pillar: 'proof', name: 'How we keep it honest',
    idea: 'One rule MadeVisa follows: real posting dates, closed means closed, jobs from the source, scores from outcomes.',
    example: 'A job posted two weeks ago says two weeks ago.',
    source: 'How it works', link: '/how-it-works', visual: 'Big statement',
    platforms: FEED, parts: ['afternoon', 'evening'], weight: 1.5, cooldown: 96,
  },

  // --- Community ------------------------------------------------------------------------
  {
    key: 'follow_cta', pillar: 'community', name: 'Follow for …',
    idea: 'A short reason to follow, a different one each time: sponsored jobs, remote roles, a country, students.',
    example: 'Follow for jobs in Germany that mention visa sponsorship.',
    source: 'The busiest countries and categories this week', link: 'Profile', visual: 'Call-to-action card',
    platforms: VISUAL, parts: ['evening', 'night', 'lunch'], weight: 1.5, cooldown: 96,
  },
  {
    key: 'comment_cta', pillar: 'community', name: 'Comment “+” to get the list',
    idea: 'People comment a word and get the link to a filtered job list in reply. Comments lift reach on Instagram and TikTok.',
    example: 'Comment “+” and we’ll send you today’s remote roles in Europe.',
    source: 'A filtered jobs page', link: '/jobs?…', visual: 'Call-to-action card',
    platforms: ['instagram', 'tiktok'], parts: ['evening', 'night'], weight: 1.5, cooldown: 120,
    needs: 'Everyone who comments expects the link. Instagram replies are sent automatically when your token has the comments permission; otherwise answer by hand.',
  },
  {
    key: 'this_or_that', pillar: 'community', name: 'This or that',
    idea: 'Two countries, one question. An easy comment, with the real difference in the caption.',
    example: 'Ireland or the Netherlands — where would you go?',
    source: 'Visa guides + live numbers', link: '/destinations', visual: 'Two flags',
    platforms: VISUAL, parts: ['evening', 'night'], weight: 2, cooldown: 96,
  },
  {
    key: 'question', pillar: 'community', name: 'A question',
    idea: 'An open question about applying abroad. Answers tell you what to post next.',
    example: 'What’s the hardest part of applying abroad?',
    source: 'A rotating list of questions', link: '—', visual: 'Big statement',
    platforms: FEED, parts: ['evening', 'night', 'lunch'], weight: 1.5, cooldown: 96,
  },
  {
    key: 'tip', pillar: 'community', name: 'Job-search tip',
    idea: 'One practical tip, each tied to something the site does: real posting dates, reply rates, salary thresholds.',
    example: 'Check when the job was really posted before you apply.',
    source: 'A rotating list of tips', link: 'The matching page', visual: 'Big statement',
    platforms: FEED, parts: ['morning', 'lunch', 'evening'], weight: 2.5, cooldown: 48,
  },
  {
    key: 'feedback_ask', pillar: 'community', name: 'How did it go?',
    idea: 'Ask people to share how their last application went. Feeds the Company Scores.',
    example: 'How did your last application go? It takes 20 seconds.',
    source: 'Hiring Feedback', link: '/feedback', visual: 'Call-to-action card',
    platforms: FEED, parts: ['evening', 'night'], weight: 1.5, cooldown: 168,
  },
  {
    key: 'job_alert', pillar: 'community', name: 'Free job alert',
    idea: 'The free job alert: new jobs for one country in your inbox once a day. One alert is free, one click to unsubscribe.',
    example: 'New jobs in Germany, in your inbox. Once a day, free.',
    source: 'Job alerts, and the busiest countries this week', link: '/jobs?country=…', visual: 'Call-to-action card',
    platforms: FEED, parts: ['evening', 'lunch', 'morning'], weight: 1.2, cooldown: 120, off: true,
    needs: 'Off until you switch it on: it promises an email, so first set up job-alert emails (Resend key, migration 20261122090000). On Resend’s free plan at most 90 alert emails go out a day.',
  },
  {
    key: 'invite', pillar: 'community', name: 'Invite a friend',
    idea: 'The invite link: you get 2 extra Visa Plans when someone you invited starts MadeVisa Pro.',
    example: 'Know someone job hunting abroad? Send them your link.',
    source: 'Invite rewards', link: '/profile', visual: 'Call-to-action card',
    platforms: FEED, parts: ['evening', 'night'], weight: 0.7, cooldown: 336,
  },
  {
    key: 'recruiters', pillar: 'community', name: 'For recruiters',
    idea: 'An invitation to hiring managers and recruiters who hire across borders to list themselves.',
    example: 'Hiring across borders? Be found by people who can move.',
    source: 'Recruiters directory', link: '/network', visual: 'Call-to-action card',
    platforms: PRO, parts: ['morning', 'lunch'], weight: 1, cooldown: 240, days: [1, 2, 3, 4],
  },
  {
    key: 'employer_inbox', pillar: 'community', name: 'Employer inbox',
    idea: 'For recruiters: sign in with a work email and see every Visa Plan candidates sent to your company. Free.',
    example: 'Hiring internationally? Candidates may already have sent your company a Visa Plan.',
    source: 'Employer inbox', link: '/employers/inbox', visual: 'Call-to-action card',
    platforms: PRO, parts: ['morning', 'lunch'], weight: 1, cooldown: 240, days: [1, 2, 3, 4],
    needs: 'Needs the employer inbox (migration 20261121090000_employer_inbox.sql).',
  },
  {
    key: 'employers', pillar: 'community', name: 'For employers',
    idea: 'If a company has a careers page, its roles can appear on MadeVisa automatically, free.',
    example: 'Your careers page is enough. No integration, no cost.',
    source: 'How it works — for employers', link: '/how-it-works', visual: 'Numbered steps',
    platforms: PRO, parts: ['morning', 'lunch'], weight: 1, cooldown: 240, days: [1, 2, 3, 4],
  },

  // --- News ------------------------------------------------------------------------------
  {
    key: 'news', pillar: 'news', name: 'News from the news desk',
    idea: 'A program, rule change or deadline you add in the News desk — “X announced Y”. Always posted with its source.',
    example: 'Portugal opens applications for its new job-seeker visa.',
    source: 'News desk (you add the item and the source)', link: 'The source or a MadeVisa page', visual: 'News card with the country',
    platforms: FEED, parts: ['morning', 'lunch', 'afternoon'], weight: 3, cooldown: 6,
  },
  {
    key: 'article', pillar: 'news', name: 'New on the blog',
    idea: 'A new article: weekly hiring reports, visa guides, career guides.',
    example: 'New report: who’s hiring in Germany this week.',
    source: 'Blog articles published in the last 10 days', link: '/blog/<article>', visual: 'Article cover',
    platforms: FEED, parts: ['morning', 'lunch', 'evening'], weight: 2, cooldown: 20,
  },
  {
    key: 'program', pillar: 'news', name: 'Program spotlight',
    idea: 'An official program listed on MadeVisa: who runs it, who it is for, funding, the application window.',
    example: 'Applications are open: a fully funded program in Finland.',
    source: 'Programs from official sources', link: '/programs/<program>', visual: 'News card with the country',
    platforms: FEED, parts: ['morning', 'afternoon', 'evening'], weight: 2, cooldown: 24,
  },
];

// --- Reels --------------------------------------------------------------------
// The same facts as the image posts, as a 12–16 second vertical video: city or
// country footage, big text boxes that appear one by one, the link at the end.
// Reels are what Instagram shows to people who don't follow the account yet.
const REEL_ON: Platform[] = ['instagram', 'facebook', 'tiktok', 'telegram'];
const REEL_NEEDS = 'Needs the reel renderer (the “Render reels” GitHub Action). Until it has run, reels stay off.';
FORMATS.push(
  {
    key: 'reel_country', pillar: 'market', name: 'Reel: “X is hiring”', video: true,
    idea: 'Footage of the country, then “Germany is hiring”, three numbers that appear one by one, and where to find the roles.',
    example: 'Germany is hiring. 5,200 open roles right now.',
    source: 'Live job-market numbers by country', link: '/destinations/<country>', visual: 'Reel, about 12 seconds',
    platforms: REEL_ON, parts: ['lunch', 'evening', 'night'], weight: 3, cooldown: 40, needs: REEL_NEEDS,
  },
  {
    key: 'reel_city', pillar: 'jobs', name: 'Reel: jobs in one city', video: true, fresh: true,
    idea: 'Footage of a city, then three roles that opened there today, with the links in the caption.',
    example: 'Berlin is hiring. 3 roles posted in the last 24 hours.',
    source: 'Fresh jobs, grouped by city', link: '/jobs?country=…', visual: 'Reel, about 12 seconds',
    platforms: REEL_ON, parts: ['morning', 'lunch', 'evening'], weight: 3, cooldown: 20, needs: REEL_NEEDS,
  },
  {
    key: 'reel_route', pillar: 'visa', name: 'Reel: a visa route in 15 seconds', video: true,
    idea: 'One visa route: its name over footage of the country, then what it asks for, line by line, and the official source.',
    example: 'Opportunity Card, Germany. Move first, find the job after.',
    source: 'Visa guides', link: '/destinations/<country>', visual: 'Reel, about 15 seconds',
    platforms: REEL_ON, parts: ['evening', 'night', 'lunch'], weight: 3, cooldown: 40, needs: REEL_NEEDS,
  },
  {
    key: 'reel_myth', pillar: 'visa', name: 'Reel: myth, then fact', video: true,
    idea: 'A common belief on screen, then the fact that corrects it. Short, and made to be shared.',
    example: 'Myth: you need a job offer before you can move.',
    source: 'Visa guides', link: '/destinations', visual: 'Reel, about 14 seconds',
    platforms: REEL_ON, parts: ['evening', 'night'], weight: 2, cooldown: 60, needs: REEL_NEEDS,
  },
  {
    key: 'reel_plan', pillar: 'plan', name: 'Reel: you make the offer', video: true,
    idea: 'The Visa Plan idea as a reel: the hook, the three steps, “see how it works”.',
    example: 'No visa line in the ad is not a no.',
    source: 'Visa Plan', link: '/offers', visual: 'Reel, about 15 seconds',
    platforms: REEL_ON, parts: ['lunch', 'evening', 'night'], weight: 1.5, cooldown: 96, needs: REEL_NEEDS,
  },
  {
    key: 'reel_match', pillar: 'plan', name: 'Reel: check your match', video: true,
    idea: 'Footage of people at work, then the question (“Does your CV match the job?”), the three things you get, and where to try it.',
    example: 'Does your CV say what the ad asks for?',
    source: 'CV match', link: '/cv-match', visual: 'Reel, about 14 seconds',
    platforms: REEL_ON, parts: ['lunch', 'evening', 'night'], weight: 3, cooldown: 48, needs: REEL_NEEDS,
  },
  {
    key: 'reel_cvfix', pillar: 'plan', name: 'Reel: one CV fix', video: true,
    idea: 'One CV mistake and its fix in three screens, over footage of someone working on a laptop.',
    example: 'Your CV has no numbers. Here’s the fix.',
    source: 'CV match — checks on the CV itself', link: '/cv-match', visual: 'Reel, about 13 seconds',
    platforms: REEL_ON, parts: ['morning', 'evening', 'night'], weight: 2.5, cooldown: 40, needs: REEL_NEEDS,
  },
  {
    key: 'reel_news', pillar: 'news', name: 'Reel: news', video: true,
    idea: 'A News desk item as a reel: the headline over footage of the country, the key facts, the source.',
    example: 'Portugal opens applications for its job-seeker visa.',
    source: 'News desk (you add the item and the source)', link: 'The source or a MadeVisa page', visual: 'Reel, about 13 seconds',
    platforms: REEL_ON, parts: ['morning', 'lunch', 'evening'], weight: 3, cooldown: 6, needs: REEL_NEEDS,
  }
);

export const FORMAT_BY_KEY: Record<string, FormatDef> = Object.fromEntries(FORMATS.map((f) => [f.key, f]));

/** Formats that pick live jobs (and so reserve them). */
export const JOB_FORMATS = new Set(FORMATS.filter((f) => f.fresh).map((f) => f.key));

/** Program settings, as stored in social_program. */
export type ProgramSettings = {
  timezone: string;
  /** false = every post waits for approval. */
  autopilot: boolean;
  /** Posts per day, per network; missing = the default rhythm. */
  per_day: Partial<Record<Platform, number>>;
  /** format key → false to switch it off / true to switch on a format that is off by default. */
  formats: Record<string, boolean>;
  /** pillar → share (0–100); missing = default. */
  mix: Partial<Record<Pillar, number>>;
  /** "@madevisa" etc., used in follow posts. */
  handles: Partial<Record<Platform, string>>;
  /** ISO codes to feature more often (empty = follow the data). */
  focus: string[];
  /** The reel renderer has reported in lately — reel formats are only planned when it has. */
  reels?: boolean;
  /** Minutes two networks stay apart (default 30). */
  gap?: number;
  /** 'photo' = a real photo opens every post, the card follows; 'graphic' = cards only. */
  look?: 'photo' | 'graphic';
  /** A real person on the team whose name signs the captions ("— Leyla, MadeVisa"). Empty = no signature. */
  host?: string;
};

/** Minutes between two networks' posts unless set otherwise. */
export const DEFAULT_GAP = 30;

export const DEFAULT_SETTINGS: ProgramSettings = { timezone: 'UTC', autopilot: true, per_day: {}, formats: {}, mix: {}, handles: {}, focus: [] };

export const isFormatOn = (f: FormatDef, s: Pick<ProgramSettings, 'formats' | 'reels'>) => (f.video && !s.reels ? false : f.key in (s.formats ?? {}) ? Boolean(s.formats[f.key]) : !f.off);
export const perDayFor = (p: Platform, s: Pick<ProgramSettings, 'per_day'>, weekend: boolean) => {
  const base = Math.max(0, Math.min(RHYTHM[p].max, Math.round(Number(s.per_day?.[p] ?? RHYTHM[p].perDay))));
  if (!weekend) return base;
  // Weekends keep the same proportion as the default rhythm.
  return Math.min(base, Math.max(base ? 1 : 0, Math.round((base * RHYTHM[p].weekend) / RHYTHM[p].perDay)));
};
export const mixFor = (s: Pick<ProgramSettings, 'mix'>): Record<Pillar, number> =>
  Object.fromEntries(PILLAR_ORDER.map((k) => [k, Math.max(0, Number(s.mix?.[k] ?? PILLARS[k].share))])) as Record<Pillar, number>;

// --- Reels: from scenes to timed layers ---------------------------------------
// A reel is a few screens ("scenes"). A scene with several steps reveals its
// lines or rows one by one: each step is the same picture with one more part
// visible. The renderer fades every layer in and lets the last step of a scene
// fade out.
export type ReelScene = { url: string; steps: number; step: number; hold: number };
export type ReelLayer = { url: string; at: number; end: number; last: boolean };
export type ReelRecipe = {
  v: 1;
  bg: { queries: string[]; cc: string | null; photo: string | null; credit: string | null; fallback: string; salt: number; /** Clips from the media library, tried before a live stock search. */ clips?: { id: number; url: string; credit: string | null }[] };
  frame: string;
  scenes: ReelScene[];
  layers: ReelLayer[];
  duration: number;
  cover_at: number;
  /** The status the post gets once rendered. */
  after: 'approved' | 'awaiting_approval';
};

export function reelLayers(scenes: ReelScene[]): { layers: ReelLayer[]; duration: number; cover_at: number } {
  const layers: ReelLayer[] = [];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let t = 0.25;
  let coverAt = 2.4;
  scenes.forEach((s, si) => {
    const steps = Math.max(1, s.steps);
    const end = t + (steps - 1) * s.step + s.hold;
    for (let k = 1; k <= steps; k++) {
      const at = t + (k - 1) * s.step;
      const u = new URL(s.url);
      if (steps > 1) u.searchParams.set('n', String(k));
      layers.push({ url: u.toString(), at: r2(at), end: r2(k < steps ? at + s.step + 0.32 : end), last: k === steps });
    }
    // The cover is the opening screen with everything on it.
    if (si === 0) coverAt = r2(t + (steps - 1) * s.step + Math.min(1, s.hold / 2));
    t = end + 0.12;
  });
  return { layers, duration: r2(t + 0.3), cover_at: coverAt };
}
