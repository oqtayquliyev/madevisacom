import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, FileText, Lightbulb, MapPin, UploadCloud, X } from 'lucide-react';
import { MatchRing } from '@/components/cv/MatchBits';

// Landing → "Know how well you fit": a short, looping demo of CV match — a
// cursor drops a CV in, the score counts up, the missing skills and the
// suggestions appear, then the jobs that fit and how the interview chances
// grow. Illustrative example with made-up numbers, labelled as such.
// It is one fixed-height card, so nothing on the page moves while it plays;
// it pauses off-screen, and people who prefer reduced motion get the final frame.

type Stage = 0 | 1 | 2 | 3 | 4 | 5;
/** How long each stage lasts (ms): cursor brings the CV · reading · score · gaps + tips · fitting jobs · hold. */
const DURATION: Record<Stage, number> = { 0: 1900, 1: 1500, 2: 2200, 3: 2600, 4: 3000, 5: 2200 };
const MISSING = [
  { name: 'Kafka', required: true },
  { name: 'Terraform', required: true },
  { name: 'gRPC', required: false },
];
const JOBS = [
  { title: 'Backend Engineer', company: 'Fintech · Amsterdam', score: 91 },
  { title: 'Senior Go Developer', company: 'Logistics · Berlin', score: 86 },
  { title: 'Platform Engineer', company: 'Remote · EU', score: 82 },
];
/** Where the cursor points in each stage, in % of the card. */
const CURSOR: Record<Stage, { x: number; y: number }> = {
  0: { x: 48, y: 50 },
  1: { x: 50, y: 52 },
  2: { x: 22, y: 30 },
  3: { x: 62, y: 66 },
  4: { x: 82, y: 50 },
  5: { x: 86, y: 92 },
};

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!m) return;
    setReduce(m.matches);
    const on = () => setReduce(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return reduce;
}

