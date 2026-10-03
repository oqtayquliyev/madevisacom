// The evidence layer of the Visa Plan (the candidate's sponsorship proposal).
//
// The document is a proposal that starts a conversation. It is only useful
// if the reader can tell, for every line, which of three things it is:
//   KNOWN     supported by a source we can point to (the job ad, an official page)
//   PROPOSED  something the candidate suggests or states about themselves
//   UNKNOWN   needs the employer, the authority or a professional to confirm
//
// Everything here is worked out from data the document already has. Nothing
// is inferred, scored or estimated: a salary the ad doesn't state is "Not
// stated", a route we have not checked is "To be confirmed", and no line
// ever says how likely a visa or a job is.

import type { VisaRoute } from '@/data/visa';
import {
  ARRANGEMENT_LABEL,
  FACT_GROUP,
  FACT_STATUS_LABEL,
  money,
  OFFER_ITEM_LABEL,
  PAYER_LABEL,
  type FactGroup,
  type FactStatus,
  type OfferTerms,
  type Payer,
  type ProposalFacts,
  type WorkArrangement,
} from '@/lib/sponsorOffer';

/** Printed at the foot of every document. */
export const PROPOSAL_NOTICE =
  'This document is a candidate-initiated sponsorship and mobility proposal. It is not an employment contract, an immigration approval, a visa guarantee or a guarantee of sponsorship. Immigration and employment requirements vary by country and route. Anything marked as needing confirmation should be checked with the employer, the relevant government authority or a qualified immigration professional.';

/** "1.0" when made, "1.1" after the first saved change, and so on. */
export const versionLabel = (t: Pick<OfferTerms, 'rev'>) => `1.${Math.max(0, Math.round(t.rev ?? 0))}`;

/** A proposal is valid for this many days from the day it was made. */
export const VALID_DAYS = 30;
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const day = fmtDate;
/** '2026-06' → 'June 2026'. */
export function monthLabel(ym: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym ?? '');
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
/** "United States" → "the United States", for use inside a sentence. */
export const withThe = (name: string) => (/^(United |Netherlands$|Philippines$|Czech Republic$|Dominican Republic$|Central African|Democratic Republic|Republic of|Bahamas$|Maldives$|Seychelles$|Gambia$|Comoros$|Marshall Islands$|Solomon Islands$|Cayman Islands$|Faroe Islands$)/.test(name) ? `the ${name}` : name);

/** 'https://www.gov.uk/skilled-worker-visa' → 'gov.uk'. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '') || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Where the document stands
// ---------------------------------------------------------------------------

export type ProposalState = 'draft' | 'approved' | 'accepted' | 'expired';

export const PROPOSAL_STATE_LABEL: Record<ProposalState, string> = {
  draft: 'Draft',
  approved: 'Approved by the candidate',
  accepted: 'Accepted in principle by the employer',
  expired: 'Validity ended',
};

export function proposalState(input: { draft: boolean; validUntil: string; acceptedAt?: string | null; now?: number }): ProposalState {
  if (input.draft) return 'draft';
  if (input.acceptedAt) return 'accepted';
  return (input.now ?? Date.now()) > Date.parse(input.validUntil) ? 'expired' : 'approved';
}

// ---------------------------------------------------------------------------
// The snapshot taken when the document is made
// ---------------------------------------------------------------------------

/** Stored as the ad's country when the ad names no single country ("Various", remote). */
export const NO_AD_COUNTRY = '-';

/** Long tracking links are cut to the page itself: the snapshot has to stay small. */
function compactUrl(url: string | null | undefined): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  if (url.length <= 400) return url;
  try {
    const u = new URL(url);
    const bare = `${u.origin}${u.pathname}`;
    return bare.length <= 400 ? bare : u.origin;
  } catch {
    return null;
  }
}

const clip = (v: string | null | undefined, n: number) => {
  const t = (v ?? '').trim();
  return t ? t.slice(0, n) : null;
};

