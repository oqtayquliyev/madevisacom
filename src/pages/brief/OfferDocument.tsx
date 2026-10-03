// The Visa Plan itself — what the employer reads and what prints.
//
// It is a CANDIDATE SPONSORSHIP PROPOSAL: a way to open a conversation about
// sponsorship, immigration and relocation before any employment contract or
// immigration application exists. It is written so that nobody can mistake
// it for one of those:
//  - every fact carries its source and one of three standings — known,
//    proposed by the candidate, or needing confirmation (src/lib/proposal.ts);
//  - nothing says how likely a visa, a sponsorship or a job is;
//  - costs are shown one by one with the basis for each, never as a single
//    "employer N% / candidate N%" rule;
//  - a repayment term appears only when the candidate chose to propose one,
//    and then says that MadeVisa has not determined whether it is allowed.

import type { ReactNode } from 'react';
import { AlertTriangle, BadgeCheck, Check, CircleDot, Lock } from 'lucide-react';
import { CircleFlag } from '@/components/common/CircleFlag';
import { checkVisaSalary, formatMoney } from '@/data/visa/salaryThresholds';
import type { VisaGuide, VisaRoute } from '@/data/visa';
import { briefPath, GENERIC_ROUTE_ID, type BriefAcceptance } from '@/lib/briefs';
import { ARRANGEMENT_LABEL, cleanWebsite, currencyFor, money, type FactGroup, type OfferTerms, type Payer } from '@/lib/sponsorOffer';
import {
  COST_BASIS_LABEL,
  costMatrix,
  fmtDate,
  monthLabel,
  PROPOSAL_NOTICE,
  PROPOSAL_STATE_LABEL,
  VALID_DAYS,
  proposalState,
  verificationRows,
  verificationSummary,
  versionLabel,
  withThe,
  type CostBasis,
  type ProposalState,
} from '@/lib/proposal';

/** Everything the document prints, whether it's a draft or saved. */
export type DocData = {
  ref: string;
  issuedAt: string;
  shareId: string | null;
  jobTitle: string;
  companyName: string;
  city: string | null;
  candidateName: string;
  headline: string | null;
  linkedin: string | null;
  note: string | null;
};

const GROUP_TEXT: Record<FactGroup, string> = {
  known: 'text-emerald-800',
  proposed: 'text-[#1D4ED8] print:text-ink-900',
  unknown: 'text-amber-800',
};
const GROUP_WORD: Record<FactGroup, string> = {
  known: 'Known',
  proposed: 'Proposed',
  unknown: 'Needs confirmation',
};

function GroupIcon({ group, className = 'h-3.5 w-3.5' }: { group: FactGroup; className?: string }) {
  if (group === 'known') return <Check className={className} strokeWidth={3} aria-hidden />;
  if (group === 'proposed') return <CircleDot className={className} aria-hidden />;
  return <AlertTriangle className={className} aria-hidden />;
}

const STATE_TONE: Record<ProposalState, string> = {
  draft: 'bg-amber-50 text-amber-800',
  approved: 'bg-emerald-50 text-emerald-800',
  accepted: 'bg-emerald-600 text-white print:text-ink-950',
  expired: 'bg-ink-100 text-ink-700',
};

