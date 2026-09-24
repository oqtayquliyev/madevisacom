// Detects structured job facts from free-text job descriptions:
//   compensation   "$126,000—$136,000 CAD", "€54,000 - €75,000", "USD 120k–150k per year"
//   experience     "8–12 years of progressive experience", "3+ years of ... experience", "at least 5 years"
//   work type      "Work Type: Onsite", "#LI-HYBRID", "This role is fully remote"
//   employment     "Employment type: Full-time", "This is a 12-month contract"
//   visa           "visa sponsorship is available" / "we are unable to sponsor visas"
//
// Used at import time (to fill empty DB fields), by the admin backfill,
// and as a display-time fallback on the job page. Every detector returns
// null rather than guessing when the text doesn't clearly say.

export type WorkArrangement = 'onsite' | 'hybrid' | 'remote';
export type VisaStatus = 'offered' | 'not_offered';

export type DetectedFacts = {
  compensation: string | null;
  experience: string | null;
  workArrangement: WorkArrangement | null;
  employmentType: string | null; // one of JOB_CATEGORIES
  visa: VisaStatus | null;
};

// ---------------------------------------------------------------------------
// HTML → text
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', euro: '€', pound: '£', yen: '¥', rsquo: '’', lsquo: '‘', hellip: '…' };

export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr|li)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Compensation
// ---------------------------------------------------------------------------

const CODES = 'USD|EUR|GBP|CAD|AUD|NZD|CHF|SEK|NOK|DKK|PLN|CZK|HUF|RON|AZN|AED|SAR|QAR|KWD|BHD|OMR|INR|JPY|CNY|SGD|HKD|KRW|BRL|MXN|ZAR|TRY|ILS|GEL|KZT|UAH';
const SYMS = 'US\\$|CA\\$|C\\$|A\\$|AU\\$|NZ\\$|S\\$|HK\\$|R\\$|\\$|€|£|¥|₹|₺|₽|₼|₪|₩|zł|kr\\.?';
const NUM = '\\d{1,3}(?:[,.\\u202f\\u00a0 ]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d+)?\\s?[kK]\\b|\\d{4,7}(?:[.,]\\d{1,2})?|\\d{2,3}(?:[.,]\\d{2})?';
const AMOUNT = `(?:(?:${SYMS})\\s?|(?:${CODES})\\s?)?(?:${NUM})(?:\\s?(?:${CODES})\\b)?`;
const RANGE_RE = new RegExp(`(${AMOUNT})(?:\\s*(?:-|–|—|to|and|until|bis|à)\\s*(${AMOUNT}))?(\\s*(?:${CODES})\\b)?`, 'gi');
const HAS_CURRENCY = new RegExp(`(?:${SYMS})|\\b(?:${CODES})\\b`, 'i');
const SALARY_CONTEXT = /salary|pay\b|pay range|compensation|base|wage|remuneration|OTE|earning|annual|per year|per annum|p\.a\.|hourly|range|gross/i;
const NOT_SALARY_AFTER = /^\s*(?:million|billion|bn\b|mn\b|m\b|b\b|trillion|users|customers|members|people|employees|downloads|in (?:revenue|funding|sales)|revenue|funding|valuation|ARR|of (?:revenue|funding))/i;

