import { ExternalLink, Info, Lock, MessageCircleReply, ShieldCheck, Users, Wallet } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useSponsorProof, recordLine, REGISTER_NAME, type SponsorRecord } from '@/lib/sponsorProof';
import { useCompanySignal } from '@/lib/companySignals';
import { useDiaspora } from '@/lib/diaspora';
import { moveMath, usd, type MoveMath, type SalaryFacts } from '@/lib/moveMath';
import { replyOdds, ODDS_LABEL, type Odds } from '@/lib/replyOdds';
import { allCountries } from '@/data/allCountries';
import { MOVE_MATH_UPDATED } from '@/data/moveMath';
import { Blur } from '@/components/common/Blur';

// "Your edge on this job": four answers no job board gives, on every job page.
//   Sponsor Proof   official government records that the company sponsors visas (UK, NL, US)
//   Move Math       what's left each month after tax and rent there, vs at home
//   Reply odds      High / Fair / Low, and why
//   Your people     members from your country who applied here
// Members see the answers. Everyone else sees that the answer exists (blurred, with a
// lock) — the strongest reason to subscribe is a real answer you can almost read.

export type EdgeInput = {
  publisherId: string | null | undefined;
  company: string;
  /** Job country (ISO-2). */
  dest: string | null;
  /** Visitor's country: passport first, else where they live. */
  home: string | null;
  needsVisa: boolean;
  salary: SalaryFacts;
  visaOffered: boolean;
  ageDays: number | null;
  match: number | null;
};

export type Edge = {
  sponsor: SponsorRecord[] | undefined;
  move: MoveMath | null;
  odds: Odds | null;
  diaspora: number | null;
  homeName: string | null;
};

const countryName = (code: string | null) => (code ? (allCountries.find((c) => c.code === code.toUpperCase())?.name ?? code) : null);

/** All four answers for a job (each null/[] when we don't know — then that row is left out). */
export function useJobEdge(i: EdgeInput): Edge {
  const sponsor = useSponsorProof(i.publisherId);
  const signal = useCompanySignal(i.publisherId);
  const diaspora = useDiaspora(i.publisherId, i.home);
  const move = moveMath(i.salary, i.dest, i.home);
  const odds = replyOdds({
    responseRate: signal?.response_rate ?? null,
    ageDays: i.ageDays,
    posted30d: signal?.posted_30d ?? null,
    visaOffered: i.visaOffered,
    sponsorRecord: Boolean(sponsor?.length),
    needsVisa: i.needsVisa,
    match: i.match,
  });
  return { sponsor, move, odds, diaspora, homeName: countryName(i.home) };
}

function Row({ icon, title, children, locked, onUnlock, note }: { icon: ReactNode; title: string; children: ReactNode; locked: boolean; onUnlock?: () => void; note?: ReactNode }) {
  // Title-first: the how-and-where details stay one tap away (ⓘ), not as grey text under every answer.
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-3 border-t border-ink-100 py-3.5 first:border-t-0">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-ink-500">
          {title}
          {note && !locked && (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`How we know: ${title}`} className="rounded-full p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
              <Info className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </p>
        <div className="mt-0.5 text-[15px] font-semibold leading-6 text-ink-950">
          {locked ? (
            <button type="button" onClick={onUnlock} className="inline-flex items-center gap-2 text-left" aria-label={`${title}: members only. Unlock`}>
              <Blur w={170} />
              <Lock className="h-3.5 w-3.5 text-ink-400" aria-hidden />
            </button>
          ) : (
            children
          )}
        </div>
        {note && !locked && open && <p className="mt-1.5 rounded-lg bg-ink-50 px-3 py-2 text-[13px] leading-5 text-ink-600">{note}</p>}
      </div>
    </div>
  );
}

export function JobEdgePanel({ edge, company, locked, onUnlock }: { edge: Edge; company: string; locked: boolean; onUnlock?: () => void }) {
  const { sponsor, move, odds, diaspora, homeName } = edge;
  const hasSponsor = Boolean(sponsor?.length);
  if (!hasSponsor && !move && !odds && diaspora == null) return null;
  return (
    <section aria-labelledby="edge-title" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-ink-200 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="edge-title" className="text-[18px] font-bold text-ink-950">
          Your edge on this job
        </h2>
        {locked && (
          <button type="button" onClick={onUnlock} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink-950 px-3.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-ink-800">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Unlock
          </button>
        )}
      </div>
      <div className="mt-2">
        {hasSponsor && (
          <Row
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Sponsor proof"
            locked={locked}
            onUnlock={onUnlock}
            note={
              <>
                Official government data, matched by company name. A record doesn’t mean every role is sponsored.{' '}
                {sponsor!.map((r) => (
                  <a key={r.country} href={r.source_url} target="_blank" rel="noopener noreferrer" className="mr-2 inline-flex items-center gap-0.5 font-semibold text-brand-700 hover:underline">
                    {REGISTER_NAME[r.country] ?? r.country} <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </>
            }
          >
            <ul className="space-y-0.5">
              {sponsor!.map((r) => (
                <li key={r.country}>{recordLine(r)}</li>
              ))}
            </ul>
          </Row>
        )}
        {move && (
          <Row
            icon={<Wallet className="h-4 w-4" />}
            title="Move math"
            locked={locked}
            onUnlock={onUnlock}
            note={`Estimate: the salary in the ad, minus about ${move.tax}% tax and ${usd(move.rent)} rent for a 1-bedroom flat, compared with average take-home pay minus rent in ${homeName ?? 'your country'} (${MOVE_MATH_UPDATED} figures).`}
          >
            ≈ {usd(move.left)} a month left after tax and rent
            <span className="block text-[14px] font-medium text-ink-600">
              {move.delta > 0 ? (
                <>
                  <strong className="text-emerald-700">{usd(move.delta)} more</strong> than the average at home{homeName ? ` (${homeName})` : ''}
                </>
              ) : (
                <>About the same as, or less than, the average at home{homeName ? ` (${homeName})` : ''}</>
              )}
            </span>
          </Row>
        )}
        {odds && (
          <Row icon={<MessageCircleReply className="h-4 w-4" />} title="Reply odds" locked={locked} onUnlock={onUnlock} note={`Our estimate${odds.reasons.length ? `: ${odds.reasons.join(', ')}` : ''}.`}>
            <span className={odds.level === 'high' ? 'text-emerald-700' : odds.level === 'fair' ? 'text-amber-700' : 'text-rose-700'}>{ODDS_LABEL[odds.level]}</span>{' '}
            <span className="text-[14px] font-medium text-ink-600">chance {company} replies</span>
          </Row>
        )}
        {diaspora != null && (
          <Row icon={<Users className="h-4 w-4" />} title="Your people here" locked={locked} onUnlock={onUnlock} note="Members who track their applications on MadeVisa. Shown from 3 people, never names.">
            {diaspora} people from {homeName} applied to {company} through MadeVisa
          </Row>
        )}
      </div>
    </section>
  );
}
