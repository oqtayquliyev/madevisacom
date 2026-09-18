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
    intro: `${ENTITY} helps people discover and plan their path to a new life abroad — official government programs, visa and immigration pathways, sponsored jobs, study opportunities, business and family programs, relocation services, flights, travel support, and trusted agencies and experts.`,
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
          'Supabase provides our authentication and database infrastructure. Google provides optional sign-in. Cloudinary and our own storage host images. Flight search links go through the Travelpayouts affiliate network — see our Affiliate Disclosure.',
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
          "Saved jobs, programs, agencies, experts and destinations are stored in your browser's local storage — this data stays on your device and isn't sent to our servers.",
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

  'affiliate-disclosure': {
    slug: 'affiliate-disclosure',
    title: 'Affiliate Disclosure',
    sections: [
      {
        heading: 'Flight search links',
        paragraphs: [
          'Flight search results on MadeVisa link out through the Travelpayouts affiliate network. If you book a flight after clicking through, MadeVisa may earn a commission at no extra cost to you.',
        ],
      },
      {
        heading: 'No influence on results',
        paragraphs: [
          'Affiliate relationships do not change which jobs, programs, or destinations are shown or how they are ranked for eligibility.',
        ],
      },
      {
        heading: 'Future partnerships',
        paragraphs: [
          `If MadeVisa enters other affiliate or referral arrangements, this page will be updated to disclose them. Questions: ${EMAIL}.`,
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
          `Governments, companies, and agencies can apply from their MadeVisa profile ("Become a partner"), or reach us directly at ${EMAIL}.`,
        ],
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
  'affiliate-disclosure',
  'advertising-policy',
  'editorial-policy',
  'corrections',
  'verification-policy',
];
