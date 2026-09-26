// Live hiring metrics per destination, computed in the browser from the
// same published-jobs feed the Jobs board uses (already cached there, so
// opening Destinations after Jobs costs no extra request).
//
// "Visa-sponsored" = the listing says it offers sponsorship
// (visa_sponsorship, or visa_status = 'offered' where that column exists).

import { useEffect, useState } from 'react';
import { companyNameFromUrl, fetchPublishedSponsoredJobs, isClosedJob, type SponsoredJob } from '@/lib/sponsoredJobs';
import { weeklyCounts } from '@/components/charts/SoftCharts';

export type CompanyInCountry = {
  id: string;
  name: string;
  logoUrl: string | null;
  total: number;
  sponsored: number;
  /** 0–100 */
  rate: number;
  /** New listings per week, last 8 weeks. */
  weekly: number[];
  lastPosted: string | null;
};

export type CountryStats = {
  code: string;
  /** Country name as stored in the database (what the Jobs board filters on). */
  name: string;
  total: number;
  sponsored: number;
  /** Share of open jobs offering visa sponsorship, 0–100. Null with no jobs. */
  rate: number | null;
  posted30: number;
  sponsored30: number;
  remote: number;
  /** Posting dates, for charts at any range. */
  datesAll: string[];
  datesSponsored: string[];
  companies: CompanyInCountry[];
  functions: { label: string; n: number }[];
  cities: { label: string; n: number }[];
};

export const offersSponsorship = (j: SponsoredJob) => j.visa_sponsorship || j.visa_status === 'offered';
const postedAt = (j: SponsoredJob) => j.source_posted_at ?? j.approved_at ?? j.created_at;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function buildCountryStats(jobs: SponsoredJob[]): Map<string, CountryStats> {
  const since30 = Date.now() - 30 * 86_400_000;
  const byCountry = new Map<string, SponsoredJob[]>();
  for (const j of jobs) {
    if (isClosedJob(j)) continue;
    const code = j.country?.iso_code?.toUpperCase();
    if (!code) continue;
    const list = byCountry.get(code);
    if (list) list.push(j);
    else byCountry.set(code, [j]);
  }

  const out = new Map<string, CountryStats>();
  for (const [code, list] of byCountry) {
    const sponsoredJobs = list.filter(offersSponsorship);
    const recent = list.filter((j) => new Date(postedAt(j)).getTime() >= since30);

    const companies = new Map<string, { name: string; logo: string | null; jobs: SponsoredJob[] }>();
    const functions = new Map<string, number>();
    const cities = new Map<string, number>();
    for (const j of list) {
      const id = j.publisher?.id ?? j.publisher_id;
      const c = companies.get(id) ?? { name: j.publisher?.name ?? companyNameFromUrl(j.official_url ?? j.application_url) ?? 'Company', logo: j.publisher?.logo_url ?? null, jobs: [] };
      c.jobs.push(j);
      companies.set(id, c);
      if (j.job_function) functions.set(j.job_function, (functions.get(j.job_function) ?? 0) + 1);
      const city = j.remote ? 'Remote' : j.city?.trim();
      if (city) cities.set(city, (cities.get(city) ?? 0) + 1);
    }

    out.set(code, {
      code,
      name: list[0].country?.name ?? code,
      total: list.length,
      sponsored: sponsoredJobs.length,
      rate: list.length ? pct(sponsoredJobs.length, list.length) : null,
      posted30: recent.length,
      sponsored30: recent.filter(offersSponsorship).length,
      remote: list.filter((j) => j.remote).length,
      datesAll: list.map(postedAt),
      datesSponsored: sponsoredJobs.map(postedAt),
      companies: [...companies.entries()]
        .map(([id, c]) => {
          const sponsored = c.jobs.filter(offersSponsorship).length;
          const dates = c.jobs.map(postedAt).sort();
          return {
            id,
            name: c.name,
            logoUrl: c.logo,
            total: c.jobs.length,
            sponsored,
            rate: pct(sponsored, c.jobs.length),
            weekly: weeklyCounts(dates, 8),
            lastPosted: dates[dates.length - 1] ?? null,
          };
        })
        .sort((a, b) => b.sponsored - a.sponsored || b.total - a.total),
      functions: [...functions.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n),
      cities: [...cities.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n),
    });
  }
  return out;
}

/** Stats for every country with open jobs. `null` while the first page loads. */
export function useDestinationStats() {
  const [stats, setStats] = useState<Map<string, CountryStats> | null>(null);
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchPublishedSponsoredJobs({ onPartial: (rows) => alive && setStats(buildCountryStats(rows)) })
      .then((rows) => {
        if (!alive) return;
        setStats(buildCountryStats(rows));
        setComplete(true);
      })
      .catch(() => {
        if (!alive) return;
        setStats((s) => s ?? new Map());
        setComplete(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  return { stats, complete };
}