export function captureFacts(input: {
  custom: boolean;
  sourceUrl: string | null | undefined;
  postedAt: string | null | undefined;
  /** Ids of the lines the candidate ticked. */
  checked: string[];
  arrangement: WorkArrangement | null | undefined;
  employmentType: string | null | undefined;
  adPay: string | null | undefined;
  /** Annual salary on the document, and the one worked out from the ad (0 = none). */
  salary: number;
  adSalary: number;
  sponsorship: ProposalFacts['sponsorship'];
  /** The candidate chose the country themselves: the ad's own country code, or '' when the ad names none. Null = the ad's country is used. */
  adCountry?: string | null;
  now?: string;
}): ProposalFacts {
  const facts: ProposalFacts = {
    v: 1,
    sourceUrl: input.custom ? null : compactUrl(input.sourceUrl),
    capturedAt: input.now ?? new Date().toISOString(),
    postedAt: input.custom ? null : input.postedAt ?? null,
    custom: input.custom,
    checked: [...new Set(input.checked)].slice(0, 16),
    arrangement: input.custom ? null : input.arrangement ?? null,
    employmentType: input.custom ? null : clip(input.employmentType, 60),
    adPay: input.custom ? null : clip(input.adPay, 80),
    salarySource: !input.salary ? 'missing' : !input.custom && input.adSalary > 0 && input.salary === input.adSalary ? 'job_ad' : 'candidate',
    sponsorship: input.custom ? 'not_stated' : input.sponsorship,
  };
  if (!input.custom && input.adCountry != null) facts.adCountry = input.adCountry.toUpperCase() || NO_AD_COUNTRY;
  return facts;
}

/**
 * The owner changed a saved document: anything they changed is no longer
 * "checked against the ad", it is their own information.
 */
export function reviseFacts(facts: ProposalFacts | undefined, before: OfferTerms, after: OfferTerms): ProposalFacts | undefined {
  if (!facts) return facts;
  let checked = facts.checked;
  let salarySource = facts.salarySource;
  if ((before.salary ?? 0) !== (after.salary ?? 0)) {
    checked = checked.filter((id) => id !== 'salary');
    salarySource = after.salary ? 'candidate' : 'missing';
  }
  if ((before.employer?.name ?? '') !== (after.employer?.name ?? '')) checked = checked.filter((id) => id !== 'company');
  return { ...facts, checked, salarySource };
}

// ---------------------------------------------------------------------------
// Proposal verification: one row per fact, with its source and status
// ---------------------------------------------------------------------------

export type VerifyRow = {
  id: string;
  label: string;
  value: string;
  /** A second line under the value. */
  detail?: string;
  /** Where the value comes from, in words. Null when there is no source. */
  source: string | null;
  status: FactStatus;
  /** The status in words, when the standard label needs more precision. */
  statusText: string;
  group: FactGroup;
};

export type VerifyInput = {
  facts: ProposalFacts | undefined;
  company: string;
  website: string | null;
  role: string;
  code: string;
  countryName: string;
  /** Name of the ad's own country, when it differs. */
  adCountryName?: string | null;
  city: string | null;
  salary: number;
  route: VisaRoute;
  /** No checked route for this country: the general "national work permit". */
  generic: boolean;
  /** When MadeVisa last checked this country's routes against official sources ('YYYY-MM'). */
  reviewed: string | null;
};