export function OfferDocument({
  doc,
  terms,
  guide,
  route,
  code,
  locked,
  draft,
  approvedAt,
  confirmed,
  adCountryName,
}: {
  doc: DocData;
  terms: OfferTerms;
  guide: VisaGuide;
  route: VisaRoute;
  code: string;
  /** No plan yet: the clause wording is left out and the page can't be printed. */
  locked?: boolean;
  /** Not saved yet: readable in full (with the plan), but still not printable. */
  draft?: boolean;
  approvedAt?: string | null;
  /** The company's reply "we accept in principle". */
  confirmed?: BriefAcceptance | null;
  /** Name of the country the job ad is for, when the candidate chose another. */
  adCountryName?: string | null;
}) {
  const employer = route.employer!;
  const generic = route.id === GENERIC_ROUTE_ID;
  const reviewed = generic ? null : (guide.reviewed ?? null);
  const place = [doc.city, guide.name].filter(Boolean).join(', ');
  /** The country's name inside a sentence ("the United States"). */
  const land = withThe(guide.name);
  const validUntil = new Date(Date.parse(doc.issuedAt) + VALID_DAYS * 86_400_000).toISOString();
  const state = proposalState({
    draft: !approvedAt,
    validUntil,
    acceptedAt: confirmed?.acceptedAt,
  });
  const stateDate = state === 'accepted' ? confirmed!.acceptedAt! : state === 'approved' ? approvedAt! : state === 'expired' ? validUntil : null;
  const stateText = `${PROPOSAL_STATE_LABEL[state]}${stateDate ? ` on ${fmtDate(stateDate)}` : ' · not yet approved'}`;

  const rows = verificationRows({
    facts: terms.facts,
    company: doc.companyName,
    website: cleanWebsite(terms.employer?.website),
    role: doc.jobTitle,
    code,
    countryName: guide.name,
    adCountryName,
    city: doc.city,
    salary: terms.salary ?? 0,
    route,
    generic,
    reviewed,
  });
  const sum = verificationSummary(rows);
  const costs = costMatrix({
    terms,
    route,
    generic,
    countryName: guide.name,
    reviewed,
  });
  const paidBy = (p: Payer) => costs.filter((c) => c.key !== 'by-law' && c.payer === p).map((c) => c.label);
  const routeRow = rows.find((r) => r.id === 'route')!;
  const sources = sourceList({ terms, route, guide, generic, code });

  let n = 0;
  const clause = () => ++n;
  const L = Boolean(locked);
  const noPrint = L || Boolean(draft);
  const first = doc.candidateName.split(/\s+/)[0];

  return (
    <>
      {noPrint && <div className="offer-paper hidden p-10 font-sans text-[14px] print:block">This is a preview. Prepare the document on madevisa.com to download the PDF.</div>}
      <article
        onContextMenu={L ? (e) => e.preventDefault() : undefined}
        className={`${L ? 'select-none print:hidden' : noPrint ? 'print:hidden' : 'offer-paper'} relative mx-auto max-w-[820px] overflow-hidden rounded-sm bg-white px-6 py-8 font-serif text-[15px] leading-[1.7] text-ink-900 shadow-soft-lg sm:px-14 sm:py-14 print:max-w-none print:rounded-none print:p-0 print:shadow-none`}
        data-doc="proposal"
      >
        {L && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-around overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="-rotate-12 whitespace-nowrap font-sans text-[56px] font-black tracking-widest text-[#1D4ED8]/[0.06] sm:text-[88px]">
                PREVIEW · PREVIEW
              </span>
            ))}
          </div>
        )}

        {/* Letterhead */}
        <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink-900 pb-4 font-sans">
          <div>
            <p className="text-[18px] font-extrabold tracking-tight text-ink-950">
              made<span className="text-[#1D4ED8]">visa</span>
            </p>
            <p className="text-[12px] text-ink-500">Candidate Sponsorship Proposal</p>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 text-[12px] leading-5 text-ink-600">
            <dt>Reference</dt>
            <dd className="font-semibold tabular-nums text-ink-900">
              {doc.ref} · v{versionLabel(terms)}
            </dd>
            <dt>Created</dt>
            <dd className="text-ink-900">{fmtDate(doc.issuedAt)}</dd>
            <dt>Valid until</dt>
            <dd className="text-ink-900">{fmtDate(validUntil)}</dd>
          </dl>
        </header>

        <h1 className="mt-8 text-[30px] font-semibold leading-[1.15] tracking-tight text-ink-950 sm:text-[38px] print:mt-5 print:text-[27px]" style={{ fontVariationSettings: '"opsz" 144' }}>
          Visa Plan: Candidate Sponsorship Proposal
        </h1>
        <p className="mt-3 font-sans text-[15px] leading-7 text-ink-700 print:mt-2 print:text-[13.5px] print:leading-6">
          From <strong className="text-ink-950">{doc.candidateName}</strong> (the Candidate) to <strong className="text-ink-950">{doc.companyName}</strong> (the Employer), about the role of{' '}
          <strong className="text-ink-950">{doc.jobTitle}</strong> in {land}. A candidate-initiated proposal for discussing sponsorship, immigration and relocation arrangements.
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-[13px]">
          <span data-state={state} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold print:bg-transparent print:px-0 ${STATE_TONE[state]}`}>
            {state === 'accepted' ? <BadgeCheck className="h-3.5 w-3.5" /> : state === 'approved' ? <Check className="h-3.5 w-3.5" /> : null}
            Status: {stateText}
            {state === 'accepted' && confirmed?.acceptedBy ? ` (${confirmed.acceptedBy})` : ''}
          </span>
          <span className="text-ink-500">A proposal for discussion · not an employment offer or a contract</span>
        </p>

        {/* Who, what, where */}
        <dl className="mt-8 grid gap-x-8 gap-y-4 border-y border-ink-200 py-5 font-sans text-[14px] sm:grid-cols-2 print:mt-4 print:grid-cols-2 print:gap-y-2 print:py-3 print:text-[13px]">
          <Party k="Candidate" v={doc.candidateName} sub={doc.headline} />
          <Party
            k="Employer"
            v={doc.companyName}
            sub={[cleanWebsite(terms.employer?.website), terms.employer?.hq ? `HQ ${terms.employer.hq}` : null, terms.employer?.contact].filter(Boolean).join(' · ') || null}
          />
          <Party k="Role" v={doc.jobTitle} sub={terms.facts?.employmentType ?? null} />
          <Party
            k="Work location"
            v={
              <span className="flex items-center gap-2">
                <CircleFlag countryCode={code} label={guide.name} size={18} /> {place}
              </span>
            }
            sub={[doc.city ? null : 'City not stated', terms.facts?.arrangement ? ARRANGEMENT_LABEL[terms.facts.arrangement] : null].filter(Boolean).join(' · ') || null}
          />
          <Party k="Potential immigration route" v={routeRow.value} sub={generic ? 'Employer or professional confirmation required' : 'Potential route identified · to be confirmed'} />
          <Party
            k="Annual gross salary"
            v={terms.salary ? money(terms.salary, code) : 'Not stated'}
            sub={terms.salary ? <SalaryMeetsLine salary={terms.salary} code={code} /> : terms.facts?.adPay ? `The job ad shows “${terms.facts.adPay}”` : 'To be confirmed by the Employer'}
          />
        </dl>

        {/* At a glance: how much of this is known, and who is proposed to pay what */}
        <div className="mt-5 grid gap-4 font-sans text-[13px] leading-5 sm:grid-cols-2 print:mt-3 print:grid-cols-2 print:text-[12px]">
          <div>
            <p className="text-[12px] font-semibold text-ink-500">Verification summary</p>
            <ul className="mt-1 space-y-0.5">
              {(['known', 'proposed', 'unknown'] as FactGroup[])
                .filter((g) => sum[g] > 0)
                .map((g) => (
                  <li key={g} className={`flex items-center gap-1.5 font-semibold ${GROUP_TEXT[g]}`}>
                    <GroupIcon group={g} />
                    <span>
                      {sum[g]} {g === 'known' ? 'supported by a source' : g === 'proposed' ? 'stated by the Candidate' : `need${sum[g] === 1 ? 's' : ''} confirmation`}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-ink-500">Proposed cost responsibility</p>
            <ul className="mt-1 space-y-0.5 text-ink-800">
              {(['employer', 'shared', 'candidate'] as Payer[]).map((p) => {
                const list = paidBy(p);
                if (!list.length) return null;
                return (
                  <li key={p}>
                    <span className="font-semibold text-ink-950">{p === 'employer' ? 'Employer' : p === 'shared' ? 'Shared' : 'Candidate'}:</span> {list.join(', ').toLowerCase()}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <Clause n={clause()} title="Purpose">
          The Candidate would like to work for the Employer in the role above and asks the Employer to consider sponsoring the work authorisation this needs. This proposal sets out what is known, what
          the Candidate suggests and what still has to be confirmed, so that both sides can discuss it before any employment contract or immigration application. It does not change pay or any other
          term of employment.
        </Clause>

        <TableClause
          n={clause()}
          title="Proposal verification"
          lead="Where each piece of information comes from. “Checked by the candidate” means the Candidate compared it with the original job ad; MadeVisa has not verified the Employer or the job independently."
          cols="grid-cols-[1.15fr_1fr_1fr]"
          heads={['Information', 'Source', 'Status']}
          lines={rows.map((r) => (
            <div
              key={r.id}
              data-row
              data-verify={r.id}
              data-status={r.status}
              className="grid break-inside-avoid gap-x-4 gap-y-0.5 border-b border-ink-200 py-2 sm:grid-cols-[1.15fr_1fr_1fr] print:grid-cols-[1.15fr_1fr_1fr] print:py-1 print:text-[12px] print:leading-[1.35]"
            >
              <div className="min-w-0">
                <span className="block text-[11.5px] text-ink-500">{r.label}</span>
                <span className="block break-words font-semibold text-ink-950">{r.value}</span>
                {r.detail && <span className="block break-words text-[12px] text-ink-500">{r.detail}</span>}
              </div>
              <div className="min-w-0 break-words text-[12.5px] text-ink-600">{r.source ?? <span className="text-ink-400">No source</span>}</div>
              <div className={`flex min-w-0 items-start gap-1.5 text-[12.5px] font-semibold ${GROUP_TEXT[r.group]}`}>
                <span className="mt-[3px] shrink-0">
                  <GroupIcon group={r.group} />
                </span>
                <span className="min-w-0 break-words">{r.statusText}</span>
              </div>
            </div>
          ))}
        >
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-sans text-[12px] text-ink-500">
            {(['known', 'proposed', 'unknown'] as FactGroup[]).map((g) => (
              <span key={g} className={`inline-flex items-center gap-1 ${GROUP_TEXT[g]}`}>
                <GroupIcon group={g} className="h-3 w-3" /> {GROUP_WORD[g]}
              </span>
            ))}
          </p>
        </TableClause>

        <Clause n={clause()} title="Potential immigration route" locked={L}>
          {generic ? (
            <>
              MadeVisa has no checked work route for {land}, so this proposal does not name one. Which permit or visa applies, and whether the Employer can sponsor it, has to be confirmed by the
              Employer or a qualified immigration professional.
            </>
          ) : (
            <>
              Based on the information provided, the <strong>{route.name}</strong> is a potentially applicable route. Whether it fits this role and this Candidate has to be confirmed by the Employer
              or a qualified immigration professional.
            </>
          )}
          <p className="mt-3 font-sans text-[13px] font-semibold text-ink-950">{generic ? 'What usually falls to the employer' : 'What this route usually asks of the employer'}</p>
          <ol className="mt-1 space-y-1.5">
            {employer.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-8 shrink-0 font-sans text-[13px] font-semibold tabular-nums text-ink-500">
                  {n}.{i + 1}
                </span>
                <span>
                  {s.text}
                  {s.optional && <span className="font-sans text-[12px] text-ink-500"> (if needed)</span>}
                </span>
              </li>
            ))}
          </ol>
          {employer.licenceNote && <p className="mt-2">{employer.licenceNote}</p>}
          <dl className="mt-3 grid gap-x-4 gap-y-1 font-sans text-[13.5px] sm:grid-cols-[auto_1fr] print:grid-cols-[auto_1fr]">
            <dt className="text-ink-500">Estimated processing</dt>
            <dd className="text-ink-900">{generic ? 'Not established' : employer.timeline}</dd>
            {generic ? (
              <>
                <dt className="text-ink-500">Reason</dt>
                <dd className="text-ink-900">Route not confirmed. The Candidate will check current processing times with the authorities of {land}.</dd>
              </>
            ) : (
              <>
                <dt className="text-ink-500">Basis</dt>
                <dd className="text-ink-900">
                  Official guidance
                  {monthLabel(reviewed) ? `, as MadeVisa last checked it in ${monthLabel(reviewed)}` : ''}. An estimate, not a commitment: processing times change.
                </dd>
              </>
            )}
          </dl>
        </Clause>

        <TableClause
          n={clause()}
          title="Cost responsibility"
          lead="Who the Candidate proposes should pay each cost, and the basis for it. Every line is open to a different answer from the Employer."
          cols="grid-cols-[1.2fr_0.7fr_1.3fr]"
          heads={['Cost', 'Proposed payer', 'Basis']}
          lines={costs.map((c) => (
            <div
              key={c.key}
              data-row
              data-cost={c.key}
              data-basis={c.basis}
              className="grid break-inside-avoid gap-x-4 gap-y-1 border-b border-ink-200 py-2 sm:grid-cols-[1.2fr_0.7fr_1.3fr] print:grid-cols-[1.2fr_0.7fr_1.3fr] print:py-1 print:text-[12px] print:leading-[1.35]"
            >
              <div className="min-w-0">
                <span className="block break-words font-semibold text-ink-950">{c.label}</span>
                {c.detail && !L && <span className="block break-words text-[12px] text-ink-600">{c.detail}</span>}
              </div>
              <div>
                <span key={c.payer} className={`offer-flash inline-flex rounded px-2 py-0.5 text-[13px] font-semibold ${PAYER_TONE[c.payer]}`}>
                  {c.payerText}
                </span>
              </div>
              <div className="min-w-0 text-[12.5px] text-ink-600">
                <span className={`block font-semibold ${BASIS_TONE[c.basis]}`}>{COST_BASIS_LABEL[c.basis]}</span>
                {!L && c.why && <span className="block break-words">{c.why}</span>}
              </div>
            </div>
          ))}
        >
          <p className={`mt-3 font-serif text-[15px] leading-[1.7] text-ink-800 print:text-[10pt] print:leading-[1.5] ${L ? 'hidden' : ''}`}>
            Where the Employer pays, the Candidate suggests it pays the provider directly or reimburses the Candidate against receipts. Where a cost is shared, each side pays half against receipts.
            Costs that the applicable law puts on the Employer stay with the Employer, whatever this table says.
          </p>
        </TableClause>

        <Clause n={clause()} title="Repayment" locked={L}>
          {terms.repayMonths ? (
            <>
              <strong>Proposed by the Candidate.</strong> If the Candidate resigns within {terms.repayMonths} months of starting, the Candidate would repay the costs the Employer actually paid under
              the cost table above, reduced pro rata for each full month worked. Nothing would be repaid if the Employer ends the employment for any reason other than the Candidate’s gross misconduct,
              and repayment would never cover costs the law puts on the Employer or take pay below the legal minimum or the salary the route requires.
              <Flag>
                MadeVisa cannot determine whether this repayment term is legally appropriate in {land}. Professional review recommended. It applies only if both parties write it into a signed
                agreement and the applicable law allows it.
              </Flag>
            </>
          ) : (
            <>Not included. The Candidate does not propose any repayment of costs the Employer pays.</>
          )}
        </Clause>

        {terms.salaryOffset ? (
          <Clause n={clause()} title="Salary deduction" locked={L}>
            <strong>Proposed by the Candidate.</strong> The Candidate is willing to agree, in writing, that the Employer deducts up to {money(terms.salaryOffset, code)}
            {terms.salary ? ` (about ${Math.round((terms.salaryOffset / terms.salary) * 1000) / 10}% of the stated annual gross salary)` : ''} from gross salary during the first twelve months, in
            equal monthly instalments and only to recover costs the Employer actually paid under the cost table above. Deductions would stop once those costs are recovered, would never cover costs the
            law puts on the Employer, and would never take pay below the legal minimum or the salary the route requires.
            <Flag>Whether deductions from pay are permitted, and on what conditions, depends on the law of {land}. MadeVisa has not determined this. Professional review recommended.</Flag>
          </Clause>
        ) : null}

        <Clause n={clause()} title="The Candidate’s part and target start" locked={L}>
          The Candidate provides their own documents (passport, qualifications, translations and anything else the authority asks of the applicant) and completes the applicant’s part of the
          application. Candidate target for starting: within approximately {terms.startWeeks} weeks after work authorisation is granted, subject to Employer onboarding, travel and applicable
          requirements. This is a target, not a commitment.
          {terms.remoteStart && (
            <>
              {' '}
              Until then, the Candidate is open to starting remotely from their country of residence if both sides want that. Whether and how this can be arranged depends on the law in both countries
              and needs to be checked first.
            </>
          )}
        </Clause>

        <Clause n={clause()} title="Pay and fair recruitment" locked={L}>
          Pay and conditions are set by the Employer in the employment contract and must meet the law of {land} and the requirements of the route that applies. Nothing in this proposal lowers them.
          The Candidate asks that no recruitment or placement fee be charged to them, and keeps their own identity and travel documents. The Candidate prepared this document with MadeVisa, a software
          service the Candidate uses directly; MadeVisa does not recruit for or represent the Employer and is not a party to this proposal.
        </Clause>

        {doc.note && (
          <Clause n={clause()} title="Note from the Candidate" locked={L}>
            <span className="whitespace-pre-line italic">{doc.note}</span>
          </Clause>
        )}

        <Clause n={clause()} title="Sources" locked={L}>
          <ul className="space-y-1.5 font-sans text-[13.5px] leading-5">
            {sources.map((s) => (
              <li key={s.label} className="break-inside-avoid">
                <span className="font-semibold text-ink-950">{s.label}</span>
                {s.url ? (
                  <>
                    {': '}
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-all text-[#1D4ED8] print:text-ink-700">
                      {s.url}
                    </a>
                  </>
                ) : null}
                {s.when ? <span className="block text-[12px] text-ink-500">{s.when}</span> : null}
              </li>
            ))}
          </ul>
        </Clause>

        <Clause n={clause()} title="Status of this proposal" locked={L}>
          This is a proposal from the Candidate. It is not an employment offer, an employment contract, an immigration application or a decision on one, and it guarantees neither sponsorship nor a
          visa. Its terms take effect only if the Employer and the Candidate write them into the employment contract or into a separate agreement they both sign. An Employer reply of “we accept in
          principle” means the Employer is willing to go ahead on this basis; it does not create employment. The proposal is valid for {VALID_DAYS} days from the date it was created. It was prepared
          with MadeVisa from the sources listed above and is not legal advice.
        </Clause>

        {/* Printed only: the company replies in one click (links stay clickable in PDFs). */}
        {doc.shareId && !L && (
          <a
            href={`https://madevisa.com${briefPath(doc.shareId)}`}
            className="mt-8 hidden break-inside-avoid items-center justify-between gap-4 rounded-lg border-2 border-[#1D4ED8] px-5 py-3 font-sans no-underline print:mt-5 print:flex"
          >
            <span>
              <span className="block text-[14px] font-bold text-ink-950">Reply to {first} in one click</span>
              <span className="block text-[12px] text-ink-600">Interested · Need more information · Accept in principle · Not right now — no account needed</span>
            </span>
            <span className="shrink-0 text-[13px] font-bold text-[#1D4ED8]">madevisa.com{briefPath(doc.shareId)}</span>
          </a>
        )}

        {/* Acknowledgement */}
        {L ? (
          <section className="mt-10 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#1D4ED8]/30 bg-[#1D4ED8]/[0.03] px-4 py-8 font-sans text-[14px] font-semibold text-[#1D4ED8]">
            <Lock className="h-4 w-4" /> Full wording and the acknowledgement lines unlock when you prepare the document
          </section>
        ) : (
          <section className="mt-10 break-inside-avoid font-sans text-[13px] print:mt-5 print:text-[12px]">
            <p className="font-semibold text-ink-950">Acknowledgement</p>
            <p className="mt-0.5 text-ink-600">Signing here acknowledges this proposal as a basis for discussion. It does not create an employment contract or an obligation to sponsor.</p>
            <div className="mt-2 grid gap-10 sm:grid-cols-2 print:grid-cols-2">
              <Sign who="Candidate" name={doc.candidateName} />
              <Sign who={`For ${doc.companyName}`} />
            </div>
          </section>
        )}

        <footer className="mt-12 border-t border-ink-200 pt-3 font-sans text-[11px] leading-4 text-ink-500 print:mt-4 print:pt-2 print:text-[9.5px] print:leading-[1.35]">
          <p className="flex flex-wrap gap-x-2 gap-y-0.5">
            <span className="font-semibold text-ink-700">MadeVisa {doc.ref}</span>
            <span>· Version {versionLabel(terms)}</span>
            <span>· Created {fmtDate(doc.issuedAt)}</span>
            <span>· Status: {stateText}</span>
            {doc.shareId ? (
              <span>
                · Check the current version at madevisa.com
                {briefPath(doc.shareId)}
              </span>
            ) : null}
          </p>
          <p className="mt-1.5 break-inside-avoid">
            <span className="font-semibold text-ink-700">Important notice.</span> {PROPOSAL_NOTICE}
          </p>
          {doc.linkedin && <p className="mt-1 hidden print:block">{doc.linkedin}</p>}
        </footer>
      </article>
    </>
  );
}

