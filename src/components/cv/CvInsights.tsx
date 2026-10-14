import { useMemo } from 'react';
import { ArrowRight, Briefcase, GraduationCap, Languages, Lock, MapPin, Sparkles, Timer } from 'lucide-react';
import type { StoredCv } from '@/lib/cv/store';
import type { TopResult } from '@/lib/cv/topMatches';
import { EDU_NAME } from '@/lib/cv/cvProfile';
import { LEVEL_NAME } from '@/lib/cv/languages';
import { skillName } from '@/lib/cv/skills';
import { allCountries } from '@/data/allCountries';
import { CircleFlag } from '@/components/common/CircleFlag';
import { MatchRing } from '@/components/cv/MatchBits';
import { checkoutHref, trackBilling } from '@/lib/billing';
import { priceLabel } from '@/lib/plans';
import { nav } from '@/lib/pageLayout';

// The personal part of /cv-match: who the CV says you are, and — for Starter
// and Pro — what the matches add up to, as small charts.

type Person = { fullName?: string | null; occupation?: string | null; countryCode?: string | null };

const NAME_LINE = /^[A-ZÀ-ÝƏÜÖĞÇŞİ][\p{L}'’.-]+(?:\s+[A-ZÀ-ÝƏÜÖĞÇŞİ][\p{L}'’.-]+){1,3}$/u;

/** The name at the top of a CV: the first short line of capitalised words (no digits, no @). */
function nameFromCv(text: string): string | null {
  for (const raw of text.split(/\n/).slice(0, 8)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line || line.length > 40 || /[\d@|/:]/.test(line)) continue;
    const t = line.toLowerCase() === line || line.toUpperCase() === line ? line.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()) : line;
    if (NAME_LINE.test(t)) return t;
  }
  return null;
}

