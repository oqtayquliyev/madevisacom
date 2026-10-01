// supabase/functions/import-ats-jobs/index.ts
//
// Imports jobs from (almost) any company careers page for the admin panel's
// "Import jobs from a careers page" section.
//
// HOW IT WORKS
// ------------
// You can paste ANY of these and it figures out the rest:
//   - a careers landing page      (https://www.adobe.com/careers.html)
//   - a job search/results page   (https://jobs.apple.com/en-us/search)
//   - a JSON/XHR URL from DevTools (https://explore.jobs.netflix.net/api/apply/v2/jobs?domain=netflix.com)
//   - an ATS board URL            (https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite)
//
// 1. RESOLVE (first batch only). Starting from the pasted URL it:
//      a. checks the URL itself against known ATS platforms (Workday,
//         Eightfold, Greenhouse, Lever, Ashby, SmartRecruiters, Oracle
//         Recruiting Cloud, Amazon, TalentBrew …),
//      b. fetches the page and looks for: Phenom data, Eightfold markers,
//         links/iframes to an ATS, TalentBrew (Radancy) search, job data
//         embedded in the page's JSON (Next.js, hydration blobs, JSON-LD),
//         and finally plain job-detail links,
//      c. if nothing is found, follows the page's own "Search jobs" /
//         "View all jobs" / "Open positions" links, search <form>s and
//         iframes — up to 3 hops — and repeats (b) on each page,
//      d. last resort: reads the site's sitemap.xml for job URLs.
//    The first strategy that actually returns jobs wins.
// 2. BATCH. The winning strategy + resolved URL are returned to the
//    frontend as `strategy` / `resolvedUrl`, and the frontend passes them
//    back on each following batch, so later batches skip detection and
//    just page through results.
//
// Every job ends up in the same NormalizedJob shape. When a listing only
// has a teaser, each job's own page is fetched for the full description
// (JSON-LD JobPosting first, then embedded JSON, then labeled text).
//
// Limits: sites that block datacenter IPs (Cloudflare/Akamai bot walls)
// or render jobs only via authenticated GraphQL calls can't be read by any
// server-side fetch — the error message says so when that's the cause.
//
// Deploy with: supabase functions deploy import-ats-jobs

import { pageChromeRemovals } from "./pageChrome.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Every browser origin is allowed: CORS only restricts browsers, never
// server-to-server calls, so the admin-only auth check below is the real
// access control. Echoing the Origin avoids "Failed to send a request to
// the Edge Function" on preview/staging domains.
function corsHeadersFor(req: Request) {
  const origin = req.headers.get("Origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
}

// Blocks the most common SSRF targets. Checked on EVERY outbound request,
// including each redirect hop and every URL discovered while crawling.
function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "localhost" || lower.endsWith(".localhost") || lower === "metadata.google.internal") return true;
  if (lower.includes(":")) {
    if (lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) return true;
  }
  const ipMatch = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipMatch) {
    const [a, b] = ipMatch.slice(1).map(Number);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  }
  return false;
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const JSON_ACCEPT = "application/json, text/plain, */*";

// ---- Budgets -------------------------------------------------------------
// Supabase's wall-clock limit is 150s on the free plan; everything below
// keeps one invocation comfortably under that.
const REQUEST_BUDGET_MS = 115_000;
const FETCH_TIMEOUT_MS = 12_000;
const LISTING_BUDGET_MS = 25_000; // time spent paging a listing per batch
const DETAIL_BUDGET_MS = 40_000; // time spent fetching job detail pages per batch
const DISCOVERY_MAX_PAGES = 12;
const DISCOVERY_MAX_DEPTH = 3;
const MAX_JOBS_PER_REQUEST = 100; // API strategies with inline data
const MAX_LINKS_PER_REQUEST = 60; // strategies that must fetch every job page
const DETAIL_CONCURRENCY = 6;

type Ctx = { deadline: number };
const timeLeft = (ctx: Ctx) => ctx.deadline - Date.now();

type NormalizedJob = {
  externalId: string;
  title: string;
  locationText: string;
  offices: string[];
  descriptionHtml: string;
  url: string;
  category: string | null;
  employmentTypeRaw: string | null;
  postedAt: string | null;
  remote: boolean | null;
  /** 'onsite' | 'hybrid' | 'remote' when the source states it (e.g. Eightfold work_location_option, Workday remoteType). */
  workArrangement?: "onsite" | "hybrid" | "remote" | null;
  salaryText: string | null;
};

/** Opaque per-strategy state; round-trips through the frontend as a JSON string. */
type State = { s: string; [k: string]: any };
type Plan = { url: string; state: State; label: string };
type BatchResult = { jobs: NormalizedJob[]; nextFrom: number | null; totalHits: number | null; state?: State };

/** "This strategy doesn't apply here" (as opposed to a real failure). */
class NoJobsError extends Error {}

// =========================================================================
// Small utilities
// =========================================================================

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isObj(v: any): v is Record<string, any> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** First present, non-empty value across candidate keys. */
function firstOf(obj: any, keys: string[]): any {
  if (!isObj(obj)) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    return v;
  }
  return undefined;
}

function pick(sources: any[], keys: string[]): any {
  for (const s of sources) {
    const v = firstOf(s, keys);
    if (v !== undefined) return v;
  }
  return undefined;
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function safeFromCodePoint(n: number): string {
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&amp;/gi, "&");
}

function stripTags(html: string): string {
  return decodeEntities(
    html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function plainLength(html: string): number {
  return html ? stripTags(html).length : 0;
}

function textOf(v: any, depth = 0): string {
  if (v === null || v === undefined || depth > 4) return "";
  if (typeof v === "string") return decodeEntities(v).replace(/\s+/g, " ").trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return uniq(v.map((x) => textOf(x, depth + 1)).filter(Boolean)).join(", ");
  if (isObj(v)) {
    const direct = firstOf(v, ["name", "label", "descriptor", "displayName", "text", "value", "title", "teamName", "Name", "Label"]);
    if (direct !== undefined && direct !== v) return textOf(direct, depth + 1);
  }
  return "";
}

function resolveUrl(raw: any, base: string): string | null {
  if (typeof raw !== "string") return null;
  const t = decodeEntities(raw.trim());
  if (!t || /^(javascript|mailto|tel|data):/i.test(t) || t.startsWith("#")) return null;
  try {
    const u = new URL(t, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}

function sameUrl(a: string, b: string): boolean {
  const n = (s: string) => s.replace(/#.*$/, "").replace(/\/+(\?|$)/, "$1");
  return n(a) === n(b);
}

function baseDomain(host: string): string {
  const parts = host.toLowerCase().split(".");
  if (parts.length <= 2) return parts.join(".");
  const sld = parts[parts.length - 2];
  if (["co", "com", "net", "org", "gov", "ac", "edu"].includes(sld)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

// =========================================================================
// "Not a job" filters — maps, consent walls, blog/marketing pages
// =========================================================================

/**
 * URLs that can never be a job posting, wherever they were found: map
 * links (an office address next to each job), Google/YouTube consent
 * walls ("Before you continue to Google"), search/redirect links,
 * social/share links. A job whose own link is one of these is dropped,
 * and these links are never followed as "job pages".
 */
const NON_JOB_HOST_RE =
  /(^|\.)(goo\.gl|maps\.app\.goo\.gl|g\.page|waze\.com|openstreetmap\.org|mapquest\.com|what3words\.com|wego\.here\.com|here\.com|tripadvisor\.[a-z.]+|trustpilot\.com|yelp\.[a-z.]+|wa\.me|whatsapp\.com|t\.me|telegram\.me|bit\.ly|tinyurl\.com|addtoany\.com|sharethis\.com|gstatic\.com|googleusercontent\.com|googleapis\.com|google-analytics\.com|googletagmanager\.com|doubleclick\.net|wikipedia\.org|wikimedia\.org)$/i;

function isNonJobDestination(raw: string | null | undefined): boolean {
  if (!raw) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  const h = u.hostname.toLowerCase();
  const p = u.pathname.toLowerCase();
  if (NON_JOB_HOST_RE.test(h)) return true;
  // consent.google.co.uk, consent.youtube.com, accounts.google.com …
  if (/^(consent|accounts|maps|translate|news|support|policies)\.(google|youtube)\./.test(h)) return true;
  if (/^maps\.apple\.com$/.test(h) || /(^|\.)bing\.com$/.test(h) && /^\/maps/.test(p)) return true;
  // www.google.<tld>/maps, /search, /url … (google.com/about/careers stays allowed)
  if (/(^|\.)google\.[a-z.]+$/.test(h) && /^\/(maps|search|url|amp|imgres|travel|preferences|sorry)\b/.test(p)) return true;
  if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(h)) return true;
  // A Google consent redirect carries the real destination in ?continue=
  if (/consent|sorry/.test(h + p) && /google|youtube/.test(h)) return true;
  return false;
}

/** Cookie / consent walls and "redirecting…" pages that got read as a job title. */
const CONSENT_TITLE_RE =
  /before you continue( to (google|youtube))?|bevor sie (zu (google|youtube) )?weitergehen|avant d'acc[eé]der [àa] (google|youtube)|antes de (ir|continuar) a (google|youtube)|prima di (continuare|procedere) (su|a) (google|youtube)|voordat je verdergaat naar (google|youtube)|zanim przejdziesz do (google|youtube)|prima di accedere a google|we value your privacy|cookie (settings|preferences|consent)|manage (your )?cookies|redirecting\.*$|you are being redirected/i;
/** Text only a consent page has (Google's "we use cookies and data to …" list). */
const CONSENT_TEXT_RE =
  /deliver and maintain google services|track outages and protect against spam, fraud,? and abuse|google-dienste (bereitzustellen|zu erbringen) und zu warten|non-personali[sz]ed (content|ads) (is|are) influenced by|before you continue to google|bevor sie zu google weitergehen/i;

function isConsentPage(title: string, html: string): boolean {
  if (CONSENT_TITLE_RE.test(title)) return true;
  return CONSENT_TEXT_RE.test(html.length > 200_000 ? html.slice(0, 200_000) : html);
}

/** Blog / news / article sections — some sites (e.g. Shopify "/blogs/job/…") post real jobs there, most posts aren't jobs. */
const ARTICLE_PATH_RE = /\/(blogs?|news|articles?|posts?|press|press-releases?|stories|story|insights|magazine|journal|events?|updates|media|resources|guides?|inspiration|community)(\/|$)/i;
/** Words a job title nearly always has. */
const ROLE_WORD_RE =
  /\b(assistant|associate|manager|management|engineer|engineering|developer|driver|operator|operative|technician|nurse|nursing|doctor|physician|pharmacist|pharmacy|dispenser|dispensing|analyst|specialist|coordinator|co-ordinator|administrator|administration|admin|executive|officer|lead|leader|head of|director|supervisor|intern|internship|trainee|apprentice|apprenticeship|graduate|consultant|advisor|adviser|architect|designer|scientist|researcher|accountant|bookkeeper|payroll|clerk|cashier|receptionist|representative|rep|agent|worker|labourer|laborer|chef|cook|kitchen|waiter|waitress|bartender|barista|cleaner|housekeeper|porter|warehouse|forklift|picker|packer|merchandiser|buyer|planner|controller|auditor|lawyer|solicitor|paralegal|teacher|tutor|lecturer|professor|carer|caregiver|care|therapist|mechanic|electrician|plumber|fitter|welder|machinist|installer|surveyor|estimator|sales|marketing|recruiter|staff|crew|team member|colleague|stocker|programmer|tester|support|security guard|guard|counsel|student|volunteer|praktikum|praktikant|werkstudent|mitarbeiter|ingenieur|leiter|sachbearbeiter|stagiaire|alternance|m[eé]dicos?|residentes?|vacature|stelle|vacancy|opening|position|role|job|(w\/m\/d)|(m\/w\/d)|(f\/m\/d)|(m\/f\/d))\b/i;
/** Phrases job ads have and blog posts / marketing pages don't. Each group counts once. */
const JOB_PHRASE_RES: RegExp[] = [
  /responsibilit|key tasks|duties|what you('|’)?ll do|day[- ]to[- ]day|your role|the role|aufgaben|taken/i,
  /requirements?\b|what you('|’)?ll need|what we('|’)?re looking for|you will have|you have|skills|qualifications?|qualifikation|profil\b|years of experience|experience (in|with|of)/i,
  /closing date|application deadline|apply by|to apply|how to apply|apply (now|online|here|today)|submit (your|an) application|application form|send (your|a) cv|cv and cover|bewerbung|postuler/i,
  /salary|per (hour|annum|year|month|week)|\bp\/?h\b|£\s?\d|€\s?\d|\$\s?\d|competitive pay|hourly rate|pay rate|compensation|gehalt/i,
  /full[- ]time|part[- ]time|permanent|temporary|fixed[- ]term|\bcontract\b|\bcasual\b|\bshifts?\b|\brota\b|hours per week|working hours|\d+\s?hours|vollzeit|teilzeit|befristet|unbefristet/i,
  /benefits|pension|annual leave|holiday entitlement|paid time off|health insurance|employee discount/i,
  /we are (looking|seeking|hiring|recruiting)|we('|’)re (looking|seeking|hiring|recruiting)|join (our|the) team|successful (candidate|applicant)|ideal candidate|the candidate|you will be|wir suchen/i,
  /job (description|title|type|reference|ref|id)|position:|role:|reporting to|reports to|location:|department:/i,
  /equal opportunit|e-verify|right to work|background check|dbs check/i,
];
/** Titles of seasonal / marketing / account pages. */
const MARKETING_TITLE_RE =
  /\b(opt[- ]?out|opt[- ]?in|unsubscribe|subscribe|newsletter|gifts?|christmas|black friday|cyber monday|mother'?s day|father'?s day|valentine'?s?|easter|halloween|sale|discount|% off|offers?|deals?|competition|giveaway|prize|recipes?|tips|how to|top \d+|announce(s|ment)?|press release|webinar|podcast|thank you|thanks|order|delivery|returns?|faq|terms|privacy|cookies?|store finder|our story|about us)\b/i;

function jobPhraseScore(text: string): number {
  let n = 0;
  for (const re of JOB_PHRASE_RES) if (re.test(text)) n++;
  return n;
}

function isArticlePage(html: string): boolean {
  if (/<meta[^>]+property=["']og:type["'][^>]*content=["']article["']/i.test(html) || /<meta[^>]+content=["']article["'][^>]*property=["']og:type["']/i.test(html)) return true;
  return /"@type"\s*:\s*"(BlogPosting|NewsArticle|Article)"/i.test(html) && !/"@type"\s*:\s*"JobPosting"/i.test(html);
}

/**
 * False when a page read through the generic (no structured data) path is
 * clearly not a job ad: a blog/news post, a seasonal "opt out" page, a
 * cookie/consent wall. Pages under /blog/ need real job-ad content (title
 * that names a role + several job-ad phrases) — so real jobs posted on a
 * blog (Shopify "/blogs/job/casual-sales-assistant") are still kept.
 */
function looksLikeJobAd(title: string, descriptionHtml: string, pageHtml: string, url: string): boolean {
  if (isNonJobDestination(url) || isConsentPage(title, pageHtml)) return false;
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    /* ignore */
  }
  const roleTitle = ROLE_WORD_RE.test(title);
  const text = `${stripTags(descriptionHtml)} ${htmlToLines(pageHtml).filter((l) => l.length <= 400).join(" ")}`.slice(0, 60_000);
  const score = (roleTitle ? 2 : 0) + jobPhraseScore(text);
  const contentish = ARTICLE_PATH_RE.test(path) || isArticlePage(pageHtml);
  if (contentish) return score >= 4 && (roleTitle || score >= 6);
  if (MARKETING_TITLE_RE.test(title) && !roleTitle) return score >= 4;
  return roleTitle || score >= 2;
}

/** The page itself says it is a job (schema.org JobPosting or Phenom job data). */
function hasStructuredJob(html: string): boolean {
  if (extractJsonLdJobPosting(html)) return true;
  return isPhenomSite(html) && Boolean(extractPhenomDdo(html)?.jobDetail?.data?.job);
}

/** Last check on every job before it leaves this function. */
function isUsableJob(j: NormalizedJob): boolean {
  if (!j.title || isGarbageTitle(j.title)) return false;
  if (isNonJobDestination(j.url)) return false;
  if (CONSENT_TEXT_RE.test(j.descriptionHtml.slice(0, 20_000))) return false;
  return true;
}

function cleanJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  return jobs.filter(isUsableJob);
}

/** Best-effort ISO date. Handles unix s/ms, /Date(…)/, ISO, "September 20, 2026", "Posted 3 Days Ago". */
function toIsoDate(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v > 1e9 ? v * 1000 : NaN;
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }
  const s = textOf(v);
  if (!s) return null;
  if (/^\d{10,13}$/.test(s)) return toIsoDate(Number(s));
  const msDate = s.match(/\/Date\((\d+)/);
  if (msDate) return toIsoDate(Number(msDate[1]));
  const lower = s.toLowerCase();
  const day = 86_400_000;
  if (/posted\s+today|^today$|just posted/.test(lower)) return new Date().toISOString();
  if (/yesterday/.test(lower)) return new Date(Date.now() - day).toISOString();
  const rel = lower.match(/(\d+)\+?\s*(day|week|month|hour)s?\s+ago/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2] === "hour" ? day / 24 : rel[2] === "week" ? 7 * day : rel[2] === "month" ? 30 * day : day;
    return new Date(Date.now() - n * unit).toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function remoteOf(v: any): boolean | null {
  if (typeof v === "boolean") return v;
  const s = textOf(v).toLowerCase();
  if (!s) return null;
  if (/hybrid/.test(s)) return null;
  if (/remote|telecommut|virtual|work from home|home[\s-]?based|anywhere/.test(s)) return true;
  if (/on-?site|in-?office/.test(s)) return false;
  return null;
}

/** On-site / hybrid / remote from a source's work-type field, or null when it doesn't say. */
function workArrangementOf(v: any): "onsite" | "hybrid" | "remote" | null {
  if (typeof v === "boolean") return v ? "remote" : null;
  const s = textOf(v).toLowerCase();
  if (!s) return null;
  if (/hybrid|flexible/.test(s)) return "hybrid";
  if (/remote|telecommut|virtual|work from home|home[\s-]?based|anywhere/.test(s)) return "remote";
  if (/on-?\s?site|onsite|in-?office|office|in[- ]person/.test(s)) return "onsite";
  return null;
}

// =========================================================================
// HTTP — manual redirects so every hop passes the SSRF check; tiny cookie
// jar across hops (some career sites bounce through a cookie-setting
// redirect); never throws.
// =========================================================================

type Page = { ok: boolean; status: number; url: string; text: string; contentType: string; error?: string };

async function get(
  url: string,
  opts: { accept?: string; method?: string; body?: string; headers?: Record<string, string>; timeoutMs?: number; ctx?: Ctx } = {}
): Promise<Page> {
  let current = url;
  let method = opts.method ?? "GET";
  let body = opts.body;
  const cookies: string[] = [];
  const timeout = Math.max(1_000, Math.min(opts.timeoutMs ?? FETCH_TIMEOUT_MS, opts.ctx ? timeLeft(opts.ctx) - 500 : Infinity));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const fail = (error: string, status = 0): Page => ({ ok: false, status, url: current, text: "", contentType: "", error });

  try {
    for (let hop = 0; hop < 7; hop++) {
      let parsed: URL;
      try {
        parsed = new URL(current);
      } catch {
        return fail("invalid URL");
      }
      if (!/^https?:$/.test(parsed.protocol) || isBlockedHost(parsed.hostname)) return fail("host not allowed");

      const headers: Record<string, string> = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: opts.accept ?? HTML_ACCEPT,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookies.length ? { Cookie: cookies.join("; ") } : {}),
        ...(opts.headers ?? {}),
      };
      const res = await fetch(current, { method, body, headers, redirect: "manual", signal: controller.signal });

      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        const h = res.headers as any;
        const setCookies: string[] = typeof h.getSetCookie === "function" ? h.getSetCookie() : [];
        for (const c of setCookies) cookies.push(String(c).split(";")[0]);
        try {
          await res.body?.cancel();
        } catch {
          /* ignore */
        }
        current = new URL(res.headers.get("location")!, current).toString();
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method !== "GET")) {
          method = "GET";
          body = undefined;
        }
        continue;
      }

      const contentType = res.headers.get("content-type") ?? "";
      let text: string;
      if (/\.gz(\?|$)/i.test(current) && !/text|json|xml/i.test(contentType) && res.body) {
        try {
          text = await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).text();
        } catch {
          text = "";
        }
      } else {
        text = await res.text();
      }
      return { ok: res.ok, status: res.status, url: current, text, contentType };
    }
    return fail("too many redirects");
  } catch (e) {
    return fail((e as Error)?.name === "AbortError" ? "timed out" : (e as Error)?.message ?? "network error");
  } finally {
    clearTimeout(timer);
  }
}

function describeFailure(p: Page): string {
  if (p.status === 0) return p.error ?? "network error";
  const blocked =
    [401, 403, 429, 503].includes(p.status) &&
    /cloudflare|akamai|captcha|access denied|attention required|incapsula|perimeterx|datadome/i.test(p.text);
  return blocked ? `blocked by bot protection (HTTP ${p.status})` : `HTTP ${p.status}`;
}

function parseJson(text: string): any | undefined {
  const t = text.trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

async function getJson(
  url: string,
  ctx: Ctx,
  opts: { method?: string; body?: string; headers?: Record<string, string> } = {}
): Promise<{ json: any; page: Page }> {
  const page = await get(url, { accept: JSON_ACCEPT, ctx, ...opts });
  return { json: page.ok ? parseJson(page.text) : undefined, page };
}

/** Runs `fn` over items with a small worker pool until done or the budget runs out. */
async function pool<T>(items: T[], ctx: Ctx, budgetMs: number, fn: (item: T) => Promise<void>, staggerMs = 150): Promise<void> {
  const stopAt = Math.min(Date.now() + budgetMs, ctx.deadline - 4_000);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length && Date.now() < stopAt) {
      const item = items[cursor++];
      try {
        await fn(item);
      } catch {
        /* one bad item never fails the batch */
      }
      if (staggerMs) await sleep(staggerMs);
    }
  }
  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, worker));
}

// =========================================================================
// Description formatting
// =========================================================================

const SECTION_HEADER_KEYWORDS = [
  "job description", "about the role", "about this role", "summary", "job requirements", "requirements",
  "essential requirements", "nice-to-have", "nice to have", "must-have", "must have", "preferred qualifications",
  "minimum qualifications", "basic qualifications", "key responsibilities", "responsibilities",
  "major accountabilities", "what you will achieve", "how you will achieve it", "why patients need you",
  "qualifications", "skills", "about you", "who you are", "what you'll do", "what you will do",
  "what you'll bring", "benefits and rewards", "benefits", "what we offer", "rewards", "other job details",
  "additional information", "diversity statement", "eeo statement", "about us", "who we are", "education",
  "required skills and experience", "preferred skills and experience", "job function", "job sub function",
  "job category", "all job posting locations", "the role", "the team", "your role", "your profile",
];

function isSectionHeaderLine(line: string): boolean {
  return SECTION_HEADER_KEYWORDS.includes(line.trim().replace(/:$/, "").toLowerCase());
}

/** Plain-text descriptions become <p>/<h3>/<ul>; real HTML is left alone; entity-encoded HTML is decoded first. */
function formatDescriptionHtml(raw: string): string {
  if (!raw) return "";
  let s = raw;
  if (/&lt;\s*\/?\s*(p|div|ul|ol|br|h[1-6]|li|strong|span)[\s&]/i.test(s)) s = decodeEntities(s);
  if (/<\s*(p|div|ul|ol|br|h[1-6]|li)[\s/>]/i.test(s)) return s;

  const lines = s
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n|\n(?=[A-Z][a-z]+.{0,40}:?\s*$)/)
    .flatMap((chunk) => chunk.split(/\n/))
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) =>
      isSectionHeaderLine(line)
        ? `<h3>${line.replace(/:$/, "")}</h3>`
        : /^[•\-*·]\s+/.test(line)
        ? `<li>${line.replace(/^[•\-*·]\s+/, "")}</li>`
        : `<p>${line}</p>`
    )
    .join("")
    .replace(/(?:<li>[\s\S]*?<\/li>)+/g, (m) => `<ul>${m}</ul>`);
}

