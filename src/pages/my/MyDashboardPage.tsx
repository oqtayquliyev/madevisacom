import { useEffect, useState } from 'react';
import { ArrowRight, BellOff, Briefcase, CheckCircle2, Crown, FileText, Globe2, Loader2, Plane, Send, Sparkles, Target, Zap } from 'lucide-react';
import type { View } from '@/types';
import { supabase } from '@/lib/supabase';
import { useSeo } from '@/lib/seo';
import { WRAP, nav } from '@/lib/pageLayout';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CareerOutlook } from '@/components/book/BookPromo';

// /my?t=<token> — the dashboard linked from every campaign and series email.
// Works without signing in (the token in the link is the key). Shows counts only:
// live jobs, and for an account its CV, matches, applications and membership.
// Server side: email_dashboard(token), migration 20261216090000.

type Dash = {
  email: string;
  name: string | null;
  subscribed: boolean;
  jobs: { live: number; today: number; visa: number; country: string | null; in_country: number | null };
  account: boolean;
  cv: { uploaded: boolean; at: string; titles: string | null } | null;
  matches: number | null;
  applications: { by_madevisa: number; by_you: number; in_queue: number } | null;
  auto_apply: { status: 'active' | 'paused' | 'stopped' | 'ended'; ends_at: string } | null;
  plan: { name: string; pro: boolean; until?: string | null } | null;
};

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };
const nf = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');
const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : '');

