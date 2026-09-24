// Detects structured job facts from free-text job descriptions:
//   compensation   "$126,000—$136,000 CAD", "€54,000 - €75,000", "USD 120k–150k per year"
//   experience     "8–12 years of progressive experience", "3+ years of ... experience", "at least 5 years"
//   work type      "Work Type: Onsite", "#LI-HYBRID", "This role is fully remote"
//   employment     "Employment type: Full-time", "This is a 12-month contract"
//   visa           "visa sponsorship is available" / "we are unable to sponsor visas"
//   labeled facts  "Career Level: Apprentices", "Remote Working: Up to 20%", "Posting Date: Sep 23, 2026"
//
// Used at import time (to fill empty DB fields), by the admin backfill,
// and as a display-time fallback on the job page. Every detector returns
// null rather than guessing when the text doesn't clearly say.

import { allCountries } from '@/data/allCountries';

export type WorkArrangement = 'onsite' | 'hybrid' | 'remote';
export type VisaStatus = 'offered' | 'not_offered';

export type DetectedFacts = {
  compensation: string | null;
  experience: string | null;
  workArrangement: WorkArrangement | null;
  employmentType: string | null; // one of JOB_CATEGORIES
  visa: VisaStatus | null;
  /** "Full-time" / "Part-time", from a labeled field ("Working Model: Full-time"). */
  schedule: string | null;
  /** "Fixed-term" / "Permanent", from a labeled field ("Contract Type: Fixed-term"). */
  contractTerm: string | null;
  /** Extra remote detail from the source ("Up to 20% remote"). */
  remoteDetail: string | null;
  /** Department / function as the source names it ("Production and Manufacturing Strategy"). */
  department: string | null;
  /** Location as the source lists it ("Osnabrück, DE"). */
  location: string | null;
  /** Posting date printed on the source page, as an ISO string. */
  postedAt: string | null;
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
// Money mentioned in a benefits context is not the salary: "$1750 per
// family annually" (insurance), "€2000 L&D budget", "$500 home-office
// stipend", "referral bonus of £1,000".
const BENEFIT_CONTEXT = /insurance|premium|deductible|\bhsa\b|\bfsa\b|401\s?\(?k|pension|allowance|stipend|budget|reimburs|bonus|referral|per family|per ee\b|contribut|l\s?&\s?d|learning|training|equity|stock|shares|relocation|sign(?:ing|-on)|voucher|credit|gym|wellness|wellbeing|meal|lunch|childcare|tuition|equipment|home[- ]office|internet|phone|travel|per diem|donation|matching/i;
const STRONG_SALARY_CONTEXT = /\b(?:salary|base pay|base salary|pay range|salary range|compensation range|annual (?:base )?(?:salary|pay)|hourly (?:rate|pay|wage)|wage|gehalt|vergütung|remuneration|OTE|on-target)\b/i;
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
    // The sentence the amount sits in (bounded by the line).
    const sentenceStart = Math.max(lineStart, text.lastIndexOf('. ', m.index) + 1);
    const near = text.slice(sentenceStart, Math.min(text.length, m.index + full.length + 60));
    const strong = STRONG_SALARY_CONTEXT.test(near) || STRONG_SALARY_CONTEXT.test(before.slice(-60));
    if (!strong && BENEFIT_CONTEXT.test(near)) continue;
    const score = (SALARY_CONTEXT.test(before) || SALARY_CONTEXT.test(line) ? 2 : 0) + (m[2] ? 1 : 0) + (period ? 1 : 0) + (strong ? 2 : 0);
    if (score === 0 && lo < 10_000) continue;
    // A lone yearly figure under 15k with no salary wording is almost never a salary.
    if (!strong && !m[2] && !hourly && period !== ' / month' && lo < 15_000) continue;
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
  if (/\b(?:this (?:role|position) is (?:based )?on-?site|on-?site (?:role|position)|fully on-?site|5 days (?:a|per) week in (?:the )?office|in[- ]office (?:role|position)|office[- ]first|office[- ]based (?:role|position|setup)|work from (?:our|the) office)\b/i.test(text)) return 'onsite';
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
// Labeled fields ("Job ID: 29644", "Career Level:\nApprentices", ...)
// ---------------------------------------------------------------------------
//
// Many career sites (SAP SuccessFactors, Workday, Phenom, ...) print a
// facts block at the top of the description — and often a second copy
// further down. These labels are read into structured facts, and the
// block itself is removed from the displayed description (see
// cleanJobDescriptionHtml below).

export type LabeledKey =
  | 'jobId'
  | 'company'
  | 'location'
  | 'department'
  | 'careerLevel'
  | 'workingModel'
  | 'contractType'
  | 'employmentType'
  | 'remote'
  | 'postingDate'
  | 'startDate'
  | 'deadline'
  | 'salary'
  | 'hours'
  | 'contactName'
  | 'email'
  | 'phone';

const LABELS: [LabeledKey, RegExp][] = [
  ['jobId', /^(?!(?:id|no\.?|number|#|code)$)(?:job\s*)?(?:req(?:uisition)?\s*|posting\s*|vacancy\s*|position\s*|reference\s*|ref\.?\s*)?(?:id|no\.?|number|#|code)$|^(?:job )?requisition$|^stellen-?id$|^kennziffer$/i],
  ['company', /^(?:company|hiring company|legal entity|employer|entity|organi[sz]ation|gesellschaft|unternehmen)$/i],
  ['location', /^(?:locations?|job location|work location|primary location|place of work|city|office|standort|arbeitsort)$/i],
  ['department', /^(?:department|division|business unit|business area|job function|job family(?: group)?|job category|functional area|bereich|fachbereich)$/i],
  ['careerLevel', /^(?:career level|experience level|seniority(?: level)?|job level|position level|karrierelevel|karrierestufe)$/i],
  ['workingModel', /^(?:working model|work model|working time|time type|work schedule|schedule|full\/part[- ]time|arbeitszeit(?:modell)?)$/i],
  ['contractType', /^(?:contract type|type of contract|contract duration|befristung|vertragsart)$/i],
  ['employmentType', /^(?:employment type|type of employment|job type|position type|worker type|anstellungsart)$/i],
  ['remote', /^(?:remote working|remote work|remote|remote option|work arrangement|workplace type|work type|location type|home office|mobile working|mobiles arbeiten)$/i],
  ['postingDate', /^(?:posting date|posted(?: on)?|date posted|posted date|publication date|published(?: on)?|start of publication|veröffentlicht(?: am)?|ausschreibungsdatum)$/i],
  ['startDate', /^(?:start date|starting date|entry date|earliest start(?: date)?|eintrittsdatum|startdatum)$/i],
  ['deadline', /^(?:application deadline|closing date|apply by|deadline|bewerbungsfrist)$/i],
  ['salary', /^(?:salary|salary range|compensation|pay|pay range|base pay|remuneration|wage|gehalt|vergütung)$/i],
  ['hours', /^(?:working hours|hours|weekly hours|hours per week|wochenstunden)$/i],
  ['contactName', /^(?:contact person|your contact|recruiter|ansprechpartner(?:in)?|contact)$/i],
  ['email', /^(?:e-?mail|email address|mail)$/i],
  ['phone', /^(?:phone|telephone|tel\.?|telefon|mobile|call us)$/i],
];

export function labelKey(label: string): LabeledKey | null {
  const l = label.replace(/\s+/g, ' ').trim();
  if (l.length < 2 || l.length > 40) return null;
  for (const [key, re] of LABELS) if (re.test(l)) return key;
  return null;
}

const LABEL_ONLY_RE = /^(.{2,40}?)\s*:$/;
const LABEL_INLINE_RE = /^(.{2,40}?)\s*:\s+(.{1,120})$/;

export type LabeledFields = Partial<Record<LabeledKey, string>>;

/** A label's value is short and not a sentence ("Full-time", "Sep 23, 2026") — so a heading like "Location:" followed by a real paragraph is left alone. */
function looksLikeValue(v: string): boolean {
  const t = v.trim();
  if (!t || t.length > 90) return false;
  if (/[.!?]$/.test(t) && t.split(/\s+/).length > 6) return false;
  return true;
}

/** True for a line that is just a known label ("Department:"). */
function isLabelLine(line: string): boolean {
  const m = line.trim().match(LABEL_ONLY_RE);
  return Boolean(m && labelKey(m[1]));
}

/** Reads "Label: value" and "Label:\nvalue" pairs out of plain text (first occurrence of each label wins). */
export function extractLabeledFields(text: string): LabeledFields {
  const out: LabeledFields = {};
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const only = line.match(LABEL_ONLY_RE);
    if (only) {
      const key = labelKey(only[1]);
      const next = lines[i + 1];
      if (key && next && looksLikeValue(next) && !isLabelLine(next)) {
        if (!out[key]) out[key] = next;
        i++;
      }
      continue;
    }
    const inline = line.match(LABEL_INLINE_RE);
    if (inline) {
      const key = labelKey(inline[1]);
      if (key && !out[key] && looksLikeValue(inline[2])) out[key] = inline[2].trim();
    }
  }
  return out;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  januar: 0, februar: 1, märz: 2, maerz: 2, mai: 4, juni: 5, juli: 6, okt: 9, dez: 11,
  janv: 0, févr: 1, fevr: 1, mars: 2, avr: 3, juin: 5, juil: 6, août: 7, aout: 7, sept: 8, déc: 11,
};

function monthIndex(word: string): number | null {
  const w = word.toLowerCase().replace(/\./g, '');
  if (w in MONTHS) return MONTHS[w];
  const short = w.slice(0, 3);
  return short in MONTHS ? MONTHS[short] : null;
}

function isoDate(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 0 || m > 11 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m, d, 12));
  return date.getUTCMonth() === m ? date.toISOString() : null;
}

/** Parses the date formats career sites print ("Sep 23, 2026", "23.09.2026", "2026-09-23", "23 September 2026"). Null when ambiguous. */
export function parseLooseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoDate(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\b/); // German/European 23.09.2026
  if (m) return isoDate(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/\b([A-Za-zÀ-ÿ]{3,10})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/); // Sep 23, 2026
  if (m && monthIndex(m[1]) != null) return isoDate(+m[3], monthIndex(m[1])!, +m[2]);
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\.?\s+([A-Za-zÀ-ÿ]{3,10})\.?,?\s+(\d{4})\b/); // 23 September 2026
  if (m && monthIndex(m[2]) != null) return isoDate(+m[3], monthIndex(m[2])!, +m[1]);
  m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    if (a > 12) return isoDate(+m[3], b - 1, a); // 23/09/2026
    if (b > 12) return isoDate(+m[3], a - 1, b); // 09/23/2026
    return null; // 04/05/2026 — could be either
  }
  return null;
}

