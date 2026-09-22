// supabase/functions/import-ats-jobs/index.ts
//
// Proxies job imports for ATS platforms that don't allow direct
// cross-origin browser fetches (unlike Greenhouse, which the frontend
// calls directly — see src/lib/atsImport.ts).
//
// Currently supports: Phenom People career sites (e.g. careers.roche.com),
// detected by the presence of an embedded `phApp.ddo = {...}` JSON blob in
// the page HTML. Add more ATS strategies below as you need them — follow
// the same pattern (fetch, extract, normalize into the shared job shape).
//
// Deploy with: supabase functions deploy import-ats-jobs

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Every browser origin is allowed here. This looks looser than the old
// allowlist, but it isn't actually weaker: CORS only ever restricts
// browsers, never direct server-to-server calls (see the comment above),
// so an allowlist was never the real access control — the admin-only
// auth check further down is. What the old allowlist *did* do is break
// legitimate calls the moment the site was viewed from any origin that
// wasn't exactly "https://madevisa.com" (a Vercel preview URL, a staging
// domain, "www." vs bare domain, http during local dev, etc.) — the
// preflight OPTIONS request would come back with a mismatched
// Access-Control-Allow-Origin, the browser would block it client-side,
// and supabase-js reports that as "Failed to send a request to the Edge
// Function" (a network-level failure, before this function's own code
// — including its real auth check — ever runs). Echoing back whatever
// Origin the browser sent removes that whole failure mode.
function corsHeadersFor(req: Request) {
  const origin = req.headers.get("Origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

// Hosts/IP ranges a career-page importer should never legitimately need
// to reach. Blocks the most common SSRF targets (cloud metadata
// endpoints, loopback, link-local, and RFC1918 private ranges) before
// any fetch is attempted. Not an exhaustive network-level control —
// defense in depth alongside the auth check, not a replacement for it.
function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "metadata.google.internal") return true;

  const ipMatch = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipMatch) {
    const [a, b] = ipMatch.slice(1).map(Number);
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local / cloud metadata (169.254.169.254)
    if (a === 10) return true; // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 0) return true;
  }
  return false;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Cap how many jobs we pull per request so this stays well within the
// edge function's execution time limit. For a full import of a large
// site (Roche has 1000+ listings), run the standalone Node import script
// instead of this live admin-panel path.
const MAX_JOBS_PER_REQUEST = 100;
const PAGE_DELAY_MS = 300;

type NormalizedJob = {
  externalId: string;
  title: string;
  locationText: string;
  offices: string[];
  descriptionHtml: string;
  url: string;
  /** Best-effort — extracted with several candidate field names since exact
   * per-platform JSON keys aren't publicly documented. Null/undefined means
   * "genuinely not found", which the frontend renders as "Not specified"
   * rather than guessing. */
  category: string | null;
  employmentTypeRaw: string | null;
  postedAt: string | null; // ISO date string, or null
  remote: boolean | null;
  salaryText: string | null;
};

/** Reads the first present, non-empty value across several candidate object keys — used throughout this file since exact field names vary by site/platform and aren't documented anywhere we can check ahead of time. */
function firstOf(obj: any, keys: string[]): any {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract the `phApp.ddo = {...}` JSON blob from raw HTML using
 * brace-counting (handles nested braces/quoted strings correctly).
 */
function extractPhenomDdo(html: string): any | null {
  const marker = "phApp.ddo = {";
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) return null;

  const jsonStart = startIdx + marker.length - 1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        const jsonStr = html.slice(jsonStart, i + 1);
        try {
          return JSON.parse(jsonStr);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Search results only ever carry a short teaser (job.descriptionTeaser) —
 * that's what was landing in MadeVisa's description field, which is why
 * imported jobs looked like a flattened wall of field labels ("Job Title",
 * "Company Introduction", ...) instead of a real formatted posting, and
 * why location showed as generic "Various" instead of the job's actual
 * city. The real, fully-formatted description and location live on each
 * job's own page — the functions below fetch that page per job and pull
 * the clean data out of it.
 *
 * Primary source: the `JobPosting` schema.org JSON-LD block. This isn't
 * Phenom-specific — it's a standard nearly every serious careers site
 * (Phenom, Workday, SuccessFactors, custom builds) embeds specifically so
 * Google/LinkedIn/etc. can index the posting correctly, which makes it a
 * far more reliable source than trying to keep up with each platform's
 * own internal JSON shape. Falls back to Phenom's own detail-page ddo
 * blob (same shape/idea as the search-page one above) when a site has no
 * JSON-LD.
 */
function extractJsonLdJobPosting(html: string): any | null {
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(html))) {
    let parsed: any;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      continue; // malformed block on this page — try the next <script> tag
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const c of candidates) {
      if (!c) continue;
      const type = c["@type"];
      if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return c;
      if (Array.isArray(c["@graph"])) {
        const found = c["@graph"].find(
          (g: any) => g?.["@type"] === "JobPosting" || (Array.isArray(g?.["@type"]) && g["@type"].includes("JobPosting"))
        );
        if (found) return found;
      }
    }
  }
  return null;
}

