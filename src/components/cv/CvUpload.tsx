import { useRef, useState, type DragEvent } from 'react';
import { CheckCircle2, ClipboardPaste, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { CV_ACCEPT } from '@/lib/cv/extract';
import { cvSummary, removeCv, saveCvFile, saveCvText, useCv, type StoredCv } from '@/lib/cv/store';

type Props = {
  /** `light` sits on the blue hero; `card` on white. */
  tone?: 'card' | 'light';
  /** Smaller drop area, for sidebars and dialogs. */
  compact?: boolean;
  /** Called with the CV once it has been read and saved. */
  onDone?: (cv: StoredCv) => void;
  /** Let the person take the CV off again (profile). Hidden where a CV is required. */
  allowRemove?: boolean;
  className?: string;
};

/**
 * Upload a CV (PDF, Word, text) or paste it. The file is read in the
 * browser; once there is one, shows it with "Replace".
 */
export function CvUpload({ tone = 'card', compact = false, onDone, allowRemove = false, className = '' }: Props) {
  const { cv } = useCv();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const light = tone === 'light';

  const take = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    const res = await saveCvFile(file);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPaste(false);
    onDone?.(res.cv);
  };
  const takeText = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await saveCvText(text);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPaste(false);
    setText('');
    onDone?.(res.cv);
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void take(e.dataTransfer.files?.[0]);
  };

  const picker = (
    <input
      ref={input}
      type="file"
      accept={CV_ACCEPT}
      className="sr-only"
      aria-label="Upload your CV"
      onChange={(e) => {
        void take(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );
  const err = error && (
    <p role="alert" className={`mt-2 rounded-lg px-3 py-2 text-[13px] leading-5 ${light ? 'bg-white text-rose-700' : 'bg-rose-50 text-rose-700'}`}>
      {error}
    </p>
  );

  if (cv && !paste) {
    return (
      <div className={className}>
        {picker}
        <div className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 ${light ? 'bg-white/10 ring-1 ring-white/25' : 'bg-emerald-50/70 ring-1 ring-emerald-200'}`}>
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${light ? 'bg-white text-brand-700' : 'bg-white text-emerald-700 ring-1 ring-emerald-200'}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className={`flex items-center gap-1.5 truncate text-[14px] font-semibold ${light ? 'text-white' : 'text-ink-950'}`}>
              <CheckCircle2 className={`h-4 w-4 shrink-0 ${light ? 'text-emerald-300' : 'text-emerald-600'}`} />
              <span className="truncate">{cv.name}</span>
            </p>
            <p className={`text-[12px] ${light ? 'text-white/70' : 'text-ink-500'}`}>{cvSummary(cv)}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${light ? 'text-white ring-1 ring-white/40 hover:bg-white/10' : 'text-ink-700 ring-1 ring-ink-200 hover:bg-white'}`}
            >
              Replace
            </button>
            {allowRemove && (
              <button
                type="button"
                onClick={() => window.confirm('Remove your CV from MadeVisa? Your match scores will be cleared.') && void removeCv()}
                aria-label="Remove CV"
                className={`rounded-lg p-2 ${light ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'text-ink-400 hover:bg-white hover:text-rose-600'}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {err}
      </div>
    );
  }

  if (paste) {
    return (
      <div className={className}>
        <label className={`block text-[13px] font-semibold ${light ? 'text-white' : 'text-ink-800'}`} htmlFor="cv-paste">
          Paste your CV
        </label>
        <textarea
          id="cv-paste"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={compact ? 6 : 9}
          placeholder="Your roles with dates, education, skills and languages…"
          className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-3 text-[14px] leading-6 text-ink-900 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void takeText()}
            disabled={busy || text.trim().length < 200}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-bold disabled:opacity-50 ${light ? 'bg-white text-brand-700 hover:bg-brand-50' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Use this text
          </button>
          <button type="button" onClick={() => setPaste(false)} className={`rounded-lg px-3 py-2.5 text-[13px] font-semibold ${light ? 'text-white/80 hover:text-white' : 'text-ink-500 hover:text-ink-800'}`}>
            Upload a file instead
          </button>
        </div>
        {err}
      </div>
    );
  }

  return (
    <div className={className}>
      {picker}
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        disabled={busy}
        className={`flex w-full items-center gap-4 rounded-xl border-2 border-dashed text-left transition ${compact ? 'px-4 py-3.5' : 'px-5 py-5'} ${
          light
            ? `${over ? 'border-white bg-white/20' : 'border-white/45 bg-white/10 hover:border-white hover:bg-white/15'} text-white`
            : `${over ? 'border-brand-500 bg-brand-50' : 'border-ink-300 bg-white hover:border-brand-400 hover:bg-brand-50/50'} text-ink-900`
        }`}
      >
        <span className={`grid shrink-0 place-items-center rounded-full ${compact ? 'h-10 w-10' : 'h-12 w-12'} ${light ? 'bg-white text-brand-700' : 'bg-brand-600 text-white'}`}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
        </span>
        <span className="min-w-0">
          <span className={`block font-bold ${compact ? 'text-[14px]' : 'text-[16px]'}`}>{busy ? 'Reading your CV…' : 'Upload your CV'}</span>
          <span className={`mt-0.5 block text-[13px] ${light ? 'text-white/75' : 'text-ink-500'}`}>PDF or Word, up to 5 MB. Drop it here or tap to choose.</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setPaste(true);
        }}
        className={`mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold ${light ? 'text-white/85 underline decoration-white/40 underline-offset-4 hover:text-white' : 'text-brand-700 hover:underline'}`}
      >
        <ClipboardPaste className="h-3.5 w-3.5" /> No file on this device? Paste the text
      </button>
      {err}
    </div>
  );
}

/** Just "Replace" — for places that already show the CV's name. */
export function CvReplaceButton({ className = '' }: { className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className={`flex flex-col items-stretch gap-1 sm:items-end ${className}`}>
      <input
        ref={input}
        type="file"
        accept={CV_ACCEPT}
        className="sr-only"
        aria-label="Replace your CV"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          setError(null);
          const res = await saveCvFile(file);
          setBusy(false);
          if (!res.ok) setError(res.error);
        }}
      />
      <button type="button" onClick={() => input.current?.click()} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-ink-700 ring-1 ring-ink-200 hover:bg-white disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Replace CV
      </button>
      {error && (
        <span role="alert" className="max-w-[260px] text-[12px] leading-4 text-rose-700">
          {error}
        </span>
      )}
    </span>
  );
}
