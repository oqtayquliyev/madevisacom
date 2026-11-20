// Text of the information and policy pages. Plain data: edit the words here, deploy, done.
// Contact details are in CONTACT below (used on several pages).

export const CONTACT = {
  email: 'hello@madevisa.com',
  phone: '+994 77 572 00 98',
  address: 'Yashil Dara, Sumgayit AZ5000, Azerbaijan',
};

export const LAST_UPDATED = 'November 2026';

export type TextSection = { heading: string; paragraphs?: string[]; bullets?: string[] };
export type TextPage = { slug: string; title: string; description: string; icon: 'info' | 'help' | 'doc' | 'mail' | 'shield'; intro: string; sections: TextSection[] };

export const textPages: Record<string, TextPage> = {
  about: {
    slug: 'about',
    title: 'About MadeVisa',
    description: 'MadeVisa is a free job search site for people who want to work in another country: fresh jobs from company career pages, visa sponsorship filters and work-visa guides.',
    icon: 'info',
    intro: 'MadeVisa helps people find work abroad. Every day it reads the career pages of companies that hire internationally, keeps only jobs posted in the last two weeks, and shows which ones say they sponsor a visa.',
    sections: [
      {
        heading: 'What you can do here',
        bullets: [
          'Browse fresh jobs from employers’ own career pages, filtered by country, visa sponsorship, remote work and how new they are.',
          'Open a job and read the ad in full, with the facts pulled out: location, work arrangement, salary when stated, experience and visa sponsorship.',
          'Upload your CV once and see how well it fits each job. Your CV stays in your own browser.',
          'Read the main work-visa routes of 21 countries, with official links.',
          'Watch the job market: how many jobs, where, and which companies sponsor visas.',
        ],
      },
      {
        heading: 'What MadeVisa is not',
        paragraphs: [
          'MadeVisa is not an employer, recruiter, immigration adviser or government body. It does not issue visas and cannot guarantee a job or a visa. You always apply on the company’s own page.',
          'MadeVisa never asks job seekers for money to apply, to be hired or to get a visa. If anyone claiming to be MadeVisa does, please tell us.',
        ],
      },
      {
        heading: 'Free, and kept that way',
        paragraphs: ['MadeVisa runs on free tiers of Cloudflare and GitHub. There are no accounts, no paywall and no advertising trackers. The book is the only thing for sale.'],
      },
    ],
  },
  'how-it-works': {
    slug: 'how-it-works',
    title: 'How MadeVisa works',
    description: 'How MadeVisa collects jobs every day, decides what “visa sponsorship” means for a job, and matches your CV — in plain words.',
    icon: 'help',
    intro: 'MadeVisa watches company careers pages for you, every day, and puts every new job in one list.',
    sections: [
      {
        heading: 'Why it’s quicker than big job sites',
        paragraphs: [
          'Companies post a new job on their own careers page first. It reaches LinkedIn, Indeed and other job sites later — sometimes days later, sometimes never. MadeVisa reads those careers pages directly, so a job usually shows up here soon after the company publishes it.',
        ],
        bullets: [
          'Earlier: jobs come from the source, checked every day.',
          'All at once: one list instead of opening dozens of careers pages one by one.',
          'Fresh only: jobs that leave the company’s page are removed the next day; nothing older than 14 days.',
          'The full ad: the original text from the company, with visa, salary, remote and experience pulled out.',
          'You apply direct: the Apply button takes you to the company’s own page — no middleman.',
        ],
      },
      {
        heading: '1. Every day: fresh jobs',
        paragraphs: [
          'Once a day MadeVisa reads the public job feeds of a list of companies (Greenhouse, Lever, Ashby, Workable, Recruitee, Personio and SmartRecruiters boards) and two open job boards, Arbeitnow and Remotive.',
          'Only jobs posted in the last 14 days are kept. Jobs that disappear from the company’s page are removed the next day, so you don’t waste time on closed roles.',
        ],
      },
      {
        heading: '2. Reading each ad',
        paragraphs: [
          'Each ad is cleaned (cookie banners, menus and repeated blocks removed) and read for facts: where the job is, remote / hybrid / on-site, salary if stated, experience asked for, and what the ad says about visas.',
          '“Visa sponsorship: offered” means the ad itself says the company sponsors or supports visas (or the job board marks it so). “Not offered” means the ad says you must already have the right to work. When the ad says nothing, MadeVisa says nothing — ask the company.',
        ],
      },
      {
        heading: '3. Your CV match',
        paragraphs: [
          'On /cv-match you add your CV (PDF, Word or text). It is read in your browser and saved only in your browser. On every job page MadeVisa compares the skills, role, experience, languages and education in your CV with the ad and gives a score with the reasons.',
          'Nothing about your CV is sent to MadeVisa or to employers.',
        ],
      },
      {
        heading: '4. Visa guides',
        paragraphs: ['The country guides describe the main work and residence routes, what each asks for and how long until permanent residence, with links to the official sources. Each guide shows the month it was last checked. Rules change: always confirm on the official site.'],
      },
    ],
  },
  'editorial-policy': {
    slug: 'editorial-policy',
    title: 'Editorial policy',
    description: 'Where MadeVisa’s jobs, facts and visa guides come from, and how corrections work.',
    icon: 'doc',
    intro: 'What you can rely on, and what you should double-check.',
    sections: [
      { heading: 'Jobs from the source', paragraphs: ['Jobs come only from companies’ own public job feeds and from open job boards that publish an API. MadeVisa does not write or edit ads; it shortens nothing that matters and links to the original for applying.'] },
      { heading: 'Facts are read, not guessed', paragraphs: ['Visa sponsorship, salary, remote work and experience are taken from what the ad says. When an ad is unclear, the fact is left empty rather than guessed.'] },
      { heading: 'Statistics', paragraphs: ['The job market page counts the jobs live on MadeVisa at the last daily update. It describes MadeVisa’s list, not the whole labour market of a country.'] },
      { heading: 'Visa guides', paragraphs: ['Guides are written from official government sources, linked on each page, and dated with the month they were last checked.'] },
      { heading: 'Corrections', paragraphs: [`Spotted something wrong? Email ${CONTACT.email} with the page link. Corrections are handled first.`] },
    ],
  },
  contact: {
    slug: 'contact',
    title: 'Contact MadeVisa',
    description: 'How to reach MadeVisa — job seekers, employers, press and corrections.',
    icon: 'mail',
    intro: 'A small team reads every message.',
    sections: [
      { heading: 'Email and phone', paragraphs: [`Email: <a href="mailto:${CONTACT.email}">${CONTACT.email}</a>`, `Phone: ${CONTACT.phone}`, `Address: MadeVisa, ${CONTACT.address}`] },
      { heading: 'Employers', paragraphs: ['If your company has a public job board (Greenhouse, Lever, Ashby, Workable, Recruitee, Personio or SmartRecruiters), your jobs can appear on MadeVisa for free. Email us the link to your careers page.'] },
      { heading: 'Corrections and reports', paragraphs: ['Closed, misleading or duplicate job? Email the page link and what is wrong.'] },
    ],
  },
  privacy: {
    slug: 'privacy',
    title: 'Privacy policy',
    description: 'What MadeVisa collects (very little), where your CV is kept (only in your browser) and who helps run the site.',
    icon: 'shield',
    intro: `Last updated ${LAST_UPDATED}. MadeVisa has no accounts and no sign-in. This page explains the little that is processed when you use the site.`,
    sections: [
      {
        heading: 'Your CV stays in your browser',
        paragraphs: ['When you add a CV for CV match, it is read and saved in your own browser (local storage) on your device. It is not uploaded to MadeVisa or sent to anyone. Remove it any time with “Remove my CV” on /cv-match, or by clearing your browser’s site data.'],
      },
      {
        heading: 'What is collected automatically',
        paragraphs: ['Like any website, our hosting provider receives technical data with each visit (IP address, browser, pages requested) to deliver pages and protect against abuse. Visit counts come from Cloudflare’s own server statistics, without cookies and without tracking you across sites.'],
      },
      {
        heading: 'Who helps run MadeVisa',
        bullets: [
          'Cloudflare — hosting, database, security and cookie-free visit statistics.',
          'GitHub — runs the daily job update. It handles job ads only, never visitor data.',
          'Gumroad — sells the book. If you buy it, Gumroad handles your payment under its own privacy policy; MadeVisa never sees your card.',
        ],
      },
      { heading: 'What we never do', bullets: ['We never sell personal data.', 'No advertising cookies, no sharing with advertisers.', 'We never send anything about you to employers. You apply on the employer’s own site.'] },
      { heading: 'Your rights and contact', paragraphs: [`Questions or requests about your data: ${CONTACT.email}. This policy is governed by the laws of the Republic of Azerbaijan, without limiting rights you have under the law of your own country.`] },
    ],
  },
  terms: {
    slug: 'terms',
    title: 'Terms of use',
    description: 'The rules for using MadeVisa.',
    icon: 'doc',
    intro: `Last updated ${LAST_UPDATED}. By using madevisa.com you agree to these terms.`,
    sections: [
      { heading: 'The service', paragraphs: ['MadeVisa shows jobs published by employers and job boards, facts read from those ads, visa guides and statistics. It is free and provided “as is”.'] },
      { heading: 'Job listings', paragraphs: ['Jobs belong to the companies that posted them. MadeVisa cannot confirm that a job is still open or that an ad is accurate, and is not part of any hiring decision. Apply on the employer’s own page and check the details there.'] },
      { heading: 'Visa information', paragraphs: ['Visa guides and “visa sponsorship” labels are general information, not legal or immigration advice. Rules change; always confirm with the official source or a licensed adviser.'] },
      { heading: 'Fair use', paragraphs: ['Don’t overload the site, scrape it in bulk, or use it to send spam. The job data comes from public feeds — use those feeds directly if you need it.'] },
      { heading: 'Liability and law', paragraphs: ['To the extent the law allows, MadeVisa is not liable for losses from using the site or from decisions based on it. These terms are governed by the laws of the Republic of Azerbaijan.'] },
    ],
  },
  cookies: {
    slug: 'cookies',
    title: 'Cookies and browser storage',
    description: 'MadeVisa sets no cookies. What it keeps in your browser, and why.',
    icon: 'shield',
    intro: 'MadeVisa sets no cookies of its own and uses no advertising or tracking cookies.',
    sections: [
      { heading: 'Browser storage', bullets: ['Your CV, if you add one for CV match (key “mv:cv”).', 'A copy of the job list for up to 10 minutes, so the board opens instantly.'] },
      { heading: 'Clearing it', paragraphs: ['Use “Remove my CV” on /cv-match, or clear site data for madevisa.com in your browser settings.'] },
    ],
  },
  disclaimer: {
    slug: 'disclaimer',
    title: 'Disclaimer',
    description: 'MadeVisa is not an immigration adviser, employer or government body.',
    icon: 'doc',
    intro: 'Please read before relying on anything here.',
    sections: [
      { heading: 'Not legal or immigration advice', paragraphs: ['Everything on MadeVisa is general information. For your own case, check the official government source or speak to a licensed immigration adviser.'] },
      { heading: 'Not an employer or recruiter', paragraphs: ['MadeVisa does not hire, does not represent employers and does not issue visas. It cannot guarantee a job or a visa.'] },
      { heading: 'Listings and statistics', paragraphs: ['Jobs and their facts come from employers’ ads and may be incomplete, out of date or wrong. Statistics describe the jobs on MadeVisa, not a whole country’s job market.'] },
    ],
  },
};