export function CvMatchDemo({ className = '' }: { className?: string }) {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [stage, setStage] = useState<Stage>(0);
  const [score, setScore] = useState(0);
  const [read, setRead] = useState(0);

  // Play only while on screen.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduce || !visible) return;
    const t = window.setTimeout(() => setStage((s) => ((s + 1) % 6) as Stage), DURATION[stage]);
    return () => window.clearTimeout(t);
  }, [stage, visible, reduce]);

  // Reading bar and the counting score.
  useEffect(() => {
    if (reduce) return;
    if (stage === 0) {
      setRead(0);
      setScore(0);
    }
    if (stage === 1) {
      const start = performance.now();
      let raf = 0;
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / (DURATION[1] - 200));
        setRead(p);
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }
    if (stage === 2) {
      const start = performance.now();
      let raf = 0;
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / 1100);
        setScore(Math.round(82 * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }
  }, [stage, reduce]);

  // The cursor starts each loop in the corner, then glides to the drop zone.
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    if (stage !== 0) return;
    setMoved(false);
    const t = window.setTimeout(() => setMoved(true), 120);
    return () => window.clearTimeout(t);
  }, [stage]);
  const atStart = stage === 0 && !moved;

  const s: Stage = reduce ? 4 : stage;
  const shownScore = reduce ? 82 : score;
  const result = s >= 2;
  const cursor = CURSOR[s];

  return (
    <figure ref={box} className={`relative overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft-lg ${className}`} aria-label="Animated example of CV match: a CV is uploaded, scored against a job, and matched with other jobs">
      <figcaption className="flex items-center justify-between gap-3 border-b border-ink-100 bg-ink-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-300" />
          <span className="h-2 w-2 rounded-full bg-amber-300" />
          <span className="h-2 w-2 rounded-full bg-emerald-300" />
          <span className="ml-1.5">Example</span>
        </span>
        <span className="truncate font-semibold normal-case tracking-normal text-ink-600">Senior Backend Engineer · Berlin</span>
      </figcaption>

      <div className="relative h-[500px] sm:h-[440px]">
        {/* 1. Upload */}
        <div className={`absolute inset-0 grid place-items-center p-5 transition-all duration-500 ${result ? 'pointer-events-none -translate-y-3 opacity-0' : 'opacity-100'}`}>
          <div className={`w-full max-w-[320px] rounded-2xl border-2 border-dashed p-6 text-center transition-colors duration-300 ${s === 1 ? 'border-brand-500 bg-brand-50' : 'border-ink-300 bg-ink-50/60'}`}>
            {s === 1 ? (
              <>
                <FileText className="mx-auto h-9 w-9 text-brand-600" />
                <p className="mt-2 text-[14px] font-bold text-ink-900">Alex_Morgan_CV.pdf</p>
                <p className="mt-0.5 text-[12px] text-ink-500">Reading your CV…</p>
                <div className="mx-auto mt-3 h-1.5 w-full overflow-hidden rounded-full bg-brand-100">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.round(read * 100)}%` }} />
                </div>
              </>
            ) : (
              <>
                <UploadCloud className="mx-auto h-9 w-9 text-ink-400" />
                <p className="mt-2 text-[14px] font-bold text-ink-900">Drop your CV here</p>
                <p className="mt-0.5 text-[12px] text-ink-500">PDF or Word</p>
              </>
            )}
          </div>
        </div>

        {/* 2–4. Result */}
        <div className={`absolute inset-0 overflow-hidden p-4 transition-all duration-500 sm:p-5 ${result ? 'opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}>
          <div className="flex items-center gap-4">
            <MatchRing score={shownScore} size={76} />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-ink-500">Your match</p>
              <span className={`mt-1 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-700 transition-opacity duration-300 ${shownScore >= 80 ? 'opacity-100' : 'opacity-0'}`}>Strong match</span>
              <p className={`mt-1 text-[12.5px] text-ink-600 transition-opacity duration-300 ${s >= 3 ? 'opacity-100' : 'opacity-0'}`}>
                <strong className="text-ink-900">9 of 12</strong> skills covered
              </p>
            </div>
          </div>

          {/* Missing skills + a suggestion */}
          <div className={`mt-3 transition-all duration-500 ${s >= 3 ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Missing from your CV</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {MISSING.map((m, i) => (
                <li
                  key={m.name}
                  style={{ transitionDelay: `${s >= 3 ? 150 + i * 220 : 0}ms` }}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-all duration-300 ${s >= 3 ? 'scale-100 opacity-100' : 'scale-90 opacity-0'} ${m.required ? 'bg-amber-100 text-amber-900' : 'bg-ink-100 text-ink-700'}`}
                >
                  {m.required && <X className="h-3 w-3" strokeWidth={3} />}
                  {m.name}
                  {!m.required && <span className="font-normal text-ink-500">· nice to have</span>}
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] leading-5 text-emerald-900">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span>
                You used Kafka at your last job? <strong>Add it to Skills: +6 points</strong>
              </span>
            </p>
          </div>

          {/* Jobs that fit + interview chances */}
          <div className={`mt-3 transition-all duration-500 ${s >= 4 ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Jobs that fit you</p>
            <ul className="mt-1.5 space-y-1.5">
              {JOBS.map((j, i) => (
                <li
                  key={j.title}
                  style={{ transitionDelay: `${s >= 4 ? i * 180 : 0}ms` }}
                  className={`flex items-center gap-2.5 rounded-lg border border-ink-100 bg-white px-2.5 py-1.5 transition-all duration-300 ${s >= 4 ? 'translate-x-0 opacity-100' : 'translate-x-3 opacity-0'} ${i === 2 ? 'hidden min-[380px]:flex' : ''}`}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-[12px] font-bold tabular-nums text-emerald-700">{j.score}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-ink-950">{j.title}</span>
                    <span className="flex items-center gap-1 truncate text-[11.5px] text-ink-500">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {j.company}
                    </span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                </li>
              ))}
            </ul>
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-semibold text-ink-700">Interview chances</span>
                <span className={`flex items-center gap-1 font-bold text-emerald-700 transition-opacity duration-300 ${s >= 4 ? 'opacity-100' : 'opacity-0'}`}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Going up
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-400 via-brand-500 to-emerald-500 transition-[width] duration-[1600ms] ease-out" style={{ width: s >= 4 ? '78%' : '18%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* The cursor */}
        {!reduce && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 transition-[left,top] duration-[1200ms] ease-in-out"
            style={{ left: `${atStart ? 88 : cursor.x}%`, top: `${atStart ? 96 : cursor.y}%`, transitionDuration: atStart ? '0ms' : undefined }}
          >
            <CursorGlyph pressed={stage === 1} carrying={stage === 0} />
          </div>
        )}
      </div>
    </figure>
  );
}

/** Arrow pointer; carries a small file chip while dragging the CV in. */
function CursorGlyph({ pressed, carrying }: { pressed: boolean; carrying: boolean }) {
  return (
    <div className={`relative transition-transform duration-150 ${pressed ? 'scale-90' : 'scale-100'}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" className="drop-shadow-md">
        <path d="M4 2.5 19.5 12 12.3 13.4 9.2 20.5z" fill="#0f172a" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      {carrying && (
        <span className="absolute left-4 top-4 inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-ink-800 shadow-md ring-1 ring-ink-200">
          <FileText className="h-3 w-3 text-brand-600" /> CV.pdf
        </span>
      )}
    </div>
  );
}
