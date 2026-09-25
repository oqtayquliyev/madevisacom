import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  Briefcase,
  Check,
  ChevronDown,
  Globe,
  Loader2,
  Lock,
  Trash2,
} from "lucide-react";
import {
  NEVER_HEARD_BACK_DAYS,
  NO_RESPONSE_WEEK_DAYS,
  applicationListingPath,
  companyPath,
  confirmApplication,
  deleteApplicationReport,
  fetchClosedJobOutcomes,
  fetchCompanyResponseRates,
  fetchMyApplicationReports,
  fetchMyListingStatuses,
  hasResponse,
  setApplicationPublic,
  syncPendingApplications,
  updateApplicationReport,
  type ApplicationReport,
  type ApplicationStatus,
  type ClosedJobOutcomes,
  type CompanyResponseRate,
  type ListingStatus,
} from "@/lib/companies";
import {
  AreaTrend,
  Bars,
  Gauge,
  InsightCard,
  InsightGrid,
  InsightPanel,
  Meter,
  Tag,
  type BarRow,
} from "@/components/charts/InsightCharts";

const DAY = 86_400_000;
const TIMELINE_DAYS = NEVER_HEARD_BACK_DAYS;

const daysBetween = (from: string, to: string | number = Date.now()) =>
  Math.max(
    0,
    Math.floor((new Date(to).getTime() - new Date(from).getTime()) / DAY),
  );
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const fmtShort = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What the person can record. Older statuses map onto these. */
type Choice =
  | "applied"
  | "responded"
  | "interview"
  | "rejected"
  | "no_response_week"
  | "no_response"
  | "withdrawn";

function choiceOf(r: ApplicationReport): Choice {
  switch (r.status) {
    case "withdrawn":
    case "no_response_week":
    case "no_response":
    case "interview":
    case "rejected":
    case "responded":
      return r.status;
    case "offer":
      return "interview";
    default:
      return hasResponse(r) ? "responded" : "applied";
  }
}

const isResponse = (c: Choice) =>
  c === "responded" || c === "interview" || c === "rejected";
const checkInsDone = (r: ApplicationReport) =>
  (choiceOf(r) !== "applied" ? 1 : 0) +
  (r.match_answer ? 1 : 0) +
  (r.accuracy_answer ? 1 : 0);

type Filter = "all" | "waiting" | "responded";

export type ReporterInfo = {
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  nationalitySet: boolean;
  accountCreatedAt: string | null;
};

/** Same weights as reporter_weight() in the database (20261014090000). */
function reporterWeight(me: ReporterInfo) {
  const oldEnough = me.accountCreatedAt
    ? Date.now() - new Date(me.accountCreatedAt).getTime() > 14 * DAY
    : false;
  return (
    0.5 +
    (me.emailVerified ? 0.2 : 0) +
    (me.nationalitySet ? 0.15 : 0) +
    (oldEnough ? 0.15 : 0)
  );
}

