export type LegalSection = { heading: string; paragraphs: string[] };
export type LegalPageContent = {
  slug: string;
  title: string;
  intro?: string;
  sections: LegalSection[];
};

const ENTITY = 'MadeVisa';
const ADDRESS = 'Cherkassi Street, Sumgayit, Azerbaijan';
const EMAIL = 'hello@madevisa.com';
const JURISDICTION = 'the laws of the Republic of Azerbaijan';
const LAST_UPDATED = 'September 2026';

export const legalPages: Record<string, LegalPageContent> = {
  about: {
    slug: 'about',
    title: 'About MadeVisa',
    intro: `${ENTITY} helps people discover and plan their path to a new life abroad — official government programs, visa and immigration pathways, sponsored jobs, study opportunities, business and family programs, and trusted visa experts.`,
    sections: [
      {
        heading: 'What we do',
        paragraphs: [
          'MadeVisa brings together opportunities, official information, and service providers so you can go from discovering options to actually moving, in one place: Discover → Compare → Choose → Apply → Move.',
          'We aggregate real jobs and programs from multiple sources — live public job board data, and listings submitted directly by governments, companies, agencies, and independent experts, each reviewed before publishing.',
        ],
      },
      {
        heading: 'What we are not',
        paragraphs: [
          'MadeVisa is not a law firm, a visa processing authority, a government agency, or an immigration consultancy. We do not file applications on your behalf or guarantee any visa, job, or program outcome.',
          'We are not affiliated with, endorsed by, or a partner of any government or institution shown on this platform unless explicitly stated otherwise. Official institutions are listed as public information sources.',
        ],
      },
      {
        heading: 'Who we work with',
        paragraphs: [
          'We work with governments, institutions, companies, and agencies who want to reach people interested in their programs, workforce opportunities, education, or relocation initiatives — subject to our review before anything is published.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [`Questions about MadeVisa can be sent to ${EMAIL}.`],
      },
    ],
  },

  contact: {
    slug: 'contact',
    title: 'Contact us',
    intro: 'We aim to respond to genuine inquiries as quickly as we can.',
    sections: [
      {
        heading: 'General inquiries',
        paragraphs: [`Email: ${EMAIL}`],
      },
      {
        heading: 'Registered address',
        paragraphs: [`${ENTITY}, ${ADDRESS}`],
      },
      {
        heading: 'For governments, companies, and agencies',
        paragraphs: [
          `If you represent an official institution, company, or agency and want to publish a job or program, apply from your MadeVisa profile ("Become a partner") or email ${EMAIL}.`,
        ],
      },
      {
        heading: 'Reporting incorrect information',
        paragraphs: [
          `If something on MadeVisa is inaccurate or out of date, please tell us at ${EMAIL} — see our Corrections Policy for how we handle this.`,
        ],
      },
    ],
  },

  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    intro: `This policy explains what information ${ENTITY} collects and how it's used. Last updated ${LAST_UPDATED}.`,
    sections: [
      {
        heading: 'Information we collect',
        paragraphs: [
          'Account information you provide when registering: name, email, phone, country, citizenship, and — if you apply to become a partner — organization details.',
          'Optional profile details you choose to add: languages, occupation, education, specialization, experience, and preferred destination.',
          "Items you save (jobs, programs, agencies, experts, destinations) are currently stored in your browser's local storage, not on our servers, and do not sync between devices.",
          'If you sign in with Google, we receive the profile information Google provides as part of that sign-in.',
        ],
      },
      {
        heading: 'How we use it',
        paragraphs: [
          'To operate your account, show you relevant opportunities, and let you manage your profile and saved items.',
          'To review and, where approved, publish content submitted by partners (agencies, companies, governments, experts).',
        ],
      },
      {
        heading: 'Third parties we rely on',
        paragraphs: [
          'Supabase provides our authentication and database infrastructure. Google provides optional sign-in. Cloudinary and our own storage host images.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          `You can edit or delete your personal information from your profile at any time, including permanently deleting your account. Contact ${EMAIL} for any request we haven't yet built self-service tools for.`,
        ],
      },
      {
        heading: 'Governing law',
        paragraphs: [`This policy is governed by ${JURISDICTION}.`],
      },
    ],
  },

  terms: {
    slug: 'terms',
    title: 'Terms of Service',
    intro: `By using ${ENTITY}, you agree to these terms. Last updated ${LAST_UPDATED}.`,
    sections: [
      {
        heading: 'The service',
        paragraphs: [
          `${ENTITY} is an information and discovery platform for jobs, programs, visa pathways, and related services abroad. We do not process visa applications, guarantee employment, or act as an immigration authority.`,
        ],
      },
      {
        heading: 'Your responsibilities',
        paragraphs: [
          'You are responsible for verifying any information — especially visa, eligibility, and legal requirements — with the relevant official source before relying on it or taking action.',
          'You agree not to submit false information, misuse the platform to publish misleading content, or attempt to circumvent our review process for partner submissions.',
        ],
      },
      {
        heading: 'Third-party content',
        paragraphs: [
          'Jobs, programs, and agency/expert listings may be submitted by third parties (companies, governments, agencies, individuals) and are reviewed before publishing, but we do not independently verify every underlying claim made by a third party.',
        ],
      },
      {
        heading: 'No warranty',
        paragraphs: [
          `${ENTITY} is provided "as is" without warranties of any kind regarding outcomes, accuracy, or availability of any listed opportunity.`,
        ],
      },
      {
        heading: 'Account termination',
        paragraphs: [
          'You may delete your account at any time from your profile settings. We may suspend accounts that violate these terms, misuse the partner review process, or submit fraudulent content.',
        ],
      },
      {
        heading: 'Governing law',
        paragraphs: [`These terms are governed by ${JURISDICTION}.`],
      },
    ],
  },

  cookies: {
    slug: 'cookies',
    title: 'Cookie Policy',
    intro: `This explains the cookies and local storage ${ENTITY} uses. Last updated ${LAST_UPDATED}.`,
    sections: [
      {
        heading: 'What we use',
        paragraphs: [
          'A cookie remembers the country you\'re browsing from (or that you manually selected), so pricing/relevance estimates match your situation — stored for up to 180 days.',
          'Authentication tokens are stored by Supabase to keep you signed in between visits.',
          "Jobs you recently viewed (kept for 48 hours) and your location preference are stored in your browser's local storage — this data stays on your device and isn't sent to our servers.",
        ],
      },
      {
        heading: 'What we do not use',
        paragraphs: [
          'We do not currently use third-party advertising or cross-site tracking cookies.',
        ],
      },
      {
        heading: 'Managing cookies',
        paragraphs: [
          "You can clear cookies and local storage through your browser's settings at any time; doing so will sign you out and clear your saved items on that device.",
        ],
      },
    ],
  },

  disclaimer: {
    slug: 'disclaimer',
    title: 'Disclaimer',
    sections: [
      {
        heading: 'Not legal or immigration advice',
        paragraphs: [
          `${ENTITY} provides general information for discovery purposes only. Nothing on this platform constitutes legal, immigration, tax, or financial advice.`,
        ],
      },
      {
        heading: 'Not a government body',
        paragraphs: [
          'We are not a government agency and do not process visas, work permits, or citizenship applications. Where we link to official government sources, that information belongs to and is controlled by the relevant government, not MadeVisa.',
        ],
      },
      {
        heading: 'Third-party listings',
        paragraphs: [
          'Jobs, programs, and provider listings are submitted by third parties and reviewed before publishing. We do not guarantee their accuracy, completeness, or that any application will succeed.',
        ],
      },
      {
        heading: 'Always verify independently',
        paragraphs: [
          `Before making any decision — applying for a visa, accepting a job, enrolling in a program, or engaging a service provider — verify current requirements directly with the official source or the provider. Contact us at ${EMAIL} if you believe something needs correcting.`,
        ],
      },
    ],
  },


  'advertising-policy': {
    slug: 'advertising-policy',
    title: 'Advertising Policy',
    sections: [
      {
        heading: 'Sponsored listings',
        paragraphs: [
          'Governments, companies, and agencies can submit jobs and programs to be published on MadeVisa. Every submission is reviewed by our team before it goes live, regardless of whether it is free or paid.',
          'Published sponsored listings are clearly labeled "Sponsored" wherever they appear, alongside the publisher\'s real name and verification status.',
        ],
      },
      {
        heading: 'What publication does not mean',
        paragraphs: [
          'Publishing a listing does not mean MadeVisa endorses, guarantees, or is affiliated with the publisher beyond having reviewed the submission. It does not affect a user\'s actual eligibility for any program or job.',
        ],
      },
      {
        heading: 'Editorial independence',
        paragraphs: [
          'Payment or sponsorship does not influence which eligibility results a user sees, or the factual descriptions we display for official government institutions.',
        ],
      },
      {
        heading: 'Submitting a listing or inquiring about advertising',
        paragraphs: [
          `Companies can request a free or sponsored job at madevisa.com/submit-job (see the Sponsored Listing Terms for prices, the 30-day period and refunds), or reach us directly at ${EMAIL}.`,
        ],
      },
    ],
  },

  'sponsored-listing-terms': {
    slug: 'sponsored-listing-terms',
    title: 'Sponsored Listing Terms',
    intro: `These terms apply when a company asks ${ENTITY} to publish a sponsored job. By ticking "I agree" on the Post a job form you accept them. Last updated ${LAST_UPDATED}.`,
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
          'If we don\'t approve the job, you pay nothing.',
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
  },
  'editorial-policy': {
    slug: 'editorial-policy',
    title: 'Editorial Policy',
    sections: [
      {
        heading: 'How listings are reviewed',
        paragraphs: [
          'Jobs and programs submitted by partners are reviewed by our team before publishing. Review checks that the submission is complete, plausible, and consistent with the publisher\'s stated organization — it is not a legal verification of every claim.',
        ],
      },
      {
        heading: 'Official government information',
        paragraphs: [
          'Where we describe an official government institution or program, we base that description on the institution\'s own public website and clearly link to it as the official source. We do not alter or reinterpret official eligibility requirements.',
        ],
      },
      {
        heading: 'Corrections',
        paragraphs: [`If you spot inaccurate information, see our Corrections Policy, or contact ${EMAIL}.`],
      },
    ],
  },

  corrections: {
    slug: 'corrections',
    title: 'Corrections Policy',
    sections: [
      {
        heading: 'How to report an issue',
        paragraphs: [
          `If you find inaccurate, outdated, or misleading information on MadeVisa — including in a listing, an institution description, or an official source link — email ${EMAIL} with the page and details.`,
        ],
      },
      {
        heading: 'What happens next',
        paragraphs: [
          'We review reported issues and correct or remove inaccurate content once verified. For listings submitted by a third party, we may also contact the publisher for clarification before making changes.',
        ],
      },
    ],
  },

  'verification-policy': {
    slug: 'verification-policy',
    title: 'Verification Policy',
    sections: [
      {
        heading: 'What "Verified" means on MadeVisa',
        paragraphs: [
          'A "Verified" badge on an agency, expert, company, or government publisher means our team reviewed their submitted registration details (name, organization type, country, contact information, and any supporting links) and approved them to publish.',
        ],
      },
      {
        heading: 'What it does not mean',
        paragraphs: [
          'Verification is not a government certification, legal accreditation, or guarantee of service quality or outcomes. It does not mean MadeVisa has independently audited the organization beyond the information they provided at registration.',
        ],
      },
      {
        heading: 'Revoking verification',
        paragraphs: [
          `Verified status can be suspended if we receive credible reports of misconduct or inaccurate information. Report concerns to ${EMAIL}.`,
        ],
      },
    ],
  },
};

export const legalPageOrder = [
  'about',
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
