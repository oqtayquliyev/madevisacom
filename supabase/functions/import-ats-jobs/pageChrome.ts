// Identical copy in job-facts/ and import-ats-jobs/ — keep the two in sync.
// supabase/functions/_shared/pageChrome.ts
//
// Some career sites have no structured job data, so the importer falls back
// to reading the page itself — and on sites like DSV that means the whole
// web page: menus ("Solutions", "Industry", "Click to visit page"), login
// boxes, a shipment tracker, language pickers and cookie notices around
// the actual job ad.
//
// pageChromeRemovals() looks at a description line by line and returns the
// lines that are website furniture rather than job text. Used by
//   - the importer (import-ats-jobs), before a description is saved
//   - the detector (job-facts), which cleans what's already saved
// Pure string logic: no DOM, runs anywhere.

export type ChromeLine = { text: string; li?: boolean; heading?: boolean; link?: boolean };

/** Lines that are only ever website UI, never job text. Removed everywhere. */
const UI_LINE_RE = new RegExp(
  '^(?:' +
    [
      'log ?in(?: here)?', 'log ?out', 'sign ?in', 'sign ?up', 'sign out', 'register(?: now)?', 'create (?:an )?account', 'my account',
      'skip to (?:main )?content', 'skip to navigation', 'toggle navigation', '(?:open|close) (?:the )?menu', 'main menu', 'menu',
      'back to top', 'go to top', 'scroll to top', 'click to visit page', 'visit page', 'read more', 'learn more', 'see more', 'show more', 'show less',
      'view all(?: jobs)?', 'see all(?: jobs)?', 'load more', 'more search options', 'search(?: jobs)?', 'search results', 'submit', 'reset', 'close', 'cancel',
      'accept(?: all)?(?: cookies)?', 'reject(?: all)?(?: cookies)?', 'allow all(?: cookies)?', 'deny', 'cookie settings', 'cookies? preferences', 'manage (?:cookies|preferences|consent)',
      'select (?:your )?(?:location|country|region|language)(?: and language)?', 'choose (?:your )?(?:location|country|region|language)', 'change (?:location|country|language)',
      'track(?: & trace)?', 'track (?:and trace|your shipment|shipment)', 'enter (?:id|tracking) number', 'no, continue with search',
      'share(?: this)?(?: job| page)?', 'print(?: this)?(?: job| page)?', 'save(?: job)?', 'follow us(?: on)?', 'subscribe', 'newsletter',
      'previous', 'next', 'back', 'back to (?:search|jobs|results|overview)', 'home', 'you are here',
    ].join('|') +
    ')\\s*[:›»>→]?$',
  'i',
);

/** Navigation words that are chrome when they appear in a run of short lines on a scraped page. */
const NAV_WORD_RE =
  /^(?:global|solutions?|industr(?:y|ies)|services?|products?|about(?: us)?|company|news(?:room)?|media|press|investors?|sustainability|contact(?: us)?|locations?|offices?|careers?|jobs|insights|resources|blog|events|partners|customers|support|help|faq|english|deutsch|français|español|italiano|nederlands|polski|dansk|svenska|norsk|suomi|português|日本語|中文)$/i;

/** Sentences from cookie banners and site notices. */
const NOTICE_RE =
  /\bcookies?\b|\b(?:has|have) (?:been )?merged into\b|update your (?:favourites|favorites|bookmarks)|\bjavascript\b.*\b(?:disabled|enable)|your browser (?:is|does)|(?:©|\(c\))\s*\d{4}|all rights reserved/i;

/** Where the job ad ends and the page's footer / related content begins. */
const STOP_RE =
  /^(?:similar jobs|related jobs|other jobs|recommended jobs|more jobs|jobs you may like|recently viewed jobs|share this job|back to (?:search|job search|all jobs)|job alerts?|get job alerts|sign up for job alerts|follow us|stay connected|connect with us|privacy (?:policy|notice)|cookie (?:policy|notice)|terms (?:of use|and conditions)|imprint|impressum|legal notice|sitemap)\b/i;

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const isProse = (t: string) => t.length >= 90 && words(t) >= 12;
const isShortLine = (l: ChromeLine) => !l.li && !l.heading && words(l.text) <= 5 && !/[.!?]$/.test(l.text) && !/:\s*\S/.test(l.text);
const isUi = (t: string) => UI_LINE_RE.test(t.trim());
const isNotice = (t: string) => NOTICE_RE.test(t) && t.length < 500;
const isChrome = (l: ChromeLine) => isUi(l.text) || NAV_WORD_RE.test(l.text.trim()) || isNotice(l.text);