export function verificationRows(v: VerifyInput): VerifyRow[] {
  const f = v.facts;
  const host = hostOf(f?.sourceUrl);
  const adSource = !f || f.custom ? null : host ? `Original job ad (${host})` : 'Job ad as listed on MadeVisa';
  const row = (id: string, label: string, value: string, source: string | null, status: FactStatus, extra?: { detail?: string; statusText?: string }): VerifyRow => ({
    id,
    label,
    value,
    source,
    status,
    statusText: extra?.statusText ?? FACT_STATUS_LABEL[status],
    detail: extra?.detail,
    group: FACT_GROUP[status],
  });
  /** A value that came with the job ad: checked by the candidate, or only taken from it. */
  const fromAd = (tick: string): { source: string | null; status: FactStatus } => {
    if (!f) return { source: null, status: 'candidate' };
    if (f.custom) return { source: 'Entered by the candidate', status: 'candidate' };
    return { source: adSource, status: f.checked.includes(tick) ? 'checked' : 'source' };
  };
  const official = hostOf(v.route.url);
  const checkedOn = monthLabel(v.reviewed);
  const routeSource = official ? `Official source (${official})${checkedOn ? ` · MadeVisa last checked ${checkedOn}` : ''}` : null;
  const rows: VerifyRow[] = [];

  // Who and what
  const company = fromAd('company');
  rows.push(row('company', 'Employer', v.company, company.source, company.status, { detail: v.website ?? undefined }));
  const role = fromAd('role');
  rows.push(row('role', 'Role', v.role, role.source, role.status));

  // Where
  if (f?.adCountry === NO_AD_COUNTRY) {
    rows.push(row('country', 'Work country', v.countryName, 'Chosen by the candidate · the job ad names no single country', 'candidate', { statusText: 'Provided by the candidate · needs employer confirmation' }));
  } else if (f?.adCountry && f.adCountry !== v.code) {
    rows.push(row('country', 'Work country', v.countryName, `Chosen by the candidate${v.adCountryName ? ` · the job ad is for ${v.adCountryName}` : ''}`, 'conflict'));
  } else {
    const c = fromAd('country');
    rows.push(row('country', 'Work country', v.countryName, c.source, c.status));
  }
  if (v.city) {
    const p = fromAd('place');
    rows.push(row('place', 'Work location', v.city, p.source, p.status, { detail: 'The place of work, not the employer’s headquarters' }));
  } else {
    rows.push(row('place', 'Work location', 'City not stated', adSource, 'missing', { statusText: 'Not stated · needs employer confirmation' }));
  }
  if (f && !f.custom) {
    const w = fromAd('work');
    rows.push(
      f.arrangement
        ? row('arrangement', 'On site, hybrid or remote', ARRANGEMENT_LABEL[f.arrangement], w.source, w.status)
        : row('arrangement', 'On site, hybrid or remote', 'Not stated in the job ad', adSource, 'missing'),
    );
    rows.push(f.employmentType ? row('type', 'Employment type', f.employmentType, w.source, w.status) : row('type', 'Employment type', 'Not stated in the job ad', adSource, 'missing'));
  }

  // Pay: never worked out from anything but the ad or the candidate's own entry.
  if (v.salary > 0 && f?.salarySource === 'job_ad') {
    const s = fromAd('salary');
    rows.push(row('salary', 'Annual gross salary', money(v.salary, v.code), `${s.source ?? 'Job ad'}${f.adPay ? `: “${f.adPay}”` : ''}`, s.status, { detail: 'To be confirmed in the employment contract' }));
  } else if (v.salary > 0) {
    const adSays = !f || f.custom ? '' : f.adPay ? ` · the job ad shows “${f.adPay}”` : ' · the job ad shows no pay';
    rows.push(row('salary', 'Annual gross salary', money(v.salary, v.code), `Entered by the candidate${adSays}`, 'candidate', { detail: 'To be confirmed in the employment contract' }));
  } else if (f?.adPay) {
    const s = fromAd('salary');
    rows.push(row('salary', 'Pay', f.adPay, s.source, s.status, { detail: 'Annual gross salary not stated' }));
  } else {
    rows.push(row('salary', 'Annual gross salary', 'Not stated', adSource, 'missing', { statusText: f && !f.custom ? 'Not stated in the job ad' : 'Not stated' }));
  }

  // Sponsorship and the route
  if (f?.sponsorship === 'offered') {
    const s = fromAd('sponsor');
    rows.push(row('sponsor', 'Visa sponsorship', 'The job ad says sponsorship is offered', s.source, s.status));
  } else if (f?.sponsorship === 'not_offered') {
    rows.push(row('sponsor', 'Visa sponsorship', 'The job ad says sponsorship is not offered', adSource, 'conflict', { statusText: 'The ad says no · the candidate asks the employer to reconsider' }));
  } else {
    rows.push(row('sponsor', 'Visa sponsorship', f && !f.custom ? 'Not stated in the job ad' : 'Not stated', adSource, 'confirm'));
  }
  if (v.generic) {
    rows.push(
      row('route', 'Potential immigration route', 'To be confirmed', `MadeVisa has no checked route for ${withThe(v.countryName)}`, 'review', {
        statusText: 'Employer or professional confirmation required',
      }),
    );
    rows.push(row('licence', 'Sponsor licence or registration', 'To be confirmed', null, 'confirm'));
  } else {
    rows.push(
      row('route', 'Potential immigration route', v.route.name, routeSource, 'confirm', {
        statusText: 'Potential route identified · whether it fits this role and candidate needs confirmation',
      }),
    );
    rows.push(
      v.route.employer?.licenceNeeded
        ? row('licence', 'Sponsor licence or registration', 'This route asks the employer to hold one', routeSource, 'confirm', { statusText: 'Whether the employer holds one needs employer confirmation' })
        : row('licence', 'Sponsor licence or registration', 'Not asked for on this route', routeSource, 'source'),
    );
  }

  // The source itself
  if (f) {
    const when = `Details captured ${day(f.capturedAt)}${f.postedAt ? ` · ad published ${day(f.postedAt)}` : ''}`;
    rows.push(
      f.custom
        ? row('source', 'Job source', 'No job ad: company and role entered by the candidate', null, 'candidate')
        : f.sourceUrl
          ? row('source', 'Job source', host ?? 'Original job ad', when, 'source')
          : row('source', 'Job source', 'No link to the original ad', when, 'missing', { statusText: 'Listed on MadeVisa · original link not available' }),
    );
  }
  return rows;
}

/** How many lines are known, proposed and unknown — a count, not a score. */
export function verificationSummary(rows: VerifyRow[]): Record<FactGroup, number> {
  const out: Record<FactGroup, number> = { known: 0, proposed: 0, unknown: 0 };
  for (const r of rows) out[r.group] += 1;
  return out;
}

// ---------------------------------------------------------------------------
// Cost responsibility: who is proposed to pay each cost, and on what basis
// ---------------------------------------------------------------------------

