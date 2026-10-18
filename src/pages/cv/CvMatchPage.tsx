import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Briefcase, ChevronDown, FileSearch, GraduationCap, Languages, ListChecks, ScanSearch, Timer, Upload } from 'lucide-react';
import type { View } from '@/types';
import { noteMilestone } from '@/lib/emailAttribution';
import { useSeo } from '@/lib/seo';
import { SEO_META } from '@/lib/seoMeta';
import { useSiteStats } from '@/lib/siteStats';
import { WRAP, nav } from '@/lib/pageLayout';
import { useTopMatches } from '@/lib/cv/topMatches';
import { EDU_NAME } from '@/lib/cv/cvProfile';
import { LEVEL_NAME } from '@/lib/cv/languages';
import { skillName } from '@/lib/cv/skills';
import { CvUpload } from '@/components/cv/CvUpload';
import { MatchLevels } from '@/components/cv/MatchShowcase';
import { ENCOURAGEMENT, SearchProgress, TopMatchesList } from '@/components/cv/TopMatches';
import { ProPlanCard } from '@/components/pro/ProPlanCard';
import { CvInsights, CvPersonCard, nameFromCv } from '@/components/cv/CvInsights';
import { useFromCountry } from '@/components/cv/DocReady';
import { cvScore, fixCount } from '@/lib/cv/cvScore';
import { CvScoreCard } from '@/components/cv/CvScoreCard';
import { CvQuiz } from '@/components/cv/CvQuiz';
import { ApplyDetailsForm } from '@/components/cv/ApplyDetailsForm';
import { ExampleJourney } from '@/components/cv/ExampleJourney';
import { CircleFlag } from '@/components/common/CircleFlag';
import { countryName as countryNameOf } from '@/lib/visaFit';
import { useAuth } from '@/lib/auth';
import { useMyPlan } from '@/lib/plans';
import { usePersonalization } from '@/lib/personalization';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { Faq } from '@/pages/info/InfoPage';
import { TestimonialsSection } from '@/components/common/Testimonials';
import { PRO_TESTIMONIALS } from '@/data/testimonials';

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
  { icon: Upload, title: 'Upload your CV', text: 'PDF or Word. It is read on your device, and goes to an employer only when you ask.' },
  { icon: FileSearch, title: 'We compare it with live jobs', text: 'The ads closest to your experience are read and scored, one by one.' },
  { icon: ListChecks, title: 'Open your best matches', text: 'Highest score first: where each job is, what it pays if the ad says, whether you need a visa — and what your CV is missing.' },
];

