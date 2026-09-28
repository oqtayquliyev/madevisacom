// Daily job counts for the /jobs filters (from /api/facets). Same numbers
// for every visitor, available instantly — no need to download the whole
// job list just to count it. Kept in memory and on the device for 6 hours.

import { useEffect, useState } from 'react';

export type JobFacets = {
  total: number;
  countries: { name: string; iso: string | null; n: number }[];
  categories: Record<string, number>;
  groups: Record<string, number>;
  computed_at: string;
};

const KEY = 'madevisa.jobFacets.v1';
const TTL = 6 * 60 * 60 * 1000;
let memory: JobFacets | null = null;
let pending: Promise<JobFacets | null> | null = null;

function readSaved(): JobFacets | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw) as { at: number; data: JobFacets };
    return Date.now() - at < TTL ? data : null;
  } catch {
    return null;
  }
}

export function fetchJobFacets(): Promise<JobFacets | null> {
  if (memory) return Promise.resolve(memory);
  const saved = readSaved();
  if (saved) {
    memory = saved;
    return Promise.resolve(saved);
  }
  pending ??= fetch('/api/facets')
    .then((r) => (r.ok ? (r.json() as Promise<JobFacets>) : null))
    .then((data) => {
      if (data && Array.isArray(data.countries)) {
        memory = data;
        try {
          localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), data }));
        } catch {
          /* optional */
        }
        return data;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function useJobFacets(): JobFacets | null {
  const [facets, setFacets] = useState<JobFacets | null>(() => memory ?? readSaved());
  useEffect(() => {
    let alive = true;
    fetchJobFacets().then((f) => alive && f && setFacets(f));
    return () => {
      alive = false;
    };
  }, []);
  return facets;
}
