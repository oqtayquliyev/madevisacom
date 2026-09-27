import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Plus, X } from 'lucide-react';

/** One selected job, already formatted by the image generator. */
export type CaptionJob = { title: string; company: string | null; place: string | null; salary: string | null };

const MAX_TAGS = 3;
const LINK = 'madevisa.com/jobs';

/**
 * Role words to recognise in job titles, most specific first
 * ("Product Manager" before "Manager"). The chip shows the label.
 */
const ROLES: { match: RegExp; label: string }[] = [
  { match: /\bproduct manager\b/i, label: 'Product Manager' },
  { match: /\bproject manager\b/i, label: 'Project Manager' },
  { match: /\bdata scientist\b/i, label: 'Data Scientist' },
  { match: /\bdata (engineer|analyst)\b/i, label: 'Data' },
  { match: /\b(software|backend|frontend|front-end|back-end|full[- ]?stack)\b/i, label: 'Developer' },
  { match: /\bdevelop(er|ers)?\b/i, label: 'Developer' },
  { match: /\bengineer(s|ing)?\b/i, label: 'Engineer' },
  { match: /\bdesign(er|ers)?\b/i, label: 'Designer' },
  { match: /\baccount(ant|ants|ing)\b/i, label: 'Accountant' },
  { match: /\bfinanc(e|ial)\b/i, label: 'Finance' },
  { match: /\banalyst\b/i, label: 'Analyst' },
  { match: /\bmarketing\b/i, label: 'Marketing' },
  { match: /\b(sales|account executive|business development)\b/i, label: 'Sales' },
  { match: /\b(recruit(er|ing|ment)|talent acquisition)\b/i, label: 'Recruiter' },
  { match: /\bnurs(e|es|ing)\b/i, label: 'Nurse' },
  { match: /\b(doctor|physician)\b/i, label: 'Doctor' },
  { match: /\bteach(er|ers|ing)\b/i, label: 'Teacher' },
  { match: /\bconsultant\b/i, label: 'Consultant' },
  { match: /\barchitect\b/i, label: 'Architect' },
  { match: /\b(lawyer|legal|counsel)\b/i, label: 'Legal' },
  { match: /\bdriver\b/i, label: 'Driver' },
  { match: /\btechnician\b/i, label: 'Technician' },
  { match: /\b(customer (service|support|success))\b/i, label: 'Customer Support' },
  { match: /\bmanager\b/i, label: 'Manager' },
];

/** Offered as extra chips when the selected jobs don't suggest enough. */
const PRESETS = ['Designer', 'Developer', 'Engineer', 'Accountant', 'Product Manager', 'Data', 'Marketing', 'Sales', 'Nurse', 'Finance'];

function roleOf(title: string): string | null {
  return ROLES.find((r) => r.match.test(title))?.label ?? null;
}

const todayLabel = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const joinNice = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} & ${xs[xs.length - 1]}`);
const hashtag = (s: string) => `#${s.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}jobs`;

function jobLine(j: CaptionJob): string {
  const bits = [j.company, j.place].filter(Boolean).join(' · ');
  return `• ${j.title}${bits ? ` — ${bits}` : ''}${j.salary ? ` · ${j.salary}` : ''}`;
}

