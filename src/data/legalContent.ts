// Policy pages (/privacy, /terms, /cookies …). Pure data with no imports, so
// the server-rendered version of each page (api/seo.ts) uses the same text.
// "About" and "How it works" live in src/data/infoContent.ts.

export type LegalSection = { heading: string; paragraphs: string[]; bullets?: string[] };
export type LegalFaq = { q: string; a: string };
export type LegalPageContent = {
  slug: string;
  title: string;
  /** One line for search results and the page header. */
  description: string;
  intro?: string;
  /** "At a glance" — the short version, shown in a card at the top. */
  summary?: string[];
  sections: LegalSection[];
  faq?: LegalFaq[];
  /** Slugs of related policy pages. */
  related?: string[];
};

const ENTITY = 'MadeVisa';
const ADDRESS = 'Cherkassi Street, Sumgayit, Azerbaijan';
const EMAIL = 'hello@madevisa.com';
const JURISDICTION = 'the laws of the Republic of Azerbaijan';
export const LEGAL_LAST_UPDATED = 'September 2026';

export const legalPages: Record<string, LegalPageContent> = {
  contact: {
    slug: 'contact',
    title: 'Contact MadeVisa',
    description: 'How to reach the MadeVisa team — for job seekers, employers, institutions, press and corrections.',
    intro: 'A small team reads every message. Tell us who you are and what you need, and it reaches the right person the first time.',
    summary: [
      `Email ${EMAIL} for anything — we reply on working days.`,
      'Employers can list jobs free from their own careers page, or post directly.',
      'Spotted something wrong on a page? Corrections are handled first.',
    ],
    sections: [
      {
        heading: 'Job seekers',
        paragraphs: [
          'Questions about your account, application tracking or your public profile: email us from the address on your account so we can find it quickly.',
          'MadeVisa never charges applicants and never asks for payment to apply, to be hired or for a visa. If anyone claiming to be MadeVisa does, report it to us.',
        ],
      },
      {
        heading: 'Employers and recruiters',
        paragraphs: [
          'If your company already has a careers page, its jobs can appear on MadeVisa at no cost. To manage your company page, add your team or post a job directly, use Post a job or email us.',
          'For sponsored placements and Hiring Briefs (a plain-language summary of what hiring someone from abroad involves for your company), see the Sponsored Listing Terms.',
        ],
      },
      {
        heading: 'Governments, universities and institutions',
        paragraphs: [
          `Official programs, scholarships and relocation initiatives can be listed with a clear link to your own official source. Email ${EMAIL} with the program and the page it lives on.`,
        ],
      },
      {
        heading: 'Press and partnerships',
        paragraphs: [
          'We publish hiring data by country, company and role on the Job Market page and in weekly reports. For data requests, interviews or partnerships, email us with "Press" or "Partnership" in the subject.',
        ],
      },
      {
        heading: 'Corrections and reports',
        paragraphs: [
          'Every job page has a "Report" button for closed, misleading or duplicate listings. For anything else — a company profile, a visa guide, an article — email us the page link and what should change. See the Corrections Policy for what happens next.',
        ],
      },
      {
        heading: 'Registered address',
        paragraphs: [`${ENTITY}, ${ADDRESS}`],
      },
    ],
    related: ['corrections', 'privacy', 'sponsored-listing-terms'],
  },

  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    description: 'What MadeVisa collects, why, who helps us run the service, how long we keep it and how to see, change or delete your data.',
    intro: `This policy explains what information ${ENTITY} collects, how it is used and the choices you have. It applies to madevisa.com and every page on it. Last updated ${LEGAL_LAST_UPDATED}.`,
    summary: [
      'You can browse jobs, company pages and visa guides without an account.',
      'We never sell your data and never use it for third-party advertising.',
      'Your email, phone and nationality are never shown publicly — not on your profile, not in the Network.',
      'Company Scores use combined, anonymous outcomes. Your name is never attached to a score.',
      'You can delete your account yourself, at any time, from your profile.',
    ],
    sections: [
      {
        heading: '1. Who we are',
        paragraphs: [`${ENTITY} (${ADDRESS}) runs madevisa.com and is responsible for the personal data described here. Questions or requests: ${EMAIL}.`],
      },
      {
        heading: '2. Information you give us',
        paragraphs: ['Only what you choose to provide, depending on what you use:'],
        bullets: [
          'Account: your name, email address and a password (stored as a secure hash by our authentication provider), or the name, email and photo Google shares if you sign in with Google.',
          'Profile (optional): username, photo, headline, phone, country, nationality, languages, occupation, education, specialisation, experience and preferred destination.',
          'Network (optional, off by default): whether you appear in the MadeVisa Network, your role (for example job seeker or recruiter) and whether you are hiring or open to work.',
          'Application tracking: the jobs you apply to through MadeVisa, whether you confirmed applying, status updates (reply, interview, rejection, offer), your answers to short check-in questions and any reminders you set. You choose which applications, if any, appear on your public profile.',
          'Experience reports: when you report an application made elsewhere — company, role, date, channel and outcome. Reports are reviewed before they count.',
          'Reports and messages: when you report a job, contact us or send a correction.',
          'Company accounts: organisation details, team members’ email addresses and job listings you submit.',
          'Two-step verification: if you turn it on, the authenticator secret is held by our authentication provider; we only see whether a sign-in passed.',
        ],
      },
      {
        heading: '3. Information collected automatically',
        paragraphs: [],
        bullets: [
          'Country: to show jobs and visa routes that fit you, we detect the country you browse from — from your browser’s location (only if you allow it; only the country code is kept, never coordinates) or, if you don’t, a rough estimate from your network address. It is saved in a cookie for 180 days and you can change it at any time.',
          'On your device: to make pages load instantly we keep a copy of the job list, your recently viewed jobs and a few display preferences in your browser’s storage. This stays on your device.',
          'Usage and performance: privacy-friendly analytics that count page views and measure page speed in aggregate, without advertising cookies or cross-site tracking.',
          'Security: a bot check on sign-up and sign-in, and standard server logs (such as network address, time and page requested) kept for a short period to protect the service.',
          'Email verification: when you confirm your email address and which address was confirmed.',
        ],
      },
      {
        heading: '4. How we use it',
        paragraphs: [],
        bullets: [
          'To run your account and the features you use — saving jobs, tracking applications, reminders, your public profile and the Network.',
          'To show relevant jobs, countries and visa routes.',
          'To calculate Company Scores, reply rates and hiring statistics. These use combined outcomes from many applicants, weighted so that no single account can swing a result, and they never identify you.',
          'To review company registrations, listings and experience reports before they are published.',
          'To keep MadeVisa safe: preventing spam, fraud and abuse.',
          'To send the emails you need, such as sign-in codes, email confirmation and replies to your messages. We don’t send marketing emails unless you ask for them.',
        ],
      },
      {
        heading: '5. What is public',
        paragraphs: [
          'Nothing about you is public unless you choose it. If you create a public profile, only the fields shown on it are visible, and only the applications you mark as public. The Network shows your name, photo, headline, role and intent — never your email, phone or nationality.',
          'Jobs, company pages, Company Scores, visa guides and articles are public information.',
        ],
      },
      {
        heading: '6. Legal bases',
        paragraphs: [
          'Where data-protection laws such as the GDPR apply, we rely on: performing our agreement with you (running your account and the features you use); legitimate interests (keeping the service secure, improving it and producing anonymous statistics, balanced against your rights); consent (browser location, optional profile fields and appearing in the Network — which you can withdraw at any time); and legal obligations where they apply.',
        ],
      },
      {
        heading: '7. Who helps us run MadeVisa',
        paragraphs: ['We share data only with service providers that process it on our behalf, under contracts that limit use to providing their service:'],
        bullets: [
          'Supabase — database, authentication and file storage.',
          'Vercel — website hosting, privacy-friendly analytics and performance measurement.',
          'Google — optional “Sign in with Google” and web fonts.',
          'Cloudflare — the bot check (Turnstile) on sign-up and sign-in.',
          'Cloudinary and our own storage — images such as logos and profile photos.',
          'BigDataCloud and ipwho.is — turning a location or network address into a country code.',
          'Our email delivery provider — sign-in codes and service emails.',
        ],
      },
      {
        heading: '8. What we never do',
        paragraphs: [],
        bullets: [
          'We never sell or rent personal data.',
          'We don’t use advertising cookies or share data with advertisers.',
          'We never pass your details to an employer. When you apply, you apply on the employer’s own site, and you decide what you send them.',
        ],
      },
      {
        heading: '9. International transfers',
        paragraphs: ['Our providers may process data outside your country. Where required, transfers are protected by safeguards such as standard contractual clauses.'],
      },
      {
        heading: '10. How long we keep it',
        paragraphs: [
          'Account and profile data: until you delete your account. Application tracking and experience reports: until you delete them or your account. Security logs: a short period, typically up to 30 days. Country cookie: 180 days. Anonymous statistics that no longer identify anyone may be kept.',
        ],
      },
      {
        heading: '11. Your rights',
        paragraphs: [
          'You can view and edit your profile, hide or show applications, leave the Network and permanently delete your account yourself, from your profile. You can also ask us for a copy of your data, to correct it, to restrict or object to processing, or to delete anything we haven’t yet built a self-service option for.',
          `Email ${EMAIL} from the address on your account; we reply within 30 days. You also have the right to complain to your local data-protection authority.`,
        ],
      },
      {
        heading: '12. Security',
        paragraphs: ['Data is encrypted in transit, access is restricted by database-level rules, admin access requires two-step verification, and contact details are never returned by public pages.'],
      },
      {
        heading: '13. Children',
        paragraphs: ['MadeVisa is not intended for anyone under 16, and we don’t knowingly collect their data.'],
      },
      {
        heading: '14. Changes',
        paragraphs: ['When this policy changes, we update the date at the top. For significant changes we will let signed-in users know on the site.'],
      },
      {
        heading: '15. Governing law',
        paragraphs: [`This policy is governed by ${JURISDICTION}, without limiting any rights you have under the law of your own country.`],
      },
    ],
    faq: [
      { q: 'Can employers see my profile or applications?', a: 'No. When you apply, you apply on the employer’s own site. MadeVisa never sends your details to employers. Only what you make public on your profile is visible to anyone.' },
      { q: 'Does MadeVisa track my exact location?', a: 'No. If you allow location, it is turned into a country code and only the country is kept. You can also pick your country by hand.' },
      { q: 'Are my application outcomes shown with my name?', a: 'No. Company Scores combine outcomes from many applicants. Individual applications only appear on your public profile if you choose to show them.' },
      { q: 'How do I delete everything?', a: 'Go to your profile and choose “Delete account”. Your account, profile, tracked applications and reports are removed.' },
    ],
    related: ['cookies', 'terms', 'contact'],
  },

  terms: {
    slug: 'terms',
    title: 'Terms of Service',
    description: 'The rules for using MadeVisa: what the service is, what we promise, what we ask of you, and which law applies.',
    intro: `By using ${ENTITY}, you agree to these terms. Last updated ${LEGAL_LAST_UPDATED}.`,
    summary: [
      'MadeVisa helps you find jobs and understand hiring and visa routes. It is free for job seekers.',
      'Jobs link to the employer’s own posting; you apply there.',
      'Visa information is a guide. Always confirm with the official source before you act.',
      'Be honest in what you post and report.',
    ],
    sections: [
      {
        heading: 'The service',
        paragraphs: [
          `${ENTITY} is a job-search and hiring-insights platform. It shows jobs from employers’ own career pages and from companies that post with us, Company Scores built from applicant outcomes, hiring statistics, and visa, program and study information. We do not process visa applications, guarantee employment or act as an immigration authority, recruiter or employer.`,
        ],
      },
      {
        heading: 'Job listings',
        paragraphs: [
          'Listings show where each job comes from and when it was posted. Employers can change or close jobs at any time; we retire closed jobs as soon as we notice, but a listing may occasionally be out of date. The employer’s own posting is always the final word.',
        ],
      },
      {
        heading: 'Your account',
        paragraphs: ['Keep your sign-in details safe and your information accurate. You are responsible for activity on your account. You must be 16 or older to create one.'],
      },
      {
        heading: 'What you agree not to do',
        paragraphs: [],
        bullets: [
          'Submit false information, fake applications, fake outcomes or fake experience reports.',
          'Post jobs that charge applicants, are not real, or break the law.',
          'Scrape, copy or resell MadeVisa data in bulk, or disrupt the service.',
          'Impersonate a person, company or institution.',
        ],
      },
      {
        heading: 'Content you submit',
        paragraphs: [
          'You keep ownership of what you submit. You allow us to display it on MadeVisa and to use it, in anonymous combined form, for statistics such as Company Scores. Reports and listings are reviewed and may be edited for format or declined.',
        ],
      },
      {
        heading: 'Visa and immigration information',
        paragraphs: [
          'Visa guides summarise official sources and show when they were last checked. Rules change; always confirm with the official source linked on each page, or a qualified adviser, before making decisions.',
        ],
      },
      {
        heading: 'No warranty and limits of liability',
        paragraphs: [
          `${ENTITY} is provided “as is”. To the extent the law allows, we are not liable for decisions made on the basis of listings or information on the site, or for the acts of employers, institutions or other users.`,
        ],
      },
      {
        heading: 'Ending your account',
        paragraphs: ['You can delete your account at any time from your profile. We may suspend accounts that break these terms, submit fraudulent content or misuse the service.'],
      },
      {
        heading: 'Changes and governing law',
        paragraphs: [`We may update these terms; the date above shows the latest version. These terms are governed by ${JURISDICTION}.`],
      },
    ],
    related: ['privacy', 'disclaimer', 'sponsored-listing-terms'],
  },

  cookies: {
    slug: 'cookies',
    title: 'Cookie Policy',
    description: 'The small amount of cookies and browser storage MadeVisa uses, what each one is for, and how to clear them.',
    intro: `${ENTITY} uses very little: one cookie, plus browser storage that keeps pages fast and keeps you signed in. No advertising cookies. Last updated ${LEGAL_LAST_UPDATED}.`,
    summary: ['No advertising or cross-site tracking cookies.', 'One cookie remembers your country for 180 days.', 'Browser storage keeps you signed in and makes the job list load instantly.'],
    sections: [
      {
        heading: 'Cookies',
        paragraphs: [],
        bullets: [
          'madevisa_country — the country you browse from or picked yourself, so jobs and visa routes fit you. Kept for 180 days.',
          'Bot check — the security check on sign-up and sign-in (Cloudflare Turnstile) may set a short-lived cookie that is only used to tell people from bots.',
        ],
      },
      {
        heading: 'Browser storage (local storage and IndexedDB)',
        paragraphs: ['These stay on your device and are not sent to us:'],
        bullets: [
          'Your sign-in session, so you stay signed in between visits.',
          'A copy of the job list and the latest update number, so /jobs opens instantly and only downloads what’s new.',
          'Recently viewed jobs, your display preferences and small counters (such as the number of live jobs) so pages don’t ask again.',
        ],
      },
      {
        heading: 'Analytics',
        paragraphs: ['We measure page views and page speed with privacy-friendly analytics that don’t use cookies and don’t follow you across other sites.'],
      },
      {
        heading: 'Managing them',
        paragraphs: ['You can clear cookies and site data in your browser settings at any time. That signs you out and clears the saved job list on that device; everything else keeps working.'],
      },
    ],
    related: ['privacy', 'terms'],
  },

  disclaimer: {
    slug: 'disclaimer',
    title: 'Disclaimer',
    description: 'What MadeVisa information is — and is not — and why you should confirm important decisions with the official source.',
    summary: ['General information, not legal or immigration advice.', 'MadeVisa is not a government body or recruiter.', 'Always confirm with the official source before you act.'],
    sections: [
      {
        heading: 'Not legal or immigration advice',
        paragraphs: [`${ENTITY} provides general information to help you discover options. Nothing on the platform is legal, immigration, tax or financial advice.`],
      },
      {
        heading: 'Not a government body, employer or recruiter',
        paragraphs: ['We don’t process visas, work permits or citizenship applications, and we don’t hire or recruit for the jobs shown. Official information belongs to the government or institution that publishes it.'],
      },
      {
        heading: 'Listings and statistics',
        paragraphs: [
          'Jobs come from employers’ own career pages and from companies that post with us. Company Scores and hiring statistics are based on data available to us and on outcomes shared by applicants; they describe the past and don’t guarantee what will happen with your application.',
        ],
      },
      {
        heading: 'Always verify',
        paragraphs: [`Before applying for a visa, accepting a job or engaging a service provider, check the current requirements with the official source or the provider. If something here needs correcting, email ${EMAIL}.`],
      },
    ],
    related: ['terms', 'editorial-policy', 'corrections'],
  },

  'advertising-policy': {
    slug: 'advertising-policy',
    title: 'Advertising Policy',
    description: 'How sponsored listings work on MadeVisa, how they are labelled, and why sponsorship never changes scores or information.',
    summary: ['Sponsored jobs are always labelled.', 'Paying never changes Company Scores, statistics or visa information.', 'Every sponsored job is reviewed before it goes live.'],
    sections: [
      {
        heading: 'Sponsored listings',
        paragraphs: [
          'Companies, governments and agencies can pay to feature a job or program. Every submission is reviewed before it goes live, whether it is free or paid.',
          'Sponsored listings are always marked “Sponsored” or “Ad” wherever they appear, with the publisher’s real name.',
        ],
      },
      {
        heading: 'Independence',
        paragraphs: [
          'Sponsorship never influences Company Scores, reply rates, hiring statistics, visa guides, eligibility results or the order of non-sponsored results. Scores are calculated the same way for every company.',
        ],
      },
      {
        heading: 'What publication does not mean',
        paragraphs: ['Publishing a listing does not mean MadeVisa endorses, guarantees or is affiliated with the publisher beyond having reviewed the submission.'],
      },
      {
        heading: 'Advertising enquiries',
        paragraphs: [`See the Sponsored Listing Terms for prices and refunds, or email ${EMAIL}.`],
      },
    ],
    related: ['sponsored-listing-terms', 'editorial-policy'],
  },

  'sponsored-listing-terms': {
    slug: 'sponsored-listing-terms',
    title: 'Sponsored Listing Terms',
    description: 'Price, review, 30-day period, cancellations and refunds for sponsored jobs on MadeVisa.',
    intro: `These terms apply when a company asks ${ENTITY} to publish a sponsored job. By ticking "I agree" on the Post a job form you accept them. Last updated ${LEGAL_LAST_UPDATED}.`,
    summary: ['$299 per job for 30 days.', 'Nothing is charged before we approve the job.', 'Full refund if we don’t publish within 3 working days.'],
    sections: [
      {
        heading: 'What a sponsored job includes',
        paragraphs: [
          'One job, shown for 30 consecutive days from the day it goes live: pinned on the MadeVisa homepage and at the top of the jobs board, and listed with all other jobs.',
          'Sponsored jobs are always clearly marked "Sponsored" or "Ad". Sponsorship never changes eligibility information, company response statistics, or anything else we show about a company.',
        ],
      },
      {
        heading: 'Price',
        paragraphs: [
          'A sponsored job costs $299 (USD) per job for 30 days, plus any tax that applies in your country. The price shown when you send your request is the price you pay.',
          'Small fixes to a live job (typos, a changed link) are free — email us. A different role is a new listing.',
        ],
      },
      {
        heading: 'Review first, payment after approval',
        paragraphs: [
          'Sending the form is a request, not a purchase. We review your company and the job first — usually within a few hours on working days.',
          'Nothing is charged before approval. If we approve the job, we email you a secure payment link or invoice. The 30 days start when the job goes live after payment.',
          "If we don't approve the job, you pay nothing.",
        ],
      },
      {
        heading: 'Cancellations and refunds',
        paragraphs: [
          'You can cancel for free at any time before you pay.',
          'After payment, if you cancel before the job goes live, or we fail to publish it within 3 working days, you get a full refund.',
          'Once the job is live, the fee is not refundable, except when we remove the job for a reason that is not your fault — then we refund the unused days.',
          'You can close a sponsored job early from your company dashboard; closing early does not create a refund.',
        ],
      },
      {
        heading: 'What we accept',
        paragraphs: [
          'The job must be real, currently open, and offered by the company named in the request (or by a recruiter clearly acting for it).',
          'Applicants must never be asked to pay a fee to apply, to be hired, or for a visa. Listings must follow the law and must not discriminate on grounds such as gender, religion, ethnicity or age, except where the law requires it.',
          'We may edit formatting, fix obvious mistakes, or decline a job. We may remove a live job that turns out to be misleading or unlawful; in that case no refund is due.',
        ],
      },
      {
        heading: 'Your details and privacy',
        paragraphs: [
          'We use the name, email and company you send only to handle your request: to reply, set up your company page, and send the payment link. We keep a record of what you accepted and when.',
          'We never sell these details or add you to marketing lists. To protect the form from abuse we store a one-way hash of your network address for a limited time. See our Privacy Policy for more.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [`Questions about a sponsored job or a payment: ${EMAIL}. These terms are governed by ${JURISDICTION}.`],
      },
    ],
    related: ['advertising-policy', 'privacy', 'contact'],
  },

  'editorial-policy': {
    slug: 'editorial-policy',
    title: 'Editorial Policy',
    description: 'How MadeVisa sources jobs, checks listings, writes visa guides and reports, and keeps information honest.',
    summary: [
      'Jobs come from the employer’s own careers page, not reposts.',
      'Posting dates are the employer’s own — never refreshed to look new.',
      'Visa guides link to the official source and show when they were last checked.',
      'Reports and statistics are calculated the same way for every company.',
    ],
    sections: [
      {
        heading: 'Jobs from the source',
        paragraphs: [
          'Most jobs on MadeVisa come straight from employers’ own career pages. Each listing links back to the original posting, shows the company that posted it and the date it was posted there. We don’t change posting dates to make jobs look newer.',
          'Listings are checked before they appear: pages that aren’t real job ads are held back, key details such as salary, work arrangement and visa sponsorship are surfaced from the ad itself, and jobs that disappear from the employer’s page are marked closed and then removed.',
        ],
      },
      {
        heading: 'Company Scores and statistics',
        paragraphs: [
          'Company Scores and reply rates come from outcomes shared by applicants on MadeVisa, weighted so that new or incomplete accounts can’t swing a result, and shown as a range until there is enough data. The method is the same for every company, and sponsorship never changes it.',
        ],
      },
      {
        heading: 'Visa guides',
        paragraphs: ['Visa guides summarise the official rules for each country and route, link to the official government page, and show the month they were last checked. We don’t reinterpret eligibility requirements.'],
      },
      {
        heading: 'Articles and hiring reports',
        paragraphs: [
          'Weekly hiring reports are generated from live MadeVisa data and say which period they cover. Guides are written and reviewed by the MadeVisa editorial team, and updated when the underlying rules change.',
        ],
      },
      {
        heading: 'Corrections',
        paragraphs: [`See the Corrections Policy, or email ${EMAIL}.`],
      },
    ],
    related: ['corrections', 'verification-policy', 'advertising-policy'],
  },

  corrections: {
    slug: 'corrections',
    title: 'Corrections Policy',
    description: 'How to report inaccurate information on MadeVisa and what we do about it.',
    summary: ['Use “Report” on any job page, or email us.', 'Closed or misleading jobs are prioritised.', 'Corrections to guides and articles show an updated date.'],
    sections: [
      {
        heading: 'How to report an issue',
        paragraphs: [
          `Every job page has a Report button for jobs that are closed, misleading or duplicated. For anything else — a company profile, a visa guide or an article — email ${EMAIL} with the page link and what should change.`,
        ],
      },
      {
        heading: 'What happens next',
        paragraphs: [
          'We review reports and correct or remove content once verified. For listings posted by a company, we may contact the company first. Corrections to visa guides and articles are shown with an updated date.',
        ],
      },
    ],
    related: ['editorial-policy', 'contact'],
  },

  'verification-policy': {
    slug: 'verification-policy',
    title: 'Verification Policy',
    description: 'What the “Verified” badge on companies, people and publishers means on MadeVisa — and what it doesn’t.',
    summary: ['Verified companies were reviewed by our team.', 'Verified people confirmed their email address.', 'Verification is not a guarantee of outcomes.'],
    sections: [
      {
        heading: 'Verified companies and publishers',
        paragraphs: ['A “Verified” badge on a company, agency or institution means our team reviewed its details (name, type, country, website and contact information) and approved it to publish.'],
      },
      {
        heading: 'Verified people',
        paragraphs: ['On a profile, “Verified” means the person confirmed they own the email address on their account. Company team access also requires a verified email at that company.'],
      },
      {
        heading: 'What it does not mean',
        paragraphs: ['Verification is not a government certification, legal accreditation or guarantee of service quality or outcomes.'],
      },
      {
        heading: 'Revoking verification',
        paragraphs: [`Verified status can be suspended after credible reports of misconduct or inaccurate information. Report concerns to ${EMAIL}.`],
      },
    ],
    related: ['editorial-policy', 'corrections'],
  },
};

export const legalPageOrder = [
  'contact',
  'privacy',
  'terms',
  'cookies',
  'disclaimer',
  'advertising-policy',
  'sponsored-listing-terms',
  'editorial-policy',
  'corrections',
  'verification-policy',
];
