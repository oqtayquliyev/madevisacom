// Job Reality Score: is this job real, live, and safe to apply to? One answer per job,
// with the reasons, so reliability is something people can see — not a promise.
//
//   Verified live   checked on the company's own careers page in the last 3 days, no warning signs
//   Looks real      a real source, but not re-checked lately, or old
//   Be careful      warning signs in the ad (fees, chat-app-only contact, "guaranteed visa"…)
//
// Scam shield: the ad text is scanned for the patterns behind the job scams that target
// people moving abroad. Real employers never charge you to apply, to train, or for a visa.

export type RealityInput = {
  sourceType?: 'company_submitted' | 'company_careers' | 'live_feed' | null;
  /** Last time a sync saw the job still on the company's careers page. */
  lastSeenAt?: string | null;
  /** When the company published it. */
  postedAt?: string | null;
  closed?: boolean;
  /** The ad as plain text (or HTML — tags are ignored). */
  text?: string | null;
  contactEmail?: string | null;
  company?: string | null;
  now?: number;
};

export type ScamFlag = { id: string; level: 'high' | 'medium'; label: string };
export type Reality = { score: number; level: 'verified' | 'real' | 'careful' | 'closed'; reasons: string[]; flags: ScamFlag[]; checkedHours: number | null };

const FREE_MAIL = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|aol|proton(mail)?|mail|gmx|yandex|icloud|rediffmail)\.[a-z.]+$/i;

const RULES: { id: string; level: ScamFlag['level']; label: string; re: RegExp }[] = [
  {
    id: 'fee',
    level: 'high',
    label: 'The ad asks you to pay (a fee or a deposit)',
    re: /\b(registration|processing|application|training|visa|placement|onboarding|equipment|medical|ticket|permit)\s+(fee|fees|charge|charges)\b(?![^.]{0,40}\b(paid|covered|reimbursed)\s+by\s+(the\s+)?(company|employer|us))|\bpay\s+(a|the|us\s+a)?\s*(fee|deposit)\b|\brefundable\s+deposit\b|\bsend\s+(us\s+)?(money|payment)\b/i,
  },
  { id: 'payment', level: 'high', label: 'Payment by crypto, gift cards or cheques you cash first', re: /\b(paid|pay|payment)\s+(in|with|via)\s+(crypto|bitcoin|usdt|gift\s*cards?)\b|\bcheque\s+to\s+(purchase|buy)\b/i },
  { id: 'guarantee', level: 'high', label: '“Guaranteed” visa or job, or no interview', re: /\bguaranteed\s+(job|visa|placement|employment|work\s+permit)\b|\b100\s*%\s+(visa|job)\b|\bno\s+interview\b|\bwithout\s+(an?\s+)?interview\b/i },
  { id: 'documents', level: 'medium', label: 'Asks for your passport or bank details up front', re: /\bsend\s+(us\s+)?(your\s+|a\s+copy\s+of\s+your\s+)?(passport|bank\s+(details|account)|id\s+card|national\s+id)\b/i },
  { id: 'chat', level: 'medium', label: 'Apply only through WhatsApp or Telegram', re: /\b(apply|contact|message|reach|text)\s+(us\s+)?(via|on|through|at)\s+(whatsapp|telegram|signal|viber)\b|\b(whatsapp|telegram)\s+only\b/i },
];

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

export function scanScam(text: string | null | undefined, contactEmail?: string | null, sourceType?: RealityInput['sourceType']): ScamFlag[] {
  const t = strip(text ?? '');
  const flags: ScamFlag[] = RULES.filter((r) => r.re.test(t)).map(({ id, level, label }) => ({ id, level, label }));
  // A recruiter writing from a free email address, for a job that isn't straight from the company's careers page.
  if (contactEmail && FREE_MAIL.test(contactEmail) && sourceType !== 'company_careers') {
    flags.push({ id: 'freemail', level: 'medium', label: 'The contact uses a free email address, not a company one' });
  }
  return flags;
}

const hoursSince = (iso: string | null | undefined, now: number) => (iso ? Math.max(0, (now - Date.parse(iso)) / 3_600_000) : null);
export const agoLabel = (h: number) => (h < 1 ? 'less than an hour ago' : h < 24 ? `${Math.round(h)} ${Math.round(h) === 1 ? 'hour' : 'hours'} ago` : `${Math.round(h / 24)} ${Math.round(h / 24) === 1 ? 'day' : 'days'} ago`);

export function jobReality(i: RealityInput): Reality {
  const now = i.now ?? Date.now();
  const flags = scanScam(i.text, i.contactEmail, i.sourceType);
  const checked = hoursSince(i.lastSeenAt, now);
  const posted = hoursSince(i.postedAt, now);
  if (i.closed) return { score: 0, level: 'closed', reasons: ['Taken down from the company’s careers page'], flags, checkedHours: checked };

  let score = 50;
  const reasons: string[] = [];
  const where = i.company ? `${i.company}’s careers page` : 'the company’s careers page';
  if (i.sourceType === 'company_careers') {
    if (checked != null && checked <= 24) {
      score += 38;
      reasons.push(`Checked live on ${where} ${agoLabel(checked)}`);
    } else if (checked != null && checked <= 72) {
      score += 28;
      reasons.push(`Checked live on ${where} ${agoLabel(checked)}`);
    } else if (checked != null) {
      score -= 8;
      reasons.push(`Not re-checked on ${where} for ${Math.round(checked / 24)} days`);
    } else {
      score += 10;
      reasons.push(`From ${where}`);
    }
  } else if (i.sourceType === 'company_submitted') {
    score += 30;
    reasons.push('Posted by the company itself on MadeVisa');
  } else if (i.sourceType === 'live_feed') {
    score += 5;
    reasons.push('From a public job feed');
  }
  if (posted != null) {
    if (posted <= 72) {
      score += 6;
      reasons.push(`Published ${agoLabel(posted)}`);
    } else if (posted > 60 * 24) {
      score -= 10;
      reasons.push(`Published ${Math.round(posted / 24 / 7)} weeks ago (may be always open)`);
    }
  }
  for (const f of flags) score -= f.level === 'high' ? 45 : 18;
  score = Math.max(1, Math.min(99, Math.round(score)));
  const level: Reality['level'] = flags.some((f) => f.level === 'high') || score < 45 ? 'careful' : score >= 75 ? 'verified' : 'real';
  return { score, level, reasons, flags, checkedHours: checked };
}

export const REALITY_LABEL: Record<Reality['level'], string> = { verified: 'Verified live', real: 'Looks real', careful: 'Be careful', closed: 'Closed' };