function officesFromJsonLdLocations(jobLocation: any): string[] {
  const items = Array.isArray(jobLocation) ? jobLocation : jobLocation ? [jobLocation] : [];
  const offices: string[] = [];
  for (const loc of items) {
    const addr = loc?.address;
    if (!addr) continue;
    const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean);
    if (parts.length) offices.push(parts.join(", "));
  }
  return offices;
}

/** schema.org JobPosting's baseSalary is a nested MonetaryAmount — this flattens whichever shape a site actually used into one human-readable line, or null if the block genuinely isn't there. */
function salaryTextFromJsonLd(baseSalary: any): string | null {
  if (!baseSalary) return null;
  const currency = baseSalary.currency ?? "";
  const v = baseSalary.value;
  if (!v) return null;
  const unit = v.unitText ? `/${String(v.unitText).toLowerCase()}` : "";
  if (v.minValue != null && v.maxValue != null && v.minValue !== v.maxValue) {
    return `${currency} ${v.minValue}–${v.maxValue}${unit}`.trim();
  }
  const single = v.value ?? v.minValue ?? v.maxValue;
  return single != null ? `${currency} ${single}${unit}`.trim() : null;
}

type DetailEnrichment = {
  descriptionHtml?: string;
  offices?: string[];
  category?: string | null;
  employmentTypeRaw?: string | null;
  postedAt?: string | null;
  remote?: boolean | null;
  salaryText?: string | null;
};

/** Fallback for the (rarer) case where a Phenom detail page has no JSON-LD — reuse the same ddo blob shape as the search page. This is the PRIMARY source for the description itself when present, though: it's the same data Phenom uses to render the visible description box, so it carries the real formatting (paragraphs, bold, lists) — JSON-LD descriptions on some sites turn out to be plain-text-flattened despite the spec allowing HTML there. */
function jobDetailFromPhenomDdo(ddo: any): DetailEnrichment | null {
  const job = ddo?.jobDetail?.data?.job;
  if (!job) return null;
  const offices: string[] = job.multi_location || (job.location ? [job.location] : []);
  const descriptionHtml = firstOf(job, ["description", "jobDescription", "descriptionTeaser"]);
  if (!descriptionHtml) return null;
  return {
    descriptionHtml,
    offices,
    category: firstOf(job, ["category", "primaryCategory", "jobCategory"]) ?? null,
    employmentTypeRaw: firstOf(job, ["jobType", "type", "employmentType", "jobShiftType"]) ?? null,
    postedAt: firstOf(job, ["postedDate", "postingDate", "date", "createdDate"]) ?? null,
    remote: typeof job.isRemote === "boolean" ? job.isRemote : null,
    salaryText: firstOf(job, ["salary", "salaryText", "compensation"]) ?? null,
  };
}