/** The search is quick; the waiting screen stays this long so the roles it found can be read one by one. */
const MIN_WAIT_MS = 5200;

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
  const site = useSiteStats();
  const { session, profile, loading: authLoading } = useAuth();
  // Leaving the quiz (signed up, or back from checkout): re-render on the plain /cv-match.
  const [, setLeft] = useState(0);
  const my = useMyPlan();
  const { profile: visitor } = usePersonalization();
  // CV match is part of Starter and Pro.
  const paid = my.isPaid;
  // Seen the matches (or the free preview): for the lifecycle emails.
  const searchingNow = status === 'running';
  useEffect(() => {
    if (cv && result && !searchingNow && session) noteMilestone('cv_match_viewed');
    // The ranked list of all matches is a paid feature (refund terms).
    if (cv && result && !searchingNow && paid) noteMilestone('paid_feature_used');
  }, [cv, result, searchingNow, session, paid]);
  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] ?? '';
  useSeo({
    title: SEO_META.cvMatch.title,
    description: 'Upload your CV and MadeVisa shows the live jobs it matches best, highest score first — and, on each job, the skills the ad asks for that your CV doesn’t show. Part of MadeVisa Starter and Pro.',
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

  // The final result, in the page header: the CV score and three counts from this person's own matches.
  const who = firstName || (cv ? (nameFromCv(cv.text) ?? '').split(/\s+/)[0] : '') || '';
  const from = useFromCountry();
  const summary = useMemo(() => {
    if (!cv || !result || searching || status === 'error' || !result.items.length) return null;
    const sc = cvScore(cv.profile, result.items);
    const docs = result.items.filter((m) => m.cc && (!from || m.cc.toUpperCase() !== from)).length;
    return { score: sc.score, jobs: result.items.length, docs, fixes: fixCount(sc) };
  }, [cv, result, searching, status, from]);


  // Results in front of someone not on a plan yet: keep the page on the one next step (no extra small print).
  const focus = Boolean(cv && result && !searching && !paid && status !== 'error');

  const p = cv?.profile;
  const skills = p ? Object.entries(p.skills).sort((a, b) => b[1] - a[1]).map(([id]) => skillName(id)) : [];

  // No account yet: the page is a 3-step quiz — no menu, no footer, one thing per screen.
  // Once signed up (free or a plan) it is the full CV match: every job, its visa route, what the CV is missing,
  // and the sponsorship document. The quiz stays for its last two screens: the email, then the choice of plan (Free → here, Starter / Pro → checkout).
  const quizStep = new URLSearchParams(window.location.search).get('step');
  const inQuiz = !paid && (!session || quizStep === 'email' || quizStep === 'choose');
  // Signing in re-reads the CV for the account (cvReady goes false for a moment): wait on a blank page,
  // never on the full page — it would drop the quiz step and skip the plan choice.
  if (authLoading || (inQuiz && !cvReady)) return <div className="min-h-screen bg-[#f8fafc]" />;
  if (inQuiz) {
    return (
      <CvQuiz
        top={top}
        searching={searching}
        cv={cv}
        onExit={() => {
          window.history.replaceState({}, '', '/cv-match');
          window.scrollTo({ top: 0 });
          setLeft((n) => n + 1);
        }}
      />
    );
  }
  // Back on a signed-in visit with an old quiz link: the plain address.
  if (quizStep && cvReady) window.history.replaceState({}, '', '/cv-match');

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active={'cv-match' as View} />

      <section className="bg-brand-700 text-white">
        <div className={`${WRAP} py-10 text-center sm:py-14`}>
          <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-white/75">
            <ScanSearch className="h-4 w-4" /> CV match
          </p>
          <h1 className="mx-auto mt-3 max-w-3xl text-[30px] font-bold leading-[1.1] tracking-tight sm:text-[46px]">
            {summary
              ? <>{who ? `${who}, your` : 'Your'} CV scores <span className="text-amber-300">{summary.score}</span> out of 100</>
              : cv
                ? `${who ? `${who}, here` : 'Here'} are the jobs you match most`
                : 'Your next job could take you somewhere new.'}
          </h1>
          {!cv && (
            <p className="mx-auto mt-3 max-w-xl text-[16px] font-medium text-white/90 sm:text-[18px]">
              Upload your CV / Resume —{' '}
              {site?.publishedJobs ? (
                <>
                  <span className="text-[20px] font-extrabold tabular-nums text-amber-300 sm:text-[22px]">{site.publishedJobs.toLocaleString('en-US')}</span> sponsored job opportunities abroad for you
                </>
              ) : (
                'sponsored job opportunities abroad for you'
              )}
            </p>
          )}
          {!cv && visitor.currentLocation && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[13px] font-semibold text-white/90">
              <CircleFlag countryCode={visitor.currentLocation} size={16} label={countryNameOf(visitor.currentLocation) ?? undefined} /> From {countryNameOf(visitor.currentLocation)}
            </p>
          )}
          {cv && (
            <div className="mt-6">
              <CvPersonCard cv={cv} person={{ fullName: profile?.full_name, occupation: profile?.occupation, countryCode: visitor.currentLocation ?? null }} />
            </div>
          )}
          {cv ? (
            <>
              <div className="mx-auto mt-4 max-w-xl text-left">
                <CvUpload tone="light" allowRemove />
              </div>
              {!focus && <p className="mt-2 text-[12px] text-white/65">Read on your device; sent to an employer only when you ask.</p>}
            </>
          ) : (
            // No CV yet: the upload in a white box — the one thing to do on this page.
            <div className="mx-auto mt-6 max-w-xl rounded-3xl bg-white p-5 text-left text-ink-900 shadow-soft sm:p-6">
              <CvUpload allowRemove />
              <p className="mt-2 text-[12px] text-ink-500">Read on your device; sent to an employer only when you ask.</p>
            </div>
          )}
          {/* Members from the visitor's own country, as high on the page as the upload allows. */}
          {!cv && cvReady && <ExampleJourney rotate className="mx-auto mt-6 max-w-4xl" />}
        </div>
      </section>

      <main className={`${WRAP} space-y-10 py-10 sm:py-12`}>
        {/* Signed in: the details Auto Apply and the documents need, asked once, saved to the profile. */}
        {session && cv && !searching && <ApplyDetailsForm cv={cv} paid={paid} />}
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

        {searching && <SearchProgress state={status === 'running' ? top : { stage: 'scoring', progress: 1, live: top.live }} cv={cv} name={profile?.full_name} />}

        {cv && !searching && status === 'error' && (
          <section className="mx-auto max-w-2xl rounded-3xl bg-white px-6 py-8 text-center ring-1 ring-ink-200">
            <h2 className="text-[18px] font-bold text-ink-950">The search didn’t finish</h2>
            <p className="mt-1 text-[14px] text-ink-600">{top.error ?? 'Something went wrong.'} Your CV is still here.</p>
            <button onClick={top.start} className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-[14px] font-bold text-white hover:bg-brand-700">
              Try again
            </button>
          </section>
        )}

        {/* Starter and Pro: the matches and the charts. Everyone else: the count, and what unlocks it. */}
        {/* No account yet: the results wait behind one email field and a code (which also makes the free account). */}

        {/* Signed in, free or on a plan: every match, each opening in a new tab. */}
        {cv && !searching && session && !my.loading && result && <TopMatchesList result={result} onAuth={onAuth} onAgain={top.start} />}

        {cv && !searching && paid && result && result.items.length > 0 && <CvInsights result={result} />}

        {cv && !searching && paid && result && result.items.length > 0 && (
          <p className="text-center">
            <button onClick={() => nav('/jobs')} className="inline-flex items-center gap-2 text-[14px] font-bold text-brand-700 hover:underline">
              Browse all jobs <ArrowRight className="h-4 w-4" />
            </button>
          </p>
        )}

        {/* The end of the results: one score for the whole CV, and what to add. */}
        {cv && !searching && result && result.items.length > 0 && status !== 'error' && (!session || !my.loading) && <CvScoreCard cv={cv} result={result} locked={!session} />}

        <div className="mx-auto max-w-3xl space-y-3">
          {p && paid && (
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

          {!focus && (
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

          )}

          {!focus && (
          <More title="What’s free, and what’s in the plan">
            <p className="text-[14px] leading-6 text-ink-600">
              CV match is part of Starter and Pro: your score on every job, the skills your CV is missing, the experience employers also want, the full report and all your matches. Sponsorship documents each month: Free 1, Starter 20, Pro 50.
            </p>
            <MatchLevels className="mt-4" />
            <div className="mt-5 max-w-2xl">
              <ProPlanCard plan="starter" source="cv_match_page" onAuth={onAuth} compact />
            </div>
          </More>
          )}
        </div>

        {!searching && !focus && (
          <TestimonialsSection
            id="cv-match-feedback"
            eyebrow="From MadeVisa Pro members"
            items={PRO_TESTIMONIALS}
            title="What Pro and CV match did for them."
            sub={`${PRO_TESTIMONIALS.length} Pro members, all 5 stars`}
            className="pt-2"
          />
        )}

        <section className="mx-auto max-w-3xl">
          <h2 className="text-[20px] font-bold tracking-tight text-ink-950">Questions</h2>
          <div className="mt-4">
            <Faq
              items={[
                { q: 'Which files can I upload?', a: 'PDF or Word (.docx), up to 5 MB. Plain text and .odt work too. A scanned CV — a picture of a page — has no text to read, so export it from Word or Google Docs instead, or paste the text.' },
                { q: 'Who sees my CV?', a: 'You, and MadeVisa staff when they need it to run or support the service — for example to fix a problem with your account or to improve how CVs are read. It goes to an employer only when you ask MadeVisa to apply to that employer’s job for you. Until you create an account your CV stays in your browser. You can replace or delete it at any time.' },
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
