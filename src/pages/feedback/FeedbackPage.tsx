import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  ChevronDown,
  Copy,
  Lock,
  Mail,
  MessageSquarePlus,
  Scale,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { SEO_META } from '@/lib/seoMeta';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { SharePromo } from '@/components/companies/SharePromo';
import { ShareExperienceDialog } from '@/components/companies/ShareExperienceDialog';
import { FeedbackCompaniesRow } from '@/components/companies/FeedbackCompaniesRow';
import { SoftCard, SoftPanel } from '@/components/charts/SoftCharts';
import { companyPath, fetchCompaniesDirectory, fetchCompanyBySlug, type CompanyProfile, type DirectoryCompany } from '@/lib/companies';
import {
  EXPERIENCE_OUTCOMES,
  feedbackPath,
  FEEDBACK_MIN_PEOPLE,
  FEEDBACK_MIN_REPORTS,
  fetchExperienceSummary,
  fetchFeedbackCompanyStats,
  scoreWord,
  type ExperienceOutcome,
  type ExperienceSummary,
  type FeedbackStat,
} from '@/lib/companyExperiences';

type Props = { slug?: string; go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const WRAP = 'mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10';
const SITE = 'https://www.madevisa.com';

function nav(href: string) {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

/**
 * /feedback — Hiring Feedback. Applicants share how an application went;
 * companies, HR teams, career centres and communities share the link.
 * /feedback/<company> is a company's own link: the company is pre-filled.
 */
export function FeedbackPage({ slug, go, onAuth }: Props) {
  const [rows, setRows] = useState<DirectoryCompany[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [company, setCompany] = useState<CompanyProfile | null | undefined>(slug ? undefined : null);
  const [summary, setSummary] = useState<ExperienceSummary | null>(null);
  const [dialog, setDialog] = useState<{ pick: { id?: string | null; name: string; logo_url?: string | null } | null; outcome?: ExperienceOutcome | null } | null>(null);

  const [stats, setStats] = useState<Record<string, FeedbackStat>>({});
  useEffect(() => {
    fetchCompaniesDirectory().then((r) => setRows(r ?? []));
  }, []);
  useEffect(() => {
    fetchFeedbackCompanyStats().then(setStats);
  }, [refreshKey]);
  useEffect(() => {
    if (!slug) return setCompany(null);
    setCompany(undefined);
    fetchCompanyBySlug(slug).then((c) => {
      setCompany(c);
      if (c) fetchExperienceSummary(c.id).then(setSummary);
    });
  }, [slug]);

  useSeo({
    title: company ? `${company.name} — share how your application went` : SEO_META.feedback.title,
    description: company
      ? `Applied to ${company.name}? Share in 20 seconds how it went — privately. It helps the next applicants and ${company.name}'s hiring team.`
      : 'Share how your job application went — no response, rejection, interview or offer. Private, reviewed, and it shows which companies really reply.',
    path: slug ? `/feedback/${slug}` : '/feedback',
    // One feedback form per company is a near-copy of the company page: keep those out of the index.
    noindex: Boolean(slug),
  });

  const pickList = useMemo(() => (rows ?? []).map((c) => ({ id: c.id, name: c.name, logo_url: c.logo_url })), [rows]);
  const fixed = company ? { id: company.id, name: company.name, logo_url: company.logo_url } : null;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="companies" />

      {/* HERO: a company's own link keeps the blue header; the /feedback home is search-first. */}
      {slug ? (
        <section className="bg-brand-700 text-white">
          <div className={`${WRAP} pb-10 pt-8 sm:pb-12`}>
            {company === undefined ? (
              <div className="h-48 animate-pulse rounded-xl bg-white/10" />
            ) : company ? (
              <CompanyHero company={company} onOutcome={(o) => setDialog({ pick: fixed, outcome: o })} />
            ) : (
              <p className="rounded-lg bg-white/10 px-4 py-3 text-sm">
                We couldn't find that company — pick it below or type its name.{' '}
                <button onClick={() => nav('/feedback')} className="font-semibold underline">
                  Open the feedback page
                </button>
              </p>
            )}
          </div>
        </section>
      ) : (
        <div className="bg-[radial-gradient(ellipse_at_top,rgba(29,78,216,0.08),transparent_60%)]">
          <SharePromo
            hero
            companies={rows ?? []}
            onPick={(c) => setDialog({ pick: c })}
            title="Applied and heard nothing? Make it count."
            text="Share how your application went — silence, rejection, interview or offer. 20 seconds, private, and it shows everyone which companies really reply."
            footer={
              <a href="#for-companies" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1D4ED8] hover:underline">
                Hiring? Get your company's feedback link <ArrowRight className="h-3.5 w-3.5" />
              </a>
            }
          />
        </div>
      )}

      <main className={`${WRAP} space-y-16 py-14`}>
        {/* THIS COMPANY (company link) */}
        {company && <CompanyNumbers company={company} summary={summary} onShare={() => setDialog({ pick: fixed })} />}

        {/* COMPANIES — your own reports first, then 5 at a time */}
        <div id="companies" className="scroll-mt-24" />
        <FeedbackCompaniesRow companies={rows} stats={stats} onShare={(pick) => setDialog({ pick })} refreshKey={refreshKey} />

        {/* FOR COMPANIES */}
        <ForCompanies companies={rows ?? []} initial={company ?? null} go={go} />

        {/* RULES */}
        <section>
          <SectionHead title="Fair rules" />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Rule icon={<Lock className="h-4 w-4" />} title="Private" text="Never shown with your name." />
            <Rule icon={<ShieldCheck className="h-4 w-4" />} title="Reviewed" text="Checked within 24 hours." />
            <Rule icon={<Users className="h-4 w-4" />} title={`${FEEDBACK_MIN_REPORTS} reports, ${FEEDBACK_MIN_PEOPLE}+ people`} text="Before any score shows." />
            <Rule icon={<Scale className="h-4 w-4" />} title="One voice each" text="One report per company a month." />
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-3xl">
          <SectionHead title="Questions" />
          <div className="mt-4 divide-y divide-ink-200 rounded-xl border border-ink-200 bg-white">
            <Faq q="Can companies see who shared?" a="No. Only totals are shown, never names or single reports." />
            <Faq q="Can a company remove a report?" a="No. Only fake, duplicate or abusive reports are removed." />
            <Faq q="Do I need to have applied via MadeVisa?" a="No. Any application counts: company site, LinkedIn, referral or recruiter." />
          </div>
        </section>
      </main>

      <ShareExperienceDialog
        open={Boolean(dialog)}
        onClose={() => {
          setDialog(null);
          setRefreshKey((k) => k + 1); // show a just-shared report in the row
        }}
        company={fixed}
        initial={fixed ? null : dialog?.pick ?? null}
        initialOutcome={dialog?.outcome ?? null}
        companies={pickList}
        onAuth={onAuth}
      />
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function CompanyHero({ company, onOutcome }: { company: CompanyProfile; onOutcome: (o: ExperienceOutcome) => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,480px)] lg:items-center">
      <div className="flex items-start gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-white p-2 shadow-lg shadow-black/10 sm:h-20 sm:w-20">
          {company.logo_url ? <img src={company.logo_url} alt="" className="h-full w-full object-contain" /> : <Building2 className="h-8 w-8 text-ink-300" />}
        </span>
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold">
            <MessageSquarePlus className="h-3.5 w-3.5" /> Hiring feedback · 20 seconds · private
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-[38px]">How did your application to {company.name} go?</h1>
          <p className="mt-2 max-w-xl text-[15px] leading-6 text-white/80">
            Your answer stays private and only adds to totals — it helps the next applicants plan their time and helps {company.name} improve how it hires.
          </p>
        </div>
      </div>
      <div className="rounded-xl bg-white p-4 text-ink-900 shadow-lg shadow-black/10">
        <p className="text-[13px] font-bold text-ink-800">What happened?</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {EXPERIENCE_OUTCOMES.map((o) => (
            <button
              key={o.value}
              onClick={() => onOutcome(o.value)}
              className="rounded-lg border border-ink-200 px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:border-[#1D4ED8] hover:bg-[#1D4ED8]/5"
            >
              <span className="block text-[14px] font-bold">{o.label}</span>
              <span className="block text-[11px] text-ink-500">{o.hint}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-400">
          <Lock className="h-3 w-3" /> Never shown with your name. Reviewed before it counts.
        </p>
      </div>
    </div>
  );
}

function CompanyNumbers({ company, summary, onShare }: { company: CompanyProfile; summary: ExperienceSummary | null; onShare: () => void }) {
  const s = summary;
  const few = !s || s.hidden || s.total < FEEDBACK_MIN_REPORTS;
  const heard = s && !few && s.total ? Math.round(((s.total - s.no_response) / s.total) * 100) : null;
  return (
    <SoftPanel
      title={`What applicants shared about ${company.name}`}
      sub="Applications made anywhere — careers site, LinkedIn, referrals."
      right={
        <a
          href={companyPath(company)}
          onClick={(e) => {
            e.preventDefault();
            nav(companyPath(company));
          }}
          className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#1D4ED8] hover:underline"
        >
          Full company score <ArrowRight className="h-3.5 w-3.5" />
        </a>
      }
    >
      {!s || s.total === 0 ? (
        <Empty text={`Nobody has shared about ${company.name} yet — yours would be the first.`} action={<CTA onClick={onShare}>Share my experience</CTA>} />
      ) : few ? (
        <Empty
          text={`${s.total}/${FEEDBACK_MIN_REPORTS} reports so far. The score shows at ${FEEDBACK_MIN_REPORTS} reports from ${FEEDBACK_MIN_PEOPLE}+ people.`}
          action={<CTA onClick={onShare}>Add yours</CTA>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Applicant experience" value={s.score != null ? `${s.score}/100` : '—'} note={s.score != null ? scoreWord(s.score) : undefined} />
          <Kpi label="Heard back" value={`${heard}%`} note={`${s.total} people shared`} />
          <Kpi label="Interview or offer" value={`${Math.round(((s.interview + s.offer) / s.total) * 100)}%`} />
          <Kpi label="First reply" value={s.avg_reply_days != null ? `~${s.avg_reply_days} days` : '—'} />
        </div>
      )}
    </SoftPanel>
  );
}

function ForCompanies({ companies, initial, go }: { companies: DirectoryCompany[]; initial: CompanyProfile | null; go: (v: View) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(initial ? { id: initial.id, name: initial.name } : null);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (initial) setPicked({ id: initial.id, name: initial.name });
  }, [initial]);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? companies.filter((c) => c.name.toLowerCase().includes(t)) : companies).slice(0, 8);
  }, [companies, q]);
  const link = picked ? `${SITE}${feedbackPath(picked)}` : `${SITE}/feedback`;
  const email = picked
    ? `Thank you for applying to ${picked.name}. We'd value 20 seconds of your time: how did our hiring process feel? Share it privately here: ${link}`
    : `How did your job applications go? Share it privately in 20 seconds — it helps everyone see which companies reply: ${link}`;
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked — text stays visible to copy by hand */
    }
  };

  return (
    <section id="for-companies" className="scroll-mt-28 overflow-hidden rounded-xl border border-ink-200 bg-white">
      <div className="grid lg:grid-cols-[1fr_1.1fr]">
        <div className="bg-[#1D4ED8]/5 p-6 sm:p-8">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[#1D4ED8]/10 px-3 py-1 text-[12px] font-bold text-[#1D4ED8]">
            <BadgeCheck className="h-3.5 w-3.5" /> For companies & HR
          </p>
          <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-ink-950">Get your company’s feedback link</h2>
          <p className="mt-2 text-[15px] leading-6 text-ink-600">Add it to rejection and “application received” emails. Free, and replying lifts your score.</p>
        </div>

        <div className="p-6 sm:p-8">
          <p className="text-[13px] font-bold text-ink-800">1. Find your company</p>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              value={picked && !open ? picked.name : q}
              onChange={(e) => {
                setQ(e.target.value);
                setPicked(null);
                setOpen(true);
              }}
              onFocus={() => {
                setOpen(true);
                if (picked) setQ('');
              }}
              onBlur={() => window.setTimeout(() => setOpen(false), 150)}
              placeholder="Company name"
              className="h-11 w-full rounded-lg border border-ink-200 pl-9 pr-8 text-sm outline-none transition focus:border-[#1D4ED8]"
            />
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            {open && (
              <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-ink-200 bg-white py-1 shadow-xl">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setPicked({ id: c.id, name: c.name });
                        setQ('');
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[#1D4ED8]/5"
                    >
                      <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded border border-ink-100 bg-white">
                        {c.logo_url ? <img src={c.logo_url} alt="" className="h-full w-full object-contain" /> : <Building2 className="h-3 w-3 text-ink-300" />}
                      </span>
                      <span className="truncate">{c.name}</span>
                    </button>
                  </li>
                ))}
                <li className="border-t border-ink-100">
                  <button onMouseDown={(e) => e.preventDefault()} onClick={() => go('company')} className="w-full px-3 py-2 text-left text-[13px] font-semibold text-[#1D4ED8] hover:bg-[#1D4ED8]/5">
                    Not listed? Add your company →
                  </button>
                </li>
              </ul>
            )}
          </div>

          <p className="mt-5 text-[13px] font-bold text-ink-800">2. Copy your link</p>
          <div className="mt-2 flex gap-2">
            <code className="flex h-11 min-w-0 flex-1 items-center truncate rounded-lg bg-ink-50 px-3 text-[13px] text-ink-800">{link}</code>
            <button onClick={() => copy('link', link)} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 text-sm font-semibold text-white hover:bg-brand-800">
              {copied === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied === 'link' ? 'Copied' : 'Copy'}
            </button>
          </div>

          <p className="mt-5 flex items-center gap-1.5 text-[13px] font-bold text-ink-800">
            <Mail className="h-4 w-4" /> 3. Paste into your emails
          </p>
          <div className="mt-2 rounded-lg border border-ink-200 p-3">
            <p className="text-[13px] leading-5 text-ink-700">{email}</p>
            <button onClick={() => copy('email', email)} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1D4ED8] hover:underline">
              {copied === 'email' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === 'email' ? 'Copied' : 'Copy text'}
            </button>
          </div>
          {!picked && <p className="mt-3 text-[12px] text-ink-500">Career centres and communities: share the general link as it is.</p>}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <h2 className="text-[28px] font-bold tracking-tight text-ink-950">{title}</h2>
      {sub && <p className="mt-1 text-[15px] text-ink-500">{sub}</p>}
    </div>
  );
}

function Rule({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl bg-[#1D4ED8]/5 p-4">
      <p className="flex items-center gap-2 text-[14px] font-bold text-ink-900">
        <span className="text-[#1D4ED8]">{icon}</span> {title}
      </p>
      <p className="mt-1 text-[13px] leading-5 text-ink-600">{text}</p>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-[15px] font-semibold text-ink-900">
        {q}
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="px-5 pb-4 text-[14px] leading-6 text-ink-600">{a}</p>}
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <SoftCard>
      <p className="text-[13px] text-ink-600">{label}</p>
      <p className="mt-1 text-[30px] font-bold leading-none text-ink-950">{value}</p>
      {note && <p className="mt-2 text-[12px] text-ink-500">{note}</p>}
    </SoftCard>
  );
}

function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg bg-[#1D4ED8]/5 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[14px] text-ink-600">{text}</p>
      {action}
    </div>
  );
}

function CTA({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#1D4ED8] px-4 py-2 text-[14px] font-semibold text-white transition hover:scale-[1.03] hover:bg-brand-800">
      <MessageSquarePlus className="h-4 w-4" /> {children}
    </button>
  );
}
