import { useEffect, useMemo, useState } from 'react';
import { Building2, Check, Copy, Lock, Mail, Search, ShieldCheck } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { SEO_META } from '@/lib/seoMeta';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { companyPath } from '@/lib/companies';
import { fetchRecruiterCompanies, type RecruiterCompany } from '@/lib/recruiters';
import { WRAP, nav } from '@/lib/pageLayout';
import { useAuth } from '@/lib/auth';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { Paywall } from '@/components/pro/Paywall';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const PAGE = 30;

/**
 * /network — HR Contacts: companies that hire abroad, with their logo, the HR / recruiter
 * emails MadeVisa has for them, and how many jobs they have live. Full addresses for members;
 * everyone else sees them shortened (the server shortens them: recruiter_companies).
 */
export function NetworkPage({ go, onAuth }: Props) {
  useSeo({ ...SEO_META.network, ogImage: 'https://madevisa.com/api/og/page?p=network', path: '/network' });
  const [rows, setRows] = useState<RecruiterCompany[] | null | undefined>(undefined);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const { session } = useAuth();
  // Shortened emails: sign up first (stays on this page), then the membership card.
  const [gate, setGate] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const unlock = () => (session ? setPaywall(true) : setGate(true));
  // Signed in (or paid) here: the list is fetched again, with what this account may see.

  useEffect(() => {
    fetchRecruiterCompanies().then(setRows);
  }, [session?.user?.id]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = rows ?? [];
    return t ? list.filter((c) => c.name.toLowerCase().includes(t) || (c.country ?? '').toLowerCase().includes(t) || c.emails.some((e) => e.includes(t))) : list;
  }, [rows, q]);
  const sponsoringCompanies = useMemo(() => (rows ?? []).filter((c) => c.sponsored > 0).length, [rows]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="network" />
      <AuthDialog open={gate && !session} onClose={() => setGate(false)} />
      {paywall && <Paywall reason="contact" source="hr_contacts" onClose={() => setPaywall(false)} />}

      <section className="bg-brand-700 text-white">
        <div className={`${WRAP} pb-10 pt-10 sm:pb-12 sm:pt-12`}>
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold">
              <ShieldCheck className="h-3.5 w-3.5" /> Direct contact
            </p>
            <h1 className="mt-4 text-[32px] font-bold leading-[1.1] tracking-tight sm:text-[44px]">Direct contact to HRs &amp; recruiters</h1>
            <p className="mt-4 text-[16px] leading-7 text-white/85">The HR and recruiter emails of companies that hire abroad, the ones that sponsor visas first. Write to them directly.</p>
            <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
              <Figure label="Companies" value={rows === undefined ? '…' : (rows?.length ?? 0).toLocaleString()} />
              <Figure label="Sponsor visas" value={rows === undefined ? '…' : sponsoringCompanies.toLocaleString()} />
            </div>
          </div>
        </div>
      </section>

      <main className={`${WRAP} py-8`}>
        <label className="flex h-12 w-full max-w-xl items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 focus-within:border-[#1D4ED8]">
          <Search className="h-4 w-4 shrink-0 text-ink-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search company, country or email"
            aria-label="Search companies"
            className="h-full w-full bg-transparent text-[15px] outline-none placeholder:text-ink-400"
          />
        </label>

        {rows === undefined ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton-shimmer h-[230px] rounded-2xl" />
            ))}
          </div>
        ) : rows === null ? (
          <Empty text="Couldn't load the companies. Please try again in a moment." />
        ) : filtered.length === 0 ? (
          <Empty text={q.trim() ? `No company matches “${q.trim()}”.` : 'No companies listed yet.'} />
        ) : (
          <>
            <p className="mt-5 text-[13px] text-ink-500">
              {filtered.length.toLocaleString()} {filtered.length === 1 ? 'company' : 'companies'}
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.slice(0, limit).map((c) => (
                <CompanyContactCard key={c.id} c={c} onUnlock={unlock} />
              ))}
            </div>
            {filtered.length > limit && (
              <div className="mt-6 text-center">
                <button onClick={() => setLimit((n) => n + PAGE)} className="rounded-xl border border-ink-200 bg-white px-5 py-2.5 text-[14px] font-semibold text-ink-700 hover:bg-ink-50">
                  Show more ({(filtered.length - limit).toLocaleString()} left)
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function CompanyContactCard({ c, onUnlock }: { c: RecruiterCompany; onUnlock: () => void }) {
  const href = c.publisher_id ? companyPath({ id: c.publisher_id, name: c.name }) : null;
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(email);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked: the address stays visible */
    }
  };
  return (
    <article className="flex flex-col rounded-2xl border border-ink-200 bg-white p-5 transition hover:shadow-[0_8px_28px_rgba(15,23,42,0.07)]">
      <div className="flex items-start gap-3.5">
        {c.logo_url ? (
          <img src={c.logo_url} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl border border-ink-100 bg-white object-contain p-1.5" />
        ) : (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#1D4ED8]/10">
            <Building2 className="h-6 w-6 text-[#1D4ED8]/60" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {href ? (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                nav(href);
              }}
              className="line-clamp-2 text-[17px] font-bold leading-snug text-ink-950 hover:text-[#1D4ED8]"
            >
              {c.name}
            </a>
          ) : (
            <p className="line-clamp-2 text-[17px] font-bold leading-snug text-ink-950">{c.name}</p>
          )}
          {!c.country && c.website && <p className="mt-1 truncate text-[13px] text-ink-500">{c.website.replace(/^https?:\/\//, '')}</p>}
          {c.country && (
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-500">
              <CircleFlag countryCode={c.country_code} label={c.country} size={14} /> {c.country}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex min-h-[28px] flex-wrap gap-1.5">
        {c.sponsored > 0 && (
          <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[13px] font-semibold text-emerald-700">{c.sponsored.toLocaleString()} with visa sponsorship</span>
        )}
        {c.jobs > 0 ? (
          <span className="rounded-lg bg-[#1D4ED8]/5 px-2.5 py-1 text-[13px] font-semibold text-[#1D4ED8]">
            {c.jobs.toLocaleString()} {c.jobs === 1 ? 'job' : 'jobs'} on MadeVisa
          </span>
        ) : (
          <span className="rounded-lg bg-ink-100 px-2.5 py-1 text-[13px] font-semibold text-ink-600">No open jobs listed yet</span>
        )}
      </div>

      {c.masked ? (
        <ul className="mt-4 space-y-1.5">
          {c.emails.map((e) => (
            <li key={e} className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2">
              <Mail className="h-4 w-4 shrink-0 text-ink-400" />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink-800">{e}</span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink-950 px-2 py-0.5 text-[11px] font-bold text-white">
                <Lock className="h-3 w-3" aria-hidden /> Members
              </span>
            </li>
          ))}
        </ul>
      ) : (
      <ul className="mt-4 space-y-1.5">
        {c.emails.map((e) => (
          <li key={e} className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2">
            <Mail className="h-4 w-4 shrink-0 text-ink-400" />
            <a href={`mailto:${e}`} className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink-800 hover:text-[#1D4ED8]">
              {e}
            </a>
            <button onClick={() => void copy(e)} aria-label={`Copy ${e}`} className="rounded-md p-1 text-ink-400 hover:bg-white hover:text-ink-700">
              {copied === e ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </li>
        ))}
      </ul>
      )}

      <div className="mt-auto flex gap-2 pt-5">
        {c.masked ? (
          <button type="button" onClick={onUnlock} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] text-[15px] font-semibold text-white hover:bg-brand-800">
            <Lock className="h-4 w-4" /> See full emails
          </button>
        ) : (
        <a href={`mailto:${c.emails[0]}`} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] text-[15px] font-semibold text-white hover:bg-brand-800">
          <Mail className="h-4 w-4" /> Contact
        </a>
        )}
        {href && c.jobs > 0 ? (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              nav(href);
            }}
            className="flex h-11 items-center justify-center rounded-xl border border-ink-200 px-4 text-[14px] font-semibold text-ink-700 hover:bg-ink-50"
          >
            See jobs
          </a>
        ) : c.website ? (
          <a href={c.website} target="_blank" rel="noopener noreferrer nofollow" className="flex h-11 items-center justify-center rounded-xl border border-ink-200 px-4 text-[14px] font-semibold text-ink-700 hover:bg-ink-50">
            Website
          </a>
        ) : null}
      </div>
    </article>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[28px] font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-[13px] text-white/75">{label}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="mt-6 rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-12 text-center text-[15px] text-ink-500">{text}</p>;
}
