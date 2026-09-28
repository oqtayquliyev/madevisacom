import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, ArrowRight, Info, MessageCircle, Stamp } from 'lucide-react';
import { usePersonalization } from '@/lib/personalization';
import { replyRatio, replyTime, useCompanySignal, type CompanySignal } from '@/lib/companySignals';
import { visaFitFor, type VisaFit } from '@/lib/visaFit';
import { companyPath } from '@/lib/companies';
import { handleNavClick } from '@/lib/navLink';
import { nav } from '@/lib/pageLayout';
import { CircleFlag } from '@/components/common/CircleFlag';

// Two lines on every job (cards on /jobs, and the job page):
//   Replies to 1 in 4 applicants · usually within 6 days      ⓘ
//   Passport from Azerbaijan: EU Blue Card route +1            ⓘ
// Each ⓘ explains exactly what the line is based on. When a company has
// too few tracked applications for a reply rate, the first line shows its
// hiring activity instead — and says so.

type Variant = 'card' | 'hero';

/** Stops a click inside a job card (which is a link) from opening the job. */
const stop = (e: React.SyntheticEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

function InfoTip({ children, label, variant }: { children: React.ReactNode; label: string; variant: Variant }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const btn = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (panel.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    window.addEventListener('scroll', () => setOpen(false), { once: true, passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (e: React.SyntheticEvent) => {
    stop(e);
    if (open) return setOpen(false);
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      const width = Math.min(320, window.innerWidth - 24);
      const left = Math.max(12, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 12));
      const up = r.bottom + 260 > window.innerHeight && r.top > 260;
      setPos({ top: up ? r.top - 8 : r.bottom + 8, left, up });
    }
    setOpen(true);
  };

  return (
    <>
      <span
        ref={btn}
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle(e)}
        className={`inline-grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-full transition ${
          variant === 'hero' ? 'text-white/70 hover:bg-white/15 hover:text-white' : 'text-ink-400 hover:bg-ink-100 hover:text-ink-700'
        }`}
      >
        <Info className="h-3.5 w-3.5" />
      </span>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={label}
            // The portal isn't inside the card's <a> in the page, but React
            // still bubbles clicks to it — stop them here.
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: Math.min(320, window.innerWidth - 24), transform: pos.up ? 'translateY(-100%)' : undefined, zIndex: 80 }}
            className="rounded-xl border border-ink-200 bg-white p-4 text-left text-[13px] leading-5 text-ink-700 shadow-xl"
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}

function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} onClick={(e) => handleNavClick(e, () => nav(href))} className="mt-2 inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
      {children} <ArrowRight className="h-3.5 w-3.5" />
    </a>
  );
}

// ---------------------------------------------------------------------------
// Line 1 — replies (or hiring activity)
// ---------------------------------------------------------------------------

type ReplyLine = { icon: typeof MessageCircle; text: string; strong: boolean };

function replyLine(s: CompanySignal): ReplyLine | null {
  if (s.response_rate != null) {
    if (s.response_rate <= 0) return { icon: MessageCircle, text: `No replies reported yet · ${s.tracked} applications tracked`, strong: true };
    const time = replyTime(s.median_days);
    return { icon: MessageCircle, text: `Replies to ${replyRatio(s.response_rate)} applicants${time ? ` · ${time}` : ''}`, strong: true };
  }
  const n = s.posted_30d;
  if (n >= 20) return { icon: Activity, text: `Very active hiring · ${n} new roles in 30 days`, strong: false };
  if (n >= 5) return { icon: Activity, text: `Actively hiring · ${n} new roles in 30 days`, strong: false };
  if (n >= 1) return { icon: Activity, text: `Hiring · ${n} new ${n === 1 ? 'role' : 'roles'} this month`, strong: false };
  if (s.live > 0) return { icon: Activity, text: `${s.live} open ${s.live === 1 ? 'role' : 'roles'} on MadeVisa`, strong: false };
  return null;
}

