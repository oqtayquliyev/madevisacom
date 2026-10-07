// Reads a CV's plain text into the facts the match needs: skills, job
// titles, years of work, education, languages — plus a few checks on the
// CV itself (contact details, dates, length).
//
// Everything here is rules, no AI service: it runs in the browser, on the
// person's own device, the moment the file is opened.

import { classifyJob } from '@/lib/jobTaxonomy';
import { findSkills } from '@/lib/cv/skills';
import { LANGS, levelIn } from '@/lib/cv/languages';
import { detectLanguage } from '@/lib/cv/text';

/** 0 unknown · 1 secondary school · 2 diploma / vocational · 3 bachelor · 4 master · 5 doctorate */
export type EduLevel = 0 | 1 | 2 | 3 | 4 | 5;
export const EDU_NAME = ['', 'secondary school', 'a diploma or vocational training', 'a bachelor’s degree', 'a master’s degree', 'a doctorate'];

/** 0 entry · 1 junior · 2 mid · 3 senior · 4 lead / manager · 5 director+ */
export type Seniority = 0 | 1 | 2 | 3 | 4 | 5;

export type CvLanguage = { code: string; name: string; level: number | null };

export type CvProfile = {
  v: 3;
  words: number;
  /** Skill ids → times mentioned. */
  skills: Record<string, number>;
  /** Job titles found in the CV, most recent first. */
  titles: string[];
  /** MadeVisa job categories those titles fall into. */
  roles: { label: string; group: string }[];
  years: number | null;
  yearsFrom: 'dates' | 'stated' | null;
  education: EduLevel;
  languages: CvLanguage[];
  /** Language the CV is written in. */
  writtenIn: string;
  seniority: Seniority;
  has: { email: boolean; phone: boolean; linkedin: boolean; dates: boolean; experience: boolean; education: boolean; skillsSection: boolean; summary: boolean };
  /** Lines with a number in them ("cut costs by 18%") — results, not duties. */
  numbers: number;
};

export type Section = 'top' | 'experience' | 'education' | 'skills' | 'languages' | 'summary' | 'other';

const HEADERS: [Section, RegExp][] = [
  ['experience', /^(?:work|professional|employment|relevant|career)?\s*(?:experience|history|background)s?$|^(?:employment|work history|career history|berufserfahrung|berufliche erfahrung|expérience professionnelle|experiencia laboral|experiencia profesional|esperienza lavorativa|iş təcrübəsi|опыт работы|positions held)$/i],
  ['education', /^(?:education|academic background|education and training|education & training|qualifications|academic qualifications|studies|ausbildung|bildung|studium|formation|educación|formación|istruzione|təhsil|образование)(?: and certifications?| & certifications?)?$/i],
  ['skills', /^(?:(?:technical|key|core|professional|hard|it|computer|relevant)\s+)?(?:skills|competenc(?:ies|es)|expertise|technologies|tech stack|tools|kenntnisse|fähigkeiten|compétences|habilidades|competenze|bacarıqlar|навыки)(?:\s*(?:&|and)\s*\w+)?$/i],
  ['languages', /^(?:languages?|language skills|sprachen|sprachkenntnisse|langues|idiomas|lingue|dillər|языки)$/i],
  ['summary', /^(?:summary|profile|professional summary|personal statement|about me|about|objective|career objective|profil|über mich|résumé|perfil|profilo|haqqımda)$/i],
  ['other', /^(?:projects?|certifications?|certificates|courses|training|awards|publications|references|interests|hobbies|volunteering|volunteer experience|achievements|personal details|contact|additional information)$/i],
];

/** Which CV section a line opens ("Work experience", "Skills"…), or null when it isn't a section heading. */
export function sectionOf(line: string): Section | null {
  const t = line.replace(/[:：•|_\-–—]+$/g, '').replace(/^[•\-–—\d.\s]+/, '').trim();
  if (!t || t.length > 42 || t.split(/\s+/).length > 5) return null;
  for (const [name, re] of HEADERS) if (re.test(t)) return name;
  return null;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  mär: 2, mai: 4, okt: 9, dez: 11, janv: 0, févr: 1, fév: 1, avr: 3, juin: 5, juil: 6, août: 7, déc: 11,
  ene: 0, abr: 3, ago: 7, dic: 11, gen: 0, mag: 4, giu: 5, lug: 6, set: 8, ott: 9,
};
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|mär|mai|okt|dez|janv|févr|fév|avr|juin|juil|août|déc|ene|abr|ago|dic|gen|mag|giu|lug|set|ott)[a-zéûä]*\\.?';
const NOW = '(?:present|current|now|today|ongoing|date|heute|aktuell|présent|aujourd.?hui|actualidad|presente|oggi|attuale|indi|настоящее время|н\\.?\\s?в\\.?)';
const POINT = `(?:(${MONTH})\\s*,?\\s*|(\\d{1,2})\\s*[./]\\s*)?((?:19|20)\\d{2})`;
const RANGE = new RegExp(`${POINT}\\s*(?:-|–|—|to|until|till|bis|au|à|al?|hasta)\\s*(?:${POINT}|(${NOW}))`, 'gi');

