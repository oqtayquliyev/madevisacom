import { useEffect, useState } from 'react';
import { ArrowRight, Briefcase, ChevronDown, FileSearch, GraduationCap, Languages, ListChecks, ScanSearch, Timer, Upload } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { WRAP, nav } from '@/lib/pageLayout';
import { FREE_DAILY_CHECKS } from '@/lib/pricing';
import { useTopMatches } from '@/lib/cv/topMatches';
import { EDU_NAME } from '@/lib/cv/cvProfile';
import { LEVEL_NAME } from '@/lib/cv/languages';
import { skillName } from '@/lib/cv/skills';
import { CvUpload } from '@/components/cv/CvUpload';
import { MatchLevels } from '@/components/cv/MatchShowcase';
import { ENCOURAGEMENT, GUEST_VISIBLE, SearchProgress, TopMatchesList } from '@/components/cv/TopMatches';
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

const STEPS: { icon: typeof Upload; title: string; text: string }[] = [
  { icon: Upload, title: 'Upload your CV', text: 'PDF or Word. It is read on your device and never sent to employers.' },
  { icon: FileSearch, title: 'We compare it with live jobs', text: 'The ads closest to your experience are read and scored, one by one.' },
  { icon: ListChecks, title: 'Open your best matches', text: 'Highest score first. Each job shows what your CV is missing for it.' },
];

/** The search is quick; the waiting screen stays this long so it can be read. */
const MIN_WAIT_MS = 2600;

/** A closed section that opens on a click — keeps the page short. */
function More({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-2xl bg-white ring-1 ring-ink-200">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-[15px] font-bold text-ink-950 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-400 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-ink-100 px-5 py-5">{children}</div>
    </details>
  );
}

