import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, MailQuestion, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { answerCheckIn, fetchCheckIns, type CheckIn, type CheckInAnswer } from '@/lib/outcomes';
import { formatRelativeTime } from '@/lib/dates';

// "Did Formue reply about Graphic Designer?" — one small card, for signed-in people with a
// tracked application of 5+ days and no answer yet. One tap. Every answer makes reply rates,
// reply odds and GhostGood more accurate for everyone, so the card says that.

const HIDE_KEY = 'mv:checkinHidden';
const ANSWERS: { id: CheckInAnswer; label: string; tone: string }[] = [
  { id: 'responded', label: 'They replied', tone: 'bg-emerald-600 text-white hover:bg-emerald-700' },
  { id: 'interview', label: 'Interview', tone: 'bg-emerald-600 text-white hover:bg-emerald-700' },
  { id: 'offer', label: 'Offer 🎉', tone: 'bg-emerald-600 text-white hover:bg-emerald-700' },
  { id: 'rejected', label: 'Rejected', tone: 'bg-ink-100 text-ink-800 hover:bg-ink-200' },
  { id: 'waiting', label: 'No reply yet', tone: 'bg-ink-100 text-ink-800 hover:bg-ink-200' },
  { id: 'not_applied', label: 'I didn’t apply', tone: 'bg-white text-ink-500 ring-1 ring-ink-200 hover:bg-ink-50' },
];

export function OutcomeCheckIn() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<CheckIn[]>([]);
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(HIDE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const load = useCallback(async () => {
    if (!user) return setItems([]);
    setItems(await fetchCheckIns());
  }, [user]);

  useEffect(() => {
    if (loading || hidden) return;
    // Not on the very first second of a visit: give the page a moment first.
    const t = window.setTimeout(() => void load(), 4000);
    return () => window.clearTimeout(t);
  }, [loading, hidden, load]);

  const hide = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(HIDE_KEY, '1');
    } catch {
      /* fine */
    }
  };

  if (!user || hidden || (!items.length && !thanks)) return null;
  const cur = items[0];

  const answer = async (a: CheckInAnswer) => {
    if (!cur || busy) return;
    setBusy(true);
    await answerCheckIn(cur.id, a);
    setBusy(false);
    setThanks(true);
    window.setTimeout(() => {
      setThanks(false);
      setItems((xs) => xs.slice(1));
    }, 1600);
  };

  return createPortal(
    <div className="fixed bottom-3 left-3 right-3 z-[80] mx-auto max-w-sm rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-ink-200 sm:left-5 sm:right-auto sm:bottom-5" role="dialog" aria-label="Did the employer reply?">
      <button type="button" onClick={hide} aria-label="Ask me later" className="absolute right-2 top-2 rounded-full p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
        <X className="h-4 w-4" />
      </button>
      {thanks ? (
        <p className="flex items-center gap-2 py-2 text-[14px] font-semibold text-emerald-700">
          <Check className="h-4 w-4" /> Thanks. That makes reply rates real for everyone.
        </p>
      ) : (
        cur && (
          <>
            <p className="flex items-start gap-2 pr-6 text-[14px] font-bold leading-5 text-ink-950">
              <MailQuestion className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
              <span>
                Did {cur.company} reply about {cur.title}?
              </span>
            </p>
            <p className="mt-0.5 pl-6 text-[12px] text-ink-500">
              Applied {formatRelativeTime(cur.appliedAt, '')}
              {items.length > 1 ? ` · ${items.length - 1} more waiting` : ''}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ANSWERS.map((a) => (
                <button key={a.id} type="button" disabled={busy} onClick={() => void answer(a.id)} className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition disabled:opacity-60 ${a.tone}`}>
                  {a.label}
                </button>
              ))}
              {busy && <Loader2 className="h-4 w-4 animate-spin self-center text-ink-400" />}
            </div>
            <p className="mt-2.5 text-[11.5px] leading-4 text-ink-500">Answers go into company reply rates as totals, never with your name (unless you made your applications public).</p>
          </>
        )
      )}
    </div>,
    document.body,
  );
}