export function ApplicantReport({
  viewedCount = 0,
  hasPublicProfile = false,
  me,
  focusListingId,
  onEditProfile,
}: {
  viewedCount?: number;
  hasPublicProfile?: boolean;
  me: ReporterInfo;
  /** From /profile?track=<listing id>: scroll to it and open its check-in. */
  focusListingId?: string | null;
  onEditProfile?: () => void;
}) {
  const [rows, setRows] = useState<ApplicationReport[] | null>(null);
  const [listing, setListing] = useState<Map<string, ListingStatus>>(new Map());
  const [rates, setRates] = useState<Map<string, CompanyResponseRate>>(
    new Map(),
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmDelete, setConfirmDelete] = useState<ApplicationReport | null>(
    null,
  );

  useEffect(() => {
    // Apply clicks made before signing in are added first.
    syncPendingApplications().finally(() => {
      fetchMyApplicationReports().then((list) => {
        setRows(list);
        fetchCompanyResponseRates(list.map((r) => r.publisher_id)).then(
          setRates,
        );
      });
      fetchMyListingStatuses().then(setListing);
    });
  }, []);

  const pending = useMemo(
    () => (rows ?? []).filter((r) => r.status === "clicked"),
    [rows],
  );
  const tracked = useMemo(
    () => (rows ?? []).filter((r) => r.status !== "clicked"),
    [rows],
  );

  const shown = tracked.filter((r) =>
    filter === "all"
      ? true
      : filter === "responded"
        ? isResponse(choiceOf(r))
        : !isResponse(choiceOf(r)),
  );

  const patchLocal = (id: string, patch: Partial<ApplicationReport>) =>
    setRows(
      (prev) =>
        prev?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? prev,
    );
  const removeLocal = (id: string) =>
    setRows((prev) => prev?.filter((x) => x.id !== id) ?? prev);

  return (
    <div className="space-y-6">
      <Overview
        rows={tracked}
        viewed={viewedCount}
        me={me}
        onEditProfile={onEditProfile}
      />

      {pending.length > 0 && (
        <section
          aria-labelledby="confirm-heading"
          className="rounded-xl bg-[#2563EB]/20 p-4 sm:p-5"
        >
          <h2 id="confirm-heading" className="text-base font-bold text-ink-950">
            Did you apply?{" "}
            <span className="font-semibold text-[#2563EB]">
              {pending.length} to confirm
            </span>
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-ink-600">
            You clicked Apply on these. Confirm the ones you sent to start
            tracking.
          </p>
          <ul className="mt-3 space-y-2">
            {pending.map((r) => (
              <ConfirmRow
                key={r.id}
                r={r}
                focused={r.listing_id === focusListingId}
                onConfirmed={() =>
                  patchLocal(r.id, {
                    status: "applied",
                    confirmed_at: new Date().toISOString(),
                    excluded: false,
                    remind_at: new Date(Date.now() + 7 * DAY).toISOString(),
                  })
                }
                onDismissed={() => removeLocal(r.id)}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="report-heading">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="report-heading" className="text-lg font-bold text-ink-950">
            Your applications
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
            <Lock className="h-3 w-3" /> Private unless you share it
          </span>
          <div className="ml-auto flex rounded-lg bg-[#2563EB]/10 p-0.5">
            {(["all", "waiting", "responded"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${filter === f ? "bg-white text-ink-950 shadow-sm" : "text-ink-600 hover:text-[#2563EB]"}`}
              >
                {f === "all"
                  ? `All ${tracked.length}`
                  : f === "waiting"
                    ? "In progress"
                    : "Replied"}
              </button>
            ))}
          </div>
        </div>

        {rows === null ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#2563EB]/[0.06] px-5 py-6 text-sm text-ink-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your
            applications…
          </div>
        ) : tracked.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[#2563EB]/30 bg-[#2563EB]/[0.04] px-5 py-10 text-center">
            <Briefcase className="mx-auto h-8 w-8 text-[#2563EB]/40" />
            <p className="mt-2 text-sm font-semibold text-ink-800">
              {pending.length
                ? "Confirm an application above to start tracking"
                : "No applications tracked yet"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-ink-500">
              Apply to a job on MadeVisa, then press{" "}
              <strong>I applied — track this job</strong> at the end of the job
              page.
            </p>
          </div>
        ) : shown.length === 0 ? (
          <p className="mt-4 rounded-xl bg-[#2563EB]/[0.06] px-5 py-6 text-sm text-ink-500">
            Nothing here.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {shown.map((r) => (
              <TrackCard
                key={r.id}
                r={r}
                me={me}
                listing={listing.get(r.id)}
                rate={rates.get(r.publisher_id)}
                hasPublicProfile={hasPublicProfile}
                focused={r.listing_id === focusListingId}
                onPatch={(p) => patchLocal(r.id, p)}
                onDelete={() => setConfirmDelete(r)}
              />
            ))}
          </ul>
        )}

        <p className="mt-3 text-[11px] leading-5 text-ink-400">
          Only applications tracked through MadeVisa appear here. Company pages
          show anonymous numbers only — never your name — and only once enough
          different people have answered.
        </p>
      </section>

      {confirmDelete && (
        <ConfirmDelete
          r={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const res = await deleteApplicationReport(confirmDelete.id);
            if (res.ok) {
              removeLocal(confirmDelete.id);
              setConfirmDelete(null);
            }
            return res;
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview: the same 3-graphic style as job pages
// ---------------------------------------------------------------------------

function Overview({
  rows,
  viewed,
  me,
  onEditProfile,
}: {
  rows: ApplicationReport[];
  viewed: number;
  me: ReporterInfo;
  onEditProfile?: () => void;
}) {
  const applied = rows.filter((r) => r.status !== "withdrawn");
  const replied = applied.filter(hasResponse);
  const rate = applied.length
    ? Math.round((100 * replied.length) / applied.length)
    : null;
  const byChoice = (c: Choice) =>
    applied.filter((r) => choiceOf(r) === c).length;

  const stages: BarRow[] = [
    {
      key: "p",
      label: "In progress",
      n: byChoice("applied") + byChoice("no_response_week"),
      dot: "rgba(37,99,235,0.25)",
    },
    {
      key: "r",
      label: "Got a reply",
      n: byChoice("responded"),
      dot: "rgba(37,99,235,0.5)",
    },
    { key: "i", label: "Interview", n: byChoice("interview"), dot: "#2563EB" },
    { key: "x", label: "Rejection", n: byChoice("rejected"), dot: "#94a3b8" },
    { key: "n", label: "No reply", n: byChoice("no_response"), dot: "#cbd5e1" },
  ];

  // Contribution
  const weight = reporterWeight(me);
  const answered = rows.reduce(
    (n, r) => n + (r.match_answer || r.accuracy_answer ? 1 : 0),
    0,
  );
  const companies = new Set(applied.map((r) => r.publisher_id)).size;
  const score = Math.round(
    ((weight - 0.5) / 0.5) * 40 +
      Math.min(applied.length, 5) * 6 +
      Math.min(answered, 5) * 6,
  );
  const level =
    score >= 70
      ? "Trusted reporter"
      : score >= 30
        ? "Contributor"
        : "Getting started";

  // Applications per week, last 8 weeks
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = Date.now() - (7 - i) * 7 * DAY;
    const start = end - 7 * DAY;
    return applied.filter((r) => {
      const t = new Date(r.applied_at).getTime();
      return t > start && t <= end;
    }).length;
  });
  const hasTrend = weeks.filter((n) => n > 0).length >= 2;

  const todo = [
    !me.emailVerified && "Verify your email",
    !me.nationalitySet && "Add your nationality",
    applied.length < 5 && "Track your applications",
    answered < 5 && "Answer check-ins",
  ].filter(Boolean) as string[];

  return (
    <InsightPanel
      title="Your job search"
      right={<Tag>{level}</Tag>}
      foot="Your numbers are private. Your answers add — anonymously — to each company’s public response rate."
    >
      <InsightGrid count={3}>
        <InsightCard
          title="Your reply rate"
          tag={
            viewed ? <Tag tone="grey">{viewed} viewed · 48 h</Tag> : undefined
          }
        >
          <div className="mt-3 flex flex-col items-center gap-1 text-center">
            <Gauge value={rate ?? 18} placeholder={rate == null} />
            <p className="text-sm font-bold text-ink-900">
              {rate != null
                ? `${replied.length} of ${plural(applied.length, "application")} got a reply`
                : "Track an application to start"}
            </p>
          </div>
        </InsightCard>

        <InsightCard
          title="Where your applications are"
          foot={
            applied.length ? undefined : "Your applications show here by stage."
          }
        >
          <p className="mt-2 text-sm text-ink-600">
            <strong className="text-2xl font-bold tabular-nums text-ink-950">
              {applied.length}
            </strong>{" "}
            tracked · {companies} {companies === 1 ? "company" : "companies"}
          </p>
          <Bars
            rows={stages}
            placeholder={!applied.length}
            unit={["application", "applications"]}
          />
        </InsightCard>

        <InsightCard
          title="Your contribution"
          tag={<Tag tone="grey">Answers count {Math.round(weight * 100)}%</Tag>}
        >
          <p className="mt-2 text-sm text-ink-600">
            <strong className="text-2xl font-bold tabular-nums text-ink-950">
              {Math.min(100, score)}
            </strong>{" "}
            / 100 · {plural(answered, "check-in")} answered
          </p>
          {hasTrend ? (
            <AreaTrend
              values={weeks}
              label="Applications per week"
              noun={["application", "applications"]}
            />
          ) : (
            <div className="mt-4">
              <Meter value={Math.min(100, score)} />
            </div>
          )}
          {todo.length > 0 && (
            <p className="mt-3 text-xs leading-5 text-ink-600">
              Raise it:{" "}
              {todo.map((t, i) => (
                <span key={t}>
                  {i > 0 && " · "}
                  {(t === "Add your nationality" ||
                    t === "Verify your email") &&
                  onEditProfile ? (
                    <button
                      onClick={onEditProfile}
                      className="font-semibold text-[#2563EB] hover:underline"
                    >
                      {t}
                    </button>
                  ) : (
                    <span className="font-semibold text-ink-800">{t}</span>
                  )}
                </span>
              ))}
            </p>
          )}
        </InsightCard>
      </InsightGrid>
    </InsightPanel>
  );
}

// ---------------------------------------------------------------------------
// "Did you apply?"
// ---------------------------------------------------------------------------

function ConfirmRow({
  r,
  focused,
  onConfirmed,
  onDismissed,
}: {
  r: ApplicationReport;
  focused: boolean;
  onConfirmed: () => void;
  onDismissed: () => void;
}) {
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const company = r.publisher?.name ?? "the company";
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused)
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focused]);

  return (
    <li
      ref={ref}
      className={`flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 ring-1 ${focused ? "ring-2 ring-[#2563EB]" : "ring-[#2563EB]/15"}`}
    >
      <Logo url={r.publisher?.logo_url} size={40} />
      <div className="min-w-0 flex-1">
        <a
          href={applicationListingPath(r, company)}
          className="line-clamp-2 text-sm font-bold text-ink-950 hover:text-[#2563EB]"
        >
          {r.listing_title ?? "Application"}
        </a>
        <p className="text-xs text-ink-500">
          {company} · clicked Apply {fmtDate(r.applied_at)}
        </p>
        {msg && (
          <p className="mt-1 text-[11px] font-medium text-rose-600">{msg}</p>
        )}
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <button
          disabled={busy !== null}
          onClick={async () => {
            setBusy("yes");
            setMsg(null);
            const res = await confirmApplication(r.id);
            setBusy(null);
            if (res.ok) onConfirmed();
            else setMsg(res.error ?? "Could not confirm.");
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60 sm:flex-none"
        >
          {busy === "yes" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Yes, I applied
        </button>
        <button
          disabled={busy !== null}
          onClick={async () => {
            setBusy("no");
            const res = await deleteApplicationReport(r.id);
            setBusy(null);
            if (res.ok) onDismissed();
            else setMsg(res.error ?? "Could not remove.");
          }}
          className="flex-1 rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-xs font-semibold text-ink-600 hover:border-ink-300 hover:text-ink-900 disabled:opacity-60 sm:flex-none"
        >
          No, I didn’t
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// One tracked application
// ---------------------------------------------------------------------------

function TrackCard({
  r,
  me,
  listing,
  rate,
  hasPublicProfile,
  focused,
  onPatch,
  onDelete,
}: {
  r: ApplicationReport;
  me: ReporterInfo;
  listing?: ListingStatus;
  rate?: CompanyResponseRate;
  hasPublicProfile: boolean;
  focused: boolean;
  onPatch: (p: Partial<ApplicationReport>) => void;
  onDelete: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const choice = choiceOf(r);
  const company = r.publisher?.name ?? "the company";
  const daysIn = daysBetween(r.applied_at);
  const replyDay =
    isResponse(choice) && r.responded_at
      ? daysBetween(r.applied_at, r.responded_at)
      : null;
  const closed = Boolean(
    listing &&
    ["expired", "deleted", "rejected", "archived"].includes(listing.status),
  );
  const due = Boolean(
    r.remind_at && new Date(r.remind_at).getTime() <= Date.now(),
  );
  const done = checkInsDone(r);
  const [open, setOpen] = useState(focused || due);
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) {
      setOpen(true);
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focused]);

  const save = async (
    patch: Parameters<typeof updateApplicationReport>[1],
    local: Partial<ApplicationReport>,
    before: Partial<ApplicationReport>,
  ) => {
    onPatch(local);
    setMsg(null);
    const res = await updateApplicationReport(r.id, patch);
    if (!res.ok) {
      onPatch(before);
      setMsg(res.error ?? "Could not save.");
    }
  };

  const setChoice = (next: Choice) => {
    if (next === choice || next === "withdrawn") return;
    const status: ApplicationStatus = next;
    const final = next !== "applied";
    void save(
      {
        status,
        ...(next === "applied" && !r.remind_at
          ? { remind_at: new Date(Date.now() + 14 * DAY).toISOString() }
          : {}),
      },
      {
        status,
        responded_at: isResponse(next)
          ? (r.responded_at ?? new Date().toISOString())
          : null,
        ...(final ? { remind_at: null } : {}),
      },
      {
        status: r.status,
        responded_at: r.responded_at,
        remind_at: r.remind_at,
      },
    );
  };

  // Status pill (top right)
  const pill = closed
    ? { text: "Job closed", cls: "bg-ink-200 text-ink-700" }
    : isResponse(choice)
      ? {
          text: `${choice === "interview" ? "Interview" : choice === "rejected" ? "Rejected" : "Replied"} · day ${replyDay ?? daysIn}`,
          cls: "bg-emerald-50 text-emerald-700",
        }
      : choice === "no_response"
        ? { text: "No reply", cls: "bg-ink-100 text-ink-600" }
        : {
            text: daysIn === 0 ? "In progress" : `Day ${daysIn} · In progress`,
            cls: "bg-[#2563EB]/10 text-[#2563EB]",
          };

  return (
    <li
      ref={ref}
      className={`rounded-xl bg-[#2563EB]/[0.07] p-4 ring-1 sm:p-5 ${focused ? "ring-2 ring-[#2563EB]" : "ring-[#2563EB]/15"}`}
    >
      <div className="flex gap-3 sm:gap-4">
        <Logo url={r.publisher?.logo_url} size={48} />
        <div className="min-w-0 flex-1">
          <a
            href={applicationListingPath(r, company)}
            className={`line-clamp-2 text-base font-bold leading-snug hover:text-[#2563EB] ${closed ? "text-ink-500" : "text-ink-950"}`}
          >
            {r.listing_title ?? "Application"}
          </a>
          <p className="mt-0.5 text-sm text-ink-600">
            {r.publisher ? (
              <a
                href={companyPath(r.publisher)}
                className="font-semibold hover:text-[#2563EB]"
              >
                {r.publisher.name}
              </a>
            ) : (
              "Company"
            )}
            <span className="text-ink-400">
              {" "}
              · applied {fmtShort(r.applied_at)}
            </span>
          </p>
          {rate?.responseRate != null && (
            <p className="mt-1 text-xs text-ink-600">
              {company} replies to{" "}
              <strong className="text-ink-900">{rate.responseRate}%</strong> of
              applicants
            </p>
          )}
        </div>
        <span
          className={`h-fit shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${pill.cls}`}
        >
          {pill.text}
        </span>
      </div>

      <Path
        daysIn={daysIn}
        replyDay={replyDay}
        responded={isResponse(choice)}
        me={me}
        closedAfter={
          closed && listing?.removedAt
            ? daysBetween(r.applied_at, listing.removedAt)
            : null
        }
      />

      {closed && (
        <ClosedBox
          publisherId={r.publisher_id}
          company={company}
          removedAt={listing?.removedAt ?? null}
        />
      )}

      {/* Check-in */}
      <div className="mt-4 rounded-lg bg-white ring-1 ring-[#2563EB]/15">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left"
        >
          <span className="text-sm font-bold text-ink-950">Check-in</span>
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-1.5 w-5 rounded-full ${i < done ? "bg-[#2563EB]" : "bg-[#2563EB]/15"}`}
              />
            ))}
          </span>
          <span className="text-xs text-ink-500">{done}/3</span>
          {due && <Tag tone="amber">Due now</Tag>}
          <ChevronDown
            className={`ml-auto h-4 w-4 text-ink-400 transition ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div className="space-y-4 border-t border-ink-100 px-4 py-4">
            <Question
              q={`Did ${company} reply?`}
              value={choice === "no_response_week" ? "applied" : choice}
              options={[
                { v: "applied", label: "Not yet" },
                { v: "responded", label: "Replied" },
                { v: "interview", label: "Interview" },
                { v: "rejected", label: "Rejection" },
                {
                  v: "no_response",
                  label: "Never heard back",
                  lockedFor: Math.max(0, NEVER_HEARD_BACK_DAYS - daysIn),
                },
              ]}
              onPick={(v) => setChoice(v as Choice)}
            />
            <Question
              q="Did your experience match what they asked for?"
              value={r.match_answer ?? null}
              options={[
                { v: "full", label: "Yes, fully" },
                { v: "partly", label: "Partly" },
                { v: "no", label: "Not really" },
              ]}
              onPick={(v) =>
                save(
                  { match_answer: v as ApplicationReport["match_answer"] },
                  { match_answer: v as ApplicationReport["match_answer"] },
                  { match_answer: r.match_answer ?? null },
                )
              }
            />
            <Question
              q="Was the job as described? (salary, location, visa)"
              value={r.accuracy_answer ?? null}
              options={[
                { v: "yes", label: "Yes" },
                { v: "mostly", label: "Mostly" },
                { v: "no", label: "No" },
              ]}
              onPick={(v) =>
                save(
                  {
                    accuracy_answer: v as ApplicationReport["accuracy_answer"],
                  },
                  {
                    accuracy_answer: v as ApplicationReport["accuracy_answer"],
                  },
                  { accuracy_answer: r.accuracy_answer ?? null },
                )
              }
            />
            {!isResponse(choice) && choice !== "no_response" && (
              <Reminder
                r={r}
                onSave={(iso) =>
                  save(
                    { remind_at: iso },
                    { remind_at: iso },
                    { remind_at: r.remind_at ?? null },
                  )
                }
              />
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
        <label
          className={`inline-flex items-center gap-2 ${hasPublicProfile ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
        >
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(r.is_public)}
            disabled={!hasPublicProfile}
            onClick={async () => {
              const next = !r.is_public;
              onPatch({ is_public: next });
              const res = await setApplicationPublic(r.id, next);
              if (!res.ok) {
                onPatch({ is_public: !next });
                setMsg(res.error ?? "Could not update.");
              }
            }}
            className={`relative h-4 w-7 rounded-full transition-colors ${r.is_public ? "bg-[#2563EB]" : "bg-ink-300"}`}
          >
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${r.is_public ? "left-3.5" : "left-0.5"}`}
            />
          </button>
          <span className="inline-flex items-center gap-1 font-semibold text-ink-600">
            <Globe className="h-3 w-3" />
            {hasPublicProfile
              ? "Show on my public profile"
              : "Set a profile link in Settings to share"}
          </span>
        </label>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto inline-flex items-center gap-1 font-semibold text-ink-400 transition-colors hover:text-rose-600"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </button>
      </div>
      {msg && (
        <p className="mt-1.5 text-[11px] font-medium text-rose-600">{msg}</p>
      )}
    </li>
  );
}

function Question({
  q,
  value,
  options,
  onPick,
}: {
  q: string;
  value: string | null;
  options: { v: string; label: string; lockedFor?: number }[];
  onPick: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-800">{q}</p>
      <div
        className="mt-2 flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label={q}
      >
        {options.map((o) => {
          const locked = (o.lockedFor ?? 0) > 0;
          const active = value === o.v;
          return (
            <button
              key={o.v}
              role="radio"
              aria-checked={active}
              disabled={locked}
              onClick={() => onPick(o.v)}
              title={
                locked
                  ? `Available in ${plural(o.lockedFor!, "day")}`
                  : undefined
              }
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "border-[#2563EB] bg-[#2563EB] text-white"
                  : locked
                    ? "cursor-not-allowed border-dashed border-ink-200 text-ink-300"
                    : "border-ink-200 bg-white text-ink-700 hover:border-[#2563EB] hover:text-[#2563EB]"
              }`}
            >
              {locked && <Lock className="h-3 w-3" />}
              {o.label}
              {locked && <span className="font-medium">· {o.lockedFor}d</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Reminder({
  r,
  onSave,
}: {
  r: ApplicationReport;
  onSave: (iso: string | null) => void;
}) {
  const choices = [3, 7, 14];
  const current = r.remind_at ? new Date(r.remind_at) : null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[#2563EB]/[0.06] px-3 py-2.5">
      {current ? (
        <Bell className="h-3.5 w-3.5 text-[#2563EB]" />
      ) : (
        <BellOff className="h-3.5 w-3.5 text-ink-400" />
      )}
      <span className="text-xs text-ink-700">
        {current ? (
          current.getTime() <= Date.now() ? (
            <strong>Check-in due now</strong>
          ) : (
            <>
              Next check-in <strong>{fmtShort(current.toISOString())}</strong>
            </>
          )
        ) : (
          "No reminder"
        )}{" "}
        · remind me in
      </span>
      {choices.map((d) => (
        <button
          key={d}
          onClick={() => onSave(new Date(Date.now() + d * DAY).toISOString())}
          className="rounded-full border border-[#2563EB]/30 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#2563EB] hover:bg-[#2563EB] hover:text-white"
        >
          {d} days
        </button>
      ))}
      {current && (
        <button
          onClick={() => onSave(null)}
          className="text-[11px] font-semibold text-ink-500 hover:text-ink-900"
        >
          Off
        </button>
      )}
    </div>
  );
}

/** Applied → day 7 → day 21, with the applicant's photo where they are now. */
function Path({
  daysIn,
  replyDay,
  responded,
  me,
  closedAfter,
}: {
  daysIn: number;
  replyDay: number | null;
  responded: boolean;
  me: ReporterInfo;
  closedAfter: number | null;
}) {
  const end = responded && replyDay != null ? replyDay : daysIn;
  const pct = (d: number) => Math.min(100, (100 * d) / TIMELINE_DAYS);
  const pos = Math.max(0, Math.min(100, pct(end)));
  return (
    <div className="mt-5 px-3">
      <div className="relative h-1.5 rounded-full bg-[#2563EB]/15">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${pos}%`,
            background: "linear-gradient(90deg, rgba(37,99,235,0.4), #2563EB)",
          }}
        />
        {[NO_RESPONSE_WEEK_DAYS, NEVER_HEARD_BACK_DAYS].map((d) => (
          <span
            key={d}
            className="absolute -top-1 h-3.5 w-0.5 rounded bg-[#2563EB]/30"
            style={{ left: `calc(${pct(d)}% - 1px)` }}
          />
        ))}
        {closedAfter != null && closedAfter <= TIMELINE_DAYS && (
          <span
            className="absolute -top-1 h-3.5 w-0.5 rounded bg-ink-500"
            style={{ left: `calc(${pct(closedAfter)}% - 1px)` }}
            title={`Job closed on day ${closedAfter}`}
          />
        )}
        <span
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${pos}%` }}
        >
          <Avatar me={me} done={responded} />
        </span>
      </div>
      <div className="relative mt-4 h-4 text-[10px] font-semibold text-ink-500">
        <span className="absolute left-0 -translate-x-3">Applied</span>
        <span
          className="absolute -translate-x-1/2"
          style={{ left: `${pct(NO_RESPONSE_WEEK_DAYS)}%` }}
        >
          Day {NO_RESPONSE_WEEK_DAYS}
        </span>
        <span className="absolute right-0 translate-x-3">
          Day {NEVER_HEARD_BACK_DAYS}
          {daysIn > NEVER_HEARD_BACK_DAYS ? "+" : ""}
        </span>
      </div>
    </div>
  );
}

function Avatar({ me, done }: { me: ReporterInfo; done: boolean }) {
  const [failed, setFailed] = useState(false);
  const initials = me.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={`relative grid h-8 w-8 place-items-center overflow-hidden rounded-full border-2 bg-white shadow ${done ? "border-emerald-500" : "border-[#2563EB]"}`}
    >
      {me.avatarUrl && !failed ? (
        <img
          src={me.avatarUrl}
          alt=""
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-[11px] font-bold text-[#2563EB]">
          {initials || "You"}
        </span>
      )}
    </span>
  );
}

/** Closed job: what usually happens next, for this company or across MadeVisa. Blurred when there's no data yet. */
function ClosedBox({
  publisherId,
  company,
  removedAt,
}: {
  publisherId: string;
  company: string;
  removedAt: string | null;
}) {
  const [d, setD] = useState<ClosedJobOutcomes | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetchClosedJobOutcomes(publisherId).then((x) => alive && setD(x));
    return () => {
      alive = false;
    };
  }, [publisherId]);
  const src = d?.company
    ? { who: `at ${company}`, ...d.company }
    : d?.platform
      ? { who: "across MadeVisa", ...d.platform }
      : null;
  const tiles = [
    {
      v: src ? `${src.replied_pct}%` : "XX%",
      label: "still heard back after it closed",
    },
    { v: src ? `${src.interview_pct}%` : "X%", label: "got an interview" },
    {
      v: d?.avg_open_days ? `${d.avg_open_days} days` : "XX days",
      label: "jobs usually stay open",
    },
  ];
  return (
    <div className="relative mt-4 overflow-hidden rounded-lg bg-white ring-1 ring-ink-200">
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-2.5">
        <Tag tone="grey">Job closed</Tag>
        <p className="text-xs text-ink-600">
          {company} took this job down
          {removedAt ? ` on ${fmtShort(removedAt)}` : ""}. Usually someone was
          hired or the role closed — you can still hear back.
        </p>
      </div>
      <div
        className={`grid grid-cols-3 gap-2 px-4 ${src ? "py-3" : "select-none py-6 blur-[5px]"}`}
        aria-hidden={!src}
      >
        {tiles.map((t) => (
          <div key={t.label}>
            <p className="text-xl font-bold tabular-nums text-ink-950">{t.v}</p>
            <p className="text-[11px] leading-4 text-ink-500">{t.label}</p>
          </div>
        ))}
      </div>
      {src ? (
        <p className="px-4 pb-3 text-[11px] text-ink-400">
          Based on {plural(src.applications, "application")} to closed jobs{" "}
          {src.who}. May not be 100% accurate.
        </p>
      ) : (
        <div className="absolute inset-x-0 bottom-0 top-[42px] grid place-items-center bg-white/70 px-4 text-center">
          <p className="max-w-xs text-xs font-semibold text-ink-800">
            Not enough data yet. Answer your check-in — it helps show what
            happens after {company} closes a job.
          </p>
        </div>
      )}
    </div>
  );
}

function Logo({ url, size }: { url?: string | null; size: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-ink-100"
      style={{ width: size, height: size }}
    >
      {url && !failed ? (
        <img
          src={url}
          alt=""
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <Briefcase className="h-4 w-4 text-ink-300" />
      )}
    </span>
  );
}

function ConfirmDelete({
  r,
  onCancel,
  onConfirm,
}: {
  r: ApplicationReport;
  onCancel: () => void;
  onConfirm: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-app-title"
    >
      <div className="menu-pop w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
        <h3 id="delete-app-title" className="text-base font-bold text-ink-950">
          Remove this application?
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          <strong className="text-ink-900">
            {r.listing_title ?? "This application"}
          </strong>
          {r.publisher?.name ? ` at ${r.publisher.name}` : ""} will be removed
          from your report and won’t count in any response rates. This can’t be
          undone.
        </p>
        {error && (
          <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-50"
          >
            Cancel
          </button>
          <button
            autoFocus
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await onConfirm();
              if (!res.ok) {
                setBusy(false);
                setError(
                  res.error ?? "Could not remove it — please try again.",
                );
              }
            }}
            className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
