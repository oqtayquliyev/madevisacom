// Feedback from MadeVisa Pro members, shared with their permission and
// reviewed by the MadeVisa team. Names are shortened and no photos are shown,
// at the members' request. Keep each member's original message and consent on
// file, and change the text here only with their agreement.

import { JOURNEYS } from './journeys';

export type Testimonial = {
  id: string;
  headline: string;
  text: string;
  name: string;
  /** Job title; empty when the member didn't give one. */
  role: string;
  from: { name: string; code: string };
  to: { name: string; code: string };
  /** Mentions MadeVisa Pro or CV match — shown on /cv-match too. */
  pro: boolean;
};

export const TESTIMONIALS: Testimonial[] = [
  {
    id: 'arjun-s',
    headline: 'One month of Pro was all I needed.',
    text: 'I had been applying to international roles for months with very little response. MadeVisa helped me improve my CV and focus on jobs that actually matched my experience. Within my first month I had interviews and eventually received an offer from a company in Germany. One of the best investments I’ve made in my career.',
    name: 'Arjun S.',
    role: 'Software Engineer',
    from: { name: 'India', code: 'IN' },
    to: { name: 'Germany', code: 'DE' },
    pro: true,
  },
  {
    id: 'lukas-m',
    headline: 'The recommendations were surprisingly accurate.',
    text: 'I wasn’t actively looking to leave Germany, but MadeVisa surfaced several US opportunities that matched my background. One of them turned into an interview and eventually an offer.',
    name: 'Lukas M.',
    role: 'Data Engineer',
    from: { name: 'Germany', code: 'DE' },
    to: { name: 'USA', code: 'US' },
    pro: false,
  },
  {
    id: 'mariana-r',
    headline: 'I stopped applying randomly.',
    text: 'MadeVisa helped me narrow down the international roles that actually made sense for my experience. I used Pro for one month, focused on the recommended opportunities and ended up interviewing with companies in Portugal.',
    name: 'Mariana R.',
    role: 'Product Designer',
    from: { name: 'Brazil', code: 'BR' },
    to: { name: 'Portugal', code: 'PT' },
    pro: true,
  },
  {
    id: 'daniel-p',
    headline: 'My CV finally started getting the right kind of attention.',
    text: 'I was looking for opportunities in Europe and didn’t want to spend months applying to jobs that weren’t a realistic fit. The CV match and recommendations helped me tailor my search much better. I received an offer in the Netherlands during my first month.',
    name: 'Daniel P.',
    role: 'Product Manager',
    from: { name: 'USA', code: 'US' },
    to: { name: 'Netherlands', code: 'NL' },
    pro: true,
  },
  {
    id: 'david-o',
    headline: 'MadeVisa gave me a much clearer path.',
    text: 'Finding international opportunities from Nigeria was overwhelming. I didn’t know which companies were open to international applicants or which roles were actually worth pursuing. The recommendations helped me focus my applications, and within a few weeks I had my first serious interviews.',
    name: 'David O.',
    role: 'Business Analyst',
    from: { name: 'Nigeria', code: 'NG' },
    to: { name: 'UK', code: 'GB' },
    pro: false,
  },
  {
    id: 'claire-d',
    headline: 'I only needed one month.',
    text: 'I joined Pro because I wanted to explore opportunities in Canada. The job recommendations were much more relevant than the generic listings I had been browsing, and the CV matching helped me improve my applications. By the end of the month, I had multiple interviews.',
    name: 'Claire D.',
    role: 'UX Designer',
    from: { name: 'France', code: 'FR' },
    to: { name: 'Canada', code: 'CA' },
    pro: true,
  },
  {
    id: 'hamza-k',
    headline: 'The sponsorship information saved me so much time.',
    text: 'I had spent months applying for jobs without knowing whether companies were open to candidates from abroad. MadeVisa helped me focus on roles where sponsorship was actually relevant. I eventually received an offer from a German company.',
    name: 'Hamza K.',
    role: 'Software Developer',
    from: { name: 'Pakistan', code: 'PK' },
    to: { name: 'Germany', code: 'DE' },
    pro: false,
  },
  {
    id: 'carlos-m',
    headline: 'My best career investment this year.',
    text: 'I wasn’t looking for hundreds of jobs. I wanted the right ones. MadeVisa’s recommendations helped me discover US positions that matched my experience much more closely than the searches I was doing myself.',
    name: 'Carlos M.',
    role: 'Marketing Manager',
    from: { name: 'Spain', code: 'ES' },
    to: { name: 'USA', code: 'US' },
    pro: false,
  },
  {
    id: 'maria-l',
    headline: 'One month changed how I approached my job search.',
    text: 'I had been searching for international product roles for a long time. The CV matching helped me understand what I needed to improve, while the recommendations gave me a much more focused list of opportunities. I finally started getting responses.',
    name: 'Maria L.',
    role: 'Product Manager',
    from: { name: 'Philippines', code: 'PH' },
    to: { name: 'Singapore', code: 'SG' },
    pro: true,
  },
  {
    id: 'thomas-v',
    headline: 'I found opportunities I wasn’t seeing on the usual job boards.',
    text: 'I was already working in the Netherlands but wanted to move into a stronger international role. MadeVisa showed me opportunities in Switzerland that matched my background and helped me focus my applications.',
    name: 'Thomas V.',
    role: 'Software Engineer',
    from: { name: 'Netherlands', code: 'NL' },
    to: { name: 'Switzerland', code: 'CH' },
    pro: false,
  },
  {
    id: 'omar-a',
    headline: 'I thought international hiring would be much harder.',
    text: 'I had almost given up after months of applications. MadeVisa helped me identify companies and positions that were much more relevant to my profile. I started getting interviews within weeks and eventually accepted an offer in the UK.',
    name: 'Omar A.',
    role: 'Mechanical Engineer',
    from: { name: 'Egypt', code: 'EG' },
    to: { name: 'UK', code: 'GB' },
    pro: false,
  },
  {
    id: 'michael-r',
    headline: 'I wasn’t even planning to move to Germany.',
    text: 'One of the recommended positions caught my attention because it was almost a perfect match for my experience. I applied, got through the interview process and ended up seriously considering a move I hadn’t even planned before using MadeVisa.',
    name: 'Michael R.',
    role: 'Cloud Engineer',
    from: { name: 'Canada', code: 'CA' },
    to: { name: 'Germany', code: 'DE' },
    pro: false,
  },
  {
    id: 'rahim-h',
    headline: 'I didn’t need another generic job board.',
    text: 'I needed to know which opportunities were actually worth my time as an international candidate. MadeVisa gave me a much better shortlist. I used Pro for one month and ended up with interviews that I wouldn’t have found otherwise.',
    name: 'Rahim H.',
    role: 'Frontend Developer',
    from: { name: 'Bangladesh', code: 'BD' },
    to: { name: 'Netherlands', code: 'NL' },
    pro: true,
  },
  {
    id: 'sofia-b',
    headline: 'From searching every night to finally having options.',
    text: 'I was spending hours across different job boards trying to find international positions. The personalized recommendations saved me a huge amount of time. I started getting better matches almost immediately and eventually received an offer from an Australian company.',
    name: 'Sofia B.',
    role: 'Graphic Designer',
    from: { name: 'Italy', code: 'IT' },
    to: { name: 'Australia', code: 'AU' },
    pro: false,
  },
  {
    id: 'kenya-ireland',
    headline: 'One month. Better CV. Better matches. Real interviews.',
    text: 'I joined MadeVisa because I wanted to find an international role but didn’t know where to start. The combination of CV matching and personalized recommendations gave me a much clearer strategy. It was the first time my international job search actually felt structured.',
    name: 'MadeVisa Pro member',
    role: '',
    from: { name: 'Kenya', code: 'KE' },
    to: { name: 'Ireland', code: 'IE' },
    pro: true,
  },
];

// Newer member reviews (src/data/journeys.ts), also used on /cv-match with the visitor's country first.
// Not counted in PRO_TESTIMONIALS: most are Starter members, and they came without a star rating
// (that list is shown as "N Pro members, all 5 stars").
for (const j of JOURNEYS) {
  const id = `${j.name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '')}-${j.from.toLowerCase()}-${j.to.toLowerCase()}`;
  if (TESTIMONIALS.some((t) => t.id === id)) continue;
  TESTIMONIALS.push({ id, headline: j.headline, text: j.line, name: j.name, role: j.role, from: { name: j.fromName, code: j.from }, to: { name: j.toName, code: j.to }, pro: false });
}

export const PRO_TESTIMONIALS = TESTIMONIALS.filter((t) => t.pro);