export function MyDashboardPage({ go, onAuth }: Props) {
  useSeo({ title: 'Your MadeVisa dashboard', description: 'Your jobs, matches and applications on MadeVisa.', path: '/my', noindex: true });
  const [token] = useState(() => new URLSearchParams(window.location.search).get('t') ?? '');
  const [d, setD] = useState<Dash | null | undefined>(undefined);

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(token)) return setD(null);
    supabase.rpc('email_dashboard', { p_token: token }).then(({ data, error }) => setD(error || !data ? null : (data as Dash)));
  }, [token]);

  const link = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    nav(href);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="home" />
      <section className="bg-brand-700 text-white">
        <div className={`${WRAP} py-8 sm:py-10`}>
          <p className="text-[13px] font-semibold text-white/75">Your MadeVisa dashboard</p>
          <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-tight sm:text-[34px]">{d?.name ? `Hi ${d.name} 👋` : 'Hi there 👋'}</h1>
          {d && <p className="mt-1 text-[14px] text-white/80">{d.email}</p>}
        </div>
      </section>

      <main className={`${WRAP} -mt-5 space-y-5 pb-12`}>
        <CareerOutlook placement="dashboard" compact />
        {d === undefined ? (
          <div className="flex justify-center rounded-2xl bg-white py-16 ring-1 ring-ink-200">
            <Loader2 className="h-6 w-6 animate-spin text-ink-300" />
          </div>
        ) : d === null ? (
          <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-ink-200">
            <h2 className="text-[18px] font-bold text-ink-950">This link doesn’t work</h2>
            <p className="mt-1 text-[14px] text-ink-600">Open the dashboard from the latest MadeVisa email, or sign in to see your profile.</p>
            <div className="mt-4 flex justify-center gap-2">
              <a href="/profile" onClick={link('/profile')} className="rounded-full bg-brand-600 px-5 py-2.5 text-[14px] font-bold text-white hover:bg-brand-700">
                Go to my profile
              </a>
              <a href="/jobs" onClick={link('/jobs')} className="rounded-full px-5 py-2.5 text-[14px] font-bold text-ink-800 ring-1 ring-ink-200 hover:bg-ink-50">
                Browse jobs
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* Jobs on MadeVisa right now */}
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile icon={Globe2} label="Live jobs" value={nf(d.jobs.live)} tone="blue" />
              <Tile icon={Sparkles} label="New in 24 hours" value={nf(d.jobs.today)} tone="green" />
              <Tile icon={Plane} label="With visa sponsorship" value={nf(d.jobs.visa)} tone="amber" />
              {d.jobs.country ? <Tile icon={Briefcase} label={`In ${d.jobs.country}`} value={nf(d.jobs.in_country)} tone="ink" /> : d.matches != null ? <Tile icon={Target} label="Match your CV" value={nf(d.matches)} tone="ink" /> : <Tile icon={Briefcase} label="From company career pages" value="✓" tone="ink" />}
            </section>

            {!d.account ? (
              <section className="rounded-2xl bg-white p-5 ring-1 ring-ink-200 sm:p-7">
                <h2 className="text-[20px] font-bold tracking-tight text-ink-950">See which of these jobs you match 🎯</h2>
                <ol className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    { icon: FileText, t: 'Upload your CV', s: 'PDF or Word — about 10 seconds.' },
                    { icon: Target, t: 'Get your matches', s: 'Your best jobs first, with your score on each.' },
                    { icon: Zap, t: 'Apply', s: 'Members apply to any job, straight on the employer’s page.' },
                  ].map((x, i) => (
                    <li key={x.t} className="rounded-xl bg-ink-50 p-4">
                      <span className="flex items-center gap-2 text-[12px] font-bold text-brand-700">
                        <x.icon className="h-4 w-4" /> Step {i + 1}
                      </span>
                      <p className="mt-2 text-[15px] font-bold text-ink-950">{x.t}</p>
                      <p className="mt-0.5 text-[13px] text-ink-600">{x.s}</p>
                    </li>
                  ))}
                </ol>
                <div className="mt-5 flex flex-wrap gap-2">
                  <a href="/cv-match?s=my" onClick={link('/cv-match?s=my')} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-5 py-3 text-[14px] font-bold text-white hover:bg-brand-700">
                    Upload my CV <ArrowRight className="h-4 w-4" />
                  </a>
                  <button onClick={() => onAuth?.('register')} className="rounded-full px-5 py-3 text-[14px] font-bold text-ink-800 ring-1 ring-ink-200 hover:bg-ink-50">
                    Create a free account
                  </button>
                </div>
              </section>
            ) : (
              <section className="grid gap-4 lg:grid-cols-3">
                <Card title="Your CV" icon={FileText}>
                  {d.cv ? (
                    <>
                      <p className="flex items-center gap-1.5 text-[15px] font-semibold text-ink-950">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Uploaded
                      </p>
                      <p className="mt-0.5 text-[13px] text-ink-500">
                        {d.cv.titles ? `${d.cv.titles} · ` : ''}updated {date(d.cv.at)}
                      </p>
                      <p className="mt-3 text-[28px] font-bold tabular-nums text-ink-950">{nf(d.matches)}</p>
                      <p className="text-[13px] text-ink-600">live jobs with titles like yours</p>
                      <CardLink href="/cv-match?s=my" onClick={link('/cv-match?s=my')}>See my matches</CardLink>
                    </>
                  ) : (
                    <>
                      <p className="text-[15px] font-semibold text-ink-950">Not uploaded yet</p>
                      <p className="mt-0.5 text-[13px] text-ink-600">Upload it once to see the jobs you match best.</p>
                      <CardLink href="/cv-match?s=my" onClick={link('/cv-match?s=my')}>Upload my CV</CardLink>
                    </>
                  )}
                </Card>

                <Card title="Applications" icon={Send}>
                  <p className="text-[22px] font-bold text-ink-950">{nf(d.applications?.by_you)}</p>
                  <p className="mt-0.5 text-[13px] text-ink-600">Jobs you applied to from MadeVisa.</p>
                  <CardLink href="/jobs?s=my" onClick={link('/jobs?s=my')}>Find more jobs</CardLink>
                </Card>

                <Card title="Membership" icon={Crown}>
                  <p className="text-[22px] font-bold text-ink-950">{d.plan?.name ?? 'Free'}</p>
                  <p className="mt-0.5 text-[13px] text-ink-600">{d.plan?.pro ? (d.plan.until ? `Active until ${date(d.plan.until)}` : 'Active') : 'Apply to every job, with CV match and sponsorship documents, — $12.50 once, for good.'}</p>
                  <CardLink href={d.plan?.pro ? '/profile?tab=settings#billing' : '/pricing?s=my'} onClick={link(d.plan?.pro ? '/profile?tab=settings#billing' : '/pricing?s=my')}>{d.plan?.pro ? 'Manage membership' : 'Become a member'}</CardLink>
                </Card>
              </section>
            )}

            <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-500">
              <BellOff className="h-4 w-4" />
              {d.subscribed ? (
                <>
                  Too many emails?{' '}
                  <a href={`/alerts/unsubscribe?k=all&t=${token}`} className="font-semibold text-ink-700 underline underline-offset-2">
                    Unsubscribe from MadeVisa news
                  </a>
                  {d.account && (
                    <>
                      {' '}or{' '}
                      <a href="/profile?tab=settings#emails" onClick={link('/profile?tab=settings#emails')} className="font-semibold text-ink-700 underline underline-offset-2">
                        choose which emails you get
                      </a>
                    </>
                  )}
                  .
                </>
              ) : (
                'You’re unsubscribed from MadeVisa news.'
              )}
            </p>
          </>
        )}
      </main>
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

const TONE = { blue: 'text-brand-700 bg-brand-50', green: 'text-emerald-700 bg-emerald-50', amber: 'text-amber-700 bg-amber-50', ink: 'text-ink-700 bg-ink-100' } as const;

function Tile({ icon: Icon, label, value, tone }: { icon: typeof Globe2; label: string; value: string; tone: keyof typeof TONE }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-ink-200">
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${TONE[tone]}`}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <p className="mt-3 text-[26px] font-bold tabular-nums leading-none text-ink-950">{value}</p>
      <p className="mt-1 truncate text-[13px] text-ink-600">{label}</p>
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Globe2; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl bg-white p-5 ring-1 ring-ink-200">
      <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink-500">
        <Icon className="h-4 w-4" /> {title}
      </p>
      {children}
    </div>
  );
}

function CardLink({ href, onClick, children }: { href: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <a href={href} onClick={onClick} className="mt-auto inline-flex items-center gap-1 pt-4 text-[14px] font-bold text-brand-700 hover:underline">
      {children} <ArrowRight className="h-4 w-4" />
    </a>
  );
}