async function fetchJobDetailPage(detailUrl: string, signal: AbortSignal): Promise<DetailEnrichment | null> {
  const res = await fetch(detailUrl, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, signal });
  if (!res.ok) return null;
  const html = await res.text();

  const ddo = extractPhenomDdo(html);
  const fromDdo = ddo ? jobDetailFromPhenomDdo(ddo) : null;

  const jsonLd = extractJsonLdJobPosting(html);
  const jsonLdMeta: DetailEnrichment = jsonLd
    ? {
        category: firstOf(jsonLd, ["occupationalCategory", "industry"]) ?? null,
        employmentTypeRaw: jsonLd.employmentType
          ? Array.isArray(jsonLd.employmentType)
            ? jsonLd.employmentType.join(", ")
            : String(jsonLd.employmentType)
          : null,
        postedAt: jsonLd.datePosted ?? null,
        remote: jsonLd.jobLocationType === "TELECOMMUTE" ? true : null,
        salaryText: salaryTextFromJsonLd(jsonLd.baseSalary),
      }
    : {};

  // ddo's description wins when present (real HTML formatting); JSON-LD
  // fills in whichever structured metadata ddo didn't have, and is the
  // description fallback if ddo had none at all.
  const descriptionHtml = fromDdo?.descriptionHtml ?? (jsonLd?.description ? String(jsonLd.description) : undefined);
  if (!descriptionHtml) return null;

  return {
    descriptionHtml,
    offices: fromDdo?.offices?.length ? fromDdo.offices : officesFromJsonLdLocations(jsonLd?.jobLocation),
    category: fromDdo?.category ?? jsonLdMeta.category ?? null,
    employmentTypeRaw: fromDdo?.employmentTypeRaw ?? jsonLdMeta.employmentTypeRaw ?? null,
    postedAt: fromDdo?.postedAt ?? jsonLdMeta.postedAt ?? null,
    remote: fromDdo?.remote ?? jsonLdMeta.remote ?? null,
    salaryText: fromDdo?.salaryText ?? jsonLdMeta.salaryText ?? null,
  };
}

// A handful of workers fetch job detail pages concurrently, each bailing
// out once the shared deadline passes — so a slow/huge site degrades
// gracefully (later jobs just keep their search-page teaser) instead of
// making the whole request time out or fail. Individual page fetches also
// get their own short timeout so one hung page can't stall a worker.
const DETAIL_FETCH_CONCURRENCY = 6;
const DETAIL_FETCH_TIME_BUDGET_MS = 25_000;
const DETAIL_FETCH_TIMEOUT_MS = 8_000;

async function enrichWithJobDetailPages(jobs: NormalizedJob[]): Promise<void> {
  const deadline = Date.now() + DETAIL_FETCH_TIME_BUDGET_MS;
  let cursor = 0;

  async function worker() {
    while (cursor < jobs.length && Date.now() < deadline) {
      const job = jobs[cursor++];
      if (!job.url) continue;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DETAIL_FETCH_TIMEOUT_MS);
      try {
        const detail = await fetchJobDetailPage(job.url, controller.signal);
        if (detail?.descriptionHtml) {
          job.descriptionHtml = detail.descriptionHtml;
          if (detail.offices?.length) {
            job.offices = detail.offices;
            job.locationText = detail.offices[0];
          }
          // Detail-page values win over the listing-stub guesses below
          // when present; otherwise keep whatever the stub already had.
          if (detail.category) job.category = detail.category;
          if (detail.employmentTypeRaw) job.employmentTypeRaw = detail.employmentTypeRaw;
          if (detail.postedAt) job.postedAt = detail.postedAt;
          if (detail.remote !== null && detail.remote !== undefined) job.remote = detail.remote;
          if (detail.salaryText) job.salaryText = detail.salaryText;
        }
      } catch {
        // Timed out or errored — keep the teaser/stub data already on
        // this job rather than losing it from the batch entirely.
      } finally {
        clearTimeout(timer);
      }
    }
  }

  await Promise.all(Array.from({ length: DETAIL_FETCH_CONCURRENCY }, worker));
}