export function PostCaptionBuilder({ jobs }: { jobs: CaptionJob[] }) {
  const [date, setDate] = useState(todayLabel);
  const [heading, setHeading] = useState('Fresh Jobs');
  const [tags, setTags] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [touchedTags, setTouchedTags] = useState(false);

  // Roles found in the selected jobs, most common first.
  const suggested = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of jobs) {
      const r = roleOf(j.title);
      if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
  }, [jobs]);

  // Pre-select the top suggestions until the admin changes the chips.
  useEffect(() => {
    if (!touchedTags) setTags(suggested.slice(0, MAX_TAGS));
  }, [suggested, touchedTags]);

  const chips = useMemo(() => {
    const all = [...tags, ...suggested, ...PRESETS];
    return all.filter((c, i) => all.indexOf(c) === i);
  }, [tags, suggested]);

  const toggle = (t: string) => {
    setTouchedTags(true);
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length >= MAX_TAGS ? [...cur.slice(1), t] : [...cur, t]));
  };
  const addCustom = () => {
    const t = custom.trim().replace(/\s+/g, ' ');
    if (!t) return;
    setCustom('');
    setTouchedTags(true);
    setTags((cur) => (cur.includes(t) ? cur : cur.length >= MAX_TAGS ? [...cur.slice(1), t] : [...cur, t]));
  };

  const roles = tags.length ? tags : ['New'];
  const variants = useMemo(() => {
    const first = `${date} | ${heading}`;
    const short = `${first}\n${roles.join(' / ')} jobs today on ${LINK}`;
    const list = [
      `${heading} · ${date}`,
      '',
      ...jobs.slice(0, 8).map(jobLine),
      '',
      `More ${joinNice(roles)} roles, straight from company career pages → ${LINK}`,
    ].join('\n');
    const hook = [
      `Hiring now: ${joinNice(roles)} roles 👀`,
      `${jobs.length ? `${jobs.length} fresh ${jobs.length === 1 ? 'job' : 'jobs'}` : 'Fresh jobs'} from company career pages — ${date}.`,
      '',
      `Apply at ${LINK}`,
      '',
      [...(tags.length ? tags.map(hashtag) : []), '#hiring', '#jobs', '#madevisa'].join(' '),
    ].join('\n');
    return [
      { key: 'short', label: 'Short', text: short },
      { key: 'list', label: 'Job list', text: list },
      { key: 'hook', label: 'Hook + hashtags', text: hook },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, heading, tags, jobs]);

  return (
    <div className="mb-5 rounded-xl border border-ink-200 bg-white p-4">
      <p className="text-sm font-bold text-ink-900">Post caption</p>
      <p className="mt-0.5 text-xs text-ink-500">Pick up to {MAX_TAGS} specialisations, then copy the caption that fits the post.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
        <label className="block">
          <span className="text-xs font-semibold text-ink-600">Date</span>
          <input value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink-600">Title</span>
          <input value={heading} onChange={(e) => setHeading(e.target.value)} className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500" />
        </label>
      </div>

      <div className="mt-3">
        <span className="text-xs font-semibold text-ink-600">
          Specialisations <span className="font-normal text-ink-400">({tags.length}/{MAX_TAGS} · suggested from the selected jobs)</span>
        </span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {chips.map((c) => {
            const on = tags.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggle(c)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  on ? 'border-brand-600 bg-brand-600 text-white' : suggested.includes(c) ? 'border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-400' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300'
                }`}
              >
                {on && <Check className="h-3 w-3" />}
                {c}
                {on && tags.indexOf(c) >= 0 && <span className="ml-0.5 text-[10px] opacity-80">{tags.indexOf(c) + 1}</span>}
              </button>
            );
          })}
          <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink-300 py-0.5 pl-3 pr-1">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustom()}
              placeholder="Add your own"
              maxLength={30}
              className="w-28 bg-transparent text-xs outline-none placeholder:text-ink-400"
            />
            <button onClick={addCustom} aria-label="Add specialisation" className="grid h-6 w-6 place-items-center rounded-full text-ink-500 hover:bg-ink-100">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </span>
          {tags.length > 0 && (
            <button
              onClick={() => {
                setTouchedTags(true);
                setTags([]);
              }}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {variants.map((v) => (
          <CaptionCard key={v.key} label={v.label} text={v.text} />
        ))}
      </div>
    </div>
  );
}

/** One caption: editable, with a copy button. Resets when the generated text changes. */
function CaptionCard({ label, text }: { label: string; text: string }) {
  const [value, setValue] = useState(text);
  const [copied, setCopied] = useState(false);
  useEffect(() => setValue(text), [text]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older browsers: fall back to a hidden textarea.
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col rounded-lg border border-ink-200 bg-ink-50/50">
      <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</span>
        <button
          onClick={copy}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold ${copied ? 'bg-emerald-600 text-white' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={8}
        className="min-h-[170px] flex-1 resize-y bg-transparent px-3 py-2 text-[13px] leading-5 text-ink-800 outline-none"
      />
    </div>
  );
}