/**
 * True when the text looks like a whole web page rather than a job ad:
 * several UI / menu / notice lines, or a "<title> | Brand" first line
 * followed by a wall of short menu lines.
 */
export function looksLikePageDump(lines: ChromeLine[], title = ''): boolean {
  if (lines.length < 12) return false;
  const chrome = lines.filter(isChrome).length;
  if (chrome >= 6) return true;
  const head = lines.slice(0, 25);
  const shortShare = head.filter(isShortLine).length / head.length;
  const t = norm(title);
  const pageTitleFirst = Boolean(t) && norm(lines[0].text).startsWith(t) && /\s[|–—-]\s/.test(lines[0].text);
  return chrome >= 3 && (shortShare >= 0.7 || pageTitleFirst);
}

/**
 * Indexes of lines to drop. On an ordinary description only pure UI lines
 * ("Log in", "Click to visit page", "Accept all cookies") go. On a scraped
 * page everything before the job ad (menus, login, trackers) and after it
 * (footer, related jobs, notices) goes too, plus menu lines in between.
 */
export function pageChromeRemovals(lines: ChromeLine[], title = ''): Set<number> {
  const out = new Set<number>();
  lines.forEach((l, i) => {
    if (isUi(l.text) && !l.heading) out.add(i);
  });
  if (!looksLikePageDump(lines, title)) return out;

  // START: the job title as its own line, followed soon by real sentences.
  // Earlier copies (the browser-tab title "Forklift Driver … | DSV", a
  // breadcrumb) sit in the menus and are skipped.
  const t = norm(title);
  // A real paragraph of the ad: not surrounded by UI (a login-box
  // explanation like "You can log in to two versions of …" is prose too,
  // but the lines after it are buttons).
  const chromeAfter = (j: number) => lines.slice(j + 1, j + 9).filter(isChrome).length;
  const firstProseFrom = (i: number) => {
    for (let j = i; j < lines.length; j++) if (isProse(lines[j].text) && !isChrome(lines[j]) && chromeAfter(j) <= 1) return j;
    return -1;
  };
  let start = -1;
  if (t) {
    for (let i = 0; i < lines.length; i++) {
      const k = norm(lines[i].text);
      if (!(k === t || (k.startsWith(t) && k.length <= t.length + 40))) continue;
      const p = firstProseFrom(i + 1);
      if (p !== -1 && p - i <= 15) {
        start = i;
        break;
      }
    }
  }
  if (start === -1) {
    const p = firstProseFrom(0);
    if (p === -1) return out;
    start = p;
    // Keep a heading or a few "Label: value" facts right above the first paragraph.
    while (start > 0 && start > p - 4 && (lines[start - 1].heading || /^[^:]{2,40}:\s*\S/.test(lines[start - 1].text)) && !isChrome(lines[start - 1])) start--;
  }

  // END: a footer / related-jobs marker, or a run of 3+ menu-like lines
  // after the last real paragraph.
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (STOP_RE.test(lines[i].text.trim())) {
      end = i;
      break;
    }
  }
  let lastProse = -1;
  for (let i = start; i < end; i++) if (isProse(lines[i].text) && !isChrome(lines[i])) lastProse = i;
  if (lastProse !== -1) {
    for (let i = lastProse + 1; i < end; i++) {
      // Requirement lines written as short paragraphs are fine; a run is
      // only the footer when it contains menu / UI / notice lines.
      let run = 0;
      let chromeInRun = 0;
      while (i + run < end && (isChrome(lines[i + run]) || isShortLine(lines[i + run]))) {
        if (isChrome(lines[i + run])) chromeInRun++;
        run++;
      }
      if (chromeInRun >= 2 || (chromeInRun >= 1 && run >= 4)) {
        end = i;
        break;
      }
      i += run;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (i < start || i >= end) out.add(i);
    else if (i > start && !lines[i].heading) {
      const l = lines[i];
      const nearChrome = (j: number) => j > start && j < end && j !== i && isChrome(lines[j]);
      if (isUi(l.text) || isNotice(l.text) || (NAV_WORD_RE.test(l.text.trim()) && (nearChrome(i - 1) || nearChrome(i + 1)))) out.add(i);
    }
  }
  return out;
}