const PLURAL_LEVELS: Record<string, string> = {
  apprentices: 'Apprentice', 'dual students': 'Dual student', trainees: 'Trainee', interns: 'Intern', students: 'Student', graduates: 'Graduate',
  professionals: 'Professional', 'young professionals': 'Young professional', 'experienced professionals': 'Experienced professional',
  managers: 'Manager', executives: 'Executive', specialists: 'Specialist', experts: 'Expert', seniors: 'Senior',
};

function normalizeCareerLevel(raw: string): string {
  const v = raw.trim().replace(/\s+/g, ' ');
  return PLURAL_LEVELS[v.toLowerCase()] ?? v;
}

function scheduleFrom(raw: string | undefined): string | null {
  if (!raw) return null;
  if (/part[- ]?time|teilzeit|temps partiel/i.test(raw)) return 'Part-time';
  if (/full[- ]?time|vollzeit|temps plein/i.test(raw)) return 'Full-time';
  return null;
}

function contractTermFrom(raw: string | undefined): string | null {
  if (!raw) return null;
  if (/fixed[- ]?term|temporary|limited|befristet|\bcdd\b|\d+\s*(?:-|\s)?months?/i.test(raw) && !/unlimited|unbefristet/i.test(raw)) return 'Fixed-term';
  if (/permanent|unlimited|indefinite|unbefristet|\bcdi\b|regular/i.test(raw)) return 'Permanent';
  return null;
}