async function fetchPhenomJobs(baseUrl: string, startFrom: number): Promise<{ jobs: NormalizedJob[]; nextFrom: number | null; totalHits: number | null }> {
  const jobs: NormalizedJob[] = [];
  const seenIds = new Set<string>();
  let offset = startFrom;
  let totalHits: number | null = null;
  let exhausted = false;

  while (jobs.length < MAX_JOBS_PER_REQUEST) {
    const url = new URL(baseUrl);
    url.searchParams.set("from", String(offset));

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });
    if (!res.ok) throw new Error(`Careers page returned ${res.status}`);
    const html = await res.text();

    const ddo = extractPhenomDdo(html);
    if (!ddo) {
      // Only a hard error on the very first page of the very first
      // batch — if this is a later page (or a later batch, i.e.
      // startFrom > 0), it more likely just means we've run past the
      // end of the results than that the site isn't Phenom at all.
      if (jobs.length === 0 && startFrom === 0) {
        throw new Error("Could not find embedded job data on this page — site may not be Phenom-based, or its structure changed.");
      }
      exhausted = true;
      break;
    }

    const searchBlock = ddo.eagerLoadRefineSearch;
    const searchData = searchBlock?.data;
    if (!searchData) {
      if (jobs.length === 0 && startFrom === 0) {
        throw new Error("Page structure didn't match the expected Phenom shape (eagerLoadRefineSearch missing).");
      }
      exhausted = true;
      break;
    }

    if (totalHits === null) totalHits = searchBlock.totalHits;

    const pageJobs = searchData.jobs || [];
    if (pageJobs.length === 0) {
      exhausted = true;
      break;
    }

    let newCount = 0;
    let consumedThisPage = 0;
    let hitCap = false;
    for (const job of pageJobs) {
      consumedThisPage++;
      const id = job.jobId || job.reqId;
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);

      const locations: string[] = job.multi_location || (job.location ? [job.location] : []);
      const rawType: string | null = firstOf(job, ["jobType", "type", "employmentType", "jobShiftType"]) ?? null;
      jobs.push({
        externalId: String(id),
        title: job.title ?? "",
        locationText: job.location || job.cityStateCountry || locations[0] || "",
        offices: locations,
        descriptionHtml: job.descriptionTeaser ? `<p>${job.descriptionTeaser}</p>` : "",
        url: job.applyUrl || "",
        category: firstOf(job, ["category", "primaryCategory", "jobCategory"]) ?? null,
        employmentTypeRaw: rawType,
        postedAt: firstOf(job, ["postedDate", "postingDate", "date", "createdDate"]) ?? null,
        remote:
          typeof job.isRemote === "boolean"
            ? job.isRemote
            : /remote|home[\s-]?based/i.test(job.location ?? "")
            ? true
            : null,
        salaryText: firstOf(job, ["salary", "salaryText", "compensation"]) ?? null,
      });
      newCount++;
      if (jobs.length >= MAX_JOBS_PER_REQUEST) {
        hitCap = true;
        break;
      }
    }

    if (hitCap) {
      // Stopped partway through this page — advance the offset by only
      // what we actually consumed from it (not the whole page size), so
      // the *next* batch picks up exactly where this one left off
      // instead of skipping the rest of this page.
      offset += consumedThisPage;
      break;
    }

    offset += searchBlock.hits || pageJobs.length || 10;
    if (totalHits && offset >= totalHits) {
      exhausted = true;
      break;
    }
    if (newCount === 0) {
      // Every job on this page was one we'd already seen — the site
      // isn't actually advancing with `from`, so stop rather than loop
      // forever re-fetching the same page.
      exhausted = true;
      break;
    }

    await sleep(PAGE_DELAY_MS);
  }

  // Now go fetch each job's own page for the real description/location —
  // the search-page teaser we've got so far is just a placeholder until
  // this fills in (or, for whichever jobs run past the time budget,
  // stays as the fallback).
  await enrichWithJobDetailPages(jobs);

  return { jobs, nextFrom: exhausted ? null : offset, totalHits };
}

function isPhenomSite(html: string): boolean {
  return html.includes("phApp.ddo") || html.includes("phApp =");
}

// ---------------------------------------------------------------------------
// Generic strategy: for any career site that isn't Phenom or Greenhouse.
//
// Rather than writing a new per-platform parser for every ATS (Workday,
// SuccessFactors, Drupal-based custom sites like Pfizer's, etc.), this
// leans on something nearly all of them already do for SEO: embed each
// job's detail page with schema.org JobPosting structured data
// (https://schema.org/JobPosting) inside a <script type="application/
// ld+json"> block, specifically so Google/LinkedIn/Indeed can index the
// posting. extractJsonLdJobPosting() above already parses this — it was
// built for Phenom detail-page enrichment, but the schema itself has
// nothing to do with Phenom; it's a public standard, which is exactly
// what makes this approach general rather than site-specific.
//
// So the only genuinely new piece needed is: given an arbitrary listing
// page, find the links to each job's detail page. That's done with a
// broad-but-bounded regex over real anchor hrefs (works on any
// server-rendered HTML, no JS execution needed) rather than assuming
// any particular URL shape belongs to one company.
// ---------------------------------------------------------------------------

// Matches an href whose path contains a "job-like" segment followed by
// an identifier — e.g. /about/careers/job/4964372, /jobs/12345,
// /career/opening/abc-123. Broad enough to catch common corporate-site
// conventions without also matching ordinary nav links (which won't
// have a job/opening/position/vacancy segment followed by an id).
const JOB_LINK_RE = /href="([^"#?]*\/(?:job|jobs|opening|openings|position|positions|vacancy|vacancies)\/[A-Za-z0-9][A-Za-z0-9_-]*)[^"]*"/gi;

