// Reads a job ad into what it asks for: skills (must-have vs nice-to-have),
// years of experience, education, languages, seniority and the words that
// describe the work. Same rules for every job; nothing is guessed that the
// ad doesn't say.

import { classifyJob, type JobCategory } from '../jobTaxonomy';
import { findSkills, normalize, SKILL_BY_ID, type SkillGroup } from './skills';
import { LANGS, levelIn } from './languages';
import { seniorityOf, type EduLevel, type Seniority } from './cvProfile';
import { detectLanguage, htmlToLines, stem, terms, TITLE_NOISE } from './text';

export type JobInput = {
  title: string;
  /** Description as HTML or plain text. */
  description: string;
  department?: string | null;
  /** "5+ years" as already read from the ad by MadeVisa's job-facts detector. */
  experienceHint?: string | null;
};

export type JobSkill = {
  id: string;
  /** The skill as the ad spells it. */
  label: string;
  weight: number;
  required: boolean;
  /** Skills sharing a number are alternatives ("SAP or NetSuite"): one is enough. */
  alt?: number;
};
export type JobLanguage = { code: string; name: string; level: number | null; required: boolean; inferred: boolean };

export type JobProfile = {
  title: string;
  category: JobCategory | null;
  seniority: Seniority | null;
  skills: JobSkill[];
  years: number | null;
  education: EduLevel;
  /** "…or equivalent experience". */
  educationFlexible: boolean;
  languages: JobLanguage[];
  writtenIn: string;
  /** Stemmed words that describe the work → weight. */
  terms: Map<string, number>;
  /** Stem → the word as the ad spells it (for showing to people). */
  termWords: Map<string, string>;
  titleTerms: string[];
  /** Words in the ad's own text (headings and boilerplate sections left out). */
  words: number;
};

type Zone = 'must' | 'duties' | 'nice' | 'skip' | 'intro';
const ZONE_WEIGHT: Record<Zone, number> = { must: 1, duties: 0.8, nice: 0.4, skip: 0, intro: 0.6 };