/** "Up to 20%" → hybrid, "No" / "0%" → on-site, "100%" / "Fully remote" → remote. */
function remoteFromLabel(raw: string | undefined): { arrangement: WorkArrangement; detail: string | null } | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  const pct = v.match(/(\d{1,3})\s*%/);
  if (pct) {
    const n = Number(pct[1]);
    const upTo = /up to|bis zu|max/.test(v) ? 'Up to ' : '';
    if (n === 0) return { arrangement: 'onsite', detail: null };
    if (n >= 100 && !upTo) return { arrangement: 'remote', detail: null };
    return { arrangement: 'hybrid', detail: `${upTo}${n}% remote` };
  }
  if (/^(?:no|none|not (?:possible|available)|nein|on-?site|office)\b/.test(v)) return { arrangement: 'onsite', detail: null };
  if (/by agreement|upon agreement|on agreement|nach (?:absprache|vereinbarung)|negotiable|по договор|dohodou|po dohode|na dohodę/.test(v)) {
    return { arrangement: 'hybrid', detail: 'Remote by agreement' };
  }
  if (/hybrid|partial|partly|some|flexible|possible|occasional|days? (?:a|per) week/.test(v)) {
    return { arrangement: 'hybrid', detail: raw.trim().length <= 30 && !/^hybrid$/i.test(raw.trim()) ? raw.trim() : null };
  }
  if (/^(?:yes|ja|fully|100|remote|full remote|work from home)/.test(v)) return { arrangement: 'remote', detail: null };
  return null;
}