export function CompanyReplySignal({ publisherId, company, variant = 'card' }: { publisherId: string | null | undefined; company: string; variant?: Variant }) {
  const s = useCompanySignal(publisherId);
  const text = variant === 'hero' ? 'text-white/90' : 'text-ink-600';
  if (s === undefined) return <span className={`block h-4 w-48 animate-pulse rounded ${variant === 'hero' ? 'bg-white/15' : 'bg-ink-100'}`} aria-hidden />;
  if (!s || !publisherId) return null;
  const line = replyLine(s);
  if (!line) return null;
  const Icon = line.icon;
  const href = companyPath({ id: publisherId, name: company });

  return (
    <span className={`flex min-w-0 items-center gap-1.5 text-[12.5px] ${text}`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${variant === 'hero' ? 'text-white' : line.strong ? 'text-brand-600' : 'text-ink-400'}`} aria-hidden />
      <span className={`truncate ${line.strong ? 'font-semibold' : ''}`}>{line.text}</span>
      <InfoTip label="What this is based on" variant={variant}>
        {s.response_rate != null ? (
          <>
            <p className="font-semibold text-ink-950">Reply rate from real applicants</p>
            <p className="mt-1">
              Based on <strong>{s.tracked}</strong> applications to {company} tracked by MadeVisa users. <strong>{Math.round(s.response_rate)}%</strong> got a reply
              {s.median_days != null ? <> — typically after about {Math.max(1, Math.round(s.median_days))} days</> : null}.
            </p>
            <p className="mt-1 text-xs text-ink-500">Shown only with 5+ applications from 3+ people. Counts every reply — interview, rejection or offer.</p>
          </>
        ) : (
          <>
            <p className="font-semibold text-ink-950">Hiring activity, not a reply rate</p>
            <p className="mt-1">
              Too few applications to {company} have been tracked to show a reply rate yet{s.tracked ? ` (${s.tracked} so far — 5 from 3 people are needed)` : ''}. Instead, this shows how actively it
              hires: <strong>{s.posted_30d}</strong> {s.posted_30d === 1 ? 'role' : 'roles'} published on its careers page in the last 30 days, <strong>{s.live}</strong> open now.
            </p>
            <p className="mt-1 text-xs text-ink-500">Applied here? Track it on MadeVisa and you help build this company’s reply rate.</p>
          </>
        )}
        <PanelLink href={href}>See {company} on MadeVisa</PanelLink>
      </InfoTip>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Line 2 — visa route for your passport
// ---------------------------------------------------------------------------

function VisaPanel({ fit }: { fit: VisaFit }) {
  if (fit.kind === 'no-passport') {
    return (
      <>
        <p className="font-semibold text-ink-950">See your visa route on every job</p>
        <p className="mt-1">Tell us which passport you hold and each job shows the visa route its country offers you.</p>
        <PanelLink href="/destinations">Set your passport</PanelLink>
      </>
    );
  }
  if (fit.kind === 'citizen' || fit.kind === 'free') {
    return (
      <>
        <p className="font-semibold text-ink-950">No work permit needed</p>
        <p className="mt-1">{fit.detail}</p>
        <p className="mt-1 text-xs text-ink-500">Passport: {fit.passportName} — from your profile, or the country you’re browsing from.</p>
        <PanelLink href={fit.href}>{fit.guide.name}: living and working there</PanelLink>
      </>
    );
  }
  if (fit.kind === 'no-guide') {
    return (
      <>
        <p className="font-semibold text-ink-950">{fit.label}</p>
        {fit.detail && <p className="mt-1">{fit.detail}</p>}
        {fit.sponsored && <p className="mt-1">This job’s ad says the employer offers visa sponsorship.</p>}
        <p className="mt-1 text-xs text-ink-500">Passport: {fit.passportName}. Always confirm with the employer and the official immigration site.</p>
        <PanelLink href="/destinations">Visa guides by country</PanelLink>
      </>
    );
  }
  if (fit.kind !== 'route') return null;
  const r = fit.route;
  return (
    <>
      <p className="font-semibold text-ink-950">
        {r.name} — {fit.guide.name}
      </p>
      <p className="mt-1">{r.summary}</p>
      <ul className="mt-2 space-y-0.5 text-xs text-ink-600">
        {fit.asks.length > 0 && <li>Also asks for: {fit.asks.map((a, i) => (i ? a.charAt(0).toLowerCase() + a.slice(1) : a)).join(', ')}</li>}
        <li>Valid for: {r.validity}</li>
        {r.fee && <li>Fee: {r.fee}</li>}
        <li>Counts toward permanent residence: {r.leadsToPR ? 'yes' : 'no'}</li>
        {fit.more > 0 && <li>{fit.more} more {fit.more === 1 ? 'route' : 'routes'} may fit</li>}
      </ul>
      <p className="mt-2 text-xs text-ink-500">
        Based on MadeVisa’s {fit.guide.name} visa guide (checked {fit.guide.reviewed}) for a passport from {fit.passportName}, assuming this job’s offer. General information, not legal advice.
      </p>
      <PanelLink href={fit.href}>All routes for {fit.guide.name}</PanelLink>
    </>
  );
}

export function VisaRouteSignal({ countryCode, visaOffered, variant = 'card' }: { countryCode: string | null | undefined; visaOffered?: boolean | null; variant?: Variant }) {
  const { profile } = usePersonalization();
  const fit = visaFitFor(countryCode, profile.citizenship, visaOffered);
  if (!fit) return null;
  const text = variant === 'hero' ? 'text-white/90' : 'text-ink-600';
  const passport = fit.kind === 'no-passport' ? null : profile.citizenship;
  const good = fit.kind === 'citizen' || fit.kind === 'free';

  return (
    <span className={`flex min-w-0 items-center gap-1.5 text-[12.5px] ${text}`}>
      {passport ? <CircleFlag countryCode={passport} size={14} /> : <Stamp className={`h-3.5 w-3.5 shrink-0 ${variant === 'hero' ? 'text-white' : 'text-ink-400'}`} aria-hidden />}
      <span className="truncate">
        {fit.kind === 'no-passport' ? (
          fit.label
        ) : (
          <>
            {fit.kind === 'no-guide' && fit.label.startsWith('Your country') ? null : <>Passport from {fit.passportName}: </>}
            <span className={`font-semibold ${good && variant === 'card' ? 'text-emerald-700' : ''}`}>{fit.label}</span>
          </>
        )}
      </span>
      <InfoTip label="About this visa route" variant={variant}>
        <VisaPanel fit={fit} />
      </InfoTip>
    </span>
  );
}

/** Both lines, as they appear on a job card or the job page. */
export function JobSignals({
  publisherId,
  company,
  countryCode,
  visaOffered,
  variant = 'card',
}: {
  publisherId: string | null | undefined;
  company: string;
  countryCode: string | null | undefined;
  visaOffered?: boolean | null;
  variant?: Variant;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${variant === 'card' ? 'mt-3' : 'mt-5 rounded-xl bg-white/10 p-3.5 ring-1 ring-white/20 sm:max-w-xl'}`}>
      <CompanyReplySignal publisherId={publisherId} company={company} variant={variant} />
      <VisaRouteSignal countryCode={countryCode} visaOffered={visaOffered} variant={variant} />
    </div>
  );
}