function monthIndex(name: string | undefined, num: string | undefined, fallback: number): number {
  if (name) {
    const key = name.toLowerCase().replace(/\./g, '');
    for (const k of [key.slice(0, 4), key.slice(0, 3)]) if (k in MONTHS) return MONTHS[k];
  }
  if (num) {
    const n = Number(num);
    if (n >= 1 && n <= 12) return n - 1;
  }
  return fallback;
}

/** Months worked, from date ranges outside the education section; overlaps counted once. */
function monthsWorked(lines: { text: string; section: Section }[]): number {
  const now = new Date();
  const nowIdx = now.getFullYear() * 12 + now.getMonth();
  const spans: [number, number][] = [];
  for (const l of lines) {
    if (l.section === 'education') continue;
    RANGE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RANGE.exec(l.text))) {
      const start = Number(m[3]) * 12 + monthIndex(m[1], m[2], 0);
      const end = m[7] ? nowIdx : Number(m[6]) * 12 + monthIndex(m[4], m[5], 11);
      if (end < start || start < 1960 * 12 || end > nowIdx + 1) continue;
      spans.push([start, Math.min(end, nowIdx)]);
    }
  }
  if (!spans.length) return 0;
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [s, e] = spans[0];
  for (const [a, b] of spans.slice(1)) {
    if (a <= e + 1) e = Math.max(e, b);
    else {
      total += e - s + 1;
      [s, e] = [a, b];
    }
  }
  return total + (e - s + 1);
}

