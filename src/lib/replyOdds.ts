// Reply odds: one honest label per job — how likely a reply is, from what we know.
//   High / Fair / Low, with the reasons that made it.
// Signals (each only when we have it):
//   - the company's reply rate from MadeVisa members' tracked applications (strongest)
//   - how fresh the job is (first days = the recruiter is reading)
//   - is the company actively hiring (roles added in the last 30 days)
//   - visa: sponsorship offered in the ad, or a sponsor record in official data
//   - the visitor's CV match score
// It is an estimate, labelled as one. With too few signals it says nothing.

export type OddsInput = {
  /** % of tracked applicants who got a reply (null when too few). */
  responseRate?: number | null;
  /** Days since the company published the job. */
  ageDays?: number | null;
  /** Roles the company added in the last 30 days. */
  posted30d?: number | null;
  visaOffered?: boolean;
  sponsorRecord?: boolean;
  /** Does the visitor need a visa for this country? */
  needsVisa?: boolean;
  /** CV match 0–100, when the visitor has a CV. */
  match?: number | null;
};

export type Odds = { level: 'high' | 'fair' | 'low'; score: number; reasons: string[] };

export function replyOdds(i: OddsInput): Odds | null {
  let score = 50;
  let signals = 0;
  const reasons: string[] = [];
  if (i.responseRate != null) {
    signals += 2;
    score += (i.responseRate - 25) * 0.9;
    reasons.push(`replies to ${Math.round(i.responseRate)}% of tracked applicants`);
  }
  if (i.ageDays != null) {
    signals++;
    if (i.ageDays <= 3) {
      score += 14;
      reasons.push('posted in the last 3 days');
    } else if (i.ageDays <= 14) score += 5;
    else if (i.ageDays > 45) {
      score -= 12;
      reasons.push('posted over 6 weeks ago');
    }
  }
  if (i.posted30d != null && i.posted30d > 0) {
    signals++;
    score += Math.min(10, i.posted30d * 2);
    if (i.posted30d >= 3) reasons.push(`${i.posted30d} new roles this month`);
  }
  if (i.needsVisa) {
    signals++;
    if (i.visaOffered || i.sponsorRecord) {
      score += 8;
      reasons.push(i.visaOffered ? 'sponsorship offered in the ad' : 'official sponsor record');
    } else score -= 10;
  }
  if (i.match != null) {
    signals += 2;
    score += (i.match - 55) * 0.6;
    reasons.push(`your CV matches ${Math.round(i.match)}%`);
  }
  if (signals < 2) return null;
  score = Math.max(3, Math.min(97, Math.round(score)));
  return { level: score >= 66 ? 'high' : score >= 42 ? 'fair' : 'low', score, reasons: reasons.slice(0, 3) };
}

export const ODDS_LABEL: Record<Odds['level'], string> = { high: 'High', fair: 'Fair', low: 'Low' };
