import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Check, Clock, Eye, Flag, MessageCircleQuestion, ShieldAlert, ThumbsUp } from 'lucide-react';
import { LinkedInLogo } from '@/components/common/LinkedInLogo';
import { solveProofOfWork, type PowSolution } from '@/lib/listingRequests';
import { useAuth } from '@/lib/auth';
import { nav } from '@/lib/pageLayout';
import {
  fetchMyBriefReplies,
  REPLY_LABEL,
  REPLY_MESSAGE_MAX,
  reportBriefReply,
  submitBriefReply,
  type BriefReply,
  type ReplyKind,
} from '@/lib/briefs';

const KINDS: { kind: ReplyKind; icon: typeof ThumbsUp; tone: string }[] = [
  { kind: 'interested', icon: ThumbsUp, tone: 'bg-[#1D4ED8] text-white hover:bg-brand-800' },
  { kind: 'more_info', icon: MessageCircleQuestion, tone: 'border border-ink-200 bg-white text-ink-900 hover:border-[#1D4ED8]/40' },
  { kind: 'not_now', icon: Clock, tone: 'border border-ink-200 bg-white text-ink-600 hover:border-ink-300' },
];

const input = 'w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[14px] text-ink-900 placeholder:text-ink-400 focus:border-[#1D4ED8] focus:outline-none';

/**
 * What the company sees next to the document: three buttons. Picking one
 * opens an optional name / work email / message, then Send. Spam checks
 * (honeypot, time on page, proof of work, rate limits) run on the server.
 */
