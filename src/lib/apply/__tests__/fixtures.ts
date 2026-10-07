import { parseCv } from '@/lib/cv/cvProfile';
import { parseJob } from '@/lib/cv/jobProfile';
import { matchCv } from '@/lib/cv/match';
import { matchQ } from '@/lib/apply/facts';
import { DEFAULT_PREFS, type ApplyPrefs, type ApplyProfile, type JobFacts } from '@/lib/apply/types';

export const NOW = Date.parse('2026-10-07T12:00:00Z');
export const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

export const CV_TEXT = `Leyla Mammadova
Baku, Azerbaijan · leyla.mammadova@example.com · +994 50 555 01 23
linkedin.com/in/leyla-mammadova

Summary
Data analyst with a background in retail and logistics reporting.

Work Experience
Senior Data Analyst | Caspian Retail Group | Mar 2021 – Present
• Organised the weekly stock meeting for 6 store managers
• Built Tableau dashboards on top of SQL models, used by 40 managers every week
• Cut report preparation time by 35% by moving manual Excel work into Python scripts
• Wrote the onboarding guide for new analysts

Data Analyst | Silk Way Logistics | Jun 2018 – Feb 2021
• Answered ad-hoc requests from the finance team
• Forecast monthly shipping volumes in Python (pandas), within 4% of actuals
• Maintained SQL queries for the customs reporting pipeline

Education
BSc in Statistics, Baku State University, 2014 – 2018

Skills
Tools: Excel, Tableau, Power BI, SQL, Python, Git
Languages
English (C1), Azerbaijani (native), Russian (B2)
`;

export const AD_HTML = `<h2>About the role</h2>
<p>We are hiring a Senior Data Analyst to own reporting for our logistics business in Berlin. Visa sponsorship is available.</p>
<h2>What you will do</h2>
<ul><li>Build dashboards in Tableau for operations managers</li><li>Forecast shipping volumes and explain the drivers</li><li>Maintain SQL models in dbt</li></ul>
<h2>Requirements</h2>
<ul><li>5+ years of experience as a data analyst</li><li>Strong SQL and Python</li><li>Experience with Tableau</li><li>dbt is required</li><li>Fluent English</li><li>Bachelor's degree in a quantitative field</li></ul>
<h2>How to apply</h2><p>Please include a cover letter.</p>`;

export const cv = parseCv(CV_TEXT);
export const job = parseJob({ title: 'Senior Data Analyst (m/f/d)', description: AD_HTML });
export const match = matchCv(cv, CV_TEXT, job);

export const facts = (over: Partial<JobFacts> = {}): JobFacts => ({
  id: 'job-1',
  title: 'Senior Data Analyst (m/f/d)',
  company: 'Hansa Freight',
  publisherId: 'pub-1',
  cc: 'DE',
  country: 'Germany',
  remote: false,
  arrangement: 'hybrid',
  role: 'Data Analyst',
  score: 86,
  q: { ...matchQ(match, job, cv), must: 0, gap: 0, capped: false },
  visa: 'offered',
  postedAt: daysAgo(5),
  payUsdYear: 70_000,
  ...over,
});

export const prefs = (over: Partial<ApplyPrefs> = {}): ApplyPrefs => ({ ...DEFAULT_PREFS, ...over });

export const profile = (over: Partial<ApplyProfile['answers']> = {}): ApplyProfile => ({
  answers: {
    full_name: { value: 'Leyla Mammadova', askEachTime: false, source: 'you' },
    email: { value: 'leyla.mammadova@example.com', askEachTime: false, source: 'cv' },
    phone: { value: '+994 50 555 01 23', askEachTime: false, source: 'cv' },
    ...over,
  },
  custom: {},
});