const ZONES: [Zone, RegExp][] = [
  ['nice', /nice[- ]to[- ]have|preferred|bonus|a plus|pluses|desirable|desired|advantage|good to have|would be great|extra points|wünschenswert|von vorteil|idealerweise|atouts|souhaité|deseable|valorable/i],
  ['skip', /about (?:us|the company|[a-z0-9&. ]{2,30}$)|who we are|our (?:story|mission|values|culture)|benefits|perks|what we offer|we offer|why (?:join|us|work)|compensation|salary|equal opportunit|diversity|privacy|how to apply|application process|next steps|recruitment process|hiring process|contact|über uns|wir bieten|das bieten wir|unser angebot|benefits|nous offrons|à propos|qui sommes|ofrecemos|sobre nosotros|disclaimer|location/i],
  ['must', /requirement|qualification|what you(?:'ll| will)? (?:need|bring|have)|you (?:have|bring|are|should have)|must[- ]have|who you are|your profile|about you|skills|experience|what we(?:'re| are) looking for|we(?:'re| are) looking for|minimum|essential|dein profil|ihr profil|das bringst du mit|anforderungen|qualifikation|votre profil|profil recherché|compétences|requisitos|perfil|requisiti|what makes you/i],
  ['duties', /responsibilit|what you(?:'ll| will) (?:do|be doing|work on)|the role|your role|role overview|your (?:tasks|mission|impact|day)|duties|tasks|key accountabilit|in this role|job description|deine aufgaben|ihre aufgaben|aufgaben|vos missions|missions|responsabilidades|funciones|mansioni|the opportunity|what you'll own/i],
];

function zoneOf(heading: string): Zone | null {
  for (const [zone, re] of ZONES) if (re.test(heading)) return zone;
  return null;
}

const NICE_INLINE = /nice[- ]to[- ]have|is a plus|a plus\b|are a plus|is a bonus|bonus points|preferred|preferably|desirable|advantage|ideally|beneficial|would be (?:great|nice)|not required|optional|von vorteil|wünschenswert|idealerweise|un plus|souhaité|deseable|valorable/i;
const MUST_INLINE = /\b(?:must|required|essential|mandatory|need to have|you have|minimum|zwingend|erforderlich|voraussetzung|obligatoire|imprescindible|requerido)\b/i;

/** Which job families make a "broad" skill a real requirement. */
const FAMILY: Record<string, SkillGroup[]> = {
  'Software & IT': ['Programming', 'Web & mobile', 'Cloud & DevOps', 'IT & security', 'Data & AI'],
  'Data & AI': ['Data & AI', 'Programming', 'Cloud & DevOps'],
  'Product & Design': ['Product & design', 'Web & mobile'],
  Engineering: ['Engineering'],
  'Science & Research': ['Healthcare & science', 'Data & AI'],
  'Healthcare & Medical': ['Healthcare & science'],
  'Finance & Accounting': ['Finance'],
  'Sales & Business Development': ['Sales & marketing'],
  'Customer Service & Support': ['Sales & marketing', 'IT & security'],
  'Marketing & Communications': ['Sales & marketing', 'Product & design'],
  'Human Resources': ['People & legal'],
  'Operations & Supply Chain': ['Business & operations'],
  'Manufacturing & Production': ['Engineering', 'Hospitality & trades'],
  'Skilled Trades': ['Hospitality & trades', 'Engineering'],
  'Construction & Architecture': ['Engineering', 'Hospitality & trades'],
  'Hospitality & Tourism': ['Hospitality & trades', 'Sales & marketing'],
  'Education & Training': ['Education'],
  Legal: ['People & legal'],
  'Administration & Office': ['Business & operations'],
  'Media & Creative': ['Product & design', 'Sales & marketing'],
  'Consulting & Management': ['Business & operations'],
  'Energy & Environment': ['Engineering'],
  'Agriculture & Food': ['Hospitality & trades'],
  'Aviation & Maritime': ['Hospitality & trades', 'Engineering'],
  'Beauty, Sports & Wellness': ['Hospitality & trades'],
  'Transport & Driving': ['Hospitality & trades', 'Business & operations'],
  'Real Estate': ['Business & operations', 'Sales & marketing'],
  Retail: ['Sales & marketing'],
  'Security & Defence': ['IT & security', 'Hospitality & trades'],
  'Public Sector & Nonprofit': ['Business & operations'],
};

/** The skill groups that belong to a kind of job: anything outside them is industry or other-field experience, not a core skill. */
export function familyOf(category: JobCategory | null): SkillGroup[] {
  return category ? FAMILY[category.group] ?? [] : [];
}

const EDU_LINE = /degree|bachelor|master|ph\.?\s?d|doctorate|diploma|studium|abschluss|ausbildung|university|hochschul|dipl[oô]me|formation|titulación|licenciatura|\bgrado\b|laurea|educated to|higher education|apprenticeship|vocational/i;
const EDU_ASK: [EduLevel, RegExp][] = [
  [5, /ph\.?\s?d\b|doctorate|doctoral|promotion\b/i],
  [4, /master|\bm\.?sc\b|\bmba\b|\bdiplom\b|graduate degree|postgraduate|advanced degree/i],
  [3, /bachelor|\bb\.?sc\b|\bb\.?a\b|\bbs\b|undergraduate|university degree|college degree|degree in|degree or|\bdegree\b|abgeschlossenes studium|hochschulabschluss|\bstudium\b|\blicence\b|licenciatura|\bgrado\b|laurea|higher education|educated to degree/i],
  [2, /diploma\b|vocational|ausbildung|apprenticeship|\bbts\b|technician certificate|trade certificate/i],
];
const EDU_FLEX = /or equivalent|equivalent (?:practical |work |professional |relevant )?experience|or comparable|or similar|oder vergleichbar|ou équivalent|o equivalente|or relevant experience/i;

const LANG_CUE = /fluen|proficien|native|speak|spoken|written|verbal|language|command of|working knowledge|business level|communicat|[abc][12]\b|kenntnisse|sprach|fließend|verhandlungssicher|courant|maîtrise|langue|idioma|dominio|nivel|lingua|madrelingua/i;

/** The smallest number of years an ad asks for ("3–5 years" → 3, "5+ years" → 5). */
function yearsAsked(lines: { text: string; zone: Zone }[], hint?: string | null): number | null {
  const found: number[] = [];
  const re = /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to|bis)\s*(\d{1,2})\s*\+?\s*)?(?:years?|yrs?|jahre[n]?|ans|années|años|anni)\b/gi;
  const scan = (text: string) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const n = Number(m[1]);
      const around = text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 80);
      if (n < 1 || n > 20) continue;
      if (!/experience|erfahrung|expérience|experiencia|esperienza|background|track record|working (?:in|as|with)|in a similar|in (?:a|an) \w+ role/i.test(around)) continue;
      if (/years? (?:old|of age)|for (?:over|more than) \d+ years|founded|established|since \d{4}|contract/i.test(around)) continue;
      found.push(n);
    }
  };
  for (const l of lines) if (l.zone !== 'skip') scan(l.text);
  if (!found.length && hint) {
    const m = hint.match(/(\d{1,2})/);
    if (m && Number(m[1]) <= 20) found.push(Number(m[1]));
  }
  // Several numbers ("5+ years in software, 2+ with React") → the overall one is the largest.
  return found.length ? Math.max(...found) : null;
}

