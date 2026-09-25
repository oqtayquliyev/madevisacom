import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  Briefcase,
  Check,
  ChevronDown,
  Clock,
  Eye,
  FileCheck2,
  Loader2,
  Lock,
  MessageSquare,
  Paperclip,
  ShieldCheck,
  Star,
  Trophy,
  X,
} from 'lucide-react';
import {
  APPLICATION_STATUSES,
  FEEDBACK_TAGS,
  FINAL_STATUSES,
  companyPath,
  evidenceSignedUrl,
  fetchMyApplicationReports,
  removeApplicationEvidence,
  syncPendingApplications,
  updateApplicationReport,
  uploadApplicationEvidence,
  type ApplicationReport,
  type ApplicationStatus,
} from '@/lib/companies';

const DAY = 86_400_000;

function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Human line describing where the company is at. */
function responseLine(r: ApplicationReport): { text: string; tone: 'wait' | 'good' | 'bad' | 'neutral' } {
  const d = daysSince(r.applied_at);
  if (r.status === 'offer') return { text: 'Offer received', tone: 'good' };
  if (r.status === 'rejected')
    return { text: r.responded_at ? `Rejected after ${Math.max(1, Math.round((+new Date(r.responded_at) - +new Date(r.applied_at)) / DAY))} days` : 'Rejected', tone: 'bad' };
  if (r.status === 'interview') return { text: 'In interviews', tone: 'good' };
  if (r.status === 'no_response') return { text: `No response after ${d} days`, tone: 'bad' };
  if (r.status === 'withdrawn') return { text: 'You withdrew', tone: 'neutral' };
  if (r.status === 'viewed' || r.status === 'responded') return { text: 'Company viewed your application', tone: 'good' };
  return { text: d >= 30 ? `No reply yet — ${d} days` : `Awaiting response · ${d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'}`}`, tone: 'wait' };
}

export function ApplicantReport({ viewedCount = 0 }: { viewedCount?: number }) {
  const [rows, setRows] = useState<ApplicationReport[] | null>(null);
  const [filter, setFilter] = useState<'active' | 'closed' | 'all'>('all');

  useEffect(() => {
    // Apply clicks made before signing in are added first.
    syncPendingApplications().finally(() => fetchMyApplicationReports().then(setRows));
  }, []);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const applied = list.filter((r) => r.status !== 'withdrawn');
    const responded = applied.filter((r) => r.responded_at || ['viewed', 'interview', 'offer', 'rejected'].includes(r.status));
    return {
      applied: applied.length,
      responded: responded.length,
      interviews: applied.filter((r) => r.interview_at || r.status === 'interview' || r.status === 'offer').length,
      offers: applied.filter((r) => r.status === 'offer').length,
    };
  }, [rows]);

  const shown = (rows ?? []).filter((r) =>
    filter === 'all' ? true : filter === 'closed' ? [...FINAL_STATUSES, 'withdrawn'].includes(r.status) : ![...FINAL_STATUSES, 'withdrawn'].includes(r.status)
  );

  const patchLocal = (id: string, patch: Partial<ApplicationReport>) => setRows((prev) => prev?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? prev);
  const reload = () => fetchMyApplicationReports().then(setRows);

  return (
    <div className="space-y-5">
      {/* INFOGRAPHIC */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi icon={Eye} label="Jobs viewed" value={viewedCount} />
        <Kpi icon={Briefcase} label="Applied" value={stats.applied} />
        <Kpi icon={MessageSquare} label="Responses" value={stats.responded} sub={stats.applied ? `${Math.round((100 * stats.responded) / stats.applied)}%` : undefined} />
        <Kpi icon={Clock} label="Interviews" value={stats.interviews} />
        <Kpi icon={Trophy} label="Offers" value={stats.offers} highlight={stats.offers > 0} />
      </div>

      <section className="rounded-lg border border-ink-200 bg-white">
        <header className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3 sm:px-5">
          <h2 className="text-base font-bold text-ink-950">Applicant report</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-semibold text-ink-500">
            <Lock className="h-3 w-3" /> Private to you
          </span>
          <div className="ml-auto flex gap-1">
            {(['all', 'active', 'closed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${filter === f ? 'bg-brand-600 text-white' : 'text-ink-500 hover:bg-ink-50'}`}
              >
                {f === 'all' ? 'All' : f === 'active' ? 'In progress' : 'Closed'}
              </button>
            ))}
          </div>
        </header>

        {rows === null ? (
          <div className="flex items-center gap-2 px-5 py-6 text-sm text-ink-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your applications…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Briefcase className="mx-auto h-8 w-8 text-ink-200" />
            <p className="mt-2 text-sm font-semibold text-ink-800">No applications tracked yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-ink-500">
              When you click <strong>Apply</strong> on a MadeVisa job or program, it shows up here so you can track what happens next.
            </p>
          </div>
        ) : shown.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-400">Nothing here.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {shown.map((r) => (
              <ReportRow key={r.id} r={r} onPatch={(p) => patchLocal(r.id, p)} onReload={reload} />
            ))}
          </ul>
        )}

        <footer className="border-t border-ink-100 px-4 py-3 text-[11px] leading-5 text-ink-400 sm:px-5">
          Only applications you started through MadeVisa can be tracked. Company pages show anonymous totals only — never your name, and only once
          enough different applicants have reported.
        </footer>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Kpi({ icon: Icon, label, value, sub, highlight = false }: { icon: typeof Eye; label: string; value: number; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border bg-white p-3.5 ${highlight ? 'border-emerald-200' : 'border-ink-200'}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-500">
        <Icon className={`h-3.5 w-3.5 ${highlight ? 'text-emerald-600' : 'text-brand-600'}`} /> {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1.5 font-slab text-2xl font-bold tabular-nums text-ink-950">
        {value.toLocaleString()}
        {sub && <span className="font-sans text-xs font-semibold text-ink-400">{sub}</span>}
      </p>
    </div>
  );
}

function ReportRow({ r, onPatch, onReload }: { r: ApplicationReport; onPatch: (p: Partial<ApplicationReport>) => void; onReload: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const line = responseLine(r);
  const final = FINAL_STATUSES.includes(r.status);
  const days = daysSince(r.applied_at);

  const setStatus = async (status: ApplicationStatus) => {
    const now = new Date().toISOString();
    onPatch({
      status,
      viewed_at: r.viewed_at ?? (['viewed', 'interview', 'offer', 'rejected'].includes(status) ? now : null),
      interview_at: r.interview_at ?? (['interview', 'offer'].includes(status) ? now : null),
      ...(FINAL_STATUSES.includes(status) ? {} : { experience_rating: null, feedback_tags: null }),
    });
    const res = await updateApplicationReport(r.id, { status });
    if (!res.ok) setMsg(res.error ?? 'Could not update.');
    if (FINAL_STATUSES.includes(status)) setOpen(true);
  };

  const toggleTag = async (tag: string) => {
    const next = r.feedback_tags?.includes(tag) ? r.feedback_tags.filter((t) => t !== tag) : [...(r.feedback_tags ?? []), tag];
    onPatch({ feedback_tags: next.length ? next : null });
    const res = await updateApplicationReport(r.id, { feedback_tags: next.length ? next : null });
    if (!res.ok) setMsg(res.error ?? 'Could not save.');
  };

  const setRating = async (n: number | null) => {
    onPatch({ experience_rating: n });
    const res = await updateApplicationReport(r.id, { experience_rating: n });
    if (!res.ok) setMsg(res.error ?? 'Could not save.');
  };

  return (
    <li className="px-4 py-4 sm:px-5">
      {/* Top line */}
      <div className="flex items-start gap-3">
        {r.publisher?.logo_url ? (
          <img src={r.publisher.logo_url} alt="" className="h-10 w-10 shrink-0 rounded border border-ink-100 object-contain p-0.5" />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-ink-50">
            <Briefcase className="h-4 w-4 text-ink-300" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink-950">{r.listing_title ?? 'Application'}</p>
          <p className="text-xs text-ink-500">
            {r.publisher ? (
              <a href={companyPath(r.publisher)} className="font-medium hover:text-brand-700">
                {r.publisher.name}
              </a>
            ) : null}
            {' · '}Applied {fmtDate(r.applied_at)} <span className="text-ink-400">({days === 0 ? 'today' : `${days}d ago`})</span>
          </p>
        </div>
        <label className="relative shrink-0">
          <span className="sr-only">Update status</span>
          <select
            value={r.status}
            onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
            className={`h-8 appearance-none rounded-md border py-0 pl-2.5 pr-7 text-xs font-semibold outline-none ${
              r.status === 'offer'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : r.status === 'rejected' || r.status === 'no_response'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : r.status === 'applied'
                ? 'border-ink-200 bg-white text-ink-700'
                : 'border-brand-200 bg-brand-50 text-brand-800'
            }`}
          >
            {APPLICATION_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
            {r.status === 'responded' && <option value="responded">Responded</option>}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
        </label>
      </div>

      {/* Path */}
      <Path r={r} />

      {/* Response status + labels */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className={`font-semibold ${
            line.tone === 'good' ? 'text-emerald-700' : line.tone === 'bad' ? 'text-rose-600' : line.tone === 'wait' ? 'text-amber-700' : 'text-ink-500'
          }`}
        >
          {line.text}
        </span>
        <span className="text-ink-300">·</span>
        {r.evidence_status === 'verified' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
            <BadgeCheck className="h-3 w-3" /> Verified
          </span>
        ) : (
          <span className="rounded-full bg-ink-50 px-2 py-0.5 font-semibold text-ink-500">Applicant reported</span>
        )}
        {r.excluded && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">Not counted in company statistics</span>}
        <button onClick={() => setOpen((v) => !v)} className="ml-auto font-semibold text-brand-700 hover:text-brand-800">
          {open ? 'Hide details' : final ? 'Feedback & proof' : 'Add proof'}
        </button>
      </div>

      {msg && <p className="mt-1 text-[11px] text-rose-600">{msg}</p>}

      {open && (
        <div className="mt-3 grid gap-3 rounded-md bg-ink-50/70 p-3 sm:grid-cols-2">
          {/* Feedback */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Your feedback</p>
            {final ? (
              <>
                <div className="mt-1.5 flex items-center gap-0.5" title="How was the application process?">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setRating(r.experience_rating === n ? null : n)} aria-label={`${n} stars`}>
                      <Star className={`h-5 w-5 ${(r.experience_rating ?? 0) >= n ? 'fill-amber-400 text-amber-400' : 'text-ink-200 hover:text-amber-300'}`} />
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {FEEDBACK_TAGS.map((t) => {
                    const on = r.feedback_tags?.includes(t.value);
                    return (
                      <button
                        key={t.value}
                        onClick={() => toggleTag(t.value)}
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          on
                            ? t.tone === 'good'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              : 'border-rose-200 bg-rose-50 text-rose-700'
                            : 'border-ink-200 bg-white text-ink-500 hover:border-ink-300'
                        }`}
                      >
                        {on && <Check className="mr-0.5 inline h-3 w-3" />}
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[10px] text-ink-400">Structured answers only — counted anonymously in company statistics.</p>
              </>
            ) : (
              <p className="mt-1.5 text-xs text-ink-500">Feedback opens once the process ends (offer, rejection or no response).</p>
            )}
          </div>

          {/* Evidence */}
          <div>
            <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-ink-500">
              <ShieldCheck className="h-3.5 w-3.5" /> Private proof
            </p>
            <p className="mt-1 text-[11px] leading-4 text-ink-500">
              Optional: add the company's reply or rejection email (screenshot or PDF). Only you and MadeVisa reviewers can see it; verified reports make
              company statistics more reliable.
            </p>
            {r.evidence_path ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                    r.evidence_status === 'verified'
                      ? 'bg-emerald-50 text-emerald-700'
                      : r.evidence_status === 'rejected'
                      ? 'bg-rose-50 text-rose-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  <FileCheck2 className="h-3 w-3" />
                  {r.evidence_status === 'verified' ? 'Verified' : r.evidence_status === 'rejected' ? "Couldn't be verified" : 'Waiting for review'}
                </span>
                <button
                  onClick={async () => {
                    const url = await evidenceSignedUrl(r.evidence_path!);
                    if (url) window.open(url, '_blank', 'noopener');
                  }}
                  className="font-semibold text-brand-700 hover:text-brand-800"
                >
                  View
                </button>
                <button
                  onClick={async () => {
                    setBusy(true);
                    await removeApplicationEvidence(r);
                    setBusy(false);
                    onReload();
                  }}
                  className="inline-flex items-center gap-0.5 font-semibold text-ink-400 hover:text-rose-600"
                >
                  <X className="h-3 w-3" /> Remove
                </button>
              </div>
            ) : (
              <button
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                Attach email screenshot / PDF
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setBusy(true);
                setMsg(null);
                const res = await uploadApplicationEvidence(r, file);
                setBusy(false);
                if (!res.ok) setMsg(res.error ?? 'Upload failed.');
                onReload();
              }}
            />
          </div>
        </div>
      )}
    </li>
  );
}

/** Viewed job ✓ → Applied ✓ → Company viewed → Interview → Outcome */
function Path({ r }: { r: ApplicationReport }) {
  const outcome =
    r.status === 'offer'
      ? { label: 'Offer', state: 'good' as const }
      : r.status === 'rejected'
      ? { label: 'Rejected', state: 'bad' as const }
      : r.status === 'no_response'
      ? { label: 'No response', state: 'bad' as const }
      : r.status === 'withdrawn'
      ? { label: 'Withdrawn', state: 'muted' as const }
      : { label: 'Outcome', state: 'todo' as const };
  const viewed = Boolean(r.viewed_at) || ['viewed', 'responded', 'interview', 'offer', 'rejected'].includes(r.status);
  const interviewed = Boolean(r.interview_at) || r.status === 'interview' || r.status === 'offer';

  const steps: { label: string; state: 'done' | 'todo' | 'good' | 'bad' | 'muted' | 'skip' }[] = [
    { label: 'Viewed job', state: 'done' },
    { label: 'Applied', state: 'done' },
    { label: 'Company viewed', state: viewed ? 'done' : r.status === 'no_response' ? 'skip' : 'todo' },
    { label: 'Interview', state: interviewed ? 'done' : outcome.state === 'todo' ? 'todo' : 'skip' },
    { label: outcome.label, state: outcome.state },
  ];

  return (
    <ol className="mt-3 flex items-center overflow-x-auto pb-1 [scrollbar-width:none]">
      {steps.map((s, i) => {
        const dot =
          s.state === 'done' || s.state === 'good'
            ? 'bg-emerald-500 text-white'
            : s.state === 'bad'
            ? 'bg-rose-500 text-white'
            : s.state === 'muted'
            ? 'bg-ink-300 text-white'
            : 'border border-ink-200 bg-white text-ink-300';
        return (
          <li key={s.label} className="flex shrink-0 items-center">
            <span className="flex items-center gap-1.5">
              <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${dot}`}>
                {s.state === 'done' || s.state === 'good' ? <Check className="h-3 w-3" /> : s.state === 'bad' ? <X className="h-3 w-3" /> : i + 1}
              </span>
              <span className={`text-[11px] font-semibold ${s.state === 'todo' || s.state === 'skip' ? 'text-ink-400' : s.state === 'bad' ? 'text-rose-700' : 'text-ink-800'}`}>
                {s.label}
              </span>
            </span>
            {i < steps.length - 1 && <span className={`mx-2 h-px w-5 sm:w-8 ${steps[i + 1].state === 'todo' || steps[i + 1].state === 'skip' ? 'bg-ink-200' : 'bg-emerald-400'}`} />}
          </li>
        );
      })}
    </ol>
  );
}