function extractJobLinksFromHtml(html: string, baseUrl: string): string[] {
  const seen = new Set<string>();
  const links: string[] = [];
  let match: RegExpExecArray | null;
  JOB_LINK_RE.lastIndex = 0;
  while ((match = JOB_LINK_RE.exec(html))) {
    try {
      const resolved = new URL(match[1], baseUrl).toString();
      if (!seen.has(resolved)) {
        seen.add(resolved);
        links.push(resolved);
      }
    } catch {
      // Malformed href — skip it rather than fail the whole batch.
    }
  }
  return links;
}

/** Builds a full job record from a detail page's own JSON-LD block —
 *  this is the PRIMARY source here (unlike the Phenom flow, where
 *  JSON-LD is only used to fill gaps around the ddo blob), so unlike
 *  jobDetailFromPhenomDdo/fetchJobDetailPage above, this also needs the
 *  title and an external id, which schema.org's JobPosting provides via
 *  `title` and `identifier`. */
function normalizedJobFromJsonLd(jsonLd: any, detailUrl: string): NormalizedJob | null {
  const title = jsonLd.title ? String(jsonLd.title) : null;
  if (!title) return null; // no usable title — not worth importing a blank row

  const identifierRaw = jsonLd.identifier;
  const identifierValue =
    typeof identifierRaw === "object" && identifierRaw ? identifierRaw.value : identifierRaw;
  const idFromUrl = detailUrl.match(/([A-Za-z0-9][A-Za-z0-9_-]{2,})\/?(?:\?.*)?$/)?.[1];
  const externalId = String(identifierValue ?? idFromUrl ?? detailUrl);

  const offices = officesFromJsonLdLocations(jsonLd.jobLocation);

  return {
    externalId,
    title,
    locationText: offices[0] ?? "",
    offices,
    descriptionHtml: jsonLd.description ? String(jsonLd.description) : "",
    url: detailUrl,
    category: firstOf(jsonLd, ["occupationalCategory", "industry"]) ?? null,
    employmentTypeRaw: jsonLd.employmentType
      ? Array.isArray(jsonLd.employmentType)
        ? jsonLd.employmentType.join(", ")
        : String(jsonLd.employmentType)
      : null,
    postedAt: jsonLd.datePosted ?? null,
    remote: jsonLd.jobLocationType === "TELECOMMUTE" ? true : null,
    salaryText: salaryTextFromJsonLd(jsonLd.baseSalary),
  };
}

/** Best-effort fallback for sites with no JSON-LD JobPosting block at
 *  all (not every career site bothers with it, despite it being
 *  Google's recommendation). Pulls just the <title> tag — present on
 *  virtually every page — strips a common " | Company Name" / " - 
 *  Company Name" suffix, and uses that as the job title with an empty
 *  description. This gets the job into the pending queue with a real
 *  title and link rather than being silently skipped; an admin can
 *  fill in the rest during review, same as any other pending listing. */
function fallbackJobFromTitleTag(html: string, detailUrl: string): NormalizedJob | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!match) return null;
  let title = match[1].trim();
  if (!title) return null;

  // Strip a trailing " | Site Name" or " - Site Name" if present —
  // common convention, and safe to strip only the LAST such segment
  // so a title that legitimately contains " - " elsewhere is untouched.
  const lastPipe = title.lastIndexOf(" | ");
  const lastDash = title.lastIndexOf(" - ");
  const cut = Math.max(lastPipe, lastDash);
  if (cut > 0) title = title.slice(0, cut).trim();

  const idFromUrl = detailUrl.match(/([A-Za-z0-9][A-Za-z0-9_-]{2,})\/?(?:\?.*)?$/)?.[1];

  return {
    externalId: String(idFromUrl ?? detailUrl),
    title,
    locationText: "",
    offices: [],
    descriptionHtml: "",
    url: detailUrl,
    category: null,
    employmentTypeRaw: null,
    postedAt: null,
    remote: null,
    salaryText: null,
  };
}

