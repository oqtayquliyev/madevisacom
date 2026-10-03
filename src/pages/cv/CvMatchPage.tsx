import { useMemo } from 'react';
import { ArrowRight, Briefcase, GraduationCap, Languages, ScanSearch, Timer } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { WRAP, nav } from '@/lib/pageLayout';
import { jobPath } from '@/lib/jobUrl';
import { getRecentlyViewedJobs } from '@/lib/viewedJobs';
import { uuidFromBoardId } from '@/lib/sponsorOffer';
import { FREE_DAILY_CHECKS } from '@/lib/pricing';
import { useCv } from '@/lib/cv/store';
import { savedScore, useCheckQuota } from '@/lib/cv/checks';
import { EDU_NAME } from '@/lib/cv/cvProfile';
import { LEVEL_NAME } from '@/lib/cv/languages';
import { skillName } from '@/lib/cv/skills';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CvUpload } from '@/components/cv/CvUpload';
import { MatchRing } from '@/components/cv/MatchBits';
import { MatchExample, MatchLevels } from '@/components/cv/MatchShowcase';
import { ProPlanCard } from '@/components/pro/ProPlanCard';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { Faq } from '@/pages/info/InfoPage';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const PARTS: { name: string; points: number; text: string }[] = [
  { name: 'Skills', points: 40, text: 'Every skill the ad names — must-haves count in full, nice-to-haves for less. “SAP or NetSuite” needs only one.' },
  { name: 'Role fit', points: 20, text: 'Whether the roles on your CV are the same kind of job, or at least the same field.' },
  { name: 'Experience', points: 15, text: 'The years the ad asks for against the dates on your CV. Years in another field count for less.' },
  { name: 'Wording', points: 10, text: 'The words the ad leans on, and whether your CV uses them — what recruiters search for.' },
  { name: 'Languages', points: 8, text: 'Languages the ad requires and the level it asks for. A required language you don’t list holds the score at 60%.' },
  { name: 'Education', points: 7, text: 'The degree the ad asks for, and whether it accepts equivalent experience.' },
];

