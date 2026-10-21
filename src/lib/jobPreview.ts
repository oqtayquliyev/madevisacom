// What the jobs list already knows about a job (title, company, place), kept for a moment
// so the job page can show it at once while the full ad loads.
import type { Job } from '@/data/jobs';
import { jobPath } from '@/lib/jobUrl';

const byPath = new Map<string, Job>();

export function rememberJobPreview(job: Job): void {
  byPath.set(jobPath(job), job);
  if (byPath.size > 200) byPath.delete(byPath.keys().next().value as string);
}

/** The list's copy of the job at this address (/jobs/…), if it was just picked there. */
export function peekJobPreview(pathname: string): Job | null {
  return byPath.get(pathname.replace(/\/+$/, '')) ?? null;
}