/** /cv-match — upload a CV, see the jobs it matches most. */
export function CvMatchPage({ go, onAuth }: Props) {
  const top = useTopMatches({ auto: true });
  const { cv, cvReady, status, result } = top;
  useSeo({
    title: 'CV match — upload your CV and see the jobs you match most',
    description: `Upload your CV and MadeVisa shows the live jobs it matches best, highest score first — and, on each job, the skills the ad asks for that your CV doesn’t show. The score is free; missing skills are free on ${FREE_DAILY_CHECKS} jobs a day.`,
    path: '/cv-match',
  });

  // Keep the waiting screen up for a moment even when the search is instant.
  const [until, setUntil] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (status === 'running') setUntil(Date.now() + MIN_WAIT_MS);
  }, [status]);
  useEffect(() => {
    const left = until - Date.now();
    if (left <= 0) return;
    const t = window.setTimeout(() => tick((n) => n + 1), left + 30);
    return () => window.clearTimeout(t);
  }, [until]);
  const searching = Boolean(cv) && (status === 'running' || (status === 'done' && Date.now() < until));

  const p = cv?.profile;
  const skills = p ? Object.entries(p.skills).sort((a, b) => b[1] - a[1]).map(([id]) => skillName(id)) : [];

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active={'cv-match' as View} />

      <section className="bg-brand-700 text-white">
        <div className={`${WRAP} py-10 text-center sm:py-14`}>
          <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-white/75">
            <ScanSearch className="h-4 w-4" /> CV match
          </p>
          <h1 className="mx-auto mt-3 max-w-3xl text-[30px] font-bold leading-[1.1] tracking-tight sm:text-[46px]">{cv ? 'The jobs you match most' : 'Upload your CV. See the jobs you match most.'}</h1>
          {!cv && <p className="mx-auto mt-4 max-w-xl text-[16px] leading-7 text-white/85">We compare it with the live jobs on MadeVisa and put your best matches first. Free, and it takes a few seconds.</p>}
          <div className="mx-auto mt-6 max-w-xl text-left">
            <CvUpload tone="light" allowRemove />
          </div>
          <p className="mt-2 text-[12px] text-white/65">Free. Read on your device; never sent to employers.</p>
        </div>
      </section>

      <main className={`${WRAP} space-y-10 py-10 sm:py-12`}>
        {!cv && cvReady && (
          <>
            <ol className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl bg-white p-5 ring-1 ring-ink-200">
                  <span className="flex items-center gap-2 text-[12px] font-bold text-brand-700">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-50">
                      <s.icon className="h-3.5 w-3.5" />
                    </span>
                    Step {i + 1}
                  </span>
                  <p className="mt-3 text-[15px] font-bold text-ink-950">{s.title}</p>
                  <p className="mt-1 text-[13px] leading-5 text-ink-600">{s.text}</p>
                </li>
              ))}
            </ol>
            <p className="mx-auto max-w-xl text-center text-[15px] font-medium leading-6 text-ink-700">“{ENCOURAGEMENT[0]}”</p>
          </>
        )}

        {searching && <SearchProgress state={status === 'running' ? top : { stage: 'scoring', progress: 1 }} />}

        {cv && !searching && status === 'error' && (
          <section className="mx-auto max-w-2xl rounded-3xl bg-white px-6 py-8 text-center ring-1 ring-ink-200">
            <h2 className="text-[18px] font-bold text-ink-950">The search didn’t finish</h2>
            <p className="mt-1 text-[14px] text-ink-600">{top.error ?? 'Something went wrong.'} Your CV is still here.</p>
            <button onClick={top.start} className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-[14px] font-bold text-white hover:bg-brand-700">
              Try again
            </button>
          </section>
        )}

        {cv && !searching && result && <TopMatchesList result={result} onAuth={onAuth} onAgain={top.start} />}

        {cv && !searching && result && result.items.length > 0 && (
          <p className="text-center">
            <button onClick={() => nav('/jobs')} className="inline-flex items-center gap-2 text-[14px] font-bold text-brand-700 hover:underline">
              Browse all jobs <ArrowRight className="h-4 w-4" />
            </button>
          </p>
        )}

        <div className="mx-auto max-w-3xl space-y-3">
          {p && (
            <More title="What we read from your CV">
              <p className="text-[13px] leading-5 text-ink-500">This is what every job is compared with. If something is wrong or missing here, it’s missing for a recruiter’s search too — fix it in the CV and upload it again.</p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
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
            </More>
          )}

          <More title="How the score works">
            <p className="text-[14px] leading-6 text-ink-600">The same six checks on every job, 100 points in all. A part the ad doesn’t ask about is left out, and the rest share its points. No AI guesswork, and nothing about your age, gender, nationality or photo.</p>
            <ol className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {PARTS.map((part) => (
                <li key={part.name} className="flex gap-3 rounded-xl bg-ink-50 p-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[13px] font-bold tabular-nums text-brand-700 ring-1 ring-ink-200">{part.points}</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-bold text-ink-950">{part.name}</span>
                    <span className="block text-[13px] leading-5 text-ink-600">{part.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </More>

          <More title="What’s free, and what’s in the plan">
            <p className="text-[14px] leading-6 text-ink-600">
              Without an account you see your best {GUEST_VISIBLE} matches and the score on any job. A free account shows every match and, on {FREE_DAILY_CHECKS} jobs a day, the skills your CV is missing. MadeVisa Pro adds the full report on every job and 50 sponsorship documents a month.
            </p>
            <MatchLevels className="mt-4" />
            <div className="mt-5 max-w-2xl">
              <ProPlanCard onAuth={onAuth} compact />
            </div>
          </More>
        </div>

        <section className="mx-auto max-w-3xl">
          <h2 className="text-[20px] font-bold tracking-tight text-ink-950">Questions</h2>
          <div className="mt-4">
            <Faq
              items={[
                { q: 'Which files can I upload?', a: 'PDF or Word (.docx), up to 5 MB. Plain text and .odt work too. A scanned CV — a picture of a page — has no text to read, so export it from Word or Google Docs instead, or paste the text.' },
                { q: 'Who sees my CV?', a: 'You, and MadeVisa staff when they need it to run or support the service — for example to fix a problem with your account or to improve how CVs are read. It is never sent or shown to employers: you apply on the employer’s own site, with your own file. Until you create an account your CV stays in your browser. You can replace or delete it at any time.' },
                { q: 'My score is low but I can do the job. Why?', a: 'The score reads the CV, not you. If the ad asks for a skill and your CV doesn’t name it, it counts as missing — which is also how a recruiter’s search and screening software see it. Add what is true, in the ad’s own words, and check again.' },
                { q: 'Does a high score mean I’ll get an interview?', a: 'No. It means your CV says what the ad asks for. Employers also weigh things no CV check can see — and, abroad, whether they can sponsor a visa, which is what the sponsorship document is for.' },
                { q: 'Does it work for jobs or CVs that aren’t in English?', a: 'Yes. An ad written in another language is compared in an English translation when one is available, and a CV in another language is translated once you have an account (translation is done by a machine translation service). Without a translation, skills, role, years and education are still compared and wording is left out. A language the ad requires and your CV doesn’t list holds the score down.' },
                { q: 'How do you choose the jobs you show me?', a: 'From your CV we take your job titles, the kind of roles they are and your main skills, and look for live jobs whose title contains those words. We then read the ads of the closest ones — about 50 — and score each against your CV with the same rules as on a job page. So the list is your best matches among jobs with titles like yours, not a score for every job on the site. It is kept for 24 hours.' },
                { q: 'Nobody matches 100%, do they?', a: 'Hardly anyone. An ad lists everything an employer would like; people are hired without ticking every box. Read a score as “how much of what this ad asks for does my CV show” — 80% is a strong match, and the missing part tells you what to add to the CV if you have it, or what to address when you apply.' },
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