function sectionHtml(title: string, body: any): string {
  const b = typeof body === "string" ? body.trim() : "";
  if (!b) return "";
  return `<h3>${title}</h3>${formatDescriptionHtml(b)}`;
}

function additionalPropertiesHtml(jsonLd: any): string {
  const props = jsonLd?.additionalProperty;
  if (!Array.isArray(props) || props.length === 0) return "";
  const items = props
    .map((p: any) => {
      const name = p?.name ?? p?.propertyID;
      const value = p?.value;
      if (!name || value === undefined || value === null || value === "") return null;
      return `<li><strong>${String(name)}:</strong> ${textOf(value)}</li>`;
    })
    .filter(Boolean)
    .join("");
  return items ? `<h3>Additional Details</h3><ul>${items}</ul>` : "";
}

// =========================================================================
// Embedded data extraction: JSON-LD, Phenom ddo, script JSON, hydration blobs
// =========================================================================

/** Balanced {…} / […] extraction starting at `start` (string/escape aware). */
function extractBalanced(text: string, start: number): string | null {
  const open = text[start];
  if (open !== "{" && open !== "[") return null;
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;
  const limit = Math.min(text.length, start + 15_000_000);
  for (let i = start; i < limit; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (inString) {
      if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function extractPhenomDdo(html: string): any | null {
  const idx = html.search(/phApp\.ddo\s*=\s*\{/);
  if (idx === -1) return null;
  const raw = extractBalanced(html, html.indexOf("{", idx));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isPhenomSite(html: string): boolean {
  return html.includes("phApp.ddo") || html.includes("phApp =");
}

function jsonLdBlocks(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1]
      .trim()
      .replace(/^\/\*\s*<!\[CDATA\[\s*\*\/|\/\*\s*\]\]>\s*\*\/$/g, "")
      .replace(/^<!\[CDATA\[|\]\]>$/g, "");
    try {
      out.push(JSON.parse(raw));
    } catch {
      try {
        out.push(JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " "))); // raw newlines inside strings — common
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

function isJobPostingType(t: any): boolean {
  return t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"));
}

function extractJsonLdJobPosting(html: string): any | null {
  for (const parsed of jsonLdBlocks(html)) {
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const c of candidates) {
      if (!c) continue;
      if (isJobPostingType(c["@type"])) return c;
      if (Array.isArray(c["@graph"])) {
        const found = c["@graph"].find((g: any) => isJobPostingType(g?.["@type"]));
        if (found) return found;
      }
    }
  }
  return null;
}

/** JSON blobs embedded in a page: <script type=application/json> (incl. __NEXT_DATA__), window.X = {…}, JSON.parse("…"), JSON-LD. */
function extractEmbeddedJson(html: string): any[] {
  const out: any[] = [];
  let budget = 40;
  let m: RegExpExecArray | null;

  const scriptRe = /<script\b[^>]*type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = scriptRe.exec(html)) && budget-- > 0) {
    const parsed = parseJson(m[1].includes("&quot;") ? decodeEntities(m[1]) : m[1]);
    if (parsed !== undefined) out.push(parsed);
  }

  const assignRe = /(?:window\.[\w$]+|window\[["'][\w$]+["']\]|self\.[\w$]+|(?:var|let|const)\s+[\w$]+)\s*=\s*(?=[{[])/g;
  while ((m = assignRe.exec(html)) && budget-- > 0) {
    const start = m.index + m[0].length;
    const raw = extractBalanced(html, start);
    if (!raw) continue;
    assignRe.lastIndex = start + raw.length;
    if (raw.length < 50) continue;
    const parsed = parseJson(raw);
    if (parsed !== undefined) out.push(parsed);
  }

  const parseRe = /JSON\.parse\(\s*(["'])((?:\\.|(?!\1)[^\\])*)\1\s*\)/g;
  while ((m = parseRe.exec(html)) && budget-- > 0) {
    if (m[2].length < 50) continue;
    try {
      const inner = m[1] === "'" ? m[2].replace(/\\'/g, "'").replace(/(^|[^\\])"/g, '$1\\"') : m[2];
      const parsed = parseJson(JSON.parse(`"${inner}"`));
      if (parsed !== undefined) out.push(parsed);
    } catch {
      /* skip */
    }
  }

  out.push(...jsonLdBlocks(html));
  return out;
}

// =========================================================================
// Universal job-record mapping — works on any JSON shape by recognising
// field-name synonyms across platforms.
// =========================================================================

const K = {
  titleStrong: ["PositionTitle", "title", "jobTitle", "job_title", "postingTitle", "positionTitle", "Title", "JobTitle", "requisitionTitle", "externalName", "jobName", "job_name", "position_title"],
  titleWeak: ["name", "text", "Name"],
  id: ["MatchedObjectId", "jobId", "job_id", "jobID", "JobId", "reqId", "req_id", "requisitionId", "requisition_id", "jobReqId", "refNumber", "ats_job_id", "display_job_id", "id_icims", "jobPostingId", "positionId", "jobCode", "job_code", "Id", "ID", "id", "uuid", "externalId", "slug", "key"],
  jobId: ["jobId", "job_id", "reqId", "req_id", "requisitionId", "jobReqId", "ats_job_id", "jobPostingId", "id_icims", "positionId", "refNumber", "display_job_id"],
  url: ["PositionURI", "canonicalPositionUrl", "positionUrl", "absolute_url", "absoluteUrl", "jobUrl", "job_url", "hostedUrl", "externalUrl", "detailUrl", "detailsUrl", "jobDetailUrl", "postingUrl", "canonical_url", "canonicalUrl", "url", "URL", "link", "href", "permalink", "job_path", "jobPath", "externalPath", "applyUrl", "apply_url"],
  location: ["PositionLocation", "locationsText", "location", "locationText", "location_name", "locationName", "full_location", "normalized_location", "primaryLocation", "PrimaryLocation", "cityStateCountry", "locations", "multi_location", "standardizedLocations", "jobLocation", "job_location", "office", "offices", "workLocation", "work_location", "city"],
  description: ["descriptionHtml", "description_html", "job_description", "jobDescription", "description", "content", "body", "ExternalDescriptionStr", "jobSummary", "descriptionTeaser", "summary", "shortDescription", "ShortDescriptionStr", "descriptionPlain"],
  category: ["JobCategory", "category", "jobCategory", "job_category", "department", "departments", "team", "jobFunction", "job_function", "function", "jobFamily", "JobFamily", "business_unit", "businessUnit", "division", "categories"],
  type: ["PositionSchedule", "PositionOfferingType", "employmentType", "employment_type", "jobType", "job_type", "timeType", "commitment", "job_schedule_type", "workType", "typeOfEmployment", "JobSchedule", "schedule"],
  posted: ["PublicationStartDate", "datePosted", "postedDate", "posted_date", "postedOn", "postingDate", "publishedAt", "published_at", "publishDate", "releasedDate", "PostedDate", "postDateInGMT", "postedTs", "t_create", "createdAt", "created_at", "creationDate", "updated_at", "updatedAt", "t_update"],
  remote: ["isRemote", "remote", "work_location_option", "workLocationOption", "workplaceType", "WorkplaceType", "remoteType", "workplace_type", "location_type", "jobLocationType"],
  salary: ["salaryText", "salary", "compensation", "pay_range", "payRange", "salaryRange", "salary_range", "compensationTierSummary", "baseSalary"],
  total: ["totalHits", "total", "totalCount", "total_count", "totalFound", "totalResults", "total_results", "numFound", "TotalJobsCount", "totalJobs", "jobCount", "recordsTotal", "hits", "count", "totalSize"],
};

const JOB_KEY_RE = /job|position|posting|requisition|opening|vacanc|career|search.?results?|hits|results/i;

function sourcesOf(o: any): any[] {
  return [o, o?.MatchedObjectDescriptor, o?.data, o?.attributes, o?.jobPostingInfo, o?.job, o?.posting, o?.fields, o?.categories, o?._source].filter(isObj);
}

function jobScore(o: any): number {
  if (!isObj(o)) return 0;
  const src = sourcesOf(o);
  let s = 0;
  const strong = pick(src, K.titleStrong);
  if (typeof strong === "string" && strong.trim().length >= 2 && strong.length <= 250) s += 3;
  else {
    const weak = pick(src, K.titleWeak);
    if (typeof weak === "string" && weak.trim().length >= 2 && weak.length <= 250) s += 1.5;
    else return 0;
  }
  if (pick(src, K.id) !== undefined) s += 1;
  if (pick(src, K.url) !== undefined) s += 1;
  if (pick(src, K.location) !== undefined) s += 1;
  if (pick(src, K.description) !== undefined) s += 1;
  if (pick(src, K.posted) !== undefined) s += 1;
  if (pick(src, K.category) !== undefined) s += 0.5;
  if (pick(src, K.type) !== undefined) s += 0.5;
  if (pick(src, K.jobId) !== undefined) s += 1;
  return s;
}

function hasJobSignal(o: any): boolean {
  const src = sourcesOf(o);
  return pick(src, K.location) !== undefined || pick(src, K.jobId) !== undefined || pick(src, K.description) !== undefined;
}

type JobArray = { items: any[]; total: number | null };

/** Finds the array in any JSON value that most looks like a list of jobs. */
function findJobArray(root: any): JobArray | null {
  let best: { items: any[]; rank: number; ancestors: any[] } | null = null;
  let visited = 0;

  function walk(node: any, key: string, ancestors: any[], depth: number) {
    if (depth > 14 || visited++ > 60_000) return;
    if (Array.isArray(node)) {
      if (node.length > 0) {
        const objs = node.filter(isObj);
        if (objs.length >= node.length * 0.8) {
          const sample = objs.slice(0, 25);
          const avg = sample.reduce((a, o) => a + jobScore(o), 0) / sample.length;
          const keyish = JOB_KEY_RE.test(key);
          const signal = sample.filter(hasJobSignal).length / sample.length;
          if (avg >= 5 && (signal >= 0.5 || keyish)) {
            const rank = avg * Math.log2(node.length + 1) * (keyish ? 1.5 : 1);
            if (!best || rank > best.rank) best = { items: node, rank, ancestors };
          }
        }
      }
      const next = ancestors.concat([node]);
      for (const el of node.slice(0, 200)) walk(el, key, next, depth + 1);
    } else if (isObj(node)) {
      const next = ancestors.concat([node]);
      for (const k of Object.keys(node)) walk(node[k], k, next, depth + 1);
    }
  }
  walk(root, "", [], 0);
  if (!best) return null;

  const found = best as { items: any[]; rank: number; ancestors: any[] };
  let total: number | null = null;
  for (const a of [...found.ancestors].reverse()) {
    if (!isObj(a)) continue;
    const t = firstOf(a, K.total) ?? firstOf(a.meta, K.total) ?? firstOf(a.pagination, K.total) ?? firstOf(a.paging, K.total) ?? firstOf(a.page_info, K.total);
    const n =
      typeof t === "number" ? t : isObj(t) && typeof t.value === "number" ? t.value : typeof t === "string" && /^\d+$/.test(t) ? Number(t) : NaN;
    if (Number.isFinite(n) && n >= found.items.length) {
      total = n;
      break;
    }
  }
  return { items: found.items, total };
}

/** Single richest job object in a detail page's JSON (for job pages with no JSON-LD). */
function findJobObject(root: any): any | null {
  let best: any = null;
  let bestLen = 0;
  let visited = 0;
  function walk(node: any, depth: number) {
    if (depth > 14 || visited++ > 60_000) return;
    if (Array.isArray(node)) {
      for (const el of node.slice(0, 200)) walk(el, depth + 1);
    } else if (isObj(node)) {
      if (jobScore(node) >= 4.5) {
        const d = pick(sourcesOf(node), K.description);
        const len = typeof d === "string" ? plainLength(d) : 0;
        if (len > bestLen) {
          best = node;
          bestLen = len;
        }
      }
      for (const k of Object.keys(node)) walk(node[k], depth + 1);
    }
  }
  walk(root, 0);
  return bestLen >= 150 ? best : null;
}

function locationList(v: any, depth = 0): string[] {
  if (v === null || v === undefined || depth > 4) return [];
  if (typeof v === "string") return v.split(/\s*[;|]\s*/).map((s) => decodeEntities(s).replace(/\s+/g, " ").trim()).filter(Boolean);
  if (Array.isArray(v)) return uniq(v.flatMap((x) => locationList(x, depth + 1)));
  if (isObj(v)) {
    if (v.address) return officesFromJsonLdLocations(v);
    const full = firstOf(v, ["fullLocation", "full_location", "formattedAddress", "displayName", "name", "Name", "LocationName", "label", "descriptor", "text", "location"]);
    const country = textOf(firstOf(v, ["countryName", "CountryName", "country_name", "country", "countryCode", "country_code"]));
    const countryTxt = country.length === 2 ? country.toUpperCase() : country;
    if (typeof full === "string" && full.trim()) {
      const f = decodeEntities(full).trim();
      return [countryTxt && !f.toLowerCase().includes(countryTxt.toLowerCase()) ? `${f}, ${countryTxt}` : f];
    }
    const parts = [textOf(v.city ?? v.CityName), textOf(v.region ?? v.state ?? v.stateProvince ?? v.regionCode ?? v.CountrySubDivisionName), countryTxt || textOf(v.CountryName)].filter(Boolean);
    return parts.length ? [uniq(parts).join(", ")] : [];
  }
  return [];
}

function salaryOf(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" || typeof v === "number") return textOf(v) || null;
  if (isObj(v)) {
    if (v.value && isObj(v.value)) return salaryTextFromJsonLd(v);
    const min = firstOf(v, ["min", "minValue", "min_value", "minimum", "from", "minAmount"]);
    const max = firstOf(v, ["max", "maxValue", "max_value", "maximum", "to", "maxAmount"]);
    const cur = firstOf(v, ["currency", "currencyCode", "currency_code"]);
    const per = firstOf(v, ["interval", "unit", "unitText", "period", "frequency"]);
    if (min !== undefined || max !== undefined) {
      return `${cur ?? ""} ${min ?? "?"}–${max ?? "?"}${per ? `/${String(per).toLowerCase()}` : ""}`.trim();
    }
    const summary = firstOf(v, ["compensationTierSummary", "summary", "text", "label", "description"]);
    return summary ? textOf(summary) : null;
  }
  return null;
}

function descriptionOf(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return formatDescriptionHtml(v);
  if (Array.isArray(v)) return v.map(descriptionOf).join("");
  if (isObj(v)) {
    // SmartRecruiters-style { sections: { x: { title, text } } }
    const inner = v.sections ?? v;
    if (isObj(inner)) {
      const parts = Object.values(inner)
        .filter(isObj)
        .map((sec: any) => (typeof sec.text === "string" ? sectionHtml(textOf(sec.title) || "Details", sec.text) : ""))
        .join("");
      if (parts) return parts;
    }
    const t = firstOf(v, ["html", "text", "value", "content"]);
    return typeof t === "string" ? formatDescriptionHtml(t) : "";
  }
  return "";
}

const GARBAGE_TITLE_PATTERNS = [
  /^sign in$/i, /^log ?in\b/i, /^search( jobs?)?\b/i, /^learn more$/i, /^apply( now)?$/i, /^see all/i, /^view all\b/i,
  /^cookie/i, /^loading\.*$/i, /^please wait/i, /^javascript is required/i, /^page not found/i, /^404\b/i,
  /^access denied/i, /^just a moment/i, /^one moment/i, /^careers?$/i, /^jobs?$/i, /^home$/i, /^error\b/i,
  /^attention required/i, /^job search\b/i, /^open positions?$/i,
];

function isGarbageTitle(title: string): boolean {
  const t = title.trim();
  return !t || t.length < 2 || GARBAGE_TITLE_PATTERNS.some((p) => p.test(t)) || CONSENT_TITLE_RE.test(t);
}

/** Map any job-like object to a NormalizedJob. `base` resolves relative URLs; `pageLinks` recovers a URL by id when the JSON has none. */
function jobFromObject(obj: any, base: string, pageLinks: string[] = []): NormalizedJob | null {
  const src = sourcesOf(obj);
  const title = textOf(pick(src, K.titleStrong) ?? pick(src, K.titleWeak));
  if (!title || title.length > 250 || isGarbageTitle(title)) return null;

  const idRaw = pick(src, K.jobId) ?? pick(src, K.id);
  const id = typeof idRaw === "string" || typeof idRaw === "number" ? String(idRaw) : "";

  let url: string | null = null;
  for (const key of K.url) {
    const r = resolveUrl(pick(src, [key]), base);
    if (r && !isNonJobDestination(r)) {
      url = r;
      break;
    }
  }
  if (!url && id.length >= 3) url = pageLinks.find((l) => l.includes(id)) ?? null;

  let offices = uniq(locationList(pick(src, K.location))).slice(0, 30);
  // A separate country field matters for destination matching — append it where the location text lacks it.
  const countryRaw = pick(src, ["countryName", "country_name", "PrimaryLocationCountry", "country", "countryCode", "country_code"]);
  let country = typeof countryRaw === "string" || isObj(countryRaw) ? textOf(countryRaw) : "";
  if (country.length === 2) country = country.toUpperCase();
  if (country) {
    offices = offices.length ? offices.map((o) => (o.toLowerCase().includes(country.toLowerCase()) ? o : `${o}, ${country}`)) : [country];
  }
  const remoteRaw = pick(src, K.remote);
  const remote = remoteRaw !== undefined ? remoteOf(remoteRaw) : offices.some((o) => /\bremote\b/i.test(o)) ? true : null;

  return {
    externalId: id || url || `${title}|${offices[0] ?? ""}`,
    title,
    locationText: offices[0] ?? "",
    offices,
    descriptionHtml: descriptionOf(pick(src, K.description)),
    url: url ?? "",
    category: textOf(pick(src, K.category)) || null,
    employmentTypeRaw: textOf(pick(src, K.type)) || null,
    postedAt: toIsoDate(pick(src, K.posted)),
    remote,
    workArrangement: remoteRaw !== undefined ? workArrangementOf(remoteRaw) : null,
    salaryText: salaryOf(pick(src, K.salary)),
  };
}

function jobsFromArray(arr: JobArray, base: string, pageLinks: string[] = []): NormalizedJob[] {
  const jobs: NormalizedJob[] = [];
  const seen = new Set<string>();
  for (const item of arr.items) {
    const j = jobFromObject(item, base, pageLinks);
    if (!j || seen.has(j.externalId)) continue;
    seen.add(j.externalId);
    jobs.push(j);
  }
  return jobs;
}

// =========================================================================
// JSON-LD helpers + detail-page parsing
// =========================================================================

function officesFromJsonLdLocations(jobLocation: any): string[] {
  const items = Array.isArray(jobLocation) ? jobLocation : jobLocation ? [jobLocation] : [];
  const offices: string[] = [];
  for (const loc of items) {
    const addr = loc?.address;
    if (!addr) {
      if (typeof loc?.name === "string") offices.push(loc.name);
      continue;
    }
    if (typeof addr === "string") {
      offices.push(addr);
      continue;
    }
    const parts = [textOf(addr.addressLocality), textOf(addr.addressRegion), textOf(addr.addressCountry)].filter(Boolean);
    if (parts.length) offices.push(uniq(parts).join(", "));
  }
  return uniq(offices);
}

function salaryTextFromJsonLd(baseSalary: any): string | null {
  if (!baseSalary) return null;
  if (typeof baseSalary === "string" || typeof baseSalary === "number") return String(baseSalary);
  const currency = baseSalary.currency ?? "";
  const v = baseSalary.value;
  if (!v) return null;
  if (typeof v !== "object") return `${currency} ${v}`.trim();
  const unit = v.unitText ? `/${String(v.unitText).toLowerCase()}` : "";
  if (v.minValue != null && v.maxValue != null && v.minValue !== v.maxValue) return `${currency} ${v.minValue}–${v.maxValue}${unit}`.trim();
  const single = v.value ?? v.minValue ?? v.maxValue;
  return single != null ? `${currency} ${single}${unit}`.trim() : null;
}

function sameSite(a: any, b: string): boolean {
  try {
    return baseDomain(new URL(String(a), b).hostname) === baseDomain(new URL(b).hostname);
  } catch {
    return false;
  }
}

function normalizedJobFromJsonLd(jsonLd: any, detailUrl: string): NormalizedJob | null {
  const title = textOf(jsonLd.title ?? jsonLd.name);
  if (!title || isGarbageTitle(title)) return null;
  const identifierRaw = jsonLd.identifier;
  const identifierValue = isObj(identifierRaw) ? identifierRaw.value ?? identifierRaw.name : identifierRaw;
  const idFromUrl = detailUrl.match(/([A-Za-z0-9][A-Za-z0-9_-]{2,})\/?(?:\?.*)?$/)?.[1];
  const offices = officesFromJsonLdLocations(jsonLd.jobLocation);
  const remote = jsonLd.jobLocationType === "TELECOMMUTE" ? true : null;
  if (remote && offices.length === 0) offices.push(...locationList(jsonLd.applicantLocationRequirements).map((r) => `Remote, ${r}`));
  const ownUrl = resolveUrl(jsonLd.url, detailUrl);
  return {
    externalId: String(identifierValue ?? idFromUrl ?? detailUrl),
    title,
    locationText: offices[0] ?? "",
    offices,
    descriptionHtml: formatDescriptionHtml(jsonLd.description ? String(jsonLd.description) : "") + additionalPropertiesHtml(jsonLd),
    url: ownUrl && sameSite(ownUrl, detailUrl) ? ownUrl : detailUrl,
    category: textOf(firstOf(jsonLd, ["occupationalCategory", "industry"])) || null,
    employmentTypeRaw: jsonLd.employmentType ? textOf(jsonLd.employmentType) : null,
    postedAt: toIsoDate(jsonLd.datePosted),
    remote,
    salaryText: salaryTextFromJsonLd(jsonLd.baseSalary),
  };
}

// Labeled-field extraction ("Location: Berlin") for pages with no structured data.
function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|header|footer)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(li|tr|p|div|br|dt|dd|h[1-6]|section|article)[ >/]/gi, "\n$&")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const LABEL_SYNONYMS: Record<string, string[]> = {
  location: ["all job posting locations", "job location", "work location", "primary location", "locations", "location"],
  postedAt: ["date posted", "posting date", "posted date", "post date", "posted on"],
  category: ["job category", "category", "department", "job function", "function", "business unit", "division", "team", "job family"],
  employmentType: ["employment type", "job type", "work pattern", "job schedule", "schedule", "time type", "contract type"],
  externalId: ["requisition number", "requisition id", "req id", "req number", "job id", "job number", "reference number", "job requisition id"],
};

function isKnownLabel(line: string): boolean {
  const lower = line.toLowerCase();
  return Object.values(LABEL_SYNONYMS).flat().some((l) => lower === l || lower.startsWith(l + ":") || lower.startsWith(l + " "));
}

function extractLabeledFields(lines: string[]): Record<string, string> {
  const found: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    for (const [field, labels] of Object.entries(LABEL_SYNONYMS)) {
      if (found[field]) continue;
      const label = labels.find((l) => lower === l || lower.startsWith(l + ":") || lower.startsWith(l + " "));
      if (!label) continue;
      const after = lines[i].slice(label.length).replace(/^[\s:–—-]+/, "").trim();
      const value = after || (lines[i + 1] && !isKnownLabel(lines[i + 1]) ? lines[i + 1] : "");
      if (value && value.length < 200) found[field] = value;
    }
  }
  return found;
}

/** Page text without forms, buttons, pickers, dialogs and side columns — for the description only. */
function htmlToContentLines(html: string): { text: string; li: boolean; heading: boolean }[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|header|footer|form|button|select|dialog|aside|template|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(li)[ >]/gi, "\n\u0001$&")
    .replace(/<(h[1-6])[ >]/gi, "\n\u0002$&")
    .replace(/<(tr|p|div|br|dt|dd|section|article)[ >/]/gi, "\n$&")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .split("\n")
    .map((line) => ({ li: line.includes("\u0001"), heading: line.includes("\u0002"), text: line.replace(/[\u0001\u0002]/g, "").replace(/\s+/g, " ").trim() }))
    .filter((l) => l.text);
}

function extractDescriptionBody(lines: string[], title: string, contentLines?: { text: string; li: boolean; heading: boolean }[]): string {
  // Whole web pages (menus, login, trackers, cookie notices around the ad) → just the ad.
  if (contentLines?.length) {
    const drop = pageChromeRemovals(contentLines, title);
    lines = contentLines.filter((_, i) => !drop.has(i)).map((l) => l.text);
  }
  const startIdx = lines.findIndex((l) => l.toLowerCase() === title.toLowerCase());
  const body = startIdx >= 0 ? lines.slice(startIdx + 1) : lines;
  const stops = ["equal opportunity employer", "privacy policy", "cookie policy", "terms of use", "recruitment fraud", "e-verify", "similar jobs", "related jobs", "share this job"];
  const stopIdx = body.findIndex((l) => stops.some((m) => l.toLowerCase().includes(m)));
  const relevant = (stopIdx >= 0 ? body.slice(0, stopIdx) : body).slice(0, 400);
  return relevant.map((l) => (isSectionHeaderLine(l) ? `<h3>${l.replace(/:$/, "")}</h3>` : `<p>${l}</p>`)).join("").slice(0, 20000);
}

// "Admin Support - student / studentka Job Details | Volkswagen AG" →
// "Admin Support - student / studentka". Only trailing segments that are
// clearly site/brand chrome ("| Volkswagen AG", "- Acme Careers") are
// removed, so a real " - " inside a job title survives.
const TITLE_CHROME_WORDS_RE = /\b(?:careers?|jobs|karriere|recruiting|hiring|vacancies|stellenangebote|join us|work(?:ing)? at|jobportal|job portal|emplois?|empleos?)\b/i;
const TITLE_COMPANY_SUFFIX_RE = /\b(?:ag|gmbh|se|inc\.?|ltd\.?|llc|plc|group|s\.?r\.?o\.?|s\.?a\.?|b\.?v\.?|n\.?v\.?|a\/s|oy|ab)$/i;
const TITLE_DETAILS_SUFFIX_RE = /\s+(?:job details|job description|job posting|stellenbeschreibung|stellenanzeige)$/i;

function stripTitleSuffix(title: string): string {
  let t = title.trim();
  for (let i = 0; i < 3; i++) {
    t = t.replace(TITLE_DETAILS_SUFFIX_RE, "");
    const m = t.match(/^(.*\S)\s+([|–—·-])\s+([^|–—·]+)$/);
    if (!m) break;
    const tail = m[3].trim();
    // " | Site name" is nearly always chrome; " - x" only when x looks like a site/company.
    const chrome = tail.split(/\s+/).length <= 5 && (m[2] === "|" || TITLE_CHROME_WORDS_RE.test(tail) || TITLE_COMPANY_SUFFIX_RE.test(tail));
    if (!chrome) break;
    t = m[1];
  }
  return t.replace(TITLE_DETAILS_SUFFIX_RE, "").trim();
}

function titleFromHtml(html: string): string | null {
  const og =
    // Quote-aware, so "Father's Day" isn't cut at the apostrophe.
    html.match(/<meta[^>]+property=["']og:title["'][^>]*content=(?:"([^"]+)"|'([^']+)')/i) ??
    html.match(/<meta[^>]+content=(?:"([^"]+)"|'([^']+)')[^>]*property=["']og:title["']/i);
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const tag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const candidates: [string | null | undefined, boolean][] = [
    [og?.[1] ?? og?.[2], true],
    [h1 ? stripTags(h1[1]) : null, false], // an <h1> is the title itself — never trimmed
    [tag?.[1], true],
  ];
  for (const [raw, trim] of candidates) {
    if (!raw) continue;
    let t = decodeEntities(raw).replace(/\s+/g, " ").trim();
    if (trim) t = stripTitleSuffix(t);
    if (!isGarbageTitle(t) && t.length <= 250) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main description container + sidebar facts
// ---------------------------------------------------------------------------

/** Returns the element starting at `openIdx` (whose tag is `tag`) including its matching close tag. */
function balancedElement(html: string, openIdx: number, tag: string): string | null {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = openIdx;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].endsWith("/>")) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(openIdx, m.index + m[0].length);
    if (re.lastIndex - openIdx > 400_000) return null;
  }
  return null;
}

// Where career sites put the actual job text, most specific first:
// SuccessFactors (jobdescription / itemprop), Workday, Greenhouse/Lever
// embeds, Personio, SmartRecruiters, and common theme class names.
const DESCRIPTION_CONTAINERS: RegExp[] = [
  /<(\w+)\b[^>]*\bclass=["'][^"']*\bjobdescription\b[^"']*["'][^>]*>/i,
  /<(\w+)\b[^>]*\bitemprop=["']description["'][^>]*>/i,
  /<(\w+)\b[^>]*\bdata-automation-id=["']jobPostingDescription["'][^>]*>/i,
  /<(\w+)\b[^>]*\b(?:id|class)=["'][^"']*\b(?:job[-_]?description|jobDescriptionText|job-details__description|description__text|posting-description|job__description|job-body|jobad-content|job-ad-body|vacancy-description)\b[^"']*["'][^>]*>/i,
  /<(\w+)\b[^>]*\b(?:id|class)=["'][^"']*\b(?:content-intro|job-content|jobContent|job_content|position-description)\b[^"']*["'][^>]*>/i,
];

function mainDescriptionHtml(html: string): string | null {
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  let best: string | null = null;
  for (const re of DESCRIPTION_CONTAINERS) {
    const m = re.exec(clean);
    if (!m) continue;
    const el = balancedElement(clean, m.index, m[1]);
    if (!el) continue;
    const inner = el.replace(/^<[^>]+>/, "").replace(/<\/\w+>\s*$/, "");
    if (plainLength(inner) >= 150 && (!best || plainLength(inner) > plainLength(best) * 1.2)) best = inner;
    if (best && plainLength(best) > 600) break;
  }
  return best;
}

// Facts many sites print in a side column ("About the job": Job ID,
// Location, Career Level, Working Model, Posting Date, ...) rather than
// in the description itself.
const FACT_LABELS = [
  "job id", "req id", "requisition id", "job requisition id", "reference number", "company", "location", "locations",
  "work location", "job location", "department", "job function", "business unit", "division", "career level",
  "experience level", "seniority level", "job level", "working model", "work model", "working time", "time type",
  "schedule", "contract type", "employment type", "job type", "type of contract", "remote working", "remote work",
  "workplace type", "work arrangement", "posting date", "date posted", "posted on", "start date", "application deadline",
  "closing date", "salary", "salary range", "compensation", "pay range", "working hours",
];
const FACT_LABEL_RE = new RegExp(`^(${FACT_LABELS.map((l) => l.replace(/ /g, "\\s+")).join("|")})\\s*:\\s*(.*)$`, "i");

function sidebarFactLines(html: string): string[] {
  const lines = htmlToLines(html);
  const facts = new Map<string, string>();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FACT_LABEL_RE);
    if (!m) continue;
    const label = m[1].replace(/\s+/g, " ");
    const key = label.toLowerCase();
    let value = m[2].trim();
    if (!value && lines[i + 1] && !FACT_LABEL_RE.test(lines[i + 1])) value = lines[i + 1].trim();
    if (!value || value.length > 90 || facts.has(key)) continue;
    facts.set(key, `${label.replace(/^./, (c) => c.toUpperCase())}: ${value}`);
  }
  return facts.size >= 2 ? [...facts.values()] : [];
}

/** Prepends sidebar facts the description doesn't already contain, as "Label: value" lines. */
function withSidebarFacts(descriptionHtml: string, pageHtml: string): string {
  const facts = sidebarFactLines(pageHtml);
  if (!facts.length) return descriptionHtml;
  const have = stripTags(descriptionHtml).replace(/\s+/g, " ").toLowerCase();
  const missing = facts.filter((f) => !have.includes(f.toLowerCase()));
  if (!missing.length) return descriptionHtml;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<ul>${missing.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>${descriptionHtml}`;
}

function fallbackJobFromHtml(html: string, detailUrl: string): NormalizedJob | null {
  const title = titleFromHtml(html);
  if (!title) return null;
  const lines = htmlToLines(html);
  const fields = extractLabeledFields(lines);
  const idFromUrl = detailUrl.match(/([A-Za-z0-9][A-Za-z0-9_-]{2,})\/?(?:\?.*)?$/)?.[1];
  const offices = fields.location ? [fields.location] : [];
  return {
    externalId: String(fields.externalId ?? idFromUrl ?? detailUrl),
    title,
    locationText: fields.location ?? "",
    offices,
    descriptionHtml: mainDescriptionHtml(html) ?? extractDescriptionBody(lines, title, htmlToContentLines(html)),
    url: detailUrl,
    category: fields.category ?? null,
    employmentTypeRaw: fields.employmentType ?? null,
    postedAt: toIsoDate(fields.postedAt),
    remote: remoteOf(fields.location) ? true : null,
    salaryText: null,
  };
}

function jobDetailFromPhenomDdo(ddo: any): Partial<NormalizedJob> | null {
  const job = ddo?.jobDetail?.data?.job;
  if (!job) return null;
  const descriptionHtml = firstOf(job, ["description", "jobDescription", "descriptionTeaser"]);
  if (!descriptionHtml) return null;
  return {
    title: job.title,
    descriptionHtml: String(descriptionHtml),
    offices: job.multi_location || (job.location ? [job.location] : []),
    category: firstOf(job, ["category", "primaryCategory", "jobCategory"]) ?? null,
    employmentTypeRaw: firstOf(job, ["jobType", "type", "employmentType", "jobShiftType"]) ?? null,
    postedAt: toIsoDate(firstOf(job, ["postedDate", "postingDate", "dateCreated", "createdDate"])),
    remote: typeof job.isRemote === "boolean" ? job.isRemote : null,
    salaryText: firstOf(job, ["salary", "salaryText", "compensation"]) ?? null,
  };
}

/**
 * Parse one job's own page, then make sure the description is the real
 * one: when structured data only carried a teaser (often just the page
 * title), the page's own description container wins; and facts printed
 * in a side column ("About the job") are added so they can be detected.
 */
function jobFromDetailHtml(html: string, url: string): NormalizedJob | null {
  const j = jobFromDetailHtmlInner(html, url);
  if (!j) return null;
  const main = mainDescriptionHtml(html);
  if (main && plainLength(main) > plainLength(j.descriptionHtml) * 1.3) j.descriptionHtml = main;
  j.descriptionHtml = withSidebarFacts(j.descriptionHtml, html);
  const pageTitle = titleFromHtml(html);
  // A title that was cut short ("Admin Support" vs "Admin Support - student") gets the full one.
  if (pageTitle && pageTitle.length > j.title.length && pageTitle.toLowerCase().startsWith(j.title.toLowerCase())) j.title = pageTitle;
  if (!j.postedAt || !j.locationText) {
    const fields = extractLabeledFields(htmlToLines(html));
    j.postedAt = j.postedAt ?? toIsoDate(fields.postedAt);
    if (!j.locationText && fields.location) {
      j.locationText = fields.location;
      if (!j.offices.length) j.offices = [fields.location];
    }
    j.category = j.category ?? fields.category ?? null;
  }
  return j;
}

function jobFromDetailHtmlInner(html: string, url: string): NormalizedJob | null {
  const ddo = isPhenomSite(html) ? extractPhenomDdo(html) : null;
  const fromDdo = ddo ? jobDetailFromPhenomDdo(ddo) : null;
  const ld = extractJsonLdJobPosting(html);

  if (ld) {
    const j = normalizedJobFromJsonLd(ld, url);
    if (j) {
      if (fromDdo?.descriptionHtml) j.descriptionHtml = formatDescriptionHtml(fromDdo.descriptionHtml) + additionalPropertiesHtml(ld);
      if (fromDdo?.offices?.length) {
        j.offices = fromDdo.offices;
        j.locationText = fromDdo.offices[0];
      }
      j.category = (fromDdo?.category as string) ?? j.category;
      j.employmentTypeRaw = (fromDdo?.employmentTypeRaw as string) ?? j.employmentTypeRaw;
      if (plainLength(j.descriptionHtml) < 100) {
        const fb = fallbackJobFromHtml(html, url);
        if (fb && plainLength(fb.descriptionHtml) > plainLength(j.descriptionHtml)) j.descriptionHtml = fb.descriptionHtml;
      }
      return j;
    }
  }

  if (fromDdo?.title) {
    const offices = fromDdo.offices ?? [];
    return {
      externalId: url,
      title: String(fromDdo.title),
      locationText: offices[0] ?? "",
      offices,
      descriptionHtml: formatDescriptionHtml(fromDdo.descriptionHtml ?? ""),
      url,
      category: (fromDdo.category as string) ?? null,
      employmentTypeRaw: (fromDdo.employmentTypeRaw as string) ?? null,
      postedAt: fromDdo.postedAt ?? null,
      remote: fromDdo.remote ?? null,
      salaryText: (fromDdo.salaryText as string) ?? null,
    };
  }

  for (const blob of extractEmbeddedJson(html)) {
    const obj = findJobObject(blob);
    if (!obj) continue;
    const j = jobFromObject(obj, url);
    if (j) {
      j.url = url;
      return j;
    }
  }

  return fallbackJobFromHtml(html, url);
}

/** Fills in full descriptions (and missing metadata) from each job's own page, for jobs whose listing only had a teaser. */
async function enrichFromDetailPages(ctx: Ctx, jobs: NormalizedJob[], listingUrl: string): Promise<void> {
  const targets = jobs.filter((j) => j.url && !sameUrl(j.url.split("#")[0], listingUrl) && plainLength(j.descriptionHtml) < 400);
  await pool(targets, ctx, DETAIL_BUDGET_MS, async (job) => {
    const page = await get(job.url, { ctx, timeoutMs: 10_000 });
    if (!page.ok) return;
    // Redirected to a map / consent wall → the job's link is not a job page.
    if (isNonJobDestination(page.url) || isConsentPage("", page.text)) {
      if (isNonJobDestination(page.url)) job.url = `${listingUrl}#${encodeURIComponent(job.externalId)}`;
      return;
    }
    const d = jobFromDetailHtml(page.text, page.url);
    if (!d || isBlockedPage(d.title, d.descriptionHtml) || !isUsableJob(d)) return;
    if (plainLength(d.descriptionHtml) > plainLength(job.descriptionHtml)) job.descriptionHtml = d.descriptionHtml;
    if (d.title.length > job.title.length && d.title.toLowerCase().startsWith(job.title.toLowerCase())) job.title = d.title;
    if (d.offices.length && (job.offices.length === 0 || job.offices.every((o) => /various|multiple/i.test(o)))) {
      job.offices = d.offices;
      job.locationText = d.offices[0];
    }
    job.category = job.category ?? d.category;
    job.employmentTypeRaw = job.employmentTypeRaw ?? d.employmentTypeRaw;
    job.postedAt = job.postedAt ?? d.postedAt;
    job.remote = job.remote ?? d.remote;
    job.salaryText = job.salaryText ?? d.salaryText;
  });
}

/** A bot-check / "JavaScript is disabled" / error page, not a job. */
const BLOCKED_RE = /javascript\s+is\s+(disabled|required)|enable\s+javascript|requires\s+javascript|not\s+a\s+robot|checking\s+your\s+browser|verify\s+you\s+are\s+human|attention\s+required|access\s+denied|request\s+unsuccessful/i;
function isBlockedPage(title: string, html: string): boolean {
  if (/^\s*(just a moment\.*|access denied|page not found|not found|40[134]\b.*|error|forbidden|security check|captcha)\s*$/i.test(title) || BLOCKED_RE.test(title)) return true;
  return plainLength(html) < 600 && BLOCKED_RE.test(html.replace(/<[^>]+>/g, " "));
}

/** Builds jobs purely from detail-page URLs (link-scan, TalentBrew and sitemap strategies). */
async function jobsFromDetailUrls(ctx: Ctx, links: string[]): Promise<NormalizedJob[]> {
  const jobs: { job: NormalizedJob; order: number }[] = [];
  let failures = 0;
  let notJobs = 0;
  let lastFailure = "";
  const indexed = links.filter((l) => !isNonJobDestination(l)).map((l, i) => ({ l, i }));
  await pool(
    indexed,
    ctx,
    DETAIL_BUDGET_MS,
    async ({ l, i }) => {
      const page = await get(l, { ctx, timeoutMs: 10_000 });
      if (!page.ok) {
        failures++;
        lastFailure = describeFailure(page);
        return;
      }
      if (isNonJobDestination(page.url)) {
        notJobs++;
        return;
      }
      const job = jobFromDetailHtml(page.text, page.url);
      // Blog posts, seasonal "opt out" pages, consent walls … read like a page, not a job.
      if (job && (!isUsableJob(job) || (!hasStructuredJob(page.text) && !looksLikeJobAd(job.title, job.descriptionHtml, page.text, page.url)))) {
        notJobs++;
        return;
      }
      if (job && !isBlockedPage(job.title, job.descriptionHtml)) jobs.push({ job, order: i });
      else if (job) {
        failures++;
        lastFailure = "the site showed a bot check instead of the job";
      }
    },
    200
  );

  if (jobs.length === 0 && links.length) {
    if (notJobs > 0 && notJobs >= links.length * 0.5) throw new NoJobsError(`found ${links.length} links but they were blog/news or other non-job pages`);
    if (failures >= links.length * 0.8) throw new Error(`found ${links.length} job links but the job pages couldn't be fetched (${lastFailure})`);
    throw new Error(`found ${links.length} job links but none of the pages had readable job data`);
  }
  if (jobs.length >= 5) {
    const distinct = new Set(jobs.map((j) => j.job.title.toLowerCase())).size;
    if (distinct / jobs.length < 0.3) throw new Error("the links found were site navigation, not job postings");
  }
  return jobs.sort((a, b) => a.order - b.order).map((x) => x.job);
}

// =========================================================================
// Link heuristics — "is this URL a single job posting?"
// =========================================================================

const JOB_WORD_RE =
  /^(jobs?|job-?details?|jobdetail(\.ftl)?|job-?posting|job-?description|openings?|positions?|postings?|vacanc(y|ies)|requisitions?|stellen(angebote?|anzeige)?|emploi|empleos?|vagas?|vacatures?|offres?|offre-d-emploi|annonces?|lavoro|oferta|careers?-?job)$/i;
const NAV_WORDS = new Set([
  "search", "search-jobs", "results", "search-results", "saved", "saved-jobs", "alerts", "job-alerts", "login", "signin", "sign-in", "register",
  "categories", "category", "locations", "location", "teams", "team", "departments", "department", "benefits", "faq", "sitemap", "list",
  "all", "filter", "map", "students", "university", "early-careers", "internships", "apply", "talent-community", "join", "culture",
  "life", "about", "how-we-hire", "events", "blog", "news", "privacy", "cookies", "en", "us", "global", "index", "home",
]);
const BAD_HOST_RE = /(^|\.)(linkedin|facebook|twitter|x|instagram|youtube|glassdoor|indeed|tiktok|pinterest|google-analytics|googletagmanager|doubleclick|whatsapp|telegram|threads|snapchat|vimeo|spotify|trustpilot|tripadvisor|yelp|waze|openstreetmap|mapquest|what3words)\./i;
const BAD_EXT_RE = /\.(pdf|jpe?g|png|gif|svg|webp|css|js|ico|woff2?|ttf|mp4|mp3|zip|docx?|xlsx?|pptx?)$/i;
const ID_PARAM_RE = /^(gh_jid|jobid|job_id|jobreqid|reqid|req_id|requisitionid|postingid|pid|jid|job|jobpostingid|positionid|vacancyid|id)$/i;

function isLikelyJobUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (BAD_HOST_RE.test(u.hostname + ".") || BAD_EXT_RE.test(u.pathname) || isNonJobDestination(raw)) return false;
  let segs: string[];
  try {
    segs = u.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s).toLowerCase());
  } catch {
    segs = u.pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
  }
  if (segs.some((s) => ["apply", "login", "logout", "logoutp", "signin", "sign-in", "signout", "sign-out", "register", "share", "print", "email-job", "refer", "security"].includes(s))) return false;

  for (const [k, v] of u.searchParams) {
    if (ID_PARAM_RE.test(k) && /^[\w-]{3,}$/.test(v) && /\d/.test(v)) {
      if (k.toLowerCase() === "id" && !/job|career|position|vacanc|posting|requisition/i.test(u.hostname + u.pathname)) continue;
      return true;
    }
  }

  const jobIdx = segs.findIndex((s) => JOB_WORD_RE.test(s));
  if (jobIdx >= 0) {
    const rest = segs.slice(jobIdx + 1);
    if (rest.length && !rest.every((s) => NAV_WORDS.has(s))) {
      if (rest.some((s) => /\d{3,}/.test(s) || /^(r|req|jr|job)[-_]?\d{2,}/i.test(s) || (s.match(/-/g) ?? []).length >= 2 || /_[a-z]*\d/i.test(s))) return true;
    }
  }
  // /jobs-12345, /job-senior-engineer-4567
  if (segs.some((s) => /^(jobs?|position|vacancy|opening)[-_].*\d{3,}/.test(s))) return true;
  // /details/200123456/title (Apple), /detail/123
  const detIdx = segs.findIndex((s) => ["details", "detail", "job-details", "jobdetails"].includes(s));
  if (detIdx >= 0 && segs.slice(detIdx + 1).some((s) => /\d{3,}/.test(s))) return true;
  // /job-search-v2/fp-a-business-partner-ecco-hq-bredebro-3563 — a job/career path ending in a title slug with a numeric id
  const lastSeg = segs[segs.length - 1] ?? "";
  if (
    segs.length >= 2 &&
    /job|career|vacanc|stellen|position|opening/i.test(segs.slice(0, -1).join("/")) &&
    /^[a-z0-9]+(-[a-z0-9]+){2,}-\d{3,}$/i.test(lastSeg) &&
    !NAV_WORDS.has(lastSeg)
  )
    return true;
  // careers.example.com/…/12345
  if (
    /career|job|talent|recruit|hiring/i.test(u.hostname + "/" + segs.slice(0, -1).join("/")) &&
    segs.some((s) => /^\d{5,}$/.test(s) || /^\d{4,}-[a-z]/.test(s))
  )
    return true;
  return false;
}

function urlShape(raw: string): string {
  try {
    const u = new URL(raw);
    const segs = u.pathname
      .split("/")
      .filter(Boolean)
      .map((s) => (/\d/.test(s) || s.length > 30 || (s.match(/-/g) ?? []).length >= 2 ? "*" : s));
    return `${u.hostname}/${segs.join("/")}?${[...u.searchParams.keys()].sort().join(",")}`;
  } catch {
    return raw;
  }
}

function extractAllUrls(html: string, pageUrl: string): string[] {
  const norm = html.replace(/\\u002[fF]/g, "/").replace(/\\\//g, "/").replace(/&amp;/g, "&");
  const raw: string[] = [];
  let m: RegExpExecArray | null;
  const attrRe = /\b(?:href|data-href|data-url|data-link|data-job-url|data-ph-at-job-url)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  while ((m = attrRe.exec(norm))) raw.push(m[1] ?? m[2] ?? m[3]);
  const jsonRe =
    /"(?:url|href|link|jobUrl|job_url|applyUrl|canonicalUrl|canonical_url|canonicalPositionUrl|positionUrl|absolute_url|externalPath|job_path|jobPath|path|detailUrl|jobDetailUrl|postingUrl|hostedUrl|seoUrl)"\s*:\s*"([^"]{3,500})"/gi;
  while ((m = jsonRe.exec(norm))) raw.push(m[1]);
  const absRe = /https?:\/\/[^\s"'<>\\)]{8,400}/g;
  while ((m = absRe.exec(norm))) raw.push(m[0]);
  return uniq(raw.map((r) => resolveUrl(r, pageUrl)).filter((x): x is string => !!x));
}

/** Job-detail links on a listing page, with noise removed by grouping on URL shape. */
function extractJobLinks(html: string, pageUrl: string): string[] {
  const links = extractAllUrls(html, pageUrl).filter((l) => isLikelyJobUrl(l) && !sameUrl(l, pageUrl));
  if (links.length < 3) return links;
  const groups = new Map<string, string[]>();
  for (const l of links) {
    const k = urlShape(l);
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  const max = Math.max(...[...groups.values()].map((g) => g.length));
  if (max < 3) return links;
  const keep = new Set([...groups.entries()].filter(([, g]) => g.length >= Math.max(2, max * 0.15)).map(([k]) => k));
  return links.filter((l) => keep.has(urlShape(l)));
}

// =========================================================================
// Pagination helpers
// =========================================================================

const OFFSET_PARAMS = ["start", "offset", "from", "skip", "startrow", "startRow", "startIndex", "start_index", "first", "begin", "jobOffset", "folderOffset"];
const PAGE_PARAMS = ["page", "pageNumber", "page_number", "pageNo", "pageNum", "pg", "p", "currentPage", "CurrentPage", "pageIndex", "page_index", "paged"];
const SIZE_PARAMS = ["num", "limit", "size", "count", "pageSize", "page_size", "per_page", "perPage", "rows", "result_limit", "results_per_page", "max", "hitsPerPage", "recordsPerPage", "RecordsPerPage", "jobsPerPage", "numResults", "folderRecordsPerPage"];

function withParam(url: string, key: string, value: string | number): string {
  const u = new URL(url);
  u.searchParams.set(key, String(value));
  return u.toString();
}

function findParam(u: URL, names: string[]): string | null {
  for (const n of names) if (u.searchParams.has(n)) return n;
  const lowerMap = new Map([...u.searchParams.keys()].map((k) => [k.toLowerCase(), k]));
  for (const n of names) {
    const hit = lowerMap.get(n.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

/** Reads pagination from a listing page's own "next" / page-number links. */
function detectHtmlPagination(html: string, pageUrl: string): { p: string; b: number; st: number } | null {
  const page = new URL(pageUrl);
  const all = [...PAGE_PARAMS, ...OFFSET_PARAMS];
  const norm = html.replace(/&amp;/g, "&");
  const relNext =
    norm.match(/<(?:a|link)\b[^>]*rel=["']next["'][^>]*href=["']([^"']+)["']/i) ??
    norm.match(/<(?:a|link)\b[^>]*href=["']([^"']+)["'][^>]*rel=["']next["']/i);

  const candidates: string[] = relNext ? [relNext[1]] : [];
  for (const m of norm.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) candidates.push(m[1]);

  const values = new Map<string, number[]>();
  for (const c of candidates) {
    const r = resolveUrl(c, pageUrl);
    if (!r) continue;
    const u = new URL(r);
    if (u.host !== page.host || u.pathname.replace(/\/$/, "") !== page.pathname.replace(/\/$/, "")) continue;
    for (const [k, v] of u.searchParams) {
      if (!all.includes(k) || !/^\d+$/.test(v)) continue;
      values.set(k, [...(values.get(k) ?? []), Number(v)]);
    }
  }
  if (!values.size) return null;

  const [param, vals] = [...values.entries()].sort((a, b) => uniq(b[1]).length - uniq(a[1]).length)[0];
  const current = page.searchParams.has(param) ? Number(page.searchParams.get(param)) : null;
  const sorted = uniq(vals).sort((a, b) => a - b);
  const isOffset = OFFSET_PARAMS.includes(param);
  const withCurrent = uniq([...(current !== null ? [current] : isOffset ? [0] : []), ...sorted]).sort((a, b) => a - b);
  let step = Infinity;
  for (let i = 1; i < withCurrent.length; i++) step = Math.min(step, withCurrent[i] - withCurrent[i - 1]);
  if (!Number.isFinite(step) || step <= 0) step = isOffset ? sorted[0] || 10 : 1;
  const base = current ?? (isOffset ? 0 : Math.max(0, sorted[0] - step));
  return { p: param, b: base, st: step };
}

function detectTotalInText(html: string): number | null {
  const t = stripTags(html.slice(0, 600_000));
  const m = t.match(/(\d{1,3}(?:[,.\s]\d{3})+|\d+)\s+(?:open\s+|available\s+|matching\s+)?(?:jobs?|positions?|results|openings|roles|vacancies|opportunities)\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[,.\s]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 200_000 ? n : null;
}

// =========================================================================
// STRATEGY: Phenom People (Roche etc.) — same approach as before
// =========================================================================

async function fetchPhenom(ctx: Ctx, baseUrl: string, startFrom: number): Promise<BatchResult> {
  const jobs: NormalizedJob[] = [];
  const seenIds = new Set<string>();
  let offset = startFrom;
  let totalHits: number | null = null;
  let exhausted = false;
  const stopAt = Date.now() + LISTING_BUDGET_MS;

  while (jobs.length < MAX_JOBS_PER_REQUEST && Date.now() < stopAt) {
    const page = await get(withParam(baseUrl, "from", offset), { ctx });
    if (!page.ok) {
      if (jobs.length === 0) throw new Error(`careers page returned ${describeFailure(page)}`);
      break;
    }
    const ddo = extractPhenomDdo(page.text);
    const searchBlock = ddo?.eagerLoadRefineSearch;
    const pageJobs: any[] = searchBlock?.data?.jobs ?? [];
    if (!searchBlock || pageJobs.length === 0) {
      if (jobs.length === 0 && startFrom === 0) throw new NoJobsError("page had no Phenom job-search data");
      exhausted = true;
      break;
    }
    if (totalHits === null && typeof searchBlock.totalHits === "number") totalHits = searchBlock.totalHits;

    let newCount = 0;
    let consumed = 0;
    let hitCap = false;
    for (const job of pageJobs) {
      consumed++;
      const id = job.jobId || job.reqId || job.jobSeqNo;
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      const locations: string[] = job.multi_location || (job.location ? [job.location] : []);
      jobs.push({
        externalId: String(id),
        title: job.title ?? "",
        locationText: job.location || job.cityStateCountry || locations[0] || "",
        offices: locations,
        descriptionHtml: job.descriptionTeaser ? `<p>${job.descriptionTeaser}</p>` : "",
        url: job.applyUrl || "",
        category: firstOf(job, ["category", "primaryCategory", "jobCategory"]) ?? null,
        employmentTypeRaw: firstOf(job, ["jobType", "type", "employmentType", "jobShiftType"]) ?? null,
        postedAt: toIsoDate(firstOf(job, ["postedDate", "postingDate", "dateCreated", "createdDate"])),
        remote: typeof job.isRemote === "boolean" ? job.isRemote : /remote|home[\s-]?based/i.test(job.location ?? "") ? true : null,
        salaryText: firstOf(job, ["salary", "salaryText", "compensation"]) ?? null,
      });
      newCount++;
      if (jobs.length >= MAX_JOBS_PER_REQUEST) {
        hitCap = true;
        break;
      }
    }
    if (hitCap) {
      offset += consumed;
      break;
    }
    offset += searchBlock.hits || pageJobs.length || 10;
    if ((totalHits && offset >= totalHits) || newCount === 0) {
      exhausted = true;
      break;
    }
    await sleep(300);
  }

  await enrichFromDetailPages(ctx, jobs, baseUrl);
  return { jobs, nextFrom: exhausted ? null : offset, totalHits };
}

// =========================================================================
// STRATEGY: Eightfold (Netflix, Microsoft, and many more)
//   list:   /api/apply/v2/jobs?domain=X&start=N&num=M  → { positions, count }
//   detail: /api/apply/v2/jobs/{id}?domain=X           → { job_description, … }
//   newer tenants: /api/pcsx/search + /api/pcsx/position_details
// =========================================================================

function eightfoldDomain(url: string, html = ""): string | null {
  const q = new URL(url).searchParams.get("domain");
  if (q) return q;
  const m = html.match(/["']domain["']\s*:\s*["']([a-z0-9.-]+\.[a-z]{2,})["']/i) ?? html.match(/[?&]domain=([a-z0-9.-]+\.[a-z]{2,})/i);
  return m ? m[1] : null;
}

async function fetchEightfold(ctx: Ctx, url: string, from: number, st: State): Promise<BatchResult> {
  const origin = new URL(url).origin;
  const input = new URL(url);
  let domain: string | null = st.domain ?? eightfoldDomain(url);
  let api: "v2" | "pcsx" | null = st.api ?? null;
  const carry = ["query", "location", "department", "sort_by"].filter((k) => input.searchParams.get(k));

  const listUrl = (kind: "v2" | "pcsx", dom: string, start: number) => {
    const u = new URL(kind === "v2" ? "/api/apply/v2/jobs" : "/api/pcsx/search", origin);
    u.searchParams.set("domain", dom);
    u.searchParams.set("start", String(start));
    if (kind === "v2") u.searchParams.set("num", "100");
    for (const k of carry) u.searchParams.set(k, input.searchParams.get(k)!);
    if (!u.searchParams.has("sort_by")) u.searchParams.set("sort_by", "relevance");
    return u.toString();
  };
  const positionsOf = (json: any): { positions: any[]; count: number | null } | null => {
    const positions = json?.positions ?? json?.data?.positions;
    if (!Array.isArray(positions)) return null;
    const c = json?.count ?? json?.data?.count;
    return { positions, count: typeof c === "number" ? c : null };
  };

  // First call: resolve the tenant domain + which API flavour answers.
  if (!domain || !api) {
    if (!domain) {
      const page = await get(url, { ctx });
      domain = eightfoldDomain(page.url, page.text);
    }
    const bd = baseDomain(input.hostname);
    const domains = domain ? [domain] : uniq([bd, `${bd.split(".")[0]}.com`]);
    outer: for (const d of domains) {
      for (const kind of ["v2", "pcsx"] as const) {
        const { json } = await getJson(listUrl(kind, d, 0), ctx);
        if (positionsOf(json)) {
          domain = d;
          api = kind;
          break outer;
        }
      }
    }
    if (!domain || !api) throw new NoJobsError("Eightfold job API didn't answer");
  }

  const jobs: NormalizedJob[] = [];
  const efIds = new Map<NormalizedJob, string>();
  const seen = new Set<string>();
  let start = from;
  let total: number | null = null;
  let exhausted = false;
  const stopAt = Date.now() + LISTING_BUDGET_MS;

  while (jobs.length < MAX_JOBS_PER_REQUEST && Date.now() < stopAt) {
    const { json, page } = await getJson(listUrl(api, domain, start), ctx);
    const res = positionsOf(json);
    if (!res) {
      if (jobs.length === 0 && from === 0) throw new Error(`Eightfold API returned ${describeFailure(page)}`);
      exhausted = true;
      break;
    }
    if (total === null) total = res.count;
    let added = 0;
    for (const p of res.positions) {
      const j = jobFromObject(p, origin);
      if (!j) continue;
      const id = String(p.id ?? p.positionId ?? j.externalId);
      if (seen.has(id)) continue;
      seen.add(id);
      j.externalId = String(p.display_job_id ?? p.ats_job_id ?? id);
      j.url = resolveUrl(p.canonicalPositionUrl ?? p.positionUrl, origin) ?? `${origin}/careers?pid=${id}&domain=${domain}`;
      efIds.set(j, id);
      jobs.push(j);
      added++;
    }
    start += res.positions.length;
    if (res.positions.length === 0 || added === 0 || (total !== null && start >= total)) {
      exhausted = true;
      break;
    }
  }

  // Full descriptions from the detail API.
  const needs = jobs.filter((j) => plainLength(j.descriptionHtml) < 300);
  await pool(needs, ctx, DETAIL_BUDGET_MS, async (job) => {
    const id = efIds.get(job);
    const detailUrls =
      api === "v2"
        ? [`${origin}/api/apply/v2/jobs/${id}?domain=${domain}`]
        : [`${origin}/api/pcsx/position_details?position_id=${id}&domain=${domain}&hl=en`, `${origin}/api/apply/v2/jobs/${id}?domain=${domain}`];
    for (const du of detailUrls) {
      const { json } = await getJson(du, ctx);
      if (!json) continue;
      let d = firstOf(json, ["job_description", "jobDescription", "description"]) ?? firstOf(json?.data, ["job_description", "jobDescription", "description"]);
      if (typeof d !== "string") {
        const o = findJobObject(json);
        d = o ? pick(sourcesOf(o), K.description) : "";
      }
      if (typeof d === "string" && plainLength(d) > plainLength(job.descriptionHtml)) {
        job.descriptionHtml = formatDescriptionHtml(d);
        break;
      }
    }
  });
  if (needs.length) await enrichFromDetailPages(ctx, jobs, url); // public page JSON-LD as a last resort

  return { jobs, nextFrom: exhausted ? null : start, totalHits: total, state: { s: "eightfold", domain, api } };
}

// =========================================================================
// STRATEGY: Workday  (*.myworkdayjobs.com / *.myworkdaysite.com)
//   list:   POST /wday/cxs/{tenant}/{site}/jobs {limit:20, offset}
//   detail: GET  /wday/cxs/{tenant}/{site}{externalPath}
// =========================================================================

function parseWorkday(url: string): { origin: string; tenant: string; site: string; publicBase: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const h = u.hostname.toLowerCase();
  const segs = u.pathname.split("/").filter(Boolean);
  const isJobs = /\.myworkdayjobs\.com$/.test(h);
  const isSite = /\.myworkdaysite\.com$/.test(h);
  if (!isJobs && !isSite) return null;

  if (segs[0] === "wday" && segs[1] === "cxs" && segs[2] && segs[3]) {
    const publicBase = isSite ? `${u.origin}/recruiting/${segs[2]}/${segs[3]}` : `${u.origin}/${segs[3]}`;
    return { origin: u.origin, tenant: segs[2], site: segs[3], publicBase };
  }
  let lang = "";
  if (segs[0] && /^[a-z]{2}(-[a-z]{2})?$/i.test(segs[0])) lang = segs.shift()!;
  if (isSite) {
    if (segs[0] !== "recruiting" || !segs[1] || !segs[2]) return null;
    return { origin: u.origin, tenant: segs[1], site: segs[2], publicBase: `${u.origin}/${lang ? lang + "/" : ""}recruiting/${segs[1]}/${segs[2]}` };
  }
  const site = segs[0];
  if (!site || ["wday", "job", "details"].includes(site)) return null;
  return { origin: u.origin, tenant: h.split(".")[0], site, publicBase: `${u.origin}/${lang ? lang + "/" : ""}${site}` };
}

async function fetchWorkday(ctx: Ctx, url: string, from: number): Promise<BatchResult> {
  const wd = parseWorkday(url);
  if (!wd) throw new Error("not a recognisable Workday board URL");
  const cxs = `${wd.origin}/wday/cxs/${wd.tenant}/${wd.site}`;
  const searchText = new URL(url).searchParams.get("q") ?? "";

  const postings: any[] = [];
  let offset = from;
  let total: number | null = null;
  let exhausted = false;
  const stopAt = Date.now() + LISTING_BUDGET_MS;

  while (postings.length < MAX_JOBS_PER_REQUEST && Date.now() < stopAt) {
    const { json, page } = await getJson(`${cxs}/jobs`, ctx, {
      method: "POST",
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText }),
    });
    const list: any[] = json?.jobPostings;
    if (!Array.isArray(list)) {
      if (postings.length === 0 && from === 0) throw new Error(`Workday API returned ${describeFailure(page)}`);
      exhausted = true;
      break;
    }
    if (total === null && typeof json.total === "number" && json.total > 0) total = json.total;
    postings.push(...list.filter((p) => p?.externalPath && p?.title));
    offset += list.length;
    if (list.length < 20 || (total !== null && offset >= total)) {
      exhausted = true;
      break;
    }
    await sleep(150);
  }

  const jobs: NormalizedJob[] = postings.map((p) => ({
    externalId: String(p.bulletFields?.[0] ?? p.externalPath),
    title: textOf(p.title),
    locationText: textOf(p.locationsText),
    offices: p.locationsText ? [textOf(p.locationsText)] : [],
    descriptionHtml: "",
    url: `${wd.publicBase}${p.externalPath}`,
    category: null,
    employmentTypeRaw: null,
    postedAt: toIsoDate(p.postedOn),
    remote: remoteOf(p.remoteType ?? p.locationsText),
    workArrangement: workArrangementOf(p.remoteType),
    salaryText: null,
  }));

  await pool(jobs.map((j, i) => ({ j, p: postings[i] })), ctx, DETAIL_BUDGET_MS, async ({ j, p }) => {
    const { json } = await getJson(`${cxs}${p.externalPath}`, ctx);
    const info = json?.jobPostingInfo;
    if (!info) return;
    j.descriptionHtml = formatDescriptionHtml(String(info.jobDescription ?? ""));
    const locs = uniq([info.location, ...(info.additionalLocations ?? [])].map((x: any) => textOf(x)).filter(Boolean));
    const country = textOf(info.country);
    const offices = locs.map((l) => (country && !l.toLowerCase().includes(country.toLowerCase()) ? `${l}, ${country}` : l));
    if (offices.length) {
      j.offices = offices;
      j.locationText = offices[0];
    }
    j.externalId = String(info.jobReqId ?? j.externalId);
    j.url = info.externalUrl ?? j.url;
    j.employmentTypeRaw = textOf(info.timeType) || null;
    j.postedAt = toIsoDate(info.startDate) ?? j.postedAt;
    j.remote = remoteOf(info.remoteType) ?? j.remote;
    j.workArrangement = workArrangementOf(info.remoteType) ?? j.workArrangement;
    j.category = textOf(info.jobFamily ?? info.jobCategory) || null;
  });

  return { jobs, nextFrom: exhausted ? null : offset, totalHits: total };
}

// =========================================================================
// STRATEGY: Greenhouse / Lever / Ashby — public JSON board APIs
// =========================================================================

async function fetchGreenhouse(ctx: Ctx, token: string, from: number): Promise<BatchResult> {
  const { json, page } = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`, ctx);
  const all: any[] = json?.jobs;
  if (!Array.isArray(all)) throw new Error(`Greenhouse board "${token}" returned ${describeFailure(page)}`);
  const slice = all.slice(from, from + 200);
  const jobs = slice.map((j): NormalizedJob => {
    const offices = uniq([textOf(j.location?.name), ...(j.offices ?? []).map((o: any) => textOf(o.name))].filter(Boolean));
    const meta: any[] = j.metadata ?? [];
    const metaValue = (re: RegExp) => {
      const f = meta.find((m) => m?.name && re.test(m.name));
      return f?.value != null && f.value !== "" ? textOf(f.value) : null;
    };
    return {
      externalId: String(j.id),
      title: textOf(j.title),
      locationText: offices[0] ?? "",
      offices,
      descriptionHtml: formatDescriptionHtml(decodeEntities(String(j.content ?? ""))),
      url: String(j.absolute_url ?? ""),
      category: textOf(j.departments?.[0]?.name) || null,
      employmentTypeRaw: metaValue(/employment.?type|job.?type/i),
      postedAt: toIsoDate(j.first_published ?? j.updated_at),
      remote: offices.some((o) => /\bremote\b/i.test(o)) || null,
      salaryText: metaValue(/salary|pay.?range|compensation/i),
    };
  });
  const next = from + slice.length;
  return { jobs, nextFrom: next < all.length ? next : null, totalHits: all.length };
}

async function fetchLever(ctx: Ctx, company: string, eu: boolean, from: number): Promise<BatchResult> {
  const host = eu ? "api.eu.lever.co" : "api.lever.co";
  const { json, page } = await getJson(`https://${host}/v0/postings/${encodeURIComponent(company)}?mode=json&skip=${from}&limit=100`, ctx);
  if (!Array.isArray(json)) throw new Error(`Lever board "${company}" returned ${describeFailure(page)}`);
  const jobs = json.map((p: any): NormalizedJob => {
    const c = p.categories ?? {};
    const offices = uniq([...(c.allLocations ?? []), c.location].map((x: any) => textOf(x)).filter(Boolean));
    const lists = (p.lists ?? []).map((l: any) => `<h3>${textOf(l.text)}</h3><ul>${l.content ?? ""}</ul>`).join("");
    return {
      externalId: String(p.id),
      title: textOf(p.text),
      locationText: offices[0] ?? "",
      offices,
      descriptionHtml:
        formatDescriptionHtml(String(p.description ?? p.descriptionPlain ?? "")) + lists + (p.additional ? formatDescriptionHtml(String(p.additional)) : ""),
      url: String(p.hostedUrl ?? ""),
      category: textOf(c.team ?? c.department) || null,
      employmentTypeRaw: textOf(c.commitment) || null,
      postedAt: toIsoDate(p.createdAt),
      remote: p.workplaceType ? remoteOf(p.workplaceType) : null,
      workArrangement: workArrangementOf(p.workplaceType),
      salaryText: p.salaryRange ? salaryOf(p.salaryRange) : null,
    };
  });
  return { jobs, nextFrom: json.length === 100 ? from + 100 : null, totalHits: null };
}

async function fetchAshby(ctx: Ctx, org: string, from: number): Promise<BatchResult> {
  const { json, page } = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=true`, ctx);
  if (!Array.isArray(json?.jobs)) throw new Error(`Ashby board "${org}" returned ${describeFailure(page)}`);
  const all: any[] = json.jobs.filter((j: any) => j?.isListed !== false);
  const slice = all.slice(from, from + 200);
  const jobs = slice.map((j): NormalizedJob => {
    const offices = uniq([textOf(j.location), ...(j.secondaryLocations ?? []).map((s: any) => textOf(s.location))].filter(Boolean));
    return {
      externalId: String(j.id),
      title: textOf(j.title),
      locationText: offices[0] ?? "",
      offices,
      descriptionHtml: formatDescriptionHtml(String(j.descriptionHtml ?? j.descriptionPlain ?? "")),
      url: String(j.jobUrl ?? `https://jobs.ashbyhq.com/${org}/${j.id}`),
      category: textOf(j.department ?? j.team) || null,
      employmentTypeRaw: textOf(j.employmentType) || null,
      postedAt: toIsoDate(j.publishedAt),
      remote: typeof j.isRemote === "boolean" ? j.isRemote : null,
      workArrangement: workArrangementOf(j.workplaceType ?? (j.isRemote ? "remote" : null)),
      salaryText: textOf(j.compensation?.compensationTierSummary ?? j.compensation?.scrapeableCompensationSalarySummary) || null,
    };
  });
  const next = from + slice.length;
  return { jobs, nextFrom: next < all.length ? next : null, totalHits: all.length };
}

// =========================================================================
// STRATEGY: SmartRecruiters (Bosch, Visa, …)
// =========================================================================

async function fetchSmartRecruiters(ctx: Ctx, company: string, from: number): Promise<BatchResult> {
  const api = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings`;
  const { json, page } = await getJson(`${api}?limit=100&offset=${from}`, ctx);
  const list: any[] = json?.content;
  if (!Array.isArray(list)) throw new Error(`SmartRecruiters company "${company}" returned ${describeFailure(page)}`);
  const total = typeof json.totalFound === "number" ? json.totalFound : null;

  const jobs = list.map((p): NormalizedJob => {
    const loc = p.location ?? {};
    const offices = locationList(loc);
    return {
      externalId: String(p.refNumber ?? p.id),
      title: textOf(p.name),
      locationText: offices[0] ?? "",
      offices,
      descriptionHtml: "",
      url: `https://jobs.smartrecruiters.com/${company}/${p.id}`,
      category: textOf(p.function ?? p.department) || null,
      employmentTypeRaw: textOf(p.typeOfEmployment) || null,
      postedAt: toIsoDate(p.releasedDate),
      remote: loc.remote === true ? true : null,
      salaryText: null,
    };
  });

  await pool(jobs.map((j, i) => ({ j, p: list[i] })), ctx, DETAIL_BUDGET_MS, async ({ j, p }) => {
    const { json: d } = await getJson(`${api}/${p.id}`, ctx);
    const sec = d?.jobAd?.sections;
    if (!sec) return;
    j.descriptionHtml = [
      sectionHtml(textOf(sec.jobDescription?.title) || "Job Description", sec.jobDescription?.text),
      sectionHtml(textOf(sec.qualifications?.title) || "Qualifications", sec.qualifications?.text),
      sectionHtml(textOf(sec.additionalInformation?.title) || "Additional Information", sec.additionalInformation?.text),
      sectionHtml(textOf(sec.companyDescription?.title) || "About the Company", sec.companyDescription?.text),
    ].join("");
    j.url = d.postingUrl ?? j.url;
  });

  const next = from + list.length;
  return { jobs, nextFrom: list.length === 0 || (total !== null && next >= total) ? null : next, totalHits: total };
}

// =========================================================================
// STRATEGY: Oracle Recruiting Cloud (Oracle, JPMorgan, and many others)
// =========================================================================

function parseOracle(url: string): { origin: string; site: string; lang: string } | null {
  try {
    const u = new URL(url);
    if (!/oraclecloud\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/hcmUI\/CandidateExperience\/([a-z-]+)\/sites\/([^/?#]+)/i);
    if (m) return { origin: u.origin, lang: m[1], site: m[2] };
    const f = decodeURIComponent(u.search).match(/siteNumber=([A-Za-z0-9_]+)/);
    if (f) return { origin: u.origin, lang: "en", site: f[1] };
  } catch {
    /* fallthrough */
  }
  return null;
}

async function fetchOracle(ctx: Ctx, url: string, from: number, st: State): Promise<BatchResult> {
  const o = parseOracle(url);
  if (!o) throw new Error("not a recognisable Oracle Candidate Experience URL");
  let siteNumber: string = st.siteNumber ?? o.site;
  if (!/^CX(_\d+)?$/i.test(siteNumber)) {
    const page = await get(url, { ctx });
    const m = page.text.match(/siteNumber["']?\s*[:=]\s*["'](CX_?\d*)["']/i);
    if (m) siteNumber = m[1];
  }
  const api = `${o.origin}/hcmRestApi/resources/latest`;
  const listUrl = (offset: number) =>
    `${api}/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber=${siteNumber},limit=25,offset=${offset},sortBy=POSTING_DATES_DESC`;

  const reqs: any[] = [];
  let offset = from;
  let total: number | null = null;
  let exhausted = false;
  const stopAt = Date.now() + LISTING_BUDGET_MS;
  while (reqs.length < MAX_JOBS_PER_REQUEST && Date.now() < stopAt) {
    const { json, page } = await getJson(listUrl(offset), ctx);
    const item = json?.items?.[0];
    const list: any[] = item?.requisitionList;
    if (!Array.isArray(list)) {
      if (reqs.length === 0 && from === 0) throw new Error(`Oracle Recruiting API returned ${describeFailure(page)}`);
      exhausted = true;
      break;
    }
    if (total === null && typeof item.TotalJobsCount === "number") total = item.TotalJobsCount;
    reqs.push(...list);
    offset += list.length;
    if (list.length < 25 || (total !== null && offset >= total)) {
      exhausted = true;
      break;
    }
  }

  const jobs = reqs.map((r): NormalizedJob => {
    const offices = uniq([textOf(r.PrimaryLocation), ...(r.secondaryLocations ?? []).map((s: any) => textOf(s.Name))].filter(Boolean));
    return {
      externalId: String(r.Id),
      title: textOf(r.Title),
      locationText: offices[0] ?? "",
      offices,
      descriptionHtml: formatDescriptionHtml(String(r.ShortDescriptionStr ?? "")),
      url: `${o.origin}/hcmUI/CandidateExperience/${o.lang}/sites/${o.site}/job/${r.Id}`,
      category: textOf(r.JobFamily ?? r.JobFunction) || null,
      employmentTypeRaw: textOf(r.JobSchedule ?? r.JobType) || null,
      postedAt: toIsoDate(r.PostedDate),
      remote: remoteOf(r.WorkplaceType ?? r.WorkplaceTypeCode),
      workArrangement: workArrangementOf(r.WorkplaceType ?? r.WorkplaceTypeCode),
      salaryText: null,
    };
  });

  await pool(jobs, ctx, DETAIL_BUDGET_MS, async (j) => {
    const { json } = await getJson(
      `${api}/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22${encodeURIComponent(j.externalId)}%22,siteNumber=${siteNumber}`,
      ctx
    );
    const d = json?.items?.[0];
    if (!d) return;
    const html = [
      d.ExternalDescriptionStr ? formatDescriptionHtml(d.ExternalDescriptionStr) : "",
      sectionHtml("Responsibilities", d.ExternalResponsibilitiesStr),
      sectionHtml("Qualifications", d.ExternalQualificationsStr),
      sectionHtml("About Us", d.CorporateDescriptionStr ?? d.OrganizationDescriptionStr),
    ].join("");
    if (plainLength(html) > plainLength(j.descriptionHtml)) j.descriptionHtml = html;
  });

  return { jobs, nextFrom: exhausted ? null : offset, totalHits: total, state: { s: "oracle", siteNumber } };
}

// =========================================================================
// STRATEGY: Amazon (amazon.jobs/…/search.json)
// =========================================================================

async function fetchAmazon(ctx: Ctx, url: string, from: number): Promise<BatchResult> {
  const input = new URL(url);
  const locale = input.pathname.split("/").filter(Boolean)[0] ?? "";
  const api = new URL(`/${/^[a-z]{2}(-[a-z]{2})?$/i.test(locale) ? locale : "en"}/search.json`, input.origin);
  for (const [k, v] of input.searchParams) if (!["offset", "result_limit"].includes(k)) api.searchParams.append(k, v);
  api.searchParams.set("offset", String(from));
  api.searchParams.set("result_limit", "100");
  if (!api.searchParams.has("sort")) api.searchParams.set("sort", "recent");

  const { json, page } = await getJson(api.toString(), ctx);
  if (!Array.isArray(json?.jobs)) throw new Error(`amazon.jobs returned ${describeFailure(page)}`);
  const jobs = json.jobs.map((j: any): NormalizedJob => {
    const offices = uniq([textOf(j.normalized_location), textOf(j.location)].filter(Boolean)).slice(0, 1);
    return {
      externalId: String(j.id_icims ?? j.id),
      title: textOf(j.title),
      locationText: offices[0] ?? "",
      offices,
      descriptionHtml:
        formatDescriptionHtml(String(j.description ?? "")) +
        sectionHtml("Basic Qualifications", j.basic_qualifications) +
        sectionHtml("Preferred Qualifications", j.preferred_qualifications),
      url: new URL(j.job_path ?? "/", input.origin).toString(),
      category: textOf(j.job_category) || null,
      employmentTypeRaw: textOf(j.job_schedule_type) || null,
      postedAt: toIsoDate(j.posted_date),
      remote: null,
      salaryText: null,
    };
  });
  const total = typeof json.hits === "number" ? json.hits : null;
  const next = from + json.jobs.length;
  return { jobs, nextFrom: json.jobs.length === 0 || (total !== null && next >= total) ? null : next, totalHits: total };
}

// =========================================================================
// STRATEGY: "search?data={...}" job APIs (Mercedes-Benz, and other sites on
// the same recruiting platform). The whole query — including paging
// (SearchParameters.FirstItem / CountItem) — is a JSON blob in ?data=.
//   response: { SearchResult: { SearchResultCountAll, SearchResultItems:
//     [{ MatchedObjectId, MatchedObjectDescriptor: { PositionTitle,
//        PositionURI, PositionLocation[], PublicationStartDate, ... } }] } }
// =========================================================================

const SEARCH_API_FIELDS = [
  "ID", "PositionID", "PositionTitle", "PositionURI", "ApplyURI", "OrganizationName",
  "PositionLocation.CountryName", "PositionLocation.CityName", "PositionLocation.CountrySubDivisionName",
  "PositionOfferingType.Name", "PositionSchedule.Name", "JobCategory.Name", "CareerLevel.Name",
  "PublicationStartDate", "PublicationEndDate", "UserArea.TextShort",
];

function parseSearchDataUrl(url: string): { u: URL; data: any } | null {
  try {
    const u = new URL(url);
    const raw = u.searchParams.get("data");
    if (!raw) return null;
    const data = JSON.parse(raw);
    return isObj(data) && isObj(data.SearchParameters) ? { u, data } : null;
  } catch {
    return null;
  }
}

/** jobs.api.example.com → https://jobs.example.com (the public site the API belongs to). */
function siteForSearchApi(u: URL): string {
  return u.origin.replace("://jobs.api.", "://jobs.").replace("://api.", "://");
}

function defaultSearchApiUrl(apiOrigin: string, lang = "EN"): string {
  const data = {
    LanguageCode: lang.toUpperCase(),
    SearchParameters: {
      FirstItem: 1,
      CountItem: 100,
      Sort: [{ Criterion: "PublicationStartDate", Direction: "DESC" }],
      MatchedObjectDescriptor: SEARCH_API_FIELDS,
    },
    SearchCriteria: [],
  };
  return `${apiOrigin}/search?data=${encodeURIComponent(JSON.stringify(data))}`;
}

async function fetchSearchDataApi(ctx: Ctx, url: string, from: number): Promise<BatchResult> {
  const parsed = parseSearchDataUrl(url);
  if (!parsed) throw new Error("not a search?data= job API URL");
  const site = siteForSearchApi(parsed.u);
  const headers = { Origin: site, Referer: `${site}/` };
  const PAGE = 100;
  const lang = String(parsed.data.LanguageCode ?? "EN").toLowerCase();
  const jobs: NormalizedJob[] = [];
  const seen = new Set<string>();
  const seenJobs = new Map<string, NormalizedJob>();
  let offset = from;
  let total: number | null = null;
  let exhausted = false;
  const stopAt = Date.now() + LISTING_BUDGET_MS;

  while (jobs.length < MAX_JOBS_PER_REQUEST && Date.now() < stopAt) {
    const data = JSON.parse(JSON.stringify(parsed.data));
    data.SearchParameters.FirstItem = offset + 1;
    data.SearchParameters.CountItem = PAGE;
    // Keep the page's own fields but drop "Facet:…" entries (those belong to
    // filter-count requests, not the job list) and always ask for ours.
    const own: string[] = Array.isArray(data.SearchParameters.MatchedObjectDescriptor) ? data.SearchParameters.MatchedObjectDescriptor : [];
    data.SearchParameters.MatchedObjectDescriptor = uniq([...own.filter((f) => !/^Facet:/i.test(String(f))), ...SEARCH_API_FIELDS]);
    if (!data.LanguageCode) data.LanguageCode = lang;
    const u = new URL(parsed.u.toString());
    u.searchParams.set("data", JSON.stringify(data));
    const { json, page } = await getJson(u.toString(), ctx, { headers });
    const sr = json?.SearchResult;
    const items: any[] = sr?.SearchResultItems;
    if (!Array.isArray(items)) {
      if (jobs.length === 0 && from === 0) throw new Error(`job search API returned ${describeFailure(page)}`);
      exhausted = true;
      break;
    }
    if (total === null) {
      const t = sr.SearchResultCountAll ?? sr.SearchResultCount;
      if (typeof t === "number" && t >= items.length) total = t;
    }
    for (const item of items) {
      const d = item?.MatchedObjectDescriptor ?? item;
      const j = jobFromObject(item, site);
      if (!j) continue;
      // The same position is often published once per site language
      // (DE / EN / HU …) with the same PositionID — keep one, preferring
      // the version whose link is in the requested language.
      const id = String(d?.PositionID ?? d?.ID ?? item?.MatchedObjectId ?? j.externalId);
      j.externalId = id;
      j.url = resolveUrl(d?.PositionURI ?? d?.ApplyURI, site) ?? j.url;
      const inLang = new RegExp(`/${lang}(/|$|\\?)`, "i").test(j.url);
      const existing = seenJobs.get(id);
      if (existing) {
        if (inLang && !new RegExp(`/${lang}(/|$|\\?)`, "i").test(existing.url)) jobs[jobs.indexOf(existing)] = j, seenJobs.set(id, j);
        continue;
      }
      seen.add(id);
      seenJobs.set(id, j);
      if (!j.descriptionHtml && typeof d?.UserArea?.TextShort === "string") j.descriptionHtml = formatDescriptionHtml(d.UserArea.TextShort);
      jobs.push(j);
    }
    offset += items.length;
    if (items.length === 0 || (total !== null && offset >= total) || (total === null && items.length < PAGE)) {
      exhausted = true;
      break;
    }
    await sleep(150);
  }

  await enrichFromDetailPages(ctx, jobs, site);
  return { jobs, nextFrom: exhausted ? null : offset, totalHits: total };
}

// =========================================================================
// STRATEGY: TalentBrew / Radancy (jobs.boeing.com, careers.unilever.com, …)
// =========================================================================

async function fetchTalentBrew(ctx: Ctx, url: string, from: number): Promise<BatchResult> {
  const u = new URL(url);
  const prefix = u.pathname.split("/search-jobs")[0].replace(/\/$/, "");
  const results = new URL(`${prefix}/search-jobs/results`, u.origin);
  const params: Record<string, string> = {
    ActiveFacetID: "0", CurrentPage: String(from + 1), RecordsPerPage: "50", Distance: "50", RadiusUnitType: "0",
    Keywords: u.searchParams.get("k") ?? "", Location: "", ShowRadius: "False", IsPagination: "False", CustomFacetName: "",
    FacetTerm: "", FacetType: "0", SearchResultsModuleName: "Search Results", SearchFiltersModuleName: "Search Filters",
    SortCriteria: "0", SortDirection: "0", SearchType: "5",
  };
  for (const [k, v] of Object.entries(params)) results.searchParams.set(k, v);

  const page = await get(results.toString(), { accept: JSON_ACCEPT, headers: { "X-Requested-With": "XMLHttpRequest" }, ctx });
  const json = parseJson(page.text);
  const html: string = typeof json?.results === "string" ? json.results : page.text;
  const links = extractJobLinks(html, u.origin + "/");
  if (links.length === 0) {
    if (from === 0) throw new NoJobsError("TalentBrew search returned no job links");
    return { jobs: [], nextFrom: null, totalHits: null };
  }
  const totalMatch = html.match(/data-total-(?:job-)?results\s*=\s*["'](\d+)["']/i);
  const total = totalMatch ? Number(totalMatch[1]) : detectTotalInText(html);
  const jobs = await jobsFromDetailUrls(ctx, links);
  const done = links.length < 50 || (total !== null && (from + 1) * 50 >= total);
  return { jobs, nextFrom: done ? null : from + 1, totalHits: total };
}

// =========================================================================
// STRATEGY: Drupal JSON:API (Sandoz) and "flat jobs JSON" (Booking) — as before
// =========================================================================

function parseDrupalJsonApiJobs(text: string): any | null {
  const json = parseJson(text);
  return json?.jsonapi?.version && Array.isArray(json.data) ? json : null;
}

async function fetchDrupalJsonApi(ctx: Ctx, baseUrl: string, from: number): Promise<BatchResult> {
  const page = await get(withParam(baseUrl, "page", from), { accept: "application/vnd.api+json, application/json", ctx });
  const json = parseDrupalJsonApiJobs(page.text);
  if (!json) throw new Error(`JSON:API endpoint returned ${describeFailure(page)}`);
  const items: any[] = json.data ?? [];
  const total: number | null = typeof json.meta?.count === "number" ? json.meta.count : null;
  const perPage: number = typeof json.number_of_items_per_page === "number" ? json.number_of_items_per_page : items.length || 10;
  const jobs = items
    .map((item): NormalizedJob | null => {
      const a = item.attributes ?? {};
      const title = a.field_job_title || a.title;
      if (!title) return null;
      const countryTerm = item.relationships?.field_job_country?.data?.[0]?.meta?.term_name;
      const countryCode = typeof countryTerm === "string" ? countryTerm.replace(/^LOC_/i, "") : null;
      const workLocation = a.field_job_work_location || "";
      const jobId = a.field_job_id || item.id;
      return {
        externalId: String(jobId),
        title: String(title),
        locationText: workLocation,
        offices: [workLocation, countryCode].filter((v): v is string => !!v),
        descriptionHtml: "",
        url: new URL(`/careers/career-search/job-details/${encodeURIComponent(jobId)}${a.path?.alias || ""}/`, baseUrl).toString(),
        category: a.field_job_business_unit ?? null,
        employmentTypeRaw: a.field_job_type ?? a.field_job_employment_type ?? null,
        postedAt: toIsoDate(a.field_date),
        remote: null,
        salaryText: null,
      };
    })
    .filter((j): j is NormalizedJob => j !== null);
  await enrichFromDetailPages(ctx, jobs, baseUrl);
  const done = items.length === 0 || (total !== null && (from + 1) * perPage >= total);
  return { jobs, nextFrom: done ? null : from + 1, totalHits: total };
}

function parseFlatJobsJson(text: string): any | null {
  const json = parseJson(text);
  return Array.isArray(json?.jobs) && json.jobs.length > 0 && json.jobs[0]?.data?.title ? json : null;
}

async function fetchFlatJobsJson(ctx: Ctx, baseUrl: string, from: number): Promise<BatchResult> {
  const { page } = await getJson(withParam(baseUrl, "page", from + 1), ctx);
  const json = parseFlatJobsJson(page.text);
  if (!json) {
    if (from > 0) return { jobs: [], nextFrom: null, totalHits: null };
    throw new Error(`jobs endpoint returned ${describeFailure(page)}`);
  }
  const items: any[] = json.jobs;
  const total: number | null = typeof json.totalCount === "number" ? json.totalCount : typeof json.count === "number" ? json.count : null;
  const perPage: number = typeof json.filter?.displayLimit === "number" ? json.filter.displayLimit : items.length || 10;
  const jobs = items
    .map((item): NormalizedJob | null => {
      const d = item.data ?? {};
      if (!d.title) return null;
      let descriptionHtml = formatDescriptionHtml(d.description ? String(d.description) : "");
      if (d.department) descriptionHtml += `<h3>Additional Details</h3><ul><li><strong>Department:</strong> ${String(d.department)}</li></ul>`;
      const url = d.meta_data?.canonical_url || d.apply_url || baseUrl;
      return {
        externalId: String(d.req_id ?? d.slug ?? url),
        title: String(d.title),
        locationText: d.full_location || d.short_location || d.city || "",
        offices: [d.full_location, d.country].filter((v): v is string => !!v),
        descriptionHtml,
        url,
        category: Array.isArray(d.category) ? d.category.map((c: string) => String(c).trim()).filter(Boolean).join(", ") : d.category ?? null,
        employmentTypeRaw: d.employment_type ?? null,
        postedAt: toIsoDate(d.posted_date),
        remote: null,
        salaryText: d.salary_min_value || d.salary_max_value ? `${d.salary_min_value ?? "?"}–${d.salary_max_value ?? "?"}` : null,
      };
    })
    .filter((j): j is NormalizedJob => j !== null);
  const done = total !== null && (from + 1) * perPage >= total;
  return { jobs, nextFrom: done ? null : from + 1, totalHits: total };
}

// =========================================================================
// STRATEGY: universal JSON endpoint — any XHR URL copied from DevTools
// =========================================================================

async function fetchJsonListing(ctx: Ctx, url: string, from: number, st: State): Promise<BatchResult> {
  let state: State = { ...st };
  const siteBase: string = state.site ?? new URL(url).origin;

  const load = async (u: string): Promise<{ arr: JobArray | null; page: Page }> => {
    const { json, page } = await getJson(u, ctx);
    return { arr: json !== undefined ? findJobArray(json) : null, page };
  };
  const idsOf = (arr: JobArray) => jobsFromArray(arr, siteBase).map((j) => j.externalId);

  // First call: work out page size and how this endpoint pages.
  let cached: { url: string; arr: JobArray } | null = null;
  if (!state.mode) {
    const first = await load(url);
    if (!first.arr) throw new NoJobsError(first.page.ok ? "JSON response had no job list in it" : `JSON endpoint returned ${describeFailure(first.page)}`);
    let base = url;
    let arr0 = first.arr;
    const u0 = new URL(url);
    const sizeParam = findParam(u0, SIZE_PARAMS);
    if (sizeParam) {
      const cur = Number(u0.searchParams.get(sizeParam));
      if (Number.isFinite(cur) && cur < 100 && arr0.items.length >= cur) {
        const bigger = withParam(url, sizeParam, 100);
        const b = await load(bigger);
        if (b.arr && b.arr.items.length > arr0.items.length) {
          base = bigger;
          arr0 = b.arr;
        }
      }
    }
    const ids0 = new Set(idsOf(arr0));
    const uBase = new URL(base);
    const offParam = findParam(uBase, OFFSET_PARAMS);
    const pageParam = findParam(uBase, PAGE_PARAMS);
    if (offParam) state = { s: "json", mode: "o", param: offParam };
    else if (pageParam) state = { s: "json", mode: "p", param: pageParam, b: Number(uBase.searchParams.get(pageParam)) || 0 };
    else {
      state = { s: "json", mode: "none" };
      const looksPaged = (arr0.total ?? 0) > arr0.items.length || [10, 12, 15, 20, 24, 25, 30, 40, 48, 50, 100].includes(arr0.items.length);
      if (looksPaged) {
        const n = arr0.items.length;
        const guesses: [string, "o" | "p", number][] = [["offset", "o", n], ["start", "o", n], ["from", "o", n], ["skip", "o", n], ["page", "p", 2], ["page", "p", 1], ["p", "p", 2], ["pageNumber", "p", 2]];
        for (const [param, mode, value] of guesses) {
          if (timeLeft(ctx) < 60_000) break;
          const g = await load(withParam(base, param, value));
          const ids = g.arr ? idsOf(g.arr) : [];
          if (ids.some((id) => !ids0.has(id))) {
            state = mode === "o" ? { s: "json", mode, param } : { s: "json", mode, param, b: value - 1 };
            break;
          }
        }
      }
    }
    state.base = base;
    state.site = siteBase;
    cached = { url: state.mode === "p" ? withParam(base, state.param, state.b) : state.mode === "o" ? withParam(base, state.param, 0) : base, arr: arr0 };
    if (state.mode === "o" && !new URL(base).searchParams.has(state.param)) cached = null; // page 0 wasn't fetched with the param
  }

  const base: string = state.base ?? url;

  if (state.mode === "none") {
    const arr = cached?.arr ?? (await load(base)).arr;
    if (!arr) throw new Error("JSON endpoint stopped returning jobs");
    const all = jobsFromArray(arr, siteBase);
    const slice = all.slice(from, from + MAX_JOBS_PER_REQUEST);
    await enrichFromDetailPages(ctx, slice, base);
    const next = from + slice.length;
    return { jobs: slice, nextFrom: next < all.length ? next : null, totalHits: arr.total ?? all.length, state };
  }

  const jobs: NormalizedJob[] = [];
  const seen = new Set<string>();
  let total: number | null = null;
  let cursor = from;
  let exhausted = false;
  const stopAt = Date.now() + LISTING_BUDGET_MS;

  while (jobs.length < MAX_JOBS_PER_REQUEST && Date.now() < stopAt) {
    const pageUrl = state.mode === "o" ? withParam(base, state.param, cursor) : withParam(base, state.param, state.b + cursor);
    const arr = cached && cached.url === pageUrl ? cached.arr : (await load(pageUrl)).arr;
    cached = null;
    if (!arr || arr.items.length === 0) {
      if (jobs.length === 0 && from === 0) throw new NoJobsError("JSON endpoint returned no jobs");
      exhausted = true;
      break;
    }
    if (total === null) total = arr.total;
    const pageJobs = jobsFromArray(arr, siteBase).filter((j) => !seen.has(j.externalId));
    pageJobs.forEach((j) => seen.add(j.externalId));
    jobs.push(...pageJobs);
    cursor += state.mode === "o" ? arr.items.length : 1;
    if (pageJobs.length === 0 || (total !== null && (state.mode === "o" ? cursor : cursor * arr.items.length) >= total)) {
      exhausted = true;
      break;
    }
  }

  await enrichFromDetailPages(ctx, jobs, base);
  return { jobs, nextFrom: exhausted ? null : cursor, totalHits: total, state };
}

// =========================================================================
// STRATEGY: HTML listing — embedded JSON jobs or job-detail links, with
// automatic pagination detection.
// =========================================================================

function embeddedJobsFromHtml(html: string, pageUrl: string): { jobs: NormalizedJob[]; total: number | null } {
  const links = extractJobLinks(html, pageUrl);
  let best: { jobs: NormalizedJob[]; total: number | null } = { jobs: [], total: null };

  for (const blob of extractEmbeddedJson(html)) {
    const list = isObj(blob) && blob["@type"] === "ItemList" ? blob.itemListElement : null;
    if (Array.isArray(list)) {
      const js = list
        .map((el: any) => el?.item ?? el)
        .filter((it: any) => isJobPostingType(it?.["@type"]))
        .map((it: any) => normalizedJobFromJsonLd(it, resolveUrl(it.url, pageUrl) ?? pageUrl))
        .filter((j: NormalizedJob | null): j is NormalizedJob => !!j);
      if (js.length > best.jobs.length) best = { jobs: js, total: null };
      continue;
    }
    const arr = findJobArray(blob);
    if (!arr) continue;
    const js = jobsFromArray(arr, pageUrl, links);
    if (js.length > best.jobs.length) best = { jobs: js, total: arr.total };
  }
  // Jobs with no URL of their own point at the listing — keep them unique.
  for (const j of best.jobs) if (!j.url) j.url = `${pageUrl}#${encodeURIComponent(j.externalId)}`;
  return best;
}

async function fetchHtmlListing(ctx: Ctx, url: string, from: number, st: State): Promise<BatchResult> {
  const mode: "links" | "embedded" = st.s === "embedded" ? "embedded" : "links";
  let state: State = { ...st };
  const target = mode === "links" ? MAX_LINKS_PER_REQUEST : MAX_JOBS_PER_REQUEST;
  const links: string[] = [];
  const embedded = new Map<string, NormalizedJob>();
  let total: number | null = null;
  let k = from;
  let exhausted = false;
  const stopAt = Date.now() + LISTING_BUDGET_MS;
  const count = () => (mode === "links" ? links.length : embedded.size);

  /** Returns how many NEW items the page added. */
  const absorb = (html: string, pUrl: string): number => {
    if (mode === "links") {
      const fresh = extractJobLinks(html, pUrl).filter((l) => !links.includes(l));
      links.push(...fresh);
      return fresh.length;
    }
    const e = embeddedJobsFromHtml(html, pUrl);
    if (total === null) total = e.total;
    let added = 0;
    for (const j of e.jobs) {
      if (embedded.has(j.externalId)) continue;
      embedded.set(j.externalId, j);
      added++;
    }
    return added;
  };

  while (count() < target && Date.now() < stopAt) {
    if (k > 0 && !state.p) {
      if (state.none) {
        exhausted = true;
        break;
      }
      // No pagination links were found on page 0 — try common conventions once.
      const guesses: [string, number, number][] = [["page", 1, 1], ["page", 0, 1], ["p", 1, 1], ["pg", 1, 1], ["start", 0, Math.max(count(), 10)], ["offset", 0, Math.max(count(), 10)]];
      let found = false;
      for (const [p, b, stp] of guesses) {
        if (Date.now() > stopAt) break;
        const pg = await get(withParam(url, p, b + k * stp), { ctx });
        if (pg.ok && absorb(pg.text, pg.url) > 0) {
          state = { ...state, p, b, st: stp };
          found = true;
          k++;
          break;
        }
      }
      if (!found) {
        state.none = true;
        exhausted = true;
        break;
      }
      continue;
    }

    const pUrl = k === 0 ? url : withParam(url, state.p, state.b + k * state.st);
    const page = await get(pUrl, { ctx });
    if (!page.ok) {
      if (k === from && count() === 0) throw new Error(`listing page returned ${describeFailure(page)}`);
      exhausted = true;
      break;
    }
    if (total === null) total = detectTotalInText(page.text);
    const added = absorb(page.text, page.url);
    if (added === 0) {
      if (k === 0 && from === 0) throw new NoJobsError(mode === "links" ? "no job links on the page" : "no embedded job data on the page");
      exhausted = true;
      break;
    }
    if (k === 0 && !state.p && !state.none) {
      const pg = detectHtmlPagination(page.text, page.url);
      if (pg) state = { ...state, ...pg };
    }
    k++;
  }

  let jobs: NormalizedJob[];
  if (mode === "links") jobs = await jobsFromDetailUrls(ctx, links);
  else {
    jobs = [...embedded.values()];
    await enrichFromDetailPages(ctx, jobs, url);
  }
  return { jobs, nextFrom: exhausted ? null : k, totalHits: total, state };
}

// =========================================================================
// STRATEGY: sitemap.xml — last resort for JavaScript-only sites
// =========================================================================

async function collectSitemapJobUrls(ctx: Ctx, pageUrl: string): Promise<string[]> {
  const u = new URL(pageUrl);
  const origin = u.origin;
  const queue: string[] = [];
  const robots = await get(`${origin}/robots.txt`, { ctx, timeoutMs: 6_000 });
  if (robots.ok) for (const m of robots.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)) queue.push(m[1]);
  queue.push(`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/jobs-sitemap.xml`, `${origin}/sitemap-jobs.xml`);

  const seenMaps = new Set<string>();
  const urls: string[] = [];
  let fetched = 0;
  const jobby = (s: string) => /job|career|position|posting|vacanc|requisition|opening/i.test(s);
  while (queue.length && fetched < 14 && urls.length < 20_000 && timeLeft(ctx) > 50_000) {
    const sm = resolveUrl(queue.shift()!, origin);
    if (!sm || seenMaps.has(sm)) continue;
    seenMaps.add(sm);
    if (baseDomain(new URL(sm).hostname) !== baseDomain(u.hostname)) continue;
    fetched++;
    const page = await get(sm, { ctx, accept: "application/xml,text/xml,*/*", timeoutMs: 10_000 });
    if (!page.ok) continue;
    const locs = [...page.text.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)].map((m) => decodeEntities(m[1]));
    if (/<sitemapindex/i.test(page.text)) {
      const ranked = locs.sort((a, b) => Number(jobby(b)) - Number(jobby(a)));
      queue.unshift(...ranked.slice(0, 8));
    } else {
      urls.push(...locs.filter(isLikelyJobUrl));
    }
  }
  let list = uniq(urls);
  // Multi-language sitemaps list every job once per locale — keep the pasted URL's locale when possible.
  const loc = u.pathname.split("/").filter(Boolean).find((s) => /^[a-z]{2}([-_][a-z]{2})?$/i.test(s));
  if (loc) {
    const same = list.filter((l) => new URL(l).pathname.toLowerCase().includes(`/${loc.toLowerCase()}/`));
    if (same.length >= list.length * 0.2 && same.length > 0) list = same;
  }
  return list;
}

async function fetchSitemap(ctx: Ctx, url: string, from: number): Promise<BatchResult> {
  const all = await collectSitemapJobUrls(ctx, url);
  if (all.length === 0) throw new NoJobsError("no job URLs in the site's sitemap");
  const slice = all.slice(from, from + MAX_LINKS_PER_REQUEST);
  const jobs = await jobsFromDetailUrls(ctx, slice);
  const next = from + slice.length;
  return { jobs, nextFrom: next < all.length ? next : null, totalHits: all.length };
}

// =========================================================================
// Detection
// =========================================================================

const LABELS: Record<string, string> = {
  phenom: "Phenom", eightfold: "Eightfold", workday: "Workday", greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby",
  smartrecruiters: "SmartRecruiters", oracle: "Oracle Recruiting Cloud", amazon: "Amazon Jobs", talentbrew: "TalentBrew",
  drupal: "Drupal JSON:API", flatjson: "jobs JSON", searchapi: "Job search API", json: "JSON endpoint", embedded: "page data", links: "job links", sitemap: "sitemap",
};

function plan(s: string, url: string, extra: Record<string, any> = {}): Plan {
  return { url, state: { s, ...extra }, label: LABELS[s] ?? s };
}

/** Plans derivable from the URL alone — no fetch needed. */
function plansFromUrl(raw: string): Plan[] {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return [];
  }
  const h = u.hostname.toLowerCase();
  const segs = u.pathname.split("/").filter(Boolean);
  const out: Plan[] = [];

  if (/\/api\/(apply\/v2|pcsx)\//.test(u.pathname) || /\.eightfold\.ai$/.test(h)) out.push(plan("eightfold", raw));
  else if (/\/careers\/?$/.test(u.pathname) && u.searchParams.has("domain")) out.push(plan("eightfold", raw));
  if (parseWorkday(raw)) out.push(plan("workday", raw));
  if (/(^|\.)greenhouse\.io$/.test(h)) {
    const token = u.searchParams.get("for") ?? (h.startsWith("boards-api") ? segs[2] : segs[0] === "embed" ? null : segs[0]);
    if (token) out.push(plan("greenhouse", raw, { token }));
  }
  if (/(^|\.)lever\.co$/.test(h)) {
    const company = h.startsWith("api") ? segs[2] : segs[0];
    if (company) out.push(plan("lever", raw, { company, eu: h.includes(".eu.") }));
  }
  if (/(^|\.)ashbyhq\.com$/.test(h)) {
    const org = h.startsWith("api") ? segs[2] : segs[0];
    if (org) out.push(plan("ashby", raw, { org }));
  }
  if (/(^|\.)smartrecruiters\.com$/.test(h)) {
    const company = h.startsWith("api") ? segs[2] : segs[0];
    if (company && !/^(static|widget|oneclick)/i.test(company)) out.push(plan("smartrecruiters", raw, { company }));
  }
  if (parseOracle(raw)) out.push(plan("oracle", raw));
  if (/(^|\.)amazon\.jobs$/.test(h)) out.push(plan("amazon", raw));
  if (parseSearchDataUrl(raw)) out.push(plan("searchapi", raw));
  // Careers sites whose job list comes from a jobs.api.<same domain> search API (e.g. Mercedes-Benz).
  if (/^jobs\.mercedes-benz\.com$/.test(h)) {
    const lang = segs[0] && /^[a-z]{2}$/i.test(segs[0]) ? segs[0] : "en";
    out.push(plan("searchapi", defaultSearchApiUrl("https://jobs.api.mercedes-benz.com", lang)));
  }
  return out;
}

/** ATS boards referenced from a page (links, iframes, scripts), most-referenced first. */
function atsPlansFromHtml(html: string): Plan[] {
  const norm = html.replace(/\\u002[fF]/g, "/").replace(/\\\//g, "/").replace(/&amp;/g, "&");
  const counts = new Map<string, { plan: Plan; n: number }>();
  const add = (p: Plan) => {
    const key = `${p.state.s}|${p.state.token ?? p.state.company ?? p.state.org ?? p.url}`;
    const cur = counts.get(key);
    counts.set(key, { plan: cur?.plan ?? p, n: (cur?.n ?? 0) + 1 });
  };
  const scan = (re: RegExp, fn: (m: RegExpMatchArray) => Plan | null) => {
    for (const m of norm.matchAll(re)) {
      const p = fn(m);
      if (p) add(p);
    }
  };
  scan(/https?:\/\/[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com\/[^\s"'<>?#]*/gi, (m) => (parseWorkday(m[0]) ? plan("workday", m[0]) : null));
  scan(/https?:\/\/wd\d+\.myworkdaysite\.com\/[^\s"'<>?#]*/gi, (m) => (parseWorkday(m[0]) ? plan("workday", m[0]) : null));
  scan(/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?(?:[^"'\s]*&)?for=)?([A-Za-z0-9_-]+)/gi, (m) =>
    m[1] && !["embed", "js"].includes(m[1].toLowerCase()) ? plan("greenhouse", `https://boards.greenhouse.io/${m[1]}`, { token: m[1] }) : null
  );
  scan(/boards-api\.greenhouse\.io\/v1\/boards\/([A-Za-z0-9_-]+)/gi, (m) => plan("greenhouse", `https://boards.greenhouse.io/${m[1]}`, { token: m[1] }));
  scan(/(?:jobs|api)\.(eu\.)?lever\.co\/(?:v0\/postings\/)?([A-Za-z0-9_.-]+)/gi, (m) => plan("lever", `https://jobs.lever.co/${m[2]}`, { company: m[2], eu: !!m[1] }));
  scan(/(?:jobs\.ashbyhq\.com|api\.ashbyhq\.com\/posting-api\/job-board)\/([A-Za-z0-9_.%-]+)/gi, (m) => plan("ashby", `https://jobs.ashbyhq.com/${m[1]}`, { org: m[1] }));
  scan(/(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)|api\.smartrecruiters\.com\/v1\/companies\/([A-Za-z0-9_-]+)/gi, (m) => {
    const c = m[1] ?? m[2];
    return c && !/^(static|widget|oneclick|sr-|js|css)/i.test(c) ? plan("smartrecruiters", `https://jobs.smartrecruiters.com/${c}`, { company: c }) : null;
  });
  scan(/https?:\/\/[a-z0-9.-]+\.oraclecloud\.com\/hcmUI\/CandidateExperience\/[a-z-]+\/sites\/[A-Za-z0-9_-]+/gi, (m) => plan("oracle", m[0]));
  scan(/https?:\/\/[a-z0-9.-]+\.eightfold\.ai\/careers[^\s"'<>]*/gi, (m) => plan("eightfold", m[0]));
  return [...counts.values()].sort((a, b) => b.n - a.n).map((x) => x.plan);
}

const DISCOVERY_TEXT_RE =
  /\b(search|find|browse|view|see|explore|discover|show)\b[^<]{0,25}\b(jobs?|roles?|positions?|openings?|opportunities|vacancies|careers?)\b|\b(all|open|current|latest|available)\s+(jobs?|roles?|positions?|openings?|opportunities|vacancies)\b|\bjob\s*(search|board|openings|listings?)\b|\bsearch\s*(&|and)\s*apply\b|\bapply\s+now\b|\bjoin\s+(us|our\s+team)\b|\bstellenangebote\b|\boffres d'emploi\b|\bvacantes\b/i;
const DISCOVERY_HREF_RE = /search-?jobs|job-?search|search-results|\/jobs\/?(\?|$)|\/search\/?(\?|$)|\/openings|\/positions|\/vacancies|\/opportunities|\/careers?\/(search|jobs|opportunities|openings)|\/job-?board|\/results/i;
const ATS_HOST_RE = /myworkdayjobs|myworkdaysite|greenhouse\.io|lever\.co|ashbyhq|smartrecruiters|oraclecloud\.com|eightfold\.ai|icims\.com|taleo\.net|successfactors|avature\.net|jobvite|workable|recruitee|teamtailor|personio|brassring|jobs\.sap\.com/i;

/** Where to go next from a page with no jobs: "Search jobs" links, search forms, iframes. */
function discoveryCandidates(html: string, pageUrl: string): { url: string; score: number }[] {
  const out = new Map<string, number>();
  const pageBase = baseDomain(new URL(pageUrl).hostname);
  const setScore = (u: string, s: number) => out.set(u, Math.max(out.get(u) ?? 0, s));

  const consider = (raw: string | undefined, score: number, strongText: boolean) => {
    const r = resolveUrl(raw ?? "", pageUrl);
    if (!r || sameUrl(r, pageUrl)) return;
    const ru = new URL(r);
    if (BAD_EXT_RE.test(ru.pathname) || BAD_HOST_RE.test(ru.hostname + ".")) return;
    const host = ru.hostname;
    if (ATS_HOST_RE.test(host)) score += 6;
    else if (baseDomain(host) !== pageBase && !strongText) return;
    if (/careers?|jobs?|talent|recruit/i.test(host)) score += 1;
    if (DISCOVERY_HREF_RE.test(r)) score += 3;
    if (isLikelyJobUrl(r)) score -= 4; // a single posting isn't a listing
    if (score <= 1) return;
    if (/icims\.com/i.test(host)) {
      // iCIMS only serves the job list server-side inside its iframe view.
      const iu = new URL(r);
      iu.pathname = "/jobs/search";
      iu.searchParams.set("ss", "1");
      iu.searchParams.set("in_iframe", "1");
      setScore(iu.toString(), score + 2);
    }
    setScore(r, score);
  };

  const norm = html.replace(/&amp;/g, "&");
  let n = 0;
  for (const m of norm.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (n++ > 4000) break;
    const attrs = m[1];
    const href = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!href) continue;
    const hrefStr = href[1] ?? href[2] ?? href[3];
    const label = `${stripTags(m[2])} ${attrs.match(/aria-label\s*=\s*["']([^"']+)/i)?.[1] ?? ""} ${attrs.match(/\btitle\s*=\s*["']([^"']+)/i)?.[1] ?? ""}`;
    const strong = DISCOVERY_TEXT_RE.test(label);
    const jobby = /job|career|search|opening|position|vacanc|opportunit|talent|recruit/i.test(hrefStr);
    consider(hrefStr, (strong ? 5 : 0) + (jobby ? 1 : 0), strong);
  }
  for (const m of norm.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) consider(m[1], 4, true);
  for (const m of norm.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attrs = m[1];
    if (/method\s*=\s*["']?post/i.test(attrs)) continue;
    const action = attrs.match(/\baction\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
    if (!/job|search|career|opening|position/i.test(action + m[2].slice(0, 2000))) continue;
    const r = resolveUrl(action || pageUrl, pageUrl);
    if (!r) continue;
    const fu = new URL(r);
    for (const h of m[2].matchAll(/<input\b[^>]*type\s*=\s*["']hidden["'][^>]*>/gi)) {
      const name = h[0].match(/\bname\s*=\s*["']([^"']+)/i)?.[1];
      const value = h[0].match(/\bvalue\s*=\s*["']([^"']*)/i)?.[1] ?? "";
      if (name && !/token|csrf|nonce/i.test(name)) fu.searchParams.set(name, value);
    }
    consider(fu.toString(), 5, true);
  }
  return [...out.entries()].map(([url, score]) => ({ url, score })).sort((a, b) => b.score - a.score).slice(0, 6);
}

/** Everything worth trying for one fetched page, best first. */
function analyzePage(page: Page): { plans: Plan[]; follow: { url: string; score: number }[] } {
  const url = page.url;
  const text = page.text;
  const plans: Plan[] = [];
  const follow: { url: string; score: number }[] = [];

  const json = parseJson(text);
  if (json !== undefined) {
    if (parseDrupalJsonApiJobs(text)) plans.push(plan("drupal", url));
    if (parseFlatJobsJson(text)) plans.push(plan("flatjson", url));
    if (Array.isArray(json?.positions) || Array.isArray(json?.data?.positions)) plans.push(plan("eightfold", url));
    plans.push(plan("json", url));
    return { plans, follow };
  }

  if (isPhenomSite(text)) {
    const ddo = extractPhenomDdo(text);
    if (ddo?.eagerLoadRefineSearch?.data?.jobs?.length) plans.push(plan("phenom", url));
    else {
      const u = new URL(url);
      const found = text.match(/href=["']([^"']*search-results[^"']*)["']/i)?.[1];
      const segs = u.pathname.split("/").filter(Boolean).slice(0, 2).join("/");
      for (const c of [found, segs ? `/${segs}/search-results` : null, "/global/en/search-results", "/us/en/search-results", "/search-results"]) {
        const r = c ? resolveUrl(c, url) : null;
        if (r) follow.push({ url: r, score: 9 });
      }
    }
  }
  if (/eightfold|\/api\/apply\/v2\/|smartApplyData|\/api\/pcsx\//i.test(text)) plans.push(plan("eightfold", url));
  {
    // Page talks to a jobs.api.<domain> search API (Mercedes-Benz-style recruiting platform).
    const api = text.replace(/\\\//g, "/").match(/https:\/\/jobs\.api\.[a-z0-9.-]+\.[a-z]{2,}/i);
    if (api) {
      const lang = new URL(url).pathname.split("/").filter(Boolean)[0];
      plans.push(plan("searchapi", defaultSearchApiUrl(api[0], lang && /^[a-z]{2}$/i.test(lang) ? lang : "en")));
    }
  }
  plans.push(...atsPlansFromHtml(text));
  if (/talentbrew|tbcdn\.|radancy|data-total-job-results|search-jobs\/results/i.test(text)) {
    const u = new URL(url);
    plans.push(plan("talentbrew", /search-jobs/.test(u.pathname) ? url : `${u.origin}/search-jobs`));
  }
  if (embeddedJobsFromHtml(text, url).jobs.length >= 3) plans.push(plan("embedded", url));
  const links = extractJobLinks(text, url);
  if (links.length >= 3) plans.push(plan("links", url));

  follow.push(...discoveryCandidates(text, url));
  if (links.length < 3 && follow.length < 2) {
    const origin = new URL(url).origin;
    for (const p of ["/search-jobs", "/jobs", "/search", "/job-search", "/careers/search", "/jobs/search", "/en/jobs"]) follow.push({ url: origin + p, score: 1 });
  }
  return { plans, follow };
}

// =========================================================================
// Runner + resolver
// =========================================================================

async function runPlan(ctx: Ctx, p: Plan, from: number): Promise<BatchResult> {
  const st = p.state;
  switch (st.s) {
    case "phenom": return fetchPhenom(ctx, p.url, from);
    case "eightfold": return fetchEightfold(ctx, p.url, from, st);
    case "workday": return fetchWorkday(ctx, p.url, from);
    case "greenhouse": return fetchGreenhouse(ctx, st.token, from);
    case "lever": return fetchLever(ctx, st.company, !!st.eu, from);
    case "ashby": return fetchAshby(ctx, st.org, from);
    case "smartrecruiters": return fetchSmartRecruiters(ctx, st.company, from);
    case "oracle": return fetchOracle(ctx, p.url, from, st);
    case "amazon": return fetchAmazon(ctx, p.url, from);
    case "talentbrew": return fetchTalentBrew(ctx, p.url, from);
    case "drupal": return fetchDrupalJsonApi(ctx, p.url, from);
    case "flatjson": return fetchFlatJobsJson(ctx, p.url, from);
    case "json": return fetchJsonListing(ctx, p.url, from, st);
    case "embedded":
    case "links": return fetchHtmlListing(ctx, p.url, from, st);
    case "sitemap": return fetchSitemap(ctx, p.url, from);
    case "searchapi": return fetchSearchDataApi(ctx, p.url, from);
    default: throw new Error(`unknown strategy "${st.s}"`);
  }
}

function shortUrl(u: string): string {
  try {
    const x = new URL(u);
    const s = x.hostname + x.pathname;
    return s.length > 60 ? s.slice(0, 57) + "…" : s;
  } catch {
    return u.slice(0, 60);
  }
}

type Resolved = BatchResult & { plan: Plan };

async function resolveAndRun(ctx: Ctx, inputUrl: string): Promise<Resolved> {
  const tried = new Set<string>();
  const notes: string[] = [];
  const visited = new Set<string>();
  const origins: string[] = [];
  const queue: { url: string; depth: number; score: number }[] = [{ url: inputUrl, depth: 0, score: 100 }];
  let pages = 0;

  const attempt = async (p: Plan): Promise<Resolved | null> => {
    const key = `${p.state.s}|${p.state.token ?? p.state.company ?? p.state.org ?? p.url}`;
    if (tried.has(key) || timeLeft(ctx) < 25_000) return null;
    tried.add(key);
    try {
      const r = await runPlan(ctx, p, 0);
      r.jobs = cleanJobs(r.jobs);
      if (r.jobs.length > 0) return { ...r, plan: { ...p, state: r.state ?? p.state } };
      notes.push(`${p.label}: 0 jobs`);
    } catch (e) {
      notes.push(`${p.label} (${shortUrl(p.url)}): ${(e as Error).message}`);
    }
    return null;
  };

  while (queue.length && pages < DISCOVERY_MAX_PAGES && timeLeft(ctx) > 25_000) {
    queue.sort((a, b) => a.depth - b.depth || b.score - a.score);
    const item = queue.shift()!;
    if (visited.has(item.url)) continue;
    visited.add(item.url);

    for (const p of plansFromUrl(item.url)) {
      const r = await attempt(p);
      if (r) return r;
    }

    pages++;
    const page = await get(item.url, { ctx, accept: "text/html,application/json;q=0.9,*/*;q=0.8" });
    if (!page.ok) {
      if (item.depth === 0) notes.push(`${shortUrl(item.url)}: ${describeFailure(page)}`);
      continue;
    }
    visited.add(page.url);
    const origin = new URL(page.url).origin;
    if (!origins.includes(origin)) origins.push(origin);

    if (!sameUrl(page.url, item.url)) {
      for (const p of plansFromUrl(page.url)) {
        const r = await attempt(p);
        if (r) return r;
      }
    }

    const { plans, follow } = analyzePage(page);
    for (const p of plans) {
      const r = await attempt(p);
      if (r) return r;
    }
    if (item.depth < DISCOVERY_MAX_DEPTH) {
      for (const f of follow) if (!visited.has(f.url)) queue.push({ url: f.url, depth: item.depth + 1, score: f.score });
    }
  }

  for (const origin of origins.slice(0, 2)) {
    const r = await attempt(plan("sitemap", origin === new URL(inputUrl).origin ? inputUrl : origin + "/"));
    if (r) return r;
  }

  const detail = uniq(notes).slice(0, 8).join(" · ");
  throw new Error(
    `Couldn't find jobs from this URL (checked ${pages} page${pages === 1 ? "" : "s"}). ${detail ? `Tried: ${detail}. ` : ""}` +
      `If the site loads jobs with JavaScript, open its job search page in Chrome → DevTools → Network → Fetch/XHR, reload, click the request whose Preview shows the job list, and paste that Request URL here instead.`
  );
}

// =========================================================================
// HTTP handler
// =========================================================================

// The auto-pipeline function (server-side sync, run by pg_cron) calls this
// function with the secret from app_secrets (migration 20261031090000).
let pipelineSecretCache: { value: string | null; at: number } | null = null;
async function isPipelineSecret(supabaseUrl: string, serviceRoleKey: string, given: string): Promise<boolean> {
  if (!pipelineSecretCache || Date.now() - pipelineSecretCache.at > 5 * 60_000) {
    const service = createClient(supabaseUrl, serviceRoleKey);
    const { data } = await service.from("app_secrets").select("value").eq("name", "cron_secret").maybeSingle();
    pipelineSecretCache = { value: (data as { value?: string } | null)?.value ?? null, at: Date.now() };
  }
  return Boolean(pipelineSecretCache.value) && given === pipelineSecretCache.value;
}

serve(async (req) => {
  const CORS_HEADERS = corsHeadersFor(req);
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    // --- Auth: admin only (or the auto-pipeline function, with the shared secret) ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const pipelineSecret = req.headers.get("x-madevisa-cron");
    if (!(pipelineSecret && (await isPipelineSecret(supabaseUrl, serviceRoleKey, pipelineSecret)))) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return reply({ ok: false, error: "Missing Authorization header." }, 401);
    const callerClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) return reply({ ok: false, error: "Not authenticated." }, 401);
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profileError || profile?.role !== "admin") return reply({ ok: false, error: "Admin access required." }, 403);
    // Same rule as the database (is_admin): once the admin has an
    // authenticator app, this session must have passed the 6-digit code.
    const asCaller = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: adminOk, error: adminErr } = await asCaller.rpc("is_admin");
    if (adminErr || adminOk !== true) return reply({ ok: false, error: "Admin access requires your two-step login code. Sign out and sign in again." }, 403);
    }

    // --- Input ---
    const body = await req.json();
    const url: unknown = body?.url;
    if (!url || typeof url !== "string") return reply({ ok: false, error: "Missing url." }, 400);
    const startFrom = typeof body.from === "number" && Number.isFinite(body.from) && body.from >= 0 ? Math.floor(body.from) : 0;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      return reply({ ok: false, error: "Invalid URL." }, 400);
    }
    if (!/^https?:$/.test(parsedUrl.protocol) || isBlockedHost(parsedUrl.hostname)) return reply({ ok: false, error: "This host is not allowed." }, 400);

    const ctx: Ctx = { deadline: Date.now() + REQUEST_BUDGET_MS };

    // Single job page: re-read one posting (used by the admin
    // "Detect job details" tool for jobs whose description came in thin).
    if (body.mode === "detail") {
      const page = await get(parsedUrl.toString(), { ctx, timeoutMs: 15_000 });
      if (!page.ok) return reply({ ok: false, error: describeFailure(page) });
      if (isNonJobDestination(page.url)) return reply({ ok: false, error: "That link leads to a map or consent page, not a job." });
      const job = jobFromDetailHtml(page.text, page.url);
      if (!job || !isUsableJob(job)) return reply({ ok: false, error: "Couldn't find a job on that page." });
      return reply({ ok: true, job });
    }

    // Continuation batch: the frontend sends back the strategy the first batch chose.
    let state: State | null = null;
    if (typeof body.strategy === "string" && body.strategy) {
      try {
        const parsed = JSON.parse(body.strategy);
        if (isObj(parsed) && typeof parsed.s === "string" && LABELS[parsed.s]) state = parsed as State;
      } catch {
        /* ignore — re-detect */
      }
    }

    if (state) {
      const p: Plan = { url: parsedUrl.toString(), state, label: LABELS[state.s] };
      const r = await runPlan(ctx, p, startFrom);
      return reply({
        ok: true, jobs: cleanJobs(r.jobs), nextFrom: r.nextFrom, totalHits: r.totalHits,
        resolvedUrl: p.url, strategy: JSON.stringify(r.state ?? state), source: p.label,
      });
    }

    // First batch: detect (and crawl if needed).
    const r = await resolveAndRun(ctx, parsedUrl.toString());
    return reply({
      ok: true, jobs: cleanJobs(r.jobs), nextFrom: r.nextFrom, totalHits: r.totalHits,
      resolvedUrl: r.plan.url, strategy: JSON.stringify(r.plan.state), source: r.plan.label,
    });
  } catch (err) {
    return reply({ ok: false, error: err instanceof Error ? err.message : "Unknown error." });
  }
});
