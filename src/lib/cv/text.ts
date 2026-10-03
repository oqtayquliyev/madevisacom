// Small text tools shared by the CV reader and the job-ad reader.

export type Line = { text: string; heading: boolean };

const decode = (s: string) =>
  s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, '–')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, ' ');

const looksLikeHeading = (t: string) => {
  const words = t.split(/\s+/).length;
  return words <= 9 && t.length <= 70 && (/[:：]$/.test(t) || (t === t.toUpperCase() && /[A-Z]{3}/.test(t)));
};

/** Job-ad HTML (or plain text) → lines, with headings marked. */
export function htmlToLines(html: string): Line[] {
  const marked = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n⟦H⟧$1\n')
    // A paragraph that is only bold text is a heading in most career pages.
    .replace(/<(p|div)[^>]*>\s*<(strong|b)[^>]*>([\s\S]{2,80}?)<\/\2>\s*:?\s*<\/\1>/gi, '\n⟦H⟧$3\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>|<\/(p|div|li|ul|ol|tr|section|article|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decode(marked)
    .split('\n')
    .map((raw) => {
      const flagged = raw.includes('⟦H⟧');
      const text = raw.replace(/⟦H⟧/g, '').replace(/\s+/g, ' ').trim();
      return { text, heading: flagged || looksLikeHeading(text) };
    })
    .filter((l) => l.text.length > 1);
}

export const stripHtml = (html: string) =>
  htmlToLines(html)
    .map((l) => l.text)
    .join('\n');

const STOP = new Set(
  (
    'a an and are as at be been being but by can could did do does for from had has have having he her here him his how i if in into is it its ' +
    'may me might more most must my no nor not of on or our out over own she should so some such than that the their them then there these they this ' +
    'those through to too under until up us very was we were what when where which while who whom why will with within without would you your yours ' +
    'about above across after again all also any around because before below between both each either every few further just like many much new now ' +
    'off once one only other others per same several since still two three well etc via including include includes included e.g i.e eg ie ' +
    // job-ad boilerplate: says nothing about the role
    'job role position candidate candidates applicant applicants team teams company companies work working works worked ability able strong excellent good great ' +
    'experience experienced experiences year years skills skill knowledge understanding responsibilities responsibility requirements requirement qualifications ' +
    'qualification required preferred plus bonus ideal ideally looking join joining opportunity opportunities environment based using use used uses ' +
    'ensure ensuring provide providing support supporting help helping make making take taking need needs needed want wants get lead leading role roles ' +
    'day days time full part level high highly relevant related similar various multiple least minimum degree equivalent proven demonstrated track record ' +
    'apply application applications offer offers benefits salary employer employee employees people person someone us we\'re you\'ll you\'re we\'ll ' +
    'und der die das mit für von zu den im ein eine oder auf ist sind als bei wir sie ihr ihre des dem nach aus sowie ' +
    'et le la les des du de un une pour avec dans en au aux sur est sont vous nous votre notre ou que qui ' +
    'el los las del con para por en una es son y o su sus al como que se'
  ).split(/\s+/),
);

/** Words that describe rank or place, not the work itself. */
export const TITLE_NOISE = new Set(
  (
    'senior junior jr sr lead principal staff head chief associate assistant intern internship trainee graduate entry mid level i ii iii iv ' +
    'm f d w x h all genders gn remote hybrid onsite full part time fulltime parttime temporary permanent contract freelance werkstudent ' +
    'europe emea apac dach uk us usa germany berlin munich london'
  ).split(/\s+/),
);

/** Very light stemmer: plurals and -ing / -ed, enough to match "managing" with "manage". */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/'s$/, '');
  if (w.length <= 4) return w;
  if (/ies$/.test(w)) return `${w.slice(0, -3)}y`;
  if (/(sses|shes|ches|xes)$/.test(w)) return w.slice(0, -2);
  if (/[^s]s$/.test(w)) w = w.slice(0, -1);
  if (w.length > 6 && /ing$/.test(w)) w = w.slice(0, -3);
  else if (w.length > 5 && /ed$/.test(w)) w = w.slice(0, -2);
  if (w.length > 4 && /(.)\1$/.test(w) && !/(ss|ll|ee|oo)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 5 && /e$/.test(w)) w = w.slice(0, -1);
  return w;
}

/** Meaningful stemmed words of a text (no stop words, no numbers). */
export function terms(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9+#.À-ɏЀ-ӿ']+/)) {
    const w = raw.replace(/^[.']+|[.']+$/g, '');
    if (w.length < 3 || STOP.has(w) || /^\d/.test(w)) continue;
    out.push(stem(w));
  }
  return out;
}

const LANG_HINTS: Record<string, RegExp> = {
  de: /\b(und|der|die|das|mit|für|wir|sie|ist|eine?|nicht|sowie|bei|deine?|unser[e]?|kenntnisse|erfahrung|aufgaben)\b/gi,
  fr: /\b(et|les|des|pour|avec|vous|nous|une|dans|votre|notre|est|sur|expérience|poste|compétences)\b/gi,
  es: /\b(y|los|las|para|con|una|del|que|por|nuestro|experiencia|puesto|conocimientos|tu|sus)\b/gi,
  it: /\b(e|il|per|con|una|del|della|che|di|esperienza|nostro|sono|gli|conoscenza)\b/gi,
  nl: /\b(en|het|een|van|voor|met|je|wij|onze|ervaring|bij|zijn|naar|jij|niet)\b/gi,
  pt: /\b(e|os|as|para|com|uma|do|da|que|experiência|nosso|você|em|não|conhecimentos)\b/gi,
  sv: /\b(och|att|som|för|med|är|du|vi|en|ett|på|av|erfarenhet|till|inte)\b/gi,
  pl: /\b(i|w|na|z|do|oraz|się|jest|nie|dla|doświadczenie|pracy|lub|naszym)\b/gi,
  en: /\b(and|the|with|for|you|our|will|are|of|to|experience|your|in|we|is)\b/gi,
};

/** Which language a text is written in (only the ones job ads on MadeVisa come in). */
export function detectLanguage(text: string): string {
  const sample = text.slice(0, 6000);
  const total = Math.max(1, sample.split(/\s+/).length);
  let best = 'en';
  let bestShare = 0;
  for (const [code, re] of Object.entries(LANG_HINTS)) {
    const share = (sample.match(re)?.length ?? 0) / total;
    // English words turn up in every tech ad; another language must clearly lead.
    const adjusted = code === 'en' ? share * 0.9 : share;
    if (adjusted > bestShare) {
      bestShare = adjusted;
      best = code;
    }
  }
  return bestShare < 0.06 ? 'en' : best;
}