export function EmployerReply({
  shareId,
  candidateName,
  candidateLinkedin,
  onSavePdf,
}: {
  shareId: string;
  candidateName: string;
  candidateLinkedin: string | null;
  onSavePdf: () => void;
}) {
  const first = candidateName.split(/\s+/)[0];
  const { session } = useAuth();
  const [kind, setKind] = useState<ReplyKind | null>(null);
  const [name, setName] = useState('');
  // A signed-in recruiter (e.g. from the employer inbox) gets their email filled in.
  const [email, setEmail] = useState(session?.user?.email ?? '');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ verified: boolean } | null>(null);
  const startedAt = useRef(Date.now());
  const pow = useRef<Promise<PowSolution | null> | null>(null);

  // Solve the proof of work quietly while the reader looks at the document.
  useEffect(() => {
    const signal = { cancelled: false };
    pow.current = solveProofOfWork(signal);
    return () => {
      signal.cancelled = true;
    };
  }, []);

  const send = async () => {
    if (!kind) return;
    setBusy(true);
    setError(null);
    const solution = await pow.current;
    if (!solution) {
      setBusy(false);
      return setError('Verification failed. Please reload the page.');
    }
    const res = await submitBriefReply({ shareId, kind, name, email, message, website, startedAt: startedAt.current, pow: solution });
    setBusy(false);
    if (!res.ok) {
      // A used proof of work can't be sent again — prepare a fresh one for the retry.
      pow.current = solveProofOfWork();
      return setError(res.error ?? 'Couldn’t send. Please try again.');
    }
    setSent({ verified: Boolean(res.verified) });
  };

  if (sent) {
    return (
      <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
        <p className="flex items-center gap-2 text-[15px] font-bold text-ink-950">
          <Check className="h-5 w-5 text-emerald-600" /> Sent — {first} has been notified
        </p>
        <p className="mt-1 text-[13px] leading-5 text-ink-600">
          {email ? `${first} can reach you at ${email}.` : `Add your email next time so ${first} can reply directly.`}
        </p>
        <a
          href="/employers/inbox"
          onClick={(e) => {
            e.preventDefault();
            nav('/employers/inbox');
          }}
          className="mt-3 block text-center text-[12px] font-semibold text-[#1D4ED8] hover:underline"
        >
          Hiring here? See every Visa Plan sent to your company →
        </a>
        {candidateLinkedin && (
          <a
            href={candidateLinkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-ink-200 px-4 py-2.5 text-[14px] font-semibold text-ink-800 hover:border-[#1D4ED8]/40"
          >
            <LinkedInLogo size={16} /> Message {first} on LinkedIn
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
      <p className="text-[15px] font-bold text-ink-950">Reply to {first}</p>
      <p className="mt-0.5 text-[13px] text-ink-600">One click. Nothing is binding.</p>

      {!kind ? (
        <div className="mt-3 space-y-2">
          {KINDS.map(({ kind: k, icon: Icon, tone }) => (
            <button key={k} onClick={() => setKind(k)} className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-bold ${tone}`}>
              <Icon className="h-4 w-4" /> {REPLY_LABEL[k]}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="rounded-lg bg-[#1D4ED8]/[0.06] px-3 py-2 text-[13px] font-semibold text-[#1D4ED8]">{REPLY_LABEL[kind]}</p>
          <input className={input} placeholder="Your name (optional)" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <input
            className={input}
            type="email"
            placeholder={`Work email — shared with ${first} (optional)`}
            value={email}
            maxLength={120}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <textarea
            className={`${input} min-h-[80px] resize-y`}
            placeholder={kind === 'more_info' ? 'What would you like to know?' : 'Message (optional)'}
            value={message}
            maxLength={REPLY_MESSAGE_MAX}
            onChange={(e) => setMessage(e.target.value)}
          />
          {/* Honeypot: hidden from people, filled by bots. */}
          <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden="true" name="website" />
          <div className="flex items-center justify-between text-[11px] text-ink-400">
            <span>No links — use your email instead.</span>
            <span className="tabular-nums">
              {message.length}/{REPLY_MESSAGE_MAX}
            </span>
          </div>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setKind(null)} className="rounded-lg px-3 py-2.5 text-[13px] font-semibold text-ink-500 hover:text-ink-800">
              Back
            </button>
            <button onClick={send} disabled={busy} className="flex-1 rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-[14px] font-bold text-white hover:bg-brand-800 disabled:opacity-60">
              {busy ? 'Sending…' : `Send to ${first}`}
            </button>
          </div>
        </div>
      )}

      <button onClick={onSavePdf} className="mt-3 w-full text-center text-[12px] font-semibold text-ink-500 hover:text-[#1D4ED8]">
        Save as PDF
      </button>
    </div>
  );
}

/** The candidate's side: who opened it and what companies replied. */
export function OwnerReplies({ shareId }: { shareId: string }) {
  const [data, setData] = useState<{ uniqueViewers: number; replies: BriefReply[] } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMyBriefReplies(shareId).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [shareId]);

  if (!data) return null;
  const { uniqueViewers, replies } = data;

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 px-1 text-[13px] text-ink-600">
        <Eye className="h-4 w-4 text-ink-400" />
        {uniqueViewers === 0 ? 'Not opened yet' : `Opened by ${uniqueViewers} ${uniqueViewers === 1 ? 'person' : 'people'}`}
        {replies.length > 0 && <span className="text-ink-400">· {replies.length} {replies.length === 1 ? 'reply' : 'replies'}</span>}
      </p>

      {replies.length === 0 ? (
        <p className="rounded-xl bg-ink-50 px-4 py-3 text-[13px] leading-5 text-ink-600">The company can reply to you in one click from your document. You’ll get a notification.</p>
      ) : (
        <>
          {replies.map((r) => (
            <div key={r.id} className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-[14px] font-bold ${r.kind === 'interested' ? 'text-emerald-700' : r.kind === 'more_info' ? 'text-[#1D4ED8]' : 'text-ink-600'}`}>{REPLY_LABEL[r.kind]}</p>
                <span className="shrink-0 text-[11px] text-ink-400">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              {(r.name || r.email) && (
                <p className="mt-1 text-[13px] text-ink-800">
                  {r.name}
                  {r.name && r.email ? ' · ' : ''}
                  {r.email && (
                    <a href={`mailto:${r.email}`} className="font-semibold text-[#1D4ED8] hover:underline">
                      {r.email}
                    </a>
                  )}
                </p>
              )}
              {r.email && (
                <p className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold ${r.verified ? 'text-emerald-700' : 'text-ink-400'}`}>
                  {r.verified ? <BadgeCheck className="h-3.5 w-3.5" /> : null}
                  {r.verified ? 'Company email verified' : 'Email not on the company’s domain'}
                </p>
              )}
              {r.message && <p className="mt-2 whitespace-pre-line text-[13px] leading-5 text-ink-700">{r.message}</p>}
              <button
                onClick={async () => {
                  if (!window.confirm('Report this reply as spam or a scam? It will be hidden.')) return;
                  if (await reportBriefReply(r.id)) setData({ uniqueViewers, replies: replies.filter((x) => x.id !== r.id) });
                }}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-ink-400 hover:text-rose-600"
              >
                <Flag className="h-3 w-3" /> Report
              </button>
            </div>
          ))}
          <p className="flex items-start gap-1.5 px-1 text-[12px] leading-5 text-ink-500">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            Real employers never ask you to pay for a job, an interview or a visa. Report anything like that.
          </p>
        </>
      )}
    </div>
  );
}