const PAYER_TONE: Record<Payer, string> = {
  employer: 'bg-[#1D4ED8] text-white print:bg-transparent print:p-0 print:text-ink-900',
  shared: 'bg-[#1D4ED8]/15 text-[#1D4ED8] print:bg-transparent print:p-0 print:text-ink-900',
  candidate: 'bg-ink-100 text-ink-800 print:bg-transparent print:p-0 print:text-ink-900',
};

const BASIS_TONE: Record<CostBasis, string> = {
  legal: 'text-emerald-800',
  proposal: 'text-[#1D4ED8] print:text-ink-900',
  review: 'text-amber-800',
};

/**
 * A numbered section that is a table. It may run over a page break, but the
 * heading, the line that introduces it, the column headings and the first
 * row always stay together, and no row is ever split.
 */
function TableClause({ n, title, lead, cols, heads, lines, children }: { n: number; title: string; lead: string; cols: string; heads: string[]; lines: ReactNode[]; children?: ReactNode }) {
  const pad = 'sm:pl-11 print:pl-0';
  const table = 'font-sans text-[13.5px] leading-5';
  return (
    <section className="offer-flow mt-7 print:mt-4" aria-label={title}>
      <div className="break-inside-avoid">
        <h2 className="flex gap-3 font-sans text-[15px] font-bold text-ink-950">
          <span className="w-8 shrink-0 tabular-nums text-[#1D4ED8] print:text-ink-900">{n}.</span>
          {title}
        </h2>
        <div className={`mt-1.5 ${pad}`}>
          <p className="font-sans text-[13px] leading-5 text-ink-600">{lead}</p>
          <div className={`mt-2 hidden ${cols} gap-x-4 border-b border-t border-b-ink-300 border-t-ink-900 py-1.5 font-sans text-[12px] font-semibold text-ink-600 sm:grid print:grid print:py-1`}>
            {heads.map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
          <div className={`${table} border-t border-ink-900 sm:border-t-0 print:border-t-0`}>{lines[0]}</div>
        </div>
      </div>
      <div className={`${pad} ${table}`}>{lines.slice(1)}</div>
      {children ? <div className={pad}>{children}</div> : null}
    </section>
  );
}

/** A line that says plainly what MadeVisa has not determined. */
function Flag({ children }: { children: ReactNode }) {
  return (
    <span className="mt-2 flex items-start gap-2 font-sans text-[13px] font-semibold leading-5 text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </span>
  );
}

/** Everything the document rests on, with the date each was captured or checked. */
function sourceList({
  terms,
  route,
  guide,
  generic,
  code,
}: {
  terms: OfferTerms;
  route: VisaRoute;
  guide: VisaGuide;
  generic: boolean;
  code: string;
}): { label: string; url: string | null; when: string | null }[] {
  const f = terms.facts;
  const out: { label: string; url: string | null; when: string | null }[] = [];
  if (f && !f.custom) {
    out.push({
      label: f.sourceUrl ? 'Original job ad' : 'Job ad as listed on MadeVisa (no link to the original)',
      url: f.sourceUrl,
      when: `Details captured ${fmtDate(f.capturedAt)}${f.postedAt ? ` · ad published ${fmtDate(f.postedAt)}` : ''}`,
    });
  } else if (f?.custom) {
    out.push({
      label: 'Company and role',
      url: null,
      when: 'Entered by the Candidate; no job ad was used',
    });
  }
  if (!generic && route.url) {
    out.push({
      label: `${route.name} — official source`,
      url: route.url,
      when: monthLabel(guide.reviewed) ? `MadeVisa last checked ${monthLabel(guide.reviewed)}` : null,
    });
  } else if (generic) {
    out.push({
      label: `Immigration rules of ${withThe(guide.name)}${route.url ? ' — an official page to start from' : ''}`,
      url: route.url || null,
      when: 'Not checked by MadeVisa: to be confirmed with the authority or a qualified immigration professional',
    });
  }
  const v = terms.salary
    ? checkVisaSalary({
        countryCode: code,
        min: terms.salary,
        max: null,
        currency: currencyFor(code).code,
        period: 'year',
      })
    : null;
  if (v)
    out.push({
      label: `${v.t.route} salary minimum — ${v.t.source.label}`,
      url: v.t.source.url,
      when: `Checked ${fmtDate(v.t.checkedOn)}`,
    });
  if (cleanWebsite(terms.employer?.website))
    out.push({
      label: 'Employer details',
      url: null,
      when: `MadeVisa’s company record for ${terms.employer?.name ?? 'the Employer'}; not verified with the Employer`,
    });
  return out;
}

/**
 * Under the salary: a sourced line saying the figure is at or above the
 * general minimum for the country's main work route, only when it clearly
 * is. Anything less certain says nothing extra — the document must never
 * overstate, and the general minimum is not the only salary rule.
 */
function SalaryMeetsLine({ salary, code }: { salary: number; code: string }) {
  const v = checkVisaSalary({
    countryCode: code,
    min: salary,
    max: null,
    currency: currencyFor(code).code,
    period: 'year',
  });
  if (v?.kind !== 'clears') return <>To be confirmed in the employment contract</>;
  return (
    <>
      To be confirmed in the employment contract.{' '}
      <span className="font-semibold text-emerald-700">
        At or above the general {v.t.route} minimum of {formatMoney(v.t.standard.annual, v.t.currency)}
      </span>{' '}
      <span className="text-[11px] text-ink-500">
        ({v.t.source.label}, checked{' '}
        {new Date(v.t.checkedOn).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
        ; other salary rules may apply)
      </span>
    </>
  );
}

function Party({ k, v, sub }: { k: string; v: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-500">{k}</dt>
      <dd className="mt-0.5 font-semibold text-ink-950">{v}</dd>
      {sub && <dd className="text-[13px] text-ink-600">{sub}</dd>}
    </div>
  );
}

function Clause({ n, title, children, locked }: { n: number; title: string; children: ReactNode; locked?: boolean }) {
  return (
    <section className="mt-7 break-inside-avoid print:mt-4">
      <h2 className="flex gap-3 font-sans text-[15px] font-bold text-ink-950">
        <span className="w-8 shrink-0 tabular-nums text-[#1D4ED8] print:text-ink-900">{n}.</span>
        {title}
      </h2>
      {locked ? (
        // Preview: the wording isn't in the page at all until it's prepared.
        <div className="mt-2.5 space-y-2 pl-11" aria-label="Unlocks when you prepare the document">
          {[92, 100, 78].map((w, i) => (
            <span key={i} className="block h-2.5 rounded-full bg-ink-100" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : (
        <div className="mt-1.5 pl-11 text-ink-800">{children}</div>
      )}
    </section>
  );
}

function Sign({ who, name }: { who: string; name?: string }) {
  return (
    <div>
      <p className="font-semibold text-ink-950">{who}</p>
      <div className="mt-10 border-b border-ink-900 print:mt-6" />
      <p className="mt-1 text-ink-500">Signature</p>
      <div className="mt-6 grid grid-cols-2 gap-4 print:mt-4">
        <div>
          <div className="h-5 border-b border-ink-400 text-ink-900">{name}</div>
          <p className="mt-1 text-ink-500">Name{name ? '' : ' and title'}</p>
        </div>
        <div>
          <div className="h-5 border-b border-ink-400" />
          <p className="mt-1 text-ink-500">Date</p>
        </div>
      </div>
    </div>
  );
}
