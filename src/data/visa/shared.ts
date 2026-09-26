import type { ApplicationStep, CandidateCover, Requirement, RouteKind } from './types';

/** EU + EEA + Switzerland — citizens move freely between these for work. */
export const FREE_MOVEMENT = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO', 'CH',
]);

/** Common Travel Area: UK and Irish citizens can live and work in each other's country. */
export const COMMON_TRAVEL_AREA = new Set(['GB', 'IE']);

export const SCHENGEN_SHORT =
  'Up to 90 days in any 180 inside the Schengen Area. Many nationalities need a Schengen visa for this; EU/EEA/Swiss citizens never do.';

export const REQUIREMENT_LABEL: Record<Requirement, string> = {
  'job-offer': 'Job offer from an employer there',
  degree: 'University degree',
  experience: '3+ years of work experience',
  'remote-income': 'Income from work outside the country',
  funds: 'Savings to support yourself',
  admission: 'Admission to a university there',
  business: 'Business plan or startup backing',
  'salary-threshold': 'Salary above the yearly threshold',
  points: 'Enough points on the points test',
  endorsement: 'Endorsement or proof of exceptional talent',
  'recent-graduate': 'Recent degree from an eligible university',
  'employer-transfer': 'Transfer within your current employer',
};

/** Requirements the visitor can answer yes/no in their profile. */
export const ANSWERABLE: Requirement[] = ['degree', 'job-offer', 'experience', 'remote-income', 'funds', 'admission', 'business'];

export const ROUTE_KIND_LABEL: Record<RouteKind, string> = {
  work: 'Work',
  talent: 'Talent',
  'job-search': 'Job search',
  remote: 'Remote work',
  business: 'Business',
  study: 'Study',
  residence: 'Residence',
};

export const CANDIDATE_COVER_LABEL: Record<CandidateCover, string> = {
  'visa-fee': 'My own visa application fee',
  relocation: 'Flights and moving costs',
  translations: 'Document translations and certification',
  recognition: 'Recognition of my qualifications',
  'own-adviser': 'My own immigration adviser, if I need one',
};

/** The same costs, as the employer reads them on a brief (third person). */
export const CANDIDATE_COVER_THIRD_PERSON: Record<CandidateCover, string> = {
  'visa-fee': 'Their own visa application fee',
  relocation: 'Flights and moving costs',
  translations: 'Document translations and certification',
  recognition: 'Recognition of their qualifications',
  'own-adviser': 'Their own immigration adviser, if needed',
};

/** Used when a country file doesn't define its own steps. */
export const DEFAULT_APPLICATION_STEPS: ApplicationStep[] = [
  { title: 'Pick the route', detail: 'Match your purpose (work, study, remote work, business) to one route. Each route has its own conditions.' },
  { title: 'Gather documents', detail: 'Collect the documents for that route. Translations and certified copies can take weeks, so start early.' },
  { title: 'Apply', detail: 'Submit online or book an appointment at the embassy, consulate or visa centre that covers where you live.' },
  { title: 'Give biometrics', detail: 'Most long-stay visas need fingerprints and a photo taken in person.' },
  { title: 'Wait for a decision', detail: 'Processing times vary by route and embassy. Don\'t book non-refundable travel until you have the decision.' },
  { title: 'Register after arrival', detail: 'Many countries ask you to register your address and collect a residence card within a few weeks of arriving.' },
];

export const DEFAULT_DOCUMENTS: string[] = [
  'Passport valid for the whole stay, with blank pages',
  'Completed application form',
  'Recent biometric photos',
  'Proof of the purpose: job contract, admission letter or proof of income',
  'Proof of health insurance',
  'Proof you can support yourself',
];
