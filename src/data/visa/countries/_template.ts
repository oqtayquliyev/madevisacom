// Copy this file to countries/<country-slug>.ts, fill it in from official
// government sources only, then register it in ../index.ts.
//
// Checklist:
// - Every `url` goes to an official government page. If you can't find the
//   exact page, use the official portal's home page rather than guessing.
// - Fees and salary thresholds change yearly: prefer "See official site"
//   (leave `fee` out) over a number you haven't checked this year.
// - Only add `employer` to a route after checking what the employer has to
//   do. Adding it switches on Hiring Briefs for that route.
// - Set `reviewed` to the year-month you checked everything.
import type { VisaGuide } from '../types';

export const template: VisaGuide = {
  code: 'XX',
  name: 'Country name',
  slug: 'country-name',
  region: 'Region',
  blurb: 'One sentence on what makes this destination distinct for movers.',
  freeMovement: false,
  schengen: false,
  currency: 'XXX',
  languages: 'Official languages',
  prYears: null,
  prNote: 'How and when people usually get permanent residence.',
  citizenshipYears: null,
  citizenshipNote: 'Residence period and main conditions for citizenship.',
  dualCitizenship: 'limited',
  shortStay: 'Who can visit visa-free, and for how long.',
  routes: [
    {
      id: 'xx-work',
      name: 'Main work visa',
      kind: 'work',
      summary: 'Who it is for and what it allows.',
      validity: 'Up to N years',
      leadsToPR: true,
      requires: ['job-offer'],
      url: 'https://official.gov/page',
    },
  ],
  officialLinks: [{ label: 'Official immigration portal', url: 'https://official.gov/' }],
  reviewed: '2026-01',
};