/** "Berlin, Germany" or "Germany" from the top of the CV, when it says. */
function placeFromCv(text: string): { place: string; code: string } | null {
  const head = text.slice(0, 900);
  let best: { at: number; c: { code: string; name: string } } | null = null;
  for (const c of allCountries) {
    const at = head.search(new RegExp(`\\b${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
    if (at >= 0 && (!best || at < best.at)) best = { at, c };
  }
  if (!best) return null;
  const before = head.slice(Math.max(0, best.at - 40), best.at);
  const city = before.match(/([A-ZÀ-ÝƏÜÖĞÇŞİ][\p{L}'’-]+(?:\s[A-ZÀ-ÝƏÜÖĞÇŞİ][\p{L}'’-]+)?)\s*,\s*$/u)?.[1];
  return { place: city ? `${city}, ${best.c.name}` : best.c.name, code: best.c.code };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Name, occupation, place and the main facts from the CV — right after it is uploaded. */
export function CvPersonCard({ cv, person }: { cv: StoredCv; person: Person }) {
  const p = cv.profile;
  const name = (person.fullName?.trim() || nameFromCv(cv.text) || 'Your CV').replace(/\s+/g, ' ');
  const occupation = p.titles[0] || person.occupation || p.roles[0]?.label || null;
  const where = placeFromCv(cv.text) ?? (person.countryCode ? { place: allCountries.find((c) => c.code === person.countryCode)?.name ?? '', code: person.countryCode } : null);
  const skills = Object.entries(p.skills)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => skillName(id));
  const facts: { icon: typeof Briefcase; text: string }[] = [
    p.years != null ? { icon: Timer, text: `${Math.round(p.years)}+ years` } : null,
    p.education ? { icon: GraduationCap, text: EDU_NAME[p.education].replace(/^an? /, '') } : null,
    p.languages.length ? { icon: Languages, text: p.languages.slice(0, 3).map((l) => `${l.name}${l.level ? ` ${LEVEL_NAME[l.level]}` : ''}`).join(' · ') } : null,
  ].filter(Boolean) as { icon: typeof Briefcase; text: string }[];

  return (
    <div className="mx-auto flex max-w-xl items-start gap-4 rounded-2xl bg-white p-4 text-left text-ink-900 shadow-soft sm:p-5">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-50 text-[18px] font-bold text-brand-700 ring-2 ring-brand-100">{initials(name)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[20px] font-bold leading-tight tracking-tight text-ink-950">{name}</p>
        {occupation && (
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[14px] font-semibold text-ink-700">
            <Briefcase className="h-3.5 w-3.5 shrink-0 text-ink-400" /> {occupation}
          </p>
        )}
        {where?.place && (
          <p className="mt-0.5 flex items-center gap-1.5 text-[13.5px] text-ink-600">
            {where.code ? <CircleFlag countryCode={where.code} size={14} label={where.place} /> : <MapPin className="h-3.5 w-3.5 text-ink-400" />} {where.place}
          </p>
        )}
        {facts.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-600">
            {facts.map((f) => (
              <span key={f.text} className="inline-flex items-center gap-1">
                <f.icon className="h-3.5 w-3.5 text-ink-400" /> {f.text}
              </span>
            ))}
          </p>
        )}
        {skills.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <li key={s} className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[12px] font-medium text-ink-700">
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type Counted = { label: string; n: number; code?: string | null };
const countBy = <T,>(items: T[], key: (x: T) => string[]): Counted[] => {
  const m = new Map<string, number>();
  for (const it of items) for (const k of new Set(key(it))) if (k) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
};

function Bars({ title, rows, tone, total }: { title: string; rows: Counted[]; tone: string; total: number }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-ink-200">
      <p className="text-[14px] font-bold text-ink-950">{title}</p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-2.5 text-[13px]">
            <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-ink-800">
              {r.code && <CircleFlag countryCode={r.code} size={14} label={r.label} />}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="h-2.5 overflow-hidden rounded-full bg-ink-100">
              <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.max(6, (100 * r.n) / max)}%` }} />
            </span>
            <span className="tabular-nums text-ink-500">
              {r.n}
              <span className="text-ink-400">/{total}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Starter and Pro: what the matches add up to — score spread, countries, and what employers ask for most. */
export function CvInsights({ result }: { result: TopResult }) {
  const items = result.items;
  const data = useMemo(() => {
    const bands = [
      { label: '80%+', n: items.filter((m) => m.score >= 80).length, tone: 'bg-emerald-500' },
      { label: '65–79%', n: items.filter((m) => m.score >= 65 && m.score < 80).length, tone: 'bg-brand-500' },
      { label: 'Under 65%', n: items.filter((m) => m.score < 65).length, tone: 'bg-amber-400' },
    ];
    const countries = countBy(items, (m) => [m.country ?? ''])
      .slice(0, 6)
      .map((c) => ({ ...c, code: items.find((m) => m.country === c.label)?.cc ?? null }));
    const skills = countBy(items, (m) => m.missing ?? []).slice(0, 6);
    const wanted = countBy(items, (m) => m.wanted ?? []).slice(0, 8);
    const sponsor = items.filter((m) => m.visa === 'offered').length;
    const avg = items.length ? Math.round(items.reduce((a, m) => a + m.score, 0) / items.length) : 0;
    return { bands, countries, skills, wanted, sponsor, avg };
  }, [items]);
  if (!items.length) return null;
  const total = items.length;

  return (
    <section aria-labelledby="insights-title" className="mx-auto max-w-3xl space-y-4">
      <h2 id="insights-title" className="text-[20px] font-bold tracking-tight text-ink-950">
        Your CV at a glance
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Jobs that fit', String(total)],
          ['Best match', `${items[0]?.score ?? 0}%`],
          ['Average match', `${data.avg}%`],
          ['Sponsor visas', String(data.sponsor)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
            <p className="text-[26px] font-bold leading-none tracking-tight tabular-nums text-ink-950">{v}</p>
            <p className="mt-1.5 text-[12.5px] font-medium text-ink-500">{k}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white p-5 ring-1 ring-ink-200">
        <p className="text-[14px] font-bold text-ink-950">How well your matches fit</p>
        <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-ink-100" role="img" aria-label={data.bands.map((b) => `${b.n} at ${b.label}`).join(', ')}>
          {data.bands.map((b) => (b.n ? <span key={b.label} className={b.tone} style={{ width: `${(100 * b.n) / total}%` }} /> : null))}
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-600">
          {data.bands.map((b) => (
            <li key={b.label} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${b.tone}`} /> {b.label} <strong className="tabular-nums text-ink-900">{b.n}</strong>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Bars title="Where your matches are" rows={data.countries} tone="bg-brand-500" total={total} />
        <Bars title="Skills employers ask for that your CV lacks" rows={data.skills} tone="bg-amber-400" total={total} />
      </div>

      {data.wanted.length > 0 && (
        <div className="rounded-2xl bg-white p-5 ring-1 ring-ink-200">
          <p className="text-[14px] font-bold text-ink-950">Experience these employers also want</p>
          <p className="mt-0.5 text-[12.5px] text-ink-500">Industry and other-field experience — not core skills. Mention it if you have it.</p>
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {data.wanted.map((w) => (
              <li key={w.label} className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[12.5px] font-semibold text-sky-900 ring-1 ring-sky-200">
                {w.label} <span className="font-normal text-sky-700">· {w.n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Free accounts and guests: CV match is part of Starter and Pro. Shows the real count, nothing else. */
export function CvMatchLocked({ result, guest, onAuth }: { result: TopResult | null; guest: boolean; onAuth?: (p: 'login' | 'register') => void }) {
  const items = result?.items ?? [];
  const countries = new Set(items.map((m) => m.country).filter(Boolean)).size;
  const href = checkoutHref('starter', 'cv_match_locked');
  const fake = [86, 82, 78];
  return (
    <section className="mx-auto max-w-2xl overflow-hidden rounded-3xl bg-white ring-1 ring-ink-200">
      <div aria-hidden className="pointer-events-none select-none space-y-px bg-ink-100 blur-[5px]">
        {(items.length ? items.slice(0, 3).map((m) => m.score) : fake).map((s, i) => (
          <div key={i} className="flex items-center gap-4 bg-white px-5 py-4">
            <MatchRing score={s} size={48} />
            <span className="min-w-0 flex-1">
              <span className="block h-4 rounded bg-ink-300" style={{ width: `${60 - i * 8}%` }} />
              <span className="mt-2 block h-3 rounded bg-ink-200" style={{ width: `${42 + i * 6}%` }} />
            </span>
          </div>
        ))}
      </div>
      <div className="px-6 py-7 text-center sm:px-10">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[12px] font-bold text-brand-700">
          <Lock className="h-3.5 w-3.5" /> Starter and Pro
        </p>
        <h2 className="mt-3 text-[24px] font-bold leading-tight tracking-tight text-ink-950">
          {items.length ? `${items.length} ${items.length === 1 ? 'job fits' : 'jobs fit'} your CV${countries > 1 ? `, in ${countries} countries` : ''}` : 'See the jobs your CV matches'}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[14.5px] leading-6 text-ink-600">Your score on every job, the skills your CV is missing, what employers also want, and charts of where you fit best.</p>
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            trackBilling('plan_selected', { plan: 'starter', source: 'cv_match_locked' });
            nav(href);
          }}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3.5 text-[15px] font-bold text-white hover:bg-brand-700"
        >
          <Sparkles className="h-4 w-4" /> Unlock CV match · {priceLabel('starter')} <ArrowRight className="h-4 w-4" />
        </a>
        {guest && (
          <p className="mt-3 text-[13px] text-ink-600">
            Already on a plan?{' '}
            <button onClick={() => onAuth?.('login')} className="font-semibold text-brand-700 hover:underline">
              Sign in
            </button>
          </p>
        )}
      </div>
    </section>
  );
}
