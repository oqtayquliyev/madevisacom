// "About" and "How it works" — MadeVisa's own story, in plain language.
// Pure data with no imports, so the server-rendered pages (api/seo.ts) and
// the React pages (src/pages/info/InfoPage.tsx) say exactly the same thing.
//
// Tone: what MadeVisa does for people and why it matters. Not how the
// machinery works — no platform names, no data-collection details.

export type InfoIcon = 'source' | 'score' | 'chart' | 'passport' | 'shield' | 'calendar' | 'scale' | 'lock' | 'gift' | 'user' | 'globe' | 'building' | 'landmark' | 'check' | 'search' | 'send' | 'track' | 'plane';

export type InfoBlock =
  | { kind: 'text'; heading: string; paragraphs: string[] }
  | { kind: 'cards'; heading: string; intro?: string; items: { title: string; text: string; icon: InfoIcon }[] }
  | { kind: 'steps'; heading: string; intro?: string; items: { title: string; text: string; icon: InfoIcon }[] }
  | { kind: 'audiences'; heading: string; intro?: string; items: { title: string; icon: InfoIcon; points: string[]; cta?: { label: string; href: string } }[] }
  | { kind: 'contrast'; heading: string; before: { title: string; points: string[] }; after: { title: string; points: string[] } };

export type InfoPageContent = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  heroTitle: string;
  heroSub: string;
  blocks: InfoBlock[];
  faq: { q: string; a: string }[];
  cta: { title: string; text: string; primary: { label: string; href: string }; secondary?: { label: string; href: string } };
};

