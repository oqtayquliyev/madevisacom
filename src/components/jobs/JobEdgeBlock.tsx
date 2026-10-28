import { useEffect, useState } from 'react';
import { JobEdgePanel, useJobEdge, type EdgeInput } from '@/components/jobs/JobEdge';
import { Paywall } from '@/components/pro/Paywall';
import { maskEmail, pingJobView } from '@/lib/conversion';

// The job page's "Your edge on this job" panel and, for non-members, the membership
// card over the page — together, because the card shows (locked) what the panel knows.

type Props = {
  input: EdgeInput;
  jobId: string | null;
  job: { title: string; company: string; category?: string | null };
  locked: boolean;
  /** The card is up (non-member, after the peek or after pressing Apply). */
  covered: boolean;
  onUnlock?: () => void;
  contactEmail?: string | null;
  postedLabel?: string | null;
  /** "3 hours ago": when the job was last seen live on the company's careers page. */
  checkedLabel?: string | null;
  fromCareers?: boolean;
  hasCv: boolean;
  showPanel: boolean;
};

export function JobEdgeBlock({ input, jobId, job, locked, covered, onUnlock, contactEmail, postedLabel, checkedLabel, fromCareers, hasCv, showPanel }: Props) {
  const edge = useJobEdge(input);
  const [views, setViews] = useState<number | null>(null);
  useEffect(() => {
    setViews(null);
    if (!jobId) return;
    let alive = true;
    void pingJobView(jobId).then((n) => alive && setViews(n));
    return () => {
      alive = false;
    };
  }, [jobId]);

  return (
    <>
      {covered && (
        <Paywall
          job={job}
          source="job_page"
          teaser={{
            contact: maskEmail(contactEmail),
            postedLabel,
            checkedLabel,
            fromCareers,
            viewsToday: views,
            sponsorRecords: edge.sponsor?.length ?? 0,
            hasMoveMath: Boolean(edge.move),
            hasOdds: Boolean(edge.odds),
            hasCv,
          }}
        />
      )}
      {showPanel && (
        <div className="mb-5">
          <JobEdgePanel edge={edge} company={job.company} locked={locked} onUnlock={onUnlock} />
        </div>
      )}
    </>
  );
}