/** /cv-match — your CV, what MadeVisa read from it, and the jobs to check it against. */
export function CvMatchPage({ go, onAuth }: Props) {
  const { cv } = useCv();
  const quota = useCheckQuota();
  useSeo({
    title: 'CV match — see how well your CV fits a job before you apply',
    description: `Upload your CV once. On every job, MadeVisa shows a match score, the skills the ad asks for that your CV doesn’t show, and what to change. The score is free; missing skills are free on ${FREE_DAILY_CHECKS} jobs a day.`,
    path: '/cv-match',
  });

  const jobs = useMemo(
    () =>
      getRecentlyViewedJobs()
        .slice(0, 6)
        .map((v) => ({ ...v, key: uuidFromBoardId(v.id) ?? v.id })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cv],
  );
  const p = cv?.profile;
  const skills = p ? Object.entries(p.skills).sort((a, b) => b[1] - a[1]).map(([id]) => skillName(id)) : [];

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active={'cv-match' as View} />

      <section className="bg-brand-700 text-white">
        <div className={`${WRAP} grid gap-8 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-center`}>
          <div>
            <p className="flex items-center gap-2 text-[13px] font-semibold text-white/75">
              <ScanSearch className="h-4 w-4" /> CV match
            </p>
            <h1 className="mt-3 max-w-2xl text-[32px] font-bold leading-[1.1] tracking-tight sm:text-[48px]">How well does your CV match the job?</h1>
            <p className="mt-4 max-w-xl text-[16px] leading-7 text-white/85">
              Upload your CV once. Then press “Check your match” next to Apply on any job: a score in a second, the skills you’re missing, and what to change before you send it.
            </p>
          </div>
          <div>
            <CvUpload tone="light" allowRemove />
            <p className="mt-2 text-[12px] text-white/65">Free. Read on your device; only you can see it.</p>
          </div>
        </div>
      </section>

      <main className={`${WRAP} space-y-12 py-10 sm:py-12`}>
        {p && (
          <section aria-labelledby="read-title" className="rounded-2xl border border-ink-200 bg-white p-5 sm:p-6">
            <h2 id="read-title" className="text-[18px] font-bold text-ink-950">
              What we read from your CV
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-500">This is what every job is compared with. If something is wrong or missing here, it’s missing for a recruiter’s search too — fix it in the CV and upload it again.</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Fact icon={Briefcase} label="Roles" value={p.titles.length ? p.titles.slice(0, 3).join(' · ') : 'No job titles found'} warn={!p.titles.length} />
              <Fact icon={Timer} label="Experience" value={p.years != null ? `About ${Math.round(p.years)} year${Math.round(p.years) === 1 ? '' : 's'}${p.yearsFrom === 'dates' ? ', from your dates' : ''}` : 'No dates found'} warn={p.years == null} />
              <Fact icon={GraduationCap} label="Education" value={p.education ? EDU_NAME[p.education].replace(/^an? /, '') : 'Not found'} warn={!p.education} />
              <Fact icon={Languages} label="Languages" value={p.languages.length ? p.languages.map((l) => `${l.name}${l.level ? ` ${LEVEL_NAME[l.level]}` : ''}`).join(' · ') : 'None listed'} warn={!p.languages.length} />
            </dl>
            <p className="mt-4 text-[13px] font-semibold text-ink-800">
              {skills.length} skill{skills.length === 1 ? '' : 's'} found
            </p>
            {skills.length > 0 ? (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {skills.slice(0, 40).map((s) => (
                  <li key={s} className="rounded-full bg-ink-100 px-2.5 py-1 text-[12.5px] font-medium text-ink-700">
                    {s}
                  </li>
                ))}
                {skills.length > 40 && <li className="px-1 py-1 text-[12.5px] text-ink-500">+{skills.length - 40} more</li>}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] text-amber-700">We didn’t recognise any skills. Add a Skills section that names your tools and methods.</p>
            )}
          </section>
        )}

        <section aria-labelledby="jobs-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="jobs-title" className="text-[18px] font-bold text-ink-950">
              {jobs.length ? 'Check the jobs you opened' : 'Pick a job to check'}
            </h2>
            {quota && !quota.pro && (
              <p className="text-[13px] text-ink-500">
                Missing skills: <strong className="text-ink-900">{quota.left}</strong> of {FREE_DAILY_CHECKS} free jobs left today
              </p>
            )}
          </div>
          {jobs.length === 0 ? (
            <div className="mt-3 flex flex-col items-start gap-3 rounded-xl border border-dashed border-ink-300 bg-white p-5 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-[14px] text-ink-600">Open any job and press “Check your match” next to Apply.</p>
              <button onClick={() => nav('/jobs')} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-[14px] font-bold text-white hover:bg-brand-700">
                Browse jobs <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-ink-100 overflow-hidden rounded-xl bg-white ring-1 ring-ink-200">
              {jobs.map((j) => {
                const href = `${jobPath({ id: j.id, title: j.title, company: j.organization })}#cv-match`;
                const score = savedScore(cv, j.key);
                return (
                  <li key={j.id}>
                    <a
                      href={href}
                      onClick={(e) => {
                        e.preventDefault();
                        nav(href);
                      }}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-ink-50"
                    >
                      <CircleFlag countryCode={j.countryCode} label={j.country} size={24} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink-900">{j.title}</span>
                        <span className="block truncate text-[12px] text-ink-500">
                          {j.organization}
                          {j.country ? `, ${j.country}` : ''}
                        </span>
                      </span>
                      {score != null ? (
                        <MatchRing score={score} size={40} />
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold text-brand-700 ring-1 ring-brand-200">
                          <ScanSearch className="h-4 w-4" /> Check
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="how-title" className="grid gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-start">
          <div>
            <h2 id="how-title" className="text-[22px] font-bold tracking-tight text-ink-950">
              Where the score comes from
            </h2>
            <p className="mt-1 text-[14px] leading-6 text-ink-600">
              The same six checks on every job, 100 points in all. A part the ad doesn’t ask about is left out, and the rest share its points. No AI guesswork, and nothing about your age, gender, nationality or photo.
            </p>
            <ol className="mt-4 space-y-2.5">
              {PARTS.map((part) => (
                <li key={part.name} className="flex gap-3 rounded-xl bg-white p-3.5 ring-1 ring-ink-200">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-[13px] font-bold tabular-nums text-brand-700">{part.points}</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-bold text-ink-950">{part.name}</span>
                    <span className="block text-[13px] leading-5 text-ink-600">{part.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-4">
            <MatchExample />
          </div>
        </section>

        <section aria-labelledby="levels-title">
          <h2 id="levels-title" className="text-[22px] font-bold tracking-tight text-ink-950">
            What’s free, and what’s in the plan
          </h2>
          <MatchLevels className="mt-4" />
          <div className="mt-6 max-w-2xl">
            <ProPlanCard onAuth={onAuth} compact />
          </div>
        </section>

        <section className="mx-auto max-w-3xl">
          <h2 className="text-[22px] font-bold tracking-tight text-ink-950">Questions</h2>
          <div className="mt-4">
            <Faq
              items={[
                { q: 'Which files can I upload?', a: 'PDF or Word (.docx), up to 5 MB. Plain text and .odt work too. A scanned CV — a picture of a page — has no text to read, so export it from Word or Google Docs instead, or paste the text.' },
                { q: 'Who sees my CV?', a: 'Only you. It is read in your browser and kept with your account. MadeVisa doesn’t send it to employers; you apply on the employer’s own site with your own file. You can replace or delete it at any time.' },
                { q: 'My score is low but I can do the job. Why?', a: 'The score reads the CV, not you. If the ad asks for a skill and your CV doesn’t name it, it counts as missing — which is also how a recruiter’s search and screening software see it. Add what is true, in the ad’s own words, and check again.' },
                { q: 'Does a high score mean I’ll get an interview?', a: 'No. It means your CV says what the ad asks for. Employers also weigh things no CV check can see — and, abroad, whether they can sponsor a visa, which is what the sponsorship document is for.' },
                { q: 'Does it work for jobs that aren’t in English?', a: 'Yes for skills, role, years and education. When the ad and your CV are in different languages, wording isn’t compared, and the ad’s language counts as a requirement.' },
              ]}
            />
          </div>
        </section>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function Fact({ icon: Icon, label, value, warn = false }: { icon: typeof Briefcase; label: string; value: string; warn?: boolean }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-lg p-3 ${warn ? 'bg-amber-50' : 'bg-ink-50'}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${warn ? 'text-amber-600' : 'text-ink-400'}`} />
      <div className="min-w-0">
        <dt className="text-[11px] text-ink-500">{label}</dt>
        <dd className={`break-words text-[13.5px] font-semibold ${warn ? 'text-amber-800' : 'text-ink-800'}`}>{value}</dd>
      </div>
    </div>
  );
}