const DEGREES: [EduLevel, RegExp][] = [
  [5, /\b(?:ph\.?\s?d|d\.?phil|doctorate|doctoral|doktor(?:at|arbeit|titel)?|dr\.\s?(?:rer|ing|phil|med))\b/i],
  [4, /\b(?:master(?:'s|s)?|m\.?\s?sc|msc|m\.?eng|meng|mba|m\.?a\.(?=\s|$|,)|llm|mphil|magister|magistr|diplom-?(?:ingenieur|kaufmann|informatiker)|dipl\.?-?ing|máster|maestría|laurea magistrale|magistratura)\b/i],
  [3, /\b(?:bachelor(?:'s|s)?|b\.?\s?sc|bsc|b\.?eng|beng|b\.?tech|btech|b\.?a\.(?=\s|$|,)|bba|llb|undergraduate degree|licence|licenciatura|laurea|grado en|bakalavr|бакалавр|university degree|college degree|degree in)\b/i],
  [2, /\b(?:associate(?:'s)? degree|diploma|hnd|hnc|vocational|apprenticeship|ausbildung|berufsausbildung|bts|dut|technician certificate|nvq|certificate iii|certificate iv|trade certificate|foundation degree)\b/i],
  [1, /\b(?:high school|secondary school|a-?levels?|gcse|abitur|baccalaur[ée]at|bachillerato|maturit[aà]|attestat|orta məktəb)\b/i],
];

/** Highest education level a text names. */
export function educationIn(text: string): EduLevel {
  for (const [level, re] of DEGREES) if (re.test(text)) return level;
  return 0;
}

const TITLE_WORD =
  /\b(?:engineer|developer|programmer|architect|manager|analyst|consultant|specialist|designer|director|coordinator|administrator|officer|assistant|associate|accountant|auditor|nurse|doctor|physician|teacher|lecturer|professor|researcher|scientist|technician|operator|supervisor|lead|head|executive|representative|advisor|adviser|agent|chef|cook|driver|electrician|mechanic|welder|plumber|carpenter|recruiter|lawyer|paralegal|intern|trainee|founder|owner|president|controller|planner|buyer|strategist|editor|writer|translator|pharmacist|therapist|caregiver|waiter|barista|receptionist|housekeeper|cashier|clerk|entwickler|ingenieur|leiter|berater|sachbearbeiter|kaufmann|mitarbeiter)(?:in)?\b/i;

export function seniorityOf(title: string): Seniority | null {
  const t = title.toLowerCase();
  if (/\b(?:chief|c[etfoim]o|vp|vice president|director|head of|geschäftsführer|partner)\b/.test(t)) return 5;
  if (/\b(?:lead|principal|staff|manager|team ?lead|supervisor|leiter(?:in)?|teamleiter)\b/.test(t)) return 4;
  if (/\b(?:senior|sr\.?|expert|specialist ii+)\b/.test(t)) return 3;
  if (/\b(?:junior|jr\.?|associate|graduate|entry.?level)\b/.test(t)) return 1;
  if (/\b(?:intern|internship|trainee|working student|werkstudent|praktikant(?:in)?|apprentice|azubi|student)\b/.test(t)) return 0;
  return null;
}

/** Lines that read like a job title, most recent first (CVs list newest first). */
// A line that says what someone DID is a duty, not a title — even when a PDF dropped
// its bullet mark: "Mentored 4 engineers", "Built billing services in Java",
// "Deployed with Docker on AWS". Titles that start with an -ed / -ing word are kept
// when that word is a known one ("Registered Nurse", "Engineering Manager").
const TITLE_ED = /^(?:certified|registered|licensed|chartered|qualified|accredited|embedded|advanced|applied|integrated|distributed|automated|skilled|specialized|specialised|experienced|associated|managed|united|limited)$/i;
const DUTY_VERB =
  /^(?:led|built|ran|wrote|cut|won|grew|drove|oversaw|taught|sold|made|set|kept|held|did|was|were|am|is|responsible|worked|work|works|manage|manages|develop|develops|design|designs|lead|leads|create|creates|build|builds|maintain|maintains|support|supports|provide|provides|ensure|ensures|collaborate|perform|performs|conduct|conducts|handle|handles|assist|assists|prepare|prepares|coordinate|coordinates|implement|implements|deliver|delivers|analyse|analyze|spearheaded|own|owns|helped|help)$/i;
function isDuty(text: string): boolean {
  const words = text.split(/\s+/);
  const first = words[0]?.replace(/[^A-Za-z]/g, '') ?? '';
  if (!first) return false;
  if (DUTY_VERB.test(first)) return words.length > 1 && !/^(?:lead|work|support|design)$/i.test(first) ? true : words.length > 3;
  if (/[a-z]{3,}ed$/i.test(first) && !TITLE_ED.test(first)) return true;
  // "Mentored 4 engineers", "Cut costs by 18%": a count or a share is a result, not a role ("Engineer II" has no digit).
  if (/\d/.test(text.replace(/\b(?:19|20)\d{2}\b/g, ''))) return true;
  // "…with Docker", "…using SAP", "…across 3 teams": how the work was done.
  if (words.length >= 4 && /\s(?:with|using|by|from|into|across|through|via)\s/i.test(text)) return true;
  return false;
}

function findTitles(lines: { text: string; section: Section }[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const consider = (raw: string) => {
    // A sentence is a duty, not a title.
    if (/[.!?]$/.test(raw) || raw.split(/\s+/).length > 14) return;
    if (isDuty(raw)) return;
    // "Senior Data Analyst | Acme GmbH | 2019 – 2022" → the part that is the title.
    const parts = raw.split(/\s+[|•·@]\s+|\s+[-–—]\s+|\s+at\s+|,\s+|\t+|\s{3,}/i).map((p) => p.trim());
    for (const p of parts) {
      const clean = p.replace(/\(.*?\)/g, '').replace(/\b(?:19|20)\d{2}\b.*$/, '').trim();
      if (clean.length < 4 || clean.length > 60 || clean.split(/\s+/).length > 7) continue;
      if (/[.!?]$/.test(clean) || /@|https?:|\d{4}/.test(clean)) continue;
      if (!TITLE_WORD.test(clean) && !classifyJob(clean)) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
      return;
    }
  };
  // The headline under the name counts first…
  lines.filter((l) => l.section === 'top').slice(0, 8).forEach((l) => consider(l.text));
  // …then titles in the work history (short lines; bullets are duties, not titles).
  for (const l of lines) {
    if (l.section !== 'experience' || /^[•\-–*▪◦]/.test(l.text) || l.text.length > 110) continue;
    consider(l.text);
    if (out.length >= 8) break;
  }
  return out.slice(0, 8);
}

function findLanguages(lines: { text: string; section: Section }[], writtenIn: string): CvLanguage[] {
  const found = new Map<string, CvLanguage>();
  const cue = /\b(?:native|fluent|proficien|intermediate|advanced|basic|beginner|conversational|mother tongue|bilingual|[abc][12]|muttersprach|fließend|grundkenntnisse|courant|language|sprach|ielts|toefl|goethe|delf|dalf|telc|dele)\b/i;
  for (const l of lines) {
    const inSection = l.section === 'languages';
    if (!inSection && !cue.test(l.text)) continue;
    // "English (C1), German (B1)" — a level belongs to the language it follows.
    const chunks = l.text.split(/[,;|•·/]|\band\b|\bund\b/i);
    for (const chunk of chunks) {
      for (const lang of LANGS) {
        if (!lang.re.test(chunk)) continue;
        const level = levelIn(chunk);
        const prev = found.get(lang.code);
        if (!prev || (level ?? 0) > (prev.level ?? 0)) found.set(lang.code, { code: lang.code, name: lang.name, level: level ?? prev?.level ?? null });
      }
    }
  }
  // A CV written in a language shows you can work in it.
  const own = LANGS.find((l) => l.code === writtenIn);
  if (own && !found.has(own.code)) found.set(own.code, { code: own.code, name: own.name, level: null });
  return [...found.values()];
}

export function parseCv(text: string): CvProfile {
  const raw = text.replace(/\r/g, '').replace(/\u00a0/g, ' ');
  let section: Section = 'top';
  const lines = raw
    .split('\n')
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((t) => {
      const s = sectionOf(t);
      if (s) section = s;
      return { text: t, section, header: Boolean(s) };
    });
  const body = lines.filter((l) => !l.header);
  const flat = body.map((l) => l.text).join('\n');
  const words = flat.split(/\s+/).filter(Boolean).length;

  const skills: Record<string, number> = {};
  for (const f of findSkills(flat).values()) skills[f.id] = f.count;

  const titles = findTitles(body);
  const roles: CvProfile['roles'] = [];
  for (const t of titles) {
    const c = classifyJob(t);
    if (c && !roles.some((r) => r.label === c.label)) roles.push({ label: c.label, group: c.group });
  }

  const months = monthsWorked(body);
  const stated = [...flat.matchAll(/(\d{1,2})\s*\+?\s*(?:years?|yrs?|jahre[n]?|ans|años|anni)\b[^.\n]{0,40}?(?:experience|erfahrung|expérience|experiencia|esperienza)/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => n > 0 && n <= 45);
  const statedYears = stated.length ? Math.max(...stated) : null;
  const dateYears = months >= 3 ? Math.min(45, Math.round((months / 12) * 10) / 10) : null;
  const years = dateYears != null && statedYears != null ? Math.max(dateYears, statedYears) : dateYears ?? statedYears;

  const eduText = body.filter((l) => l.section === 'education' || l.section === 'top' || l.section === 'summary').map((l) => l.text).join('\n');
  const education = (educationIn(eduText) || educationIn(flat)) as EduLevel;

  const writtenIn = detectLanguage(flat);
  const top = titles.map(seniorityOf).find((s) => s != null);
  const byYears: Seniority = years == null ? 2 : years < 1 ? 0 : years < 2.5 ? 1 : years < 5.5 ? 2 : years < 10 ? 3 : 4;
  const seniority = (top != null ? Math.max(top, Math.min(byYears, 3)) : byYears) as Seniority;

  return {
    v: 3,
    words,
    skills,
    titles,
    roles,
    years,
    yearsFrom: years == null ? null : dateYears != null && years === dateYears ? 'dates' : 'stated',
    education,
    languages: findLanguages(body, writtenIn),
    writtenIn,
    seniority,
    has: {
      email: /[\w.+-]+@[\w-]+\.[\w.-]{2,}/.test(raw),
      phone: /(?:\+|00)?\d[\d\s().-]{7,}\d/.test(raw),
      linkedin: /linkedin\.com\/|\blinkedin\b/i.test(raw),
      dates: months > 0,
      experience: lines.some((l) => l.section === 'experience'),
      education: lines.some((l) => l.section === 'education') || education > 0,
      skillsSection: lines.some((l) => l.section === 'skills'),
      summary: lines.some((l) => l.section === 'summary'),
    },
    numbers: body.filter((l) => l.section !== 'education' && /\d+(?:[.,]\d+)?\s?(?:%|percent|k\b|m\b|million|bn|x\b|\+)|[$€£]\s?\d|\b\d{2,}\s+(?:users|customers|clients|people|employees|projects|stores|countries|engineers|patients|students)/i.test(l.text)).length,
  };
}

/** Is this text a CV at all? (Guards against uploading the wrong file.) */
export function looksLikeCv(text: string): boolean {
  const p = parseCv(text);
  const signals = [p.has.email || p.has.phone, p.has.dates, p.has.experience || p.has.education, Object.keys(p.skills).length >= 3, p.titles.length > 0];
  return p.words >= 60 && signals.filter(Boolean).length >= 2;
}