export function parseJob(input: JobInput): JobProfile {
  const title = input.title.replace(/\s+/g, ' ').trim();
  const lines = htmlToLines(input.description || '');
  const category = classifyJob(title, input.department ?? null);
  const family = category ? FAMILY[category.group] ?? [] : [];

  // Walk the ad once, tagging each line with the kind of section it sits in.
  let zone: Zone = 'intro';
  const tagged: { text: string; zone: Zone }[] = [];
  for (const l of lines) {
    if (l.heading) {
      zone = zoneOf(l.text) ?? (zone === 'skip' ? 'skip' : zone);
      // A heading can also carry content ("Requirements: 5 years of Java").
      if (l.text.length < 40) continue;
    }
    // A long paragraph is read sentence by sentence, so "Dutch is a plus" doesn't make the whole paragraph optional.
    const pieces = l.text.length > 160 ? l.text.split(/(?<=[.!?;])\s+(?=[A-ZÀ-Ý0-9])/) : [l.text];
    for (const text of pieces) if (text.trim().length > 1) tagged.push({ text: text.trim(), zone });
  }
  // Ads with no headings at all: treat everything as the role description.
  const structured = tagged.some((l) => l.zone === 'must' || l.zone === 'duties' || l.zone === 'nice');

  // ---- skills ----
  const acc = new Map<string, { weight: number; mentions: number; mustHits: number; label: string }>();
  const add = (id: string, weight: number, count: number, must: boolean, as: string) => {
    const a = acc.get(id) ?? { weight: 0, mentions: 0, mustHits: 0, label: as };
    a.weight = Math.max(a.weight, weight);
    a.mentions += count;
    if (must) a.mustHits += count;
    acc.set(id, a);
  };
  // "SAP or NetSuite", "Java/Kotlin": either one meets the requirement.
  const altOf = new Map<string, number>();
  let altSeq = 0;
  const link = (a: string, b: string) => {
    const g = altOf.get(a) ?? altOf.get(b) ?? (altSeq += 1);
    altOf.set(a, g);
    altOf.set(b, g);
  };
  const alternatives = (text: string) => {
    // "Java/Kotlin": a slash joins alternatives only when each side is a skill by itself (not "A/B", "CI/CD").
    for (const m of text.matchAll(/([A-Za-z0-9+#.]+)\s*\/\s*([A-Za-z0-9+#.]+)/g)) {
      const a = [...findSkills(m[1]).values()][0];
      const b = [...findSkills(m[2]).values()][0];
      if (a && b && a.id !== b.id) link(a.id, b.id);
    }
    const pieces = text.split(/\s+(?:or|oder|ou)\s+/i);
    if (pieces.length < 2) return;
    const found = pieces.map((p) => [...findSkills(p).values()].filter((f) => !SKILL_BY_ID.get(f.id)?.soft).sort((x, y) => x.first - y.first));
    for (let i = 0; i + 1 < found.length; i += 1) {
      const left = found[i][found[i].length - 1];
      const right = found[i + 1][0];
      if (left && right && left.id !== right.id) link(left.id, right.id);
    }
  };
  for (const f of findSkills(title).values()) add(f.id, 1.5, f.count, true, f.as);
  alternatives(title);
  for (const l of tagged) {
    let w = structured ? ZONE_WEIGHT[l.zone] : 0.8;
    if (w === 0) continue;
    if (NICE_INLINE.test(l.text)) w = Math.min(w, 0.4);
    else if (MUST_INLINE.test(l.text)) w = Math.max(w, 1);
    for (const f of findSkills(l.text).values()) add(f.id, w, f.count, w >= 0.8, f.as);
    alternatives(l.text);
  }
  const skills: JobSkill[] = [];
  for (const [id, a] of acc) {
    const skill = SKILL_BY_ID.get(id);
    if (!skill) continue;
    let weight = a.weight;
    if (skill.broad && weight < 1.5) {
      // "Sales" in a developer ad is the sales team, not a requirement.
      const own = family.includes(skill.group);
      if (!own && a.mustHits < 2) continue;
      if (!own) weight *= 0.5;
    }
    if (skill.soft) weight *= 0.25;
    else if (a.mentions >= 3) weight *= 1.15;
    // Show the ad's own word when it is a name of its own ("Grafana"), the usual name otherwise.
    const own = a.label.length >= 3 && normalize(a.label) !== normalize(skill.name) && /^[A-Za-z0-9+#. ]+$/.test(a.label) && !/(^| )[A-Za-z]( |$)/.test(a.label);
    const label = own ? (a.label === a.label.toLowerCase() ? a.label.replace(/^\w/, (c) => c.toUpperCase()) : a.label) : skill.name;
    skills.push({ id, label, weight: Math.round(weight * 100) / 100, required: !skill.soft && a.weight >= 0.75, ...(altOf.has(id) ? { alt: altOf.get(id) } : {}) });
  }
  skills.sort((a, b) => b.weight - a.weight);

  // ---- education ----
  const eduLines = tagged.filter((l) => l.zone !== 'skip' && EDU_LINE.test(l.text));
  const asked: EduLevel[] = [];
  let flexible = eduLines.length > 0;
  for (const l of eduLines) {
    const here = EDU_ASK.filter(([, re]) => re.test(l.text)).map(([lv]) => lv);
    if (!here.length) continue;
    // "Bachelor's or Master's" asks for the lower one.
    asked.push(Math.min(...here) as EduLevel);
    if (!(l.zone === 'nice' || NICE_INLINE.test(l.text) || EDU_FLEX.test(l.text))) flexible = false;
  }
  const education = (asked.length ? Math.min(...asked) : 0) as EduLevel;
  const educationFlexible = education > 0 && flexible;

  // ---- languages ----
  const writtenIn = detectLanguage(tagged.map((l) => l.text).join(' '));
  const languages = new Map<string, JobLanguage>();
  for (const l of tagged) {
    if (l.zone === 'skip' || !LANG_CUE.test(l.text)) continue;
    const nice = l.zone === 'nice' || NICE_INLINE.test(l.text);
    for (const chunk of l.text.split(/[,;]|\band\b|\bund\b|\bet\b|\bor\b|\boder\b/i)) {
      for (const lang of LANGS) {
        if (!lang.re.test(chunk)) continue;
        const prev = languages.get(lang.code);
        const level = levelIn(chunk) ?? levelIn(l.text);
        const required = !nice && !/\bor\b|\boder\b|\bou\b/i.test(l.text.slice(Math.max(0, l.text.search(lang.re) - 12), l.text.search(lang.re)));
        languages.set(lang.code, { code: lang.code, name: lang.name, level: level ?? prev?.level ?? null, required: Boolean(prev?.required) || required, inferred: false });
      }
    }
  }
  // An ad written in German expects you to read German.
  const own = LANGS.find((l) => l.code === writtenIn);
  if (own && !languages.has(own.code)) languages.set(own.code, { code: own.code, name: own.name, level: null, required: own.code !== 'en', inferred: true });

  // ---- the words of the job ----
  const weights = new Map<string, number>();
  const termWords = new Map<string, string>();
  const remember = (text: string) => {
    for (const raw of text.toLowerCase().split(/[^a-z0-9+#.À-ɏЀ-ӿ']+/)) {
      const w = raw.replace(/^[.']+|[.']+$/g, '');
      if (w.length < 3) continue;
      const s = stem(w);
      const prev = termWords.get(s);
      if (!prev || w.length < prev.length) termWords.set(s, w);
    }
  };
  const titleTerms = terms(title).filter((t) => !TITLE_NOISE.has(t));
  remember(title);
  for (const t of titleTerms) weights.set(t, 4);
  for (const l of tagged) {
    const w = structured ? ZONE_WEIGHT[l.zone] : 0.8;
    if (w < 0.6) continue;
    remember(l.text);
    for (const t of new Set(terms(l.text))) weights.set(t, (weights.get(t) ?? 0) + w);
  }
  // Keep the words the ad leans on most: the title's, then the most repeated.
  const kept = [...weights].filter(([t, w]) => (w >= 0.8 || titleTerms.includes(t)) && !TITLE_NOISE.has(t)).sort((a, b) => b[1] - a[1]).slice(0, 40);

  return {
    title,
    category,
    seniority: seniorityOf(title),
    skills,
    years: yearsAsked(tagged, input.experienceHint),
    education,
    educationFlexible,
    languages: [...languages.values()],
    writtenIn,
    terms: new Map(kept),
    termWords,
    titleTerms,
    words: tagged.filter((l) => l.zone !== 'skip').reduce((n, l) => n + l.text.split(/\s+/).length, 0),
  };
}