/** startFrom here is a PAGE INDEX (0-based), not an item offset — each
 *  strategy is free to give the opaque from/nextFrom cursor its own
 *  meaning, since the frontend just echoes it back unexamined. Tries
 *  the listing URL's own pagination first (many sites, including
 *  Pfizer's, already carry query params like `count=`); once past page
 *  0, appends a generic `page=` param, since that's the most common
 *  convention (Drupal Views among them) — if a given site uses
 *  something else, this simply stops advancing (no new links found)
 *  rather than looping incorrectly. */
async function fetchGenericJobsViaLinks(
  baseUrl: string,
  startFrom: number
): Promise<{ jobs: NormalizedJob[]; nextFrom: number | null; totalHits: number | null }> {
  const pageUrl = new URL(baseUrl);
  if (startFrom > 0) pageUrl.searchParams.set("page", String(startFrom));

  const listingRes = await fetch(pageUrl.toString(), { headers: { "User-Agent": USER_AGENT, Accept: "text/html" } });
  if (!listingRes.ok) throw new Error(`Careers page returned ${listingRes.status}`);
  const listingHtml = await listingRes.text();

  const links = extractJobLinksFromHtml(listingHtml, pageUrl.toString()).slice(0, MAX_JOBS_PER_REQUEST);
  if (links.length === 0) {
    if (startFrom === 0) {
      throw new Error(
        "Couldn't find any job links on this page, and it doesn't match a known ATS platform (Phenom, Greenhouse). This site may need a dedicated strategy added to this function."
      );
    }
    return { jobs: [], nextFrom: null, totalHits: null }; // ran past the last page — done
  }

  const jobs: NormalizedJob[] = [];
  const deadline = Date.now() + DETAIL_FETCH_TIME_BUDGET_MS;
  let cursor = 0;

  async function worker() {
    while (cursor < links.length && Date.now() < deadline) {
      const link = links[cursor++];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DETAIL_FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(link, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, signal: controller.signal });
        if (!res.ok) continue;
        const html = await res.text();
        const jsonLd = extractJsonLdJobPosting(html);
        const job = jsonLd ? normalizedJobFromJsonLd(jsonLd, link) : fallbackJobFromTitleTag(html, link);
        if (job) jobs.push(job);
      } catch {
        // timed out or errored on this one link — move on, keep the rest of the batch
      } finally {
        clearTimeout(timer);
      }
    }
  }

  await Promise.all(Array.from({ length: DETAIL_FETCH_CONCURRENCY }, worker));

  return { jobs, nextFrom: startFrom + 1, totalHits: null };
}

serve(async (req) => {
  const CORS_HEADERS = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // --- Auth check: admin-only, mirroring the pattern already used
    // correctly in supabase/functions/delete-account/index.ts ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: "Missing Authorization header." }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ ok: false, error: "Not authenticated." }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || profile?.role !== "admin") {
      return new Response(JSON.stringify({ ok: false, error: "Admin access required." }), {
        status: 403,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    // --- End auth check ---

    const { url, from } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ ok: false, error: "Missing url." }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    const startFrom = typeof from === "number" && Number.isFinite(from) && from >= 0 ? Math.floor(from) : 0;

    // --- SSRF guard: reject internal/metadata/private-range hosts
    // before making any outbound request. ---
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Invalid URL." }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (parsedUrl.protocol !== "https:" || isBlockedHost(parsedUrl.hostname)) {
      return new Response(JSON.stringify({ ok: false, error: "This host is not allowed." }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    // --- End SSRF guard ---

    // Quick peek to decide the strategy.
    const probeRes = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!probeRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: `Could not reach that URL (HTTP ${probeRes.status}).` }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    const html = await probeRes.text();

    if (!isPhenomSite(html)) {
      // Not Phenom — try the generic link-scan + JSON-LD strategy before
      // giving up. This is what makes sites like Pfizer's (Drupal-based,
      // not Phenom or Greenhouse) work without a bespoke parser.
      try {
        const { jobs, nextFrom, totalHits } = await fetchGenericJobsViaLinks(url, startFrom);
        return new Response(JSON.stringify({ ok: true, jobs, nextFrom, totalHits }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      } catch (genericErr) {
        return new Response(
          JSON.stringify({
            ok: false,
            error:
              genericErr instanceof Error
                ? genericErr.message
                : "This doesn't look like a supported career site.",
          }),
          { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
    }

    const { jobs, nextFrom, totalHits } = await fetchPhenomJobs(url, startFrom);
    return new Response(JSON.stringify({ ok: true, jobs, nextFrom, totalHits }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Unknown error." }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
