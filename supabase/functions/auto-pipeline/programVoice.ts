// How MadeVisa sounds on social media — the small pieces every post is
// written from. No I/O.
//
// House style (what makes a caption read like a person wrote it):
//  - Open with one plain sentence. A number or a fact, not an announcement.
//  - Short lines. One idea per line. No "Exciting news!", no rocket emoji.
//  - At most one emoji in the opening (a flag counts); on LinkedIn only flags.
//  - One next step, with the exact page that has the answer.
//  - Sometimes a question or "save this" at the end — not every time.
//  - A few hashtags people really search, lower-case, at the very end.
//  - Never the same opening as a recent post on that network.

import type { Platform } from './programCatalog.ts';
import { hash } from './programSchedule.ts';

export const SITE = 'https://madevisa.com';
export const SHORT: Record<Platform, string> = { facebook: 'fb', instagram: 'ig', linkedin: 'li', tiktok: 'tt', telegram: 'tg' };

/** Networks where a link in the text can be tapped. */
export const clickable = (p: Platform) => p === 'facebook' || p === 'linkedin' || p === 'telegram';

/** Pick one of several wordings. `salt` lets one caption make several independent picks. */
export const pick = <T,>(items: T[], seed: number, salt: string | number = 0): T => items[hash(`${seed}:${salt}`) % items.length];
/** True about `share` of the time (0–1), repeatably. */
export const chance = (share: number, seed: number, salt: string | number) => (hash(`${seed}:${salt}`) % 1000) / 1000 < share;

export const nf = (n: number) => Math.round(n).toLocaleString('en-US');
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
export const flag = (iso: string | null | undefined) =>
  iso && /^[A-Z]{2}$/i.test(iso) ? String.fromCodePoint(...[...iso.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '';

const THE = /^(Netherlands|United Kingdom|United States|United Arab Emirates|Philippines|Czech Republic|Bahamas|Maldives|Gambia|Dominican Republic|Seychelles)$/i;
/** "the Netherlands", "Germany". */
export const the = (country: string) => (THE.test(country) ? `the ${country}` : country);
export const The = (country: string) => (THE.test(country) ? `The ${country}` : country);
/** "the UK" / "Germany" for short lines. */
export const shortName = (country: string) => (country === 'United Kingdom' ? 'the UK' : country === 'United States' ? 'the US' : country === 'United Arab Emirates' ? 'the UAE' : the(country));
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** "About one in five ads says" / "62% of ads say" — the start of a sentence about a share of job ads. */
export function adsSay(pct: number): string {
  const p = Math.round(pct);
  if (p >= 58 || p < 9) return `${p}% of ads say`;
  if (p >= 45) return 'About half of the ads say';
  if (p >= 30) return 'About one in three ads says';
  if (p >= 23) return 'About one in four ads says';
  if (p >= 17) return 'About one in five ads says';
  return 'About one in ten ads says';
}

export const list = (items: string[], last = 'and') => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${last} ${items[items.length - 1]}`);

/** A page on madevisa.com as it should appear in a caption on this network. */
export function page(p: Platform, path: string): string {
  if (!clickable(p)) return `madevisa.com${path === '/' ? '' : path.split('?')[0]}`;
  const sep = path.includes('?') ? '&' : '?';
  return `${SITE}${path}${sep}s=${SHORT[p]}`;
}

const BIO = ['Link in bio.', 'The link is in our bio.', 'It’s linked in our bio.', 'You’ll find the link in our bio.'];
/** The call to action line: a lead-in and the page, with "link in bio" where links can't be tapped. */
export function go(p: Platform, seed: number, lead: string | string[], path: string): string {
  const text = Array.isArray(lead) ? pick(lead, seed, 'go') : lead;
  const where = page(p, path);
  if (p === 'instagram') return `${text} ${where}. ${pick(BIO, seed, 'bio')}`;
  if (p === 'tiktok') return `${text} ${where}`;
  return `${text} ${where}`;
}

/** An emoji for the opening line — never on LinkedIn, and not every time elsewhere. */
export function mark(p: Platform, seed: number, emoji: string, share = 0.7): string {
  if (p === 'linkedin' || !emoji) return '';
  return chance(share, seed, `e:${emoji}`) ? `${emoji} ` : '';
}

const SAVE = ['Save this for when you need it.', 'Worth saving.', 'Save it, you’ll want it later.', 'Keep this one.'];
const SHARE = ['Send this to someone who’s job hunting abroad.', 'Know someone planning a move? Send it to them.', 'Pass it on to a friend who’s applying.'];
/** An optional last line. Telegram stays short; elsewhere about half the posts get one. */
export function closer(p: Platform, seed: number, kind: 'save' | 'share' | 'either', share = 0.5): string | null {
  if (p === 'telegram' || !chance(share, seed, 'closer')) return null;
  const k = kind === 'either' ? (chance(0.5, seed, 'closer-kind') ? 'save' : 'share') : kind;
  return pick(k === 'save' ? SAVE : SHARE, seed, 'closer-text');
}

const MAX_TAGS: Record<Platform, number> = { instagram: 7, tiktok: 5, facebook: 3, linkedin: 3, telegram: 2 };
export const tagWord = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
export function tags(p: Platform, words: (string | null | undefined | false)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    const t = w ? tagWord(w) : '';
    if (t.length < 2 || t.length > 28 || seen.has(t)) continue;
    seen.add(t);
    out.push(`#${t}`);
    if (out.length >= MAX_TAGS[p]) break;
  }
  return out.join(' ');
}

// A real person on the team can sign the captions ("— Leyla, MadeVisa").
// Set once per run from the program settings; empty = no signature. It is a
// signature only: captions never tell a personal story in that person's name.
let HOST = '';
export function setHost(name: string | null | undefined): void {
  HOST = (name ?? '').replace(/[\n\r#@]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
}
export const hostName = () => HOST;

const LIMIT: Record<Platform, number> = { linkedin: 2800, telegram: 980, instagram: 2100, facebook: 2100, tiktok: 2100 };
/** Paragraphs → one caption, inside the network's limit (whole paragraphs are dropped from the middle, never cut mid-sentence). */
export function write(p: Platform, parts: (string | null | undefined | false)[]): string {
  const paras = parts.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim());
  // The signature goes after the text and before the hashtags.
  if (HOST && paras.length) {
    const sign = `— ${HOST}, MadeVisa`;
    const tagsLast = paras[paras.length - 1].startsWith('#');
    paras.splice(tagsLast ? paras.length - 1 : paras.length, 0, sign);
  }
  let text = paras.join('\n\n');
  // Too long: drop paragraphs just before the last two (the link and the hashtags stay).
  while (text.length > LIMIT[p] && paras.length > 3) {
    paras.splice(paras.length - 3, 1);
    text = paras.join('\n\n');
  }
  return text.slice(0, LIMIT[p]);
}

/** First line without emoji, lower-cased — to keep two posts from opening the same way. */
export const opening = (caption: string | null | undefined) => (caption ?? '').split('\n')[0].replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase();

/** "3 Oct" */
export const dayLabel = (d: Date, tz: string) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz });
/** "Oct 2026" from "2026-10" or "2026-10-01". */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
}
/** "gov.uk" from a URL. */
export const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
/** First sentence of a paragraph. */
export const firstSentence = (s: string) => (s.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? s).trim();
export const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
export const noDot = (s: string) => s.replace(/[.\s]+$/, '');