export const infoPages: Record<'about' | 'how-it-works', InfoPageContent> = {
  about: {
    slug: 'about',
    title: 'What is MadeVisa? Jobs abroad, and a sponsorship agreement to get the visa',
    description:
      'MadeVisa brings live jobs from employers’ own career pages, shows which companies reply, and lets you attach a sponsorship agreement that shows the employer exactly how to sponsor your visa.',
    eyebrow: 'About MadeVisa',
    heroTitle: 'Find a job abroad. Get the visa sponsored.',
    heroSub:
      'MadeVisa brings live jobs straight from employers’ own career pages, shows what really happens after you apply, and gives you a sponsorship agreement to attach — so the employer sees exactly how to hire you from abroad.',
    blocks: [
      {
        kind: 'contrast',
        heading: 'Why MadeVisa exists',
        before: {
          title: 'Job search today',
          points: [
            'The same role reposted across a dozen boards, with the date refreshed to look new.',
            'Applications that vanish — no reply, no rejection, no way to know if anyone read them.',
            'For international applicants, “can they even hire me?” goes unanswered — and most employers assume sponsorship is too slow and costly to try.',
          ],
        },
        after: {
          title: 'With MadeVisa',
          points: [
            'Jobs from the employer’s own careers page, with the date they were really posted.',
            'How often each company replies, how fast, and whether the job matched the ad.',
            'A sponsorship agreement you attach to your application: the legal route, the employer’s few steps, and who pays what.',
          ],
        },
      },
      {
        kind: 'cards',
        heading: 'What MadeVisa does',
        intro: 'Six things, in one place, so every application is a better-informed one.',
        items: [
          { icon: 'check', title: 'CV match on every job', text: 'Upload your CV once. Every job shows how well it fits — a score that is always free — plus the skills the ad asks for that your CV doesn’t show, and what to change before you apply.' },
          { icon: 'send', title: 'Sponsorship agreements', text: 'When a job needs a visa, add a signed-ready agreement to your application: who pays each visa cost, the route and the employer’s few steps. 50 a month are part of MadeVisa Pro.' },
          { icon: 'source', title: 'Jobs from the source', text: 'Roles come from the employer’s own careers page — not reposts — so you see them early, with the real posting date. When a job closes there, it closes here.' },
          { icon: 'score', title: 'Company Scores', text: 'Reply rates, reply times and “was the job as described?” — built from outcomes applicants share, weighted so no single account can tilt a score.' },
          { icon: 'chart', title: 'Hiring insights', text: 'Who is hiring this week, where, for which roles, how much is remote and which companies offer visa sponsorship — updated through the day.' },
          { icon: 'passport', title: 'Visa routes by country', text: 'Work, talent, job-search and remote-work routes for 20+ countries: fees, validity, years to residence and citizenship, with the official source for each.' },
        ],
      },
      {
        kind: 'cards',
        heading: 'What we stand for',
        items: [
          { icon: 'calendar', title: 'Honest dates', text: 'A job posted two weeks ago says two weeks ago. We never refresh dates to make listings look new.' },
          { icon: 'scale', title: 'Outcomes over opinions', text: 'Scores come from what actually happened to applicants, not star ratings. The method is the same for every company — and sponsorship never changes it.' },
          { icon: 'lock', title: 'Your data stays yours', text: 'We never sell data and never pass your details to employers. Your email, phone and nationality are never shown publicly.' },
          { icon: 'gift', title: 'Free to search, fair to pay', text: 'Searching, tracking applications and visa guides are free. You pay only for a sponsorship agreement you approve — and no one should ever ask you to pay to apply or to be hired.' },
        ],
      },
      {
        kind: 'audiences',
        heading: 'Who MadeVisa is for',
        items: [
          {
            icon: 'user',
            title: 'Job seekers',
            points: ['Fresh roles from company career pages', 'Know which companies reply before you spend an evening on a cover letter', 'Track every application in one place'],
            cta: { label: 'Browse jobs', href: '/jobs' },
          },
          {
            icon: 'globe',
            title: 'International talent',
            points: ['Attach a sponsorship agreement to any application', 'See the routes open to your passport', 'Time to residence and citizenship, country by country'],
            cta: { label: 'Visas by country', href: '/destinations' },
          },
          {
            icon: 'building',
            title: 'Employers and recruiters',
            points: ['Your careers-page roles can appear at no cost', 'Claim your company page with verified team access', 'Candidates send sponsorship agreements that show exactly what hiring from abroad involves'],
            cta: { label: 'Post a job', href: '/submit-job' },
          },
          {
            icon: 'landmark',
            title: 'Institutions',
            points: ['Official programs and scholarships, linked to your own source', 'Reach people actively planning a move'],
            cta: { label: 'Contact us', href: '/contact' },
          },
        ],
      },
      {
        kind: 'text',
        heading: 'Where we’re going',
        paragraphs: [
          'Hiring is still a black box for the people on the other side of it. Every application tracked on MadeVisa makes the box a little more transparent — for the next person applying, and for employers who want to be known for treating candidates well.',
          'Next: programs and study opportunities from official sources, deeper hiring reports by country and industry, and more of the countries people most want to move to.',
        ],
      },
    ],
    faq: [
      { q: 'Is MadeVisa free?', a: 'Searching, saving and tracking applications, Company Scores and visa guides are free. A sponsorship agreement uses one credit; the first one is free, and credit packs are priced for your country. Pro includes 10 a month. Companies can pay to sponsor a listing; sponsored listings are always labelled and never change scores.' },
      { q: 'What is a sponsorship agreement?', a: 'A one-page proposal you attach to an application: the visa route, what the employer has to do, and who pays each visa-related cost. You review and approve it before paying, and after that it’s final. It becomes binding only when both you and the employer sign it.' },
      { q: 'Where do the jobs come from?', a: 'Mostly straight from employers’ own career pages, plus jobs companies post with us directly. Every listing links to the original posting, where you apply.' },
      { q: 'How fresh are the listings?', a: 'New roles arrive throughout the day, and jobs that close on the employer’s page are marked closed and then removed. Each listing shows when the employer posted it.' },
      { q: 'Is MadeVisa a recruiter or an immigration agency?', a: 'No. We don’t hire for the jobs shown and we don’t process visas. We help you find jobs and understand your options, then you apply with the employer or the official authority.' },
      { q: 'How is a Company Score calculated?', a: 'From outcomes applicants record on MadeVisa: whether they got a reply, how long it took, and whether the job matched the ad. Results are weighted so new or incomplete accounts can’t swing them, and shown as a range until there’s enough data.' },
    ],
    cta: {
      title: 'Start with the jobs that are really open.',
      text: 'Live roles from employers’ own career pages, with the insight to choose where to apply.',
      primary: { label: 'Explore jobs', href: '/jobs' },
      secondary: { label: 'Prepare a sponsorship agreement', href: '/offers' },
    },
  },

  'how-it-works': {
    slug: 'how-it-works',
    title: 'How MadeVisa works — from a company careers page to your next move',
    description:
      'How MadeVisa finds jobs at the source, checks every listing, shows who replies to applicants and maps visa routes — step by step, for job seekers and employers.',
    eyebrow: 'How it works',
    heroTitle: 'From a careers page to your next move.',
    heroSub:
      'Employers publish roles on their own careers pages first. MadeVisa brings them to you early, adds what the ad doesn’t tell you, and helps you follow through — including across borders.',
    blocks: [
      {
        kind: 'steps',
        heading: 'For job seekers, in eight steps',
        items: [
          { icon: 'source', title: 'We go to the source', text: 'MadeVisa follows the career pages of hundreds of employers — with more added every day — and brings new roles in as they appear, often before they reach the big job boards.' },
          { icon: 'check', title: 'Every listing is checked', text: 'Before a job appears we check that it is a real job ad and pull out the essentials: location, remote or on-site, salary, experience, visa sponsorship. What the ad doesn’t say shows as “not mentioned” — never guessed.' },
          { icon: 'search', title: 'Search by what matters to you', text: 'Filter by country, visa sponsorship, remote or hybrid, salary transparency, experience and category. Set your location once and the routes open to you are highlighted.' },
          { icon: 'check', title: 'Check your match', text: 'Press “Check your match” next to Apply. Your CV is compared with the ad: skills, role, years, languages and education. The score is free; with a free account you also see the missing skills on 3 jobs a day.' },
          { icon: 'lock', title: 'Add the sponsorship agreement', text: 'If the job needs a visa, the agreement is listed under “Your application” as the missing piece. Drag to decide who pays each visa cost, review and approve. Part of MadeVisa Pro; final once approved.' },
          { icon: 'send', title: 'Apply at the source — with the agreement attached', text: 'You apply on the employer’s own page and attach the PDF next to your CV, or paste its link in your cover letter. MadeVisa never stands between you and the employer, and never passes on your details.' },
          { icon: 'track', title: 'Track what happens', text: 'Mark when you applied and what happened next. Gentle check-ins ask at the right time. Your outcome, combined anonymously with others’, becomes the company’s reply rate.' },
          { icon: 'plane', title: 'Plan the move', text: 'For each country: the visa routes you may qualify for, fees, validity, years to permanent residence and citizenship — with the official source one click away.' },
        ],
      },
      {
        kind: 'cards',
        heading: 'How we keep it honest',
        items: [
          { icon: 'calendar', title: 'Real posting dates', text: 'Each job shows when the employer posted it. Nothing is re-dated to look new.' },
          { icon: 'check', title: 'Closed means closed', text: 'When a role disappears from the employer’s page, it is marked closed and then removed — so you don’t apply to ghosts.' },
          { icon: 'scale', title: 'Fair, weighted scores', text: 'Scores need several applicants before they show, appear as a range while data is early, and count verified accounts more.' },
          { icon: 'shield', title: 'Sponsored is always labelled', text: 'Companies can promote a job, but never buy a better score or a higher place among normal results.' },
        ],
      },
      {
        kind: 'audiences',
        heading: 'For employers',
        intro: 'Candidates are already looking at your roles on MadeVisa. Here’s how to make the most of it.',
        items: [
          { icon: 'source', title: 'Your jobs, already here', points: ['If you have a careers page, your roles can appear automatically', 'No integration, no cost, always in sync'] },
          { icon: 'building', title: 'Own your company page', points: ['Claim it with verified team access', 'Add your logo, details and direct listings'], cta: { label: 'Post a job', href: '/submit-job' } },
          { icon: 'passport', title: 'Hire across borders', points: ['Candidates attach a sponsorship agreement: the route, your steps and who pays what', 'Ready to sign, or to copy into the employment contract'] },
          { icon: 'score', title: 'Be known for replying', points: ['Companies that reply earn higher scores', 'Candidates see it before they apply'] },
        ],
      },
    ],
    faq: [
      { q: 'How often are jobs updated?', a: 'Continuously. New roles arrive throughout the day and closed roles are retired as they close on the employer’s page.' },
      { q: 'Why does a job show “Location on source”?', a: 'Some employers don’t state a clear location in the ad. Rather than guess, we point you to the original posting, where the employer gives the details.' },
      { q: 'Do I need an account?', a: 'No — you can search and read everything without one, and even check your CV against a job. An account keeps your CV, shows the skills you’re missing, and lets you save jobs, track applications and get check-in reminders.' },
      { q: 'Can I trust a Company Score with only a few applicants?', a: 'Scores only appear once several people have shared an outcome, and while data is early they show as a range. The more people track, the sharper they get.' },
      { q: 'How much does a sponsorship agreement cost?', a: 'It is part of MadeVisa Pro, which includes 50 a month along with the full CV match report on every job. Pro is one plan, monthly or yearly, priced for your country in your currency. Credits bought before October 2026 still work; see the Sponsorship Document Terms.' },
      { q: 'Is checking my CV against a job free?', a: 'Yes. The match score is free on every job, without a limit. With a free account you also see which skills are missing on 3 jobs a day. The full report — where each point comes from and what to change — is part of Pro.' },
      { q: 'Is the visa information official?', a: 'Each guide summarises the official rules and links to the government source, with the month it was last checked. Always confirm with the official source before you apply.' },
    ],
    cta: {
      title: 'See it in action.',
      text: 'Thousands of new roles every day, straight from the source.',
      primary: { label: 'Browse live jobs', href: '/jobs' },
      secondary: { label: 'See the job market', href: '/job-market' },
    },
  },
};