function toNumber(raw: string): number {
  let s = raw.replace(new RegExp(`(?:${SYMS})|\\b(?:${CODES})\\b`, 'gi'), '').trim();
  const k = /[kK]$/.test(s);
  s = s.replace(/[kK]$/, '').trim();
  // "126,000" / "126.000" / "126 000" — thousands separators; keep a trailing ",50"/".50" as decimals.
  s = s.replace(/[,.\u202f\u00a0 ](?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const n = parseFloat(s);
  return k ? n * 1000 : n;
}

function periodNear(text: string, start: number, end: number): string {
  const around = text.slice(Math.max(0, start - 80), Math.min(text.length, end + 40)).toLowerCase();
  if (/per hour|\/\s?h(ou)?r\b|hourly|an hour/.test(around)) return ' / hour';
  if (/per month|\/\s?mo(nth)?\b|monthly|a month/.test(around)) return ' / month';
  if (/per year|\/\s?y(ea)?r\b|annual|annually|per annum|p\.a\.|yearly|a year/.test(around)) return ' / year';
  return '';
}

export function detectCompensation(text: string): string | null {
  type Hit = { value: string; score: number };
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  RANGE_RE.lastIndex = 0;
  while ((m = RANGE_RE.exec(text))) {
    const full = m[0];
    if (!HAS_CURRENCY.test(full)) continue;
    const after = text.slice(m.index + full.length, m.index + full.length + 30);
    if (NOT_SALARY_AFTER.test(after)) continue;
    const lo = toNumber(m[1]);
    const hi = m[2] ? toNumber(m[2]) : lo;
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) continue;
    const period = periodNear(text, m.index, m.index + full.length);
    const hourly = period === ' / hour';
    if (!hourly && lo < 1000) continue; // "$5", "€40 credit"
    if (hourly && (lo < 5 || lo > 1000)) continue;
    if (lo > 5_000_000) continue;
    const before = text.slice(Math.max(0, m.index - 160), m.index);
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const line = text.slice(lineStart, text.indexOf('\n', m.index) === -1 ? undefined : text.indexOf('\n', m.index));
    const score = (SALARY_CONTEXT.test(before) || SALARY_CONTEXT.test(line) ? 2 : 0) + (m[2] ? 1 : 0) + (period ? 1 : 0);
    if (score === 0 && lo < 10_000) continue;
    const pretty = full
      .replace(/\s*(?:-|–|—|to|and|until|bis|à)\s*(?=(?:[^\s]*\d))/i, ' – ')
      .replace(/\s+/g, ' ')
      .replace(/[.,;:]$/, '')
      .trim();
    hits.push({ value: `${pretty}${period}`, score });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.score - a.score);
  return hits[0].value;
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

const DASH = '(?:-|–|—|to)';
const EXPERIENCE_RES: { re: RegExp; fmt: (m: RegExpMatchArray) => string }[] = [
  // "8–12 years of progressive experience", "3+ years of hands-on software engineering experience"
  {
    re: new RegExp(`\\b(\\d{1,2})\\s*(\\+|plus)?\\s*(?:${DASH}\\s*(\\d{1,2})\\s*\\+?\\s*)?(?:years?|yrs?)(?:['’]s?)?\\b(?:(?!\\n)[^.;]){0,80}?\\bexperience`, 'i'),
    fmt: (m) => (m[3] ? `${m[1]}–${m[3]} years` : m[2] ? `${m[1]}+ years` : `${m[1]}+ years`),
  },
  // "experience: 5+ years", "Experience of at least 4 years"
  { re: /\bexperience\b[^.\n]{0,40}?\b(?:at least|minimum(?: of)?|min\.?|over|more than)?\s*(\d{1,2})\s*(\+)?\s*(?:years?|yrs?)\b/i, fmt: (m) => `${m[1]}+ years` },
  // "minimum of 5 years", "at least 3 years in ..."
  { re: /\b(?:at least|minimum(?: of)?|min\.)\s+(\d{1,2})\s*(?:years?|yrs?)\b/i, fmt: (m) => `${m[1]}+ years` },
];

export function detectExperience(text: string): string | null {
  for (const { re, fmt } of EXPERIENCE_RES) {
    const m = text.match(re);
    if (!m) continue;
    const nums = m.slice(1).filter((x) => x && /^\d+$/.test(x)).map(Number);
    if (nums.some((n) => n > 40) || nums[0] === 0 && !nums[1]) continue;
    return fmt(m);
  }
  return null;
}

/** Buckets any experience text ("8–12 years", "Senior", "3+ years") into a filter level. */
export function experienceBucket(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  const n = s.match(/(\d{1,2})/);
  if (n) {
    const years = Number(n[1]);
    if (years <= 1) return 'Entry level (0–1 yrs)';
    if (years <= 4) return 'Mid level (2–4 yrs)';
    if (years <= 7) return 'Senior (5–7 yrs)';
    return 'Lead / Principal (8+ yrs)';
  }
  if (/intern|entry|junior|graduate|trainee/.test(s)) return 'Entry level (0–1 yrs)';
  if (/mid|intermediate|associate/.test(s)) return 'Mid level (2–4 yrs)';
  if (/senior|sr\b|experienced/.test(s)) return 'Senior (5–7 yrs)';
  if (/lead|principal|staff|director|head|executive|manager/.test(s)) return 'Lead / Principal (8+ yrs)';
  return raw;
}

// ---------------------------------------------------------------------------
// Work arrangement (on-site / hybrid / remote)
// ---------------------------------------------------------------------------

function arrangementFromWord(word: string): WorkArrangement | null {
  const w = word.toLowerCase();
  if (/hybrid|flexible/.test(w)) return 'hybrid';
  if (/remote|home|telecommut|virtual|anywhere/.test(w)) return 'remote';
  if (/on-?\s?site|onsite|in[- ]office|office[- ]based|on[- ]premise|in[- ]person/.test(w)) return 'onsite';
  return null;
}

export function detectWorkArrangement(text: string): WorkArrangement | null {
  // Labeled field: "Work Type: Onsite", "Workplace type Hybrid", "Location type: Remote"
  const labeled = text.match(/\b(?:work(?:place)?\s*(?:type|model|arrangement|setup|style|location)|location\s*type|remote\s*status|working\s*model|work\s*mode)\s*[:\-–]?\s*\n?\s*(on-?\s?site|onsite|in[- ]office|office[- ]based|in[- ]person|hybrid|flexible(?: hybrid)?|remote|fully remote|home[- ]based)/i);
  if (labeled) return arrangementFromWord(labeled[1]);
  // LinkedIn hashtags used by many ATS templates
  const tag = text.match(/#LI-(Hybrid|Remote|Onsite|On-?site)\b/i);
  if (tag) return arrangementFromWord(tag[1]);
  if (/\bflexible hybrid\b|\bhybrid (?:role|position|work(?:ing)?|model|schedule|setup)\b|\bthis (?:role|position|job) is hybrid\b|\bdays? (?:a|per) week in (?:the )?office\b/i.test(text)) return 'hybrid';
  if (/\b(?:this (?:is a |role is |position is )?(?:fully |100% )?remote(?: role| position)?|fully remote|remote-first|work from anywhere|100% remote)\b/i.test(text)) return 'remote';
  if (/\b(?:this (?:role|position) is (?:based )?on-?site|on-?site (?:role|position)|fully on-?site|5 days (?:a|per) week in (?:the )?office|in[- ]office (?:role|position))\b/i.test(text)) return 'onsite';
  return null;
}

export function workArrangementLabel(w: WorkArrangement | null | undefined): string | null {
  return w === 'onsite' ? 'On-site' : w === 'hybrid' ? 'Hybrid' : w === 'remote' ? 'Remote' : null;
}

// ---------------------------------------------------------------------------
// Employment type (maps to JOB_CATEGORIES)
// ---------------------------------------------------------------------------

export function detectEmploymentType(text: string, title = ''): string | null {
  const labeled = text.match(/\b(?:employment|job|contract|position|time)\s*type\s*[:\-–]?\s*\n?\s*([A-Za-z][A-Za-z /-]{2,30})/i);
  const source = `${labeled?.[1] ?? ''} ${title}`.toLowerCase();
  const pick = (s: string): string | null => {
    if (/\bintern(ship)?\b|werkstudent|working student/.test(s)) return 'Internship';
    if (/apprentice/.test(s)) return 'Apprenticeship';
    if (/volunteer/.test(s)) return 'Volunteer';
    if (/seasonal/.test(s)) return 'Seasonal work';
    if (/contract|freelance|fixed[- ]term|temporary|\btemp\b/.test(s)) return 'Contract / Freelance';
    if (/part[- ]?time/.test(s)) return 'Part time';
    if (/full[- ]?time|permanent|regular/.test(s)) return 'Full time';
    return null;
  };
  return pick(source) ?? pick(text.slice(0, 1500).toLowerCase().match(/\b(?:this is a |we are hiring a |as a )?(full[- ]time|part[- ]time|fixed[- ]term|temporary|freelance|internship|\d+[- ]month contract)\b/)?.[1] ?? '');
}

// ---------------------------------------------------------------------------
// Visa sponsorship
// ---------------------------------------------------------------------------

const VISA_NO = [
  /\b(?:not|unable to|cannot|can't|can ?not|won't|will not|do not|don't|does not|doesn't|are not able to|is not able to)\s+(?:be\s+)?(?:able to\s+)?(?:offer|provide|support|sponsor)(?:ing)?\s+(?:any\s+)?(?:visa|work permit|immigration|employment)?\s*(?:sponsorship|sponsor|visas?|permits?)?/i,
  /\bno\s+(?:visa|immigration|work permit)\s+sponsorship\b/i,
  /\bsponsorship\s+(?:is\s+)?not\s+(?:available|offered|provided|possible)\b/i,
  /\bwithout\s+(?:the\s+)?(?:need\s+(?:for|of)\s+)?(?:current or future\s+|future\s+)?(?:visa\s+|employer\s+)?sponsorship\b/i,
  /\bmust\s+(?:already\s+)?(?:have|hold|possess|be eligible for)\s+(?:the\s+)?(?:right|legal right|authori[sz]ation|eligibility)\s+to\s+work\b/i,
  /\bmust\s+be\s+(?:legally\s+)?(?:authori[sz]ed|eligible|entitled)\s+to\s+work\b/i,
];
const VISA_YES = [
  /\bvisa\s+sponsorship\s+(?:is\s+|will be\s+)?(?:available|offered|provided|possible|supported)\b/i,
  /\b(?:we|company|employer)\s+(?:will|can|do|are able to|is able to)\s+(?:offer\s+|provide\s+)?(?:visa\s+)?sponsor(?:ship)?\b/i,
  /\b(?:offer|provide|including|includes|with)\s+(?:full\s+)?(?:visa|work permit|immigration)\s+(?:sponsorship|support)\b/i,
  /\brelocation\s+(?:and|&)\s+visa\s+(?:support|sponsorship|assistance)\b/i,
  /\bsponsorship\s+(?:is\s+)?available\b/i,
];

export function detectVisa(text: string): VisaStatus | null {
  // Only look near the words that matter, so a "we do not" elsewhere can't flip the meaning.
  const windows: string[] = [];
  const re = /(visa|sponsor|work permit|right to work|authori[sz]ed to work|eligible to work|immigration)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && windows.length < 12) windows.push(text.slice(Math.max(0, m.index - 140), m.index + 140));
  if (!windows.length) return null;
  const joined = windows.join(' \n ');
  if (VISA_NO.some((r) => r.test(joined))) return 'not_offered';
  if (VISA_YES.some((r) => r.test(joined))) return 'offered';
  return null;
}

// ---------------------------------------------------------------------------

export function detectJobFacts(descriptionHtml: string | null | undefined, title = ''): DetectedFacts {
  const text = htmlToPlainText(descriptionHtml);
  return {
    compensation: detectCompensation(text),
    experience: detectExperience(text),
    workArrangement: detectWorkArrangement(text),
    employmentType: detectEmploymentType(text, title),
    visa: detectVisa(text),
  };
}