// ---------------------------------------------------------------------------

export function detectJobFacts(descriptionHtml: string | null | undefined, title = ''): DetectedFacts {
  const text = htmlToPlainText(descriptionHtml);
  const f = extractLabeledFields(text);

  // Labeled fields are the most reliable signal — the company filled
  // them in on purpose — so they win over free-text guesses.
  const remote = remoteFromLabel(f.remote) ?? (f.workingModel ? remoteFromLabel(f.workingModel) : null);
  const schedule = scheduleFrom(f.workingModel) ?? scheduleFrom(f.employmentType) ?? scheduleFrom(f.contractType) ?? scheduleFrom(f.hours);
  const contractTerm = contractTermFrom(f.contractType) ?? contractTermFrom(f.employmentType);

  // Employment type: the title decides for internships/apprenticeships
  // ("Apprentice (f/m/d) ..."), then labeled type fields, then the
  // older free-text detector. "Full-time + Fixed-term" stays Full time —
  // a fixed-term employee isn't a freelancer.
  const titleType = /\bintern(?:s|ship)?\b|werkstudent|working student|praktik(?:um|ant)|\bstagiaire\b|\bstage\b\s+(?:de|d'|en)|pr[aá]cticas|becari[oa]|est[aá]gi|tirocin|stagista|\bstaż|st[aá]ž|gyakornok|stajyer/i.test(title)
    ? 'Internship'
    : /apprentice|azubi|ausbildung|duales? studium|dual(?:e|es)? (?:study|studies|student)|\bapprenti|alternance|\bformaci[oó]n dual/i.test(title)
      ? 'Apprenticeship'
      : null;
  const labeledType = f.employmentType ? detectEmploymentType(`Employment type: ${f.employmentType}`) : null;
  const employmentType =
    titleType ??
    labeledType ??
    (schedule === 'Part-time' ? 'Part time' : schedule === 'Full-time' ? 'Full time' : null) ??
    (contractTerm === 'Fixed-term' && /contract|freelance|temporary/i.test(f.contractType ?? '') ? 'Contract / Freelance' : null) ??
    detectEmploymentType(text, title);

  const years = detectExperience(text);
  const level = f.careerLevel ? normalizeCareerLevel(f.careerLevel) : null;
  const experience = level && years ? `${level} (${years})` : level ?? years;

  return {
    compensation: (f.salary ? detectCompensation(`Salary: ${f.salary}`) : null) ?? detectCompensation(text),
    experience,
    workArrangement: remote?.arrangement ?? detectWorkArrangement(text),
    employmentType,
    visa: detectVisa(text),
    schedule,
    contractTerm,
    remoteDetail: remote?.detail ?? null,
    department: f.department?.trim() || null,
    location: f.location?.trim() || null,
    postedAt: parseLooseDate(f.postingDate),
  };
}

// ---------------------------------------------------------------------------
// Description cleanup (display-time)
// ---------------------------------------------------------------------------

export type JobContact = { email?: string; phone?: string; website?: string; name?: string };

const EMAIL_RE = /^(?:e-?mail\s*:?\s*)?([\w.+-]+@[\w-]+(?:\.[\w-]+)+)$/i;
const PHONE_RE = /^(?:(?:phone|tel(?:ephone)?\.?|telefon|mobile|call(?: us)?)\s*:?\s*)?(\+?\(?\d[\d\s()./-]{5,}\d)$/i;
const WEBSITE_RE = /^(?:web(?:site)?\s*:?\s*)?((?:https?:\/\/)?www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?|https?:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?)$/i;
const CTA_RE = /^(?:apply(?: now| here| today| online| for this (?:job|position|role))?|click here to apply|to apply,? click here|start (?:your|my) application|jetzt bewerben|bewirb dich jetzt|zur bewerbung|postuler|candidatar(?:-?se)?)\s*[»>→›!.…]*$/i;
const CONTACT_HEADING_RE = /^(?:contact(?: us| person| details)?|kontakt|ansprechpartner(?:in)?|questions\??|any questions\??)\s*:?$/i;
const LEAF_TAGS = 'p, li, h1, h2, h3, h4, h5, h6, div, td, th, dt, dd, blockquote';
const BLOCK_TAGS = new Set(['P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'TABLE', 'TBODY', 'TR', 'TD', 'TH', 'DL', 'DT', 'DD', 'BLOCKQUOTE', 'SECTION', 'ARTICLE']);

const squash = (t: string) => t.replace(/\s+/g, ' ').trim();
const normKey = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const phoneDigits = (t: string) => t.replace(/\D/g, '').length;

/**
 * Removes the noise career sites wrap around the actual job text, and
 * pulls contact details out so the page can show them in their own box:
 *   - the facts block ("Job ID: 29644", "Career Level: Apprentices", ...)
 *     — shown in the details boxes instead, via detectJobFacts
 *   - repeated copies of paragraphs / list runs (many sites print the
 *     facts block or the whole intro twice)
 *   - the job title repeated as the first line
 *   - apply CTAs ("Apply now »") — the page has its own Apply button
 *   - trailing contact lines (email, phone, website) → returned as `contact`
 *   - dangling lead-ins left at the end ("Curious?", "Find more ...:")
 * Expects already-sanitized HTML. Returns the input unchanged outside a browser.
 */
export function cleanJobDescriptionHtml(html: string, title = ''): { html: string; contact: JobContact } {
  const contact: JobContact = {};
  if (!html || typeof DOMParser === 'undefined') return { html, contact };
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const body = doc.body;

  // Loose inline content at the top level (e.g. after <div>s were
  // unwrapped by the sanitizer) → wrap each run in a <p>.
  let run: ChildNode[] = [];
  const flush = (before: ChildNode | null) => {
    if (run.some((n) => (n.textContent ?? '').trim())) {
      const p = doc.createElement('p');
      body.insertBefore(p, before);
      run.forEach((n) => p.appendChild(n));
    }
    run = [];
  };
  for (const node of [...body.childNodes]) {
    if (node.nodeType === 1 && BLOCK_TAGS.has((node as Element).tagName)) flush(node);
    else run.push(node);
  }
  flush(null);

  // "Line one<br>Line two" inside one paragraph → one paragraph per line,
  // so each line can be judged (and removed) on its own.
  for (const el of [...body.querySelectorAll('p, div')]) {
    if (!el.querySelector(':scope > br')) continue;
    const segments: ChildNode[][] = [[]];
    for (const child of [...el.childNodes]) {
      if (child.nodeName === 'BR') segments.push([]);
      else segments[segments.length - 1].push(child);
    }
    const filled = segments.filter((seg) => seg.some((n) => (n.textContent ?? '').trim()));
    if (filled.length < 2) continue;
    for (const seg of filled) {
      const p = doc.createElement('p');
      seg.forEach((n) => p.appendChild(n));
      el.parentNode?.insertBefore(p, el);
    }
    el.remove();
  }

  const leaves = [...body.querySelectorAll(LEAF_TAGS)].filter((el) => ![...el.querySelectorAll('*')].some((c) => BLOCK_TAGS.has(c.tagName)));
  const items = leaves.map((el) => ({ el, text: squash(el.textContent ?? '') })).filter((it) => it.text);
  const removed = new Set<number>();
  const contactIdx = new Set<number>();
  const seen = new Map<string, number>();
  const titleKey = normKey(title);

  const takeContact = (text: string, el: Element): boolean => {
    const email = text.match(EMAIL_RE);
    if (email) return (contact.email ??= email[1]), true;
    const phone = text.match(PHONE_RE);
    if (phone && phoneDigits(phone[1]) >= 7 && phoneDigits(phone[1]) <= 16) return (contact.phone ??= squash(phone[1])), true;
    const site = text.match(WEBSITE_RE);
    if (site) {
      const href = el.querySelector('a')?.getAttribute('href');
      contact.website ??= href && /^https?:/i.test(href) ? href : /^https?:/i.test(site[1]) ? site[1] : `https://${site[1]}`;
      return true;
    }
    return false;
  };

  for (let i = 0; i < items.length; i++) {
    const { el, text } = items[i];
    const key = normKey(text);

    if (titleKey && key === titleKey) {
      removed.add(i);
      continue;
    }
    if (CTA_RE.test(text)) {
      removed.add(i);
      continue;
    }

    // "Label:" on its own line, value(s) on the following line(s).
    const only = text.match(LABEL_ONLY_RE);
    const onlyKey = only ? labelKey(only[1]) : null;
    if (onlyKey && items[i + 1] && looksLikeValue(items[i + 1].text) && !isLabelLine(items[i + 1].text)) {
      removed.add(i);
      let j = i + 1;
      let first: string | null = null;
      while (j < items.length && looksLikeValue(items[j].text) && !isLabelLine(items[j].text)) {
        const v = items[j].text;
        const isExtraLocation = onlyKey === 'location' && first !== null && (v === first || /,\s*[A-Z]{2}\b/.test(v));
        if (first !== null && !isExtraLocation) break;
        if (onlyKey === 'email' || onlyKey === 'phone') takeContact(v, items[j].el);
        if (onlyKey === 'contactName' && !takeContact(v, items[j].el)) contact.name ??= v;
        first ??= v;
        removed.add(j);
        j++;
      }
      i = j - 1;
      continue;
    }

    // "Label: value" on one line.
    const inline = text.match(LABEL_INLINE_RE);
    const inlineKey = inline ? labelKey(inline[1]) : null;
    if (inline && inlineKey && looksLikeValue(inline[2])) {
      const value = inline[2].trim();
      if (inlineKey === 'contactName' || inlineKey === 'email' || inlineKey === 'phone') {
        if (!takeContact(value, el) && inlineKey === 'contactName') contact.name ??= value;
      }
      removed.add(i);
      continue;
    }

    if (takeContact(text, el)) {
      removed.add(i);
      contactIdx.add(i);
      continue;
    }

    // Repeated content: long paragraphs are dropped on their second
    // appearance; short lines only when they're part of a repeated run
    // (a duplicated skills list), so a lone repeated word survives.
    if (seen.has(key)) {
      const prevDup = removed.has(i - 1) && seen.has(normKey(items[i - 1]?.text ?? ''));
      const nextDup = seen.has(normKey(items[i + 1]?.text ?? ''));
      if (key.length >= 25 || prevDup || nextDup) {
        removed.add(i);
        continue;
      }
    } else {
      seen.set(key, i);
    }
  }

  // A "Contact" heading whose lines were all moved to the box goes too.
  items.forEach((it, i) => {
    if (!removed.has(i) && CONTACT_HEADING_RE.test(it.text) && (contactIdx.has(i + 1) || i === items.length - 1)) removed.add(i);
  });

  // Trim dangling lead-ins left at the very end.
  for (let i = items.length - 1; i >= 0; i--) {
    if (removed.has(i)) continue;
    const t = items[i].text;
    const words = t.split(' ').length;
    const dangling =
      CTA_RE.test(t) ||
      CONTACT_HEADING_RE.test(t) ||
      (t.endsWith(':') && t.length <= 140) ||
      (t.endsWith('?') && words <= 5);
    if (!dangling) break;
    removed.add(i);
  }

  removed.forEach((i) => items[i].el.remove());

  // Drop containers the removals left empty (an emptied <ul>, ...).
  for (let pass = 0; pass < 3; pass++) {
    for (const el of [...body.querySelectorAll('*')]) {
      if (el.tagName === 'BR' || el.tagName === 'IMG') continue;
      if (!(el.textContent ?? '').trim() && !el.querySelector('img')) el.remove();
    }
  }
  while (body.firstChild?.nodeName === 'BR') body.firstChild.remove();
  while (body.lastChild?.nodeName === 'BR') body.lastChild.remove();

  if (contact.email && /madevisa\.com$/i.test(contact.email)) delete contact.email;
  return { html: body.innerHTML, contact };
}

// ---------------------------------------------------------------------------

const PLACEHOLDER_VALUE_RE = /^(?:all|any|various|multiple(?: locations)?|n\/?a|none|other|-|–)$/i;

/** True for importer placeholders like "All" / "Various" that aren't real data. */
export function isPlaceholderValue(value: string | null | undefined): boolean {
  return !value || PLACEHOLDER_VALUE_RE.test(value.trim());
}

/** "Osnabrück, DE" / "Berlin, Germany" → { city: "Osnabrück", countryCode: "DE" }. */
export function splitSourceLocation(raw: string | null | undefined): { city: string | null; countryCode: string | null } | null {
  if (!raw || isPlaceholderValue(raw)) return null;
  // Drop postal codes ("843 02", "70173") so the country segment is last.
  const parts = raw.split(',').map((p) => p.trim()).filter((p) => p && !/^[\d\s-]{3,10}$/.test(p));
  if (!parts.length) return null;
  const last = parts[parts.length - 1];
  const country =
    (last.length === 2 ? allCountries.find((c) => c.code === last.toUpperCase()) : undefined) ??
    allCountries.find((c) => c.name.toLowerCase() === last.toLowerCase());
  const city = country ? (parts.length > 1 ? parts[0] : null) : parts[0];
  return { city: city && !isPlaceholderValue(city) ? city : null, countryCode: country?.code ?? null };
}