export type CostBasis = 'legal' | 'proposal' | 'review';
export const COST_BASIS_LABEL: Record<CostBasis, string> = {
  legal: 'Route rule · official source',
  proposal: 'Candidate proposal',
  review: 'Not checked · confirm before agreeing',
};

export type CostRow = {
  key: string;
  label: string;
  detail?: string;
  payer: Payer;
  payerText: string;
  basis: CostBasis;
  /** The basis in a sentence, with its source. */
  why: string;
};

export function costMatrix(input: { terms: OfferTerms; route: VisaRoute; generic: boolean; countryName: string; reviewed: string | null }): CostRow[] {
  const { terms, route, generic, countryName } = input;
  const official = hostOf(route.url);
  const checkedOn = monthLabel(input.reviewed);
  const sourced = [official ? `Source: ${official}` : null, checkedOn ? `checked ${checkedOn}` : null].filter(Boolean).join(' · ');
  const rows: CostRow[] = [];
  if (generic) {
    rows.push({
      key: 'by-law',
      label: `Any fee or charge the law of ${withThe(countryName)} puts on the employer`,
      payer: 'employer',
      payerText: 'Employer',
      basis: 'review',
      why: `MadeVisa has not checked which costs these are in ${withThe(countryName)}. Whatever they are, they stay with the Employer; nothing in this proposal moves them to the Candidate.`,
    });
  } else if (route.employer?.employerCosts) {
    rows.push({
      key: 'by-law',
      label: 'Employer-only costs on this route',
      detail: route.employer.employerCosts,
      payer: 'employer',
      payerText: 'Employer',
      basis: 'legal',
      why: `Stays with the Employer; never recovered from the Candidate.${sourced ? ` ${sourced}.` : ''}`,
    });
  }
  for (const it of terms.items) {
    const moved = it.payer !== 'employer';
    rows.push({
      key: it.key,
      label: OFFER_ITEM_LABEL[it.key],
      payer: it.payer,
      payerText: PAYER_LABEL[it.payer],
      basis: generic && moved ? 'review' : 'proposal',
      why: !moved
        ? ''
        : generic
          ? `The Candidate offers to ${it.payer === 'shared' ? 'share' : 'pay'} this. MadeVisa has not checked whether the law of ${withThe(countryName)} allows it.`
          : `A cost a candidate may pay on this route, per MadeVisa’s check${checkedOn ? ` of ${checkedOn}` : ''}.`,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// What is still open
// ---------------------------------------------------------------------------

export type Gap = { id: string; text: string; group: 'recommended' | 'employer' | 'review' };
export const GAP_GROUP_LABEL: Record<Gap['group'], string> = {
  recommended: 'Worth adding if you know it',
  employer: 'The employer has to confirm',
  review: 'Professional review recommended',
};

/**
 * What the document cannot state as known. None of it stops the download:
 * each one is printed on the document as needing confirmation.
 */
export function openQuestions(input: { rows: VerifyRow[]; terms: OfferTerms; generic: boolean; countryName: string }): Gap[] {
  const { rows, terms, generic, countryName } = input;
  const by = (id: string) => rows.find((r) => r.id === id);
  const out: Gap[] = [];
  const salary = by('salary');
  if (salary?.status === 'missing' || salary?.label === 'Pay') out.push({ id: 'salary', group: 'recommended', text: 'Annual gross salary' });
  if (by('place')?.status === 'missing') out.push({ id: 'place', group: 'employer', text: 'City or worksite' });
  if (by('arrangement')?.status === 'missing') out.push({ id: 'arrangement', group: 'employer', text: 'On site, hybrid or remote' });
  if (by('type')?.status === 'missing') out.push({ id: 'type', group: 'employer', text: 'Employment type' });
  const sponsor = by('sponsor');
  if (sponsor && sponsor.group === 'unknown') out.push({ id: 'sponsor', group: 'employer', text: 'Whether the employer will sponsor' });
  if (by('licence')?.group === 'unknown') out.push({ id: 'licence', group: 'employer', text: 'Sponsor licence or registration' });
  out.push(generic ? { id: 'route', group: 'review', text: `Which immigration route applies in ${withThe(countryName)}` } : { id: 'route', group: 'employer', text: 'That the route fits this role and candidate' });
  if (generic && terms.items.some((i) => i.payer !== 'employer')) out.push({ id: 'costs', group: 'review', text: `Which costs a candidate may pay in ${withThe(countryName)}` });
  if (terms.repayMonths) out.push({ id: 'repay', group: 'review', text: 'The repayment term you propose' });
  if (terms.salaryOffset) out.push({ id: 'offset', group: 'review', text: 'The salary deduction you propose' });
  return out;
}
