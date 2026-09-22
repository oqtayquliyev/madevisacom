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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // tighten to your actual domain in production
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
};

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

async function fetchPhenomJobs(baseUrl: string): Promise<NormalizedJob[]> {
  const jobs: NormalizedJob[] = [];
  const seenIds = new Set<string>();
  let from = 0;
  let totalHits: number | null = null;

  while (jobs.length < MAX_JOBS_PER_REQUEST) {
    const url = new URL(baseUrl);
    url.searchParams.set("from", String(from));

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });
    if (!res.ok) throw new Error(`Careers page returned ${res.status}`);
    const html = await res.text();

    const ddo = extractPhenomDdo(html);
    if (!ddo) {
      if (jobs.length === 0) throw new Error("Could not find embedded job data on this page — site may not be Phenom-based, or its structure changed.");
      break;
    }

    const searchBlock = ddo.eagerLoadRefineSearch;
    const searchData = searchBlock?.data;
    if (!searchData) {
      if (jobs.length === 0) throw new Error("Page structure didn't match the expected Phenom shape (eagerLoadRefineSearch missing).");
      break;
    }

    if (totalHits === null) totalHits = searchBlock.totalHits;

    const pageJobs = searchData.jobs || [];
    if (pageJobs.length === 0) break;

    let newCount = 0;
    for (const job of pageJobs) {
      const id = job.jobId || job.reqId;
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
      });
      newCount++;
      if (jobs.length >= MAX_JOBS_PER_REQUEST) break;
    }

    from += searchBlock.hits || 10;
    if (totalHits && from >= totalHits) break;
    if (newCount === 0) break;

    await sleep(PAGE_DELAY_MS);
  }

  return jobs;
}

function isPhenomSite(html: string): boolean {
  return html.includes("phApp.ddo") || html.includes("phApp =");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ ok: false, error: "Missing url." }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

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
      return new Response(
        JSON.stringify({
          ok: false,
          error: "This doesn't look like a Phenom-powered career site. If it's Greenhouse, use the board token directly instead. Other ATS platforms need a new strategy added to this function.",
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const jobs = await fetchPhenomJobs(url);
    return new Response(JSON.stringify({ ok: true, jobs }), {
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
