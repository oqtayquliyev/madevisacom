import { useEffect, type ReactNode } from 'react';
import { ChevronDown, Lock, ScanSearch, Sparkles } from 'lucide-react';
import { JobEdgePanel, useJobEdge, type EdgeInput } from '@/components/jobs/JobEdge';
import { pingJobView } from '@/lib/conversion';
import type { PaywallReason } from '@/components/pro/Paywall';

// The job page's paid tools, folded into two quiet rows: "CV match" and "Your edge on this job".
// Members open them in place; everyone else gets the membership card (signed out: sign up first).

type Tool = 'match' | 'edge';

type Props = {
  input: EdgeInput;
  jobId: string | null;
  company: string;
  member: boolean;
  showEdge: boolean;
  /** Not a member: what pressing a row does (the membership card, or sign-up when signed out). */
  onLocked: (reason: PaywallReason) => () => void;
  tool: Tool | null;
  onTool: (t: Tool) => void;
  /** The CV match panel, or null when the job can't be matched. */
  match: ReactNode;
  matchScore: { score: number; label: string } | null;
};

export function JobEdgeBlock({ input, jobId, company, member, showEdge, onLocked, tool, onTool, match, matchScore }: Props) {
  const edge = useJobEdge(input);
  useEffect(() => {
    if (jobId) void pingJobView(jobId);
  }, [jobId]);

  const hasEdge = showEdge && Boolean(edge.sponsor?.length || edge.move || edge.odds || edge.diaspora != null);
  if (!match && !hasEdge) return null;

  return (
    <div className="mb-5 divide-y divide-ink-100 overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200">
      {match && (
        <ToolRow
          icon={<ScanSearch className="h-4 w-4" />}
          title="CV match"
          chips={['Match score', 'Missing skills', 'What to change']}
          member={member}
          open={tool === 'match'}
          onPress={member ? () => onTool('match') : onLocked('match')}
          right={matchScore ? <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[12px] font-bold text-brand-700">{matchScore.score}%</span> : null}
          anchor="cv-match-row"
        >
          {match}
        </ToolRow>
      )}
      {hasEdge && (
        <ToolRow
          icon={<Sparkles className="h-4 w-4" />}
          title="Your edge on this job"
          chips={[edge.sponsor?.length ? 'Sponsor proof' : null, edge.move ? 'Move math' : null, edge.odds ? 'Reply odds' : null].filter(Boolean) as string[]}
          member={member}
          open={tool === 'edge'}
          onPress={member ? () => onTool('edge') : onLocked('edge')}
        >
          <JobEdgePanel edge={edge} company={company} locked={false} bare />
        </ToolRow>
      )}
    </div>
  );
}

function ToolRow({
  icon,
  title,
  chips,
  member,
  open,
  onPress,
  right,
  anchor,
  children,
}: {
  icon: ReactNode;
  title: string;
  chips: string[];
  member: boolean;
  open: boolean;
  onPress: () => void;
  right?: ReactNode;
  anchor?: string;
  children: ReactNode;
}) {
  return (
    <div id={anchor} className="scroll-mt-24">
      <button
        type="button"
        onClick={onPress}
        aria-expanded={member ? open : undefined}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-ink-50/70 sm:px-5"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-ink-950">{title}</span>
          {chips.length > 0 && (
            <span className="mt-1 hidden flex-wrap gap-1 sm:flex">
              {chips.map((c) => (
                <span key={c} className="rounded-full bg-ink-50 px-2 py-0.5 text-[11.5px] font-semibold text-ink-600 ring-1 ring-ink-100">
                  {c}
                </span>
              ))}
            </span>
          )}
        </span>
        {right}
        {member ? (
          <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink-950 px-2.5 py-1 text-[11.5px] font-bold text-white">
            <Lock className="h-3 w-3" aria-hidden /> Members
          </span>
        )}
      </button>
      {member && open && <div className="border-t border-ink-100 bg-[#f8fafc] p-3 sm:p-4">{children}</div>}
    </div>
  );
}
