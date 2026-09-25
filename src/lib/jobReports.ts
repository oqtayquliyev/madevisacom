// "Report this job": visitors flag a problem with a job; admins review the
// reports in Admin → Requests. The database function submit_job_report
// (migration 20261011090000) is the only way in and does the spam checks:
// hidden honeypot field, time on page, proof of work, rate limits per
// network and per job, 300 characters max.

import { supabase } from '@/lib/supabase';
import { solveProofOfWork, type PowSolution } from '@/lib/listingRequests';

export type ReportReason = 'offensive' | 'fake' | 'inaccurate' | 'closed' | 'advertisement' | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'offensive', label: 'It is offensive or discriminatory' },
  { value: 'fake', label: 'It seems like a fake job or a scam' },
  { value: 'inaccurate', label: 'Some details are wrong (salary, location, visa…)' },
  { value: 'closed', label: 'The job is already closed' },
  { value: 'advertisement', label: 'It is an advertisement, not a job' },
  { value: 'other', label: 'Other' },
];

export const REPORT_DETAILS_MAX = 300;

export { solveProofOfWork };
export type { PowSolution };

export async function submitJobReport(input: {
  jobId: string;
  reason: ReportReason;
  details: string;
  website: string;
  startedAt: number;
  pow: PowSolution;
}): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('submit_job_report', {
    p_job_id: input.jobId,
    p_reason: input.reason,
    p_details: input.details.slice(0, REPORT_DETAILS_MAX),
    p_website: input.website,
    p_started_at: input.startedAt,
    p_pow_ts: input.pow.ts,
    p_pow_nonce: input.pow.nonce,
  });
  if (error) {
    const missing = /submit_job_report|schema cache/i.test(error.message);
    return { ok: false, error: missing ? 'Reporting isn’t available yet. Please email hello@madevisa.com.' : error.message };
  }
  const d = data as { ok?: boolean; duplicate?: boolean } | null;
  return { ok: Boolean(d?.ok), duplicate: Boolean(d?.duplicate) };
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type JobReport = {
  id: string;
  job_id: string | null;
  job_title: string | null;
  company_name: string | null;
  reason: ReportReason;
  details: string | null;
  status: 'new' | 'resolved' | 'dismissed';
  created_at: string;
  handled_at: string | null;
};

export const REPORTS_PAGE = 20;

export async function fetchJobReports(opts: { status: 'new' | 'handled' | 'all'; before?: string }): Promise<{ rows: JobReport[]; error?: string }> {
  let q = supabase
    .from('job_reports')
    .select('id, job_id, job_title, company_name, reason, details, status, created_at, handled_at')
    .order('created_at', { ascending: false })
    .limit(REPORTS_PAGE);
  if (opts.status === 'new') q = q.eq('status', 'new');
  else if (opts.status === 'handled') q = q.neq('status', 'new');
  if (opts.before) q = q.lt('created_at', opts.before);
  const { data, error } = await q;
  if (error) return { rows: [], error: /job_reports|schema cache/i.test(error.message) ? 'Run the 20261011090000 SQL file to turn on job reports.' : error.message };
  return { rows: (data ?? []) as JobReport[] };
}

export async function countNewJobReports(): Promise<number> {
  const { count } = await supabase.from('job_reports').select('id', { count: 'exact', head: true }).eq('status', 'new');
  return count ?? 0;
}

export async function setJobReportStatus(id: string, status: JobReport['status']): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('job_reports')
    .update({ status, handled_at: status === 'new' ? null : new Date().toISOString() })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
