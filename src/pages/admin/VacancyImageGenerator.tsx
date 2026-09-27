import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, ImageIcon, Loader2, RefreshCw, Search } from 'lucide-react';
import { PostCaptionBuilder, type CaptionJob } from '@/pages/admin/PostCaptionBuilder';
import { supabase } from '@/lib/supabase';
import { formatSalary, type SalaryPeriod, type SalaryStatus } from '@/lib/listingCategories';

/**
 * Admin → Social images: 1200×1200 PNGs of vacancies in MadeVisa's style,
 * for LinkedIn / Instagram / Telegram posts. Pick jobs, a template and a
 * colour, edit the headline and call-to-action, then download.
 *
 * Company logos load only when their host allows it (CORS); otherwise the
 * company's initials are drawn instead, so the image can always be saved.
 */

const SIZE = 1200;
const BLUE = '#1D4ED8';
const INK = '#0F172A';
const MUTED = '#64748B';
const LOGO_DARK = 'https://res.cloudinary.com/dkvg0oo8c/image/upload/v1789479857/madevisa-logo-header_fqdylj.svg';
const LOGO_LIGHT = 'https://res.cloudinary.com/dkvg0oo8c/image/upload/v1788950524/Logo-Footer_uqo16m.svg';

type JobRow = {
  id: string;
  title: string;
  city: string | null;
  remote: boolean | null;
  employment_type: string | null;
  work_arrangement?: string | null;
  compensation_text: string | null;
  salary_status?: SalaryStatus;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency?: string;
  salary_period?: SalaryPeriod;
  created_at: string;
  source_posted_at: string | null;
  publisher: { name: string; logo_url: string | null } | null;
  country: { name: string; iso_code: string } | null;
};

type Template = 'spotlight' | 'salary' | 'list' | 'company';
type Theme = 'blue' | 'white' | 'dark';

const TEMPLATES: { key: Template; label: string; hint: string }[] = [
  { key: 'spotlight', label: 'Job spotlight', hint: 'One image per job' },
  { key: 'salary', label: 'Salary first', hint: 'Big salary, one per job' },
  { key: 'list', label: 'Jobs list', hint: 'Up to 5 jobs in one image' },
  { key: 'company', label: 'Company is hiring', hint: 'One per company' },
];
const THEMES: { key: Theme; label: string; swatch: string }[] = [
  { key: 'blue', label: 'Blue', swatch: BLUE },
  { key: 'white', label: 'Light', swatch: '#F1F5F9' },
  { key: 'dark', label: 'Dark', swatch: INK },
];

const salaryOf = (j: JobRow) => formatSalary(j) ?? null;
const placeOf = (j: JobRow) => {
  const parts = [j.city, j.country?.name].filter(Boolean) as string[];
  const where = [...new Set(parts)].join(', ');
  return j.remote || j.work_arrangement === 'remote' ? (where ? `${where} · Remote` : 'Remote') : where;
};
const typeOf = (j: JobRow) => {
  const t = (j.employment_type ?? '').replace(/_/g, ' ').trim();
  const w = j.work_arrangement && j.work_arrangement !== 'remote' ? j.work_arrangement.replace('onsite', 'On-site').replace('hybrid', 'Hybrid') : '';
  return [t && t[0].toUpperCase() + t.slice(1), w].filter(Boolean).join(' · ');
};

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  if (!imageCache.has(src)) {
    imageCache.set(
      src,
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      }),
    );
  }
  return imageCache.get(src)!;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Wraps text into at most `maxLines` lines, adding "…" if it doesn't fit. Returns the height used. */
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number): number {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxW || !line) line = test;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let last = shown[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxW && last.length > 1) last = last.slice(0, -1);
    shown[maxLines - 1] = `${last.trimEnd()}…`;
  }
  shown.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
  return shown.length * lineH;
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function font(weight: number, size: number) {
  return `${weight} ${size}px Inter, system-ui, -apple-system, Segoe UI, sans-serif`;
}

/** Company logo in a rounded white tile, or its initials when the logo can't be used. */
function drawLogoTile(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, name: string, x: number, y: number, s: number) {
  ctx.save();
  roundRect(ctx, x, y, s, s, s * 0.22);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.clip();
  if (img) {
    const pad = s * 0.14;
    const ratio = Math.min((s - pad * 2) / img.width, (s - pad * 2) / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    ctx.drawImage(img, x + (s - w) / 2, y + (s - h) / 2, w, h);
  } else {
    ctx.fillStyle = 'rgba(29,78,216,0.1)';
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = BLUE;
    ctx.font = font(800, s * 0.36);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    ctx.fillText(initials || '•', x + s / 2, y + s / 2 + 2);
  }
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, fg: string, size = 26) {
  ctx.font = font(700, size);
  const w = ctx.measureText(text).width + size * 1.4;
  const h = size * 1.9;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + size * 0.7, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return w;
}

type Opts = { theme: Theme; headline: string; cta: string; showSalary: boolean; showPlace: boolean };

function background(ctx: CanvasRenderingContext2D, theme: Theme) {
  const bg = theme === 'blue' ? BLUE : theme === 'dark' ? INK : '#F1F5F9';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Soft circles, like the site's blue sections.
  ctx.fillStyle = theme === 'white' ? 'rgba(29,78,216,0.06)' : 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  ctx.arc(SIZE - 90, 110, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(140, SIZE - 60, 200, 0, Math.PI * 2);
  ctx.fill();
}

async function header(ctx: CanvasRenderingContext2D, o: Opts) {
  const logo = await loadImage(o.theme === 'white' ? LOGO_DARK : LOGO_LIGHT);
  if (logo) {
    const h = 58;
    const w = (logo.width / logo.height) * h || 220;
    ctx.drawImage(logo, 80, 78, w, h);
  } else {
    ctx.fillStyle = o.theme === 'white' ? INK : '#FFFFFF';
    ctx.font = font(800, 48);
    ctx.fillText('madevisa', 80, 124);
  }
  if (o.headline.trim()) {
    ctx.font = font(700, 26);
    const text = o.headline.trim().toUpperCase();
    const w = ctx.measureText(text).width + 36;
    pill(ctx, text, SIZE - 80 - w, 80, o.theme === 'white' ? BLUE : 'rgba(255,255,255,0.16)', '#FFFFFF', 26);
  }
}

function footer(ctx: CanvasRenderingContext2D, o: Opts) {
  const fg = o.theme === 'white' ? INK : '#FFFFFF';
  ctx.fillStyle = fg;
  ctx.font = font(800, 38);
  ctx.fillText(fit(ctx, o.cta.trim() || 'Apply at madevisa.com', 700), 80, 1112);
  ctx.font = font(600, 24);
  ctx.fillStyle = o.theme === 'white' ? MUTED : 'rgba(255,255,255,0.75)';
  ctx.textAlign = 'right';
  ctx.fillText('Jobs + hiring insights', SIZE - 80, 1110);
  ctx.textAlign = 'left';
}

function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, theme: Theme) {
  ctx.save();
  ctx.shadowColor = 'rgba(15,23,42,0.18)';
  ctx.shadowBlur = theme === 'white' ? 30 : 50;
  ctx.shadowOffsetY = 14;
  roundRect(ctx, x, y, w, h, 40);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();
}

async function drawSpotlight(ctx: CanvasRenderingContext2D, j: JobRow, o: Opts, salaryFirst: boolean) {
  background(ctx, o.theme);
  await header(ctx, o);
  card(ctx, 80, 200, 1040, 820, o.theme);
  const company = j.publisher?.name ?? 'Company';
  const logo = await loadImage(j.publisher?.logo_url);
  drawLogoTile(ctx, logo, company, 140, 262, 116);
  ctx.fillStyle = INK;
  ctx.font = font(700, 36);
  ctx.fillText(fit(ctx, company, 760), 286, 312);
  ctx.fillStyle = MUTED;
  ctx.font = font(500, 28);
  const place = o.showPlace ? placeOf(j) : '';
  if (place) ctx.fillText(fit(ctx, place, 760), 286, 358);

  const salary = o.showSalary ? salaryOf(j) : null;
  // `y` = baseline of the next line of text.
  let y = 500;
  const lines = (h: number, lh: number) => h / lh; // wrap() returns lines × line height
  if (salaryFirst && salary) {
    ctx.fillStyle = BLUE;
    ctx.font = font(800, 92);
    const n = lines(wrap(ctx, salary, 140, y, 920, 100, 2), 100);
    y += (n - 1) * 100 + 108;
    ctx.fillStyle = INK;
    ctx.font = font(800, 54);
    const m = lines(wrap(ctx, j.title, 140, y, 920, 64, 3), 64);
    y += (m - 1) * 64;
  } else {
    ctx.fillStyle = INK;
    ctx.font = font(800, 76);
    const n = lines(wrap(ctx, j.title, 140, y, 920, 88, 3), 88);
    y += (n - 1) * 88;
  }

  // Chips, just under the title
  let cx = 140;
  const cy = y + 40;
  const chips = [typeOf(j)].filter(Boolean);
  for (const c of chips) cx += pill(ctx, fit(ctx, c, 500), cx, cy, 'rgba(29,78,216,0.08)', BLUE, 26) + 14;

  if (salary && !salaryFirst) {
    ctx.font = font(600, 26);
    ctx.fillStyle = MUTED;
    ctx.fillText('Salary', 140, 902);
    ctx.fillStyle = BLUE;
    ctx.font = font(800, 54);
    ctx.fillText(fit(ctx, salary, 920), 140, 964);
  } else if (!salary || salaryFirst) {
    ctx.fillStyle = MUTED;
    ctx.font = font(600, 28);
    ctx.fillText('Straight from the company’s careers page', 140, 964);
  }
  footer(ctx, o);
}

async function drawList(ctx: CanvasRenderingContext2D, jobs: JobRow[], o: Opts) {
  background(ctx, o.theme);
  await header(ctx, o);
  const rows = jobs.slice(0, 5);
  const gap = 18;
  const rowH = Math.min(190, Math.floor((840 - gap * (rows.length - 1)) / Math.max(rows.length, 1)));
  const used = rows.length * rowH + (rows.length - 1) * gap;
  const top = 190 + Math.max(0, (840 - used) / 2);
  for (let i = 0; i < rows.length; i++) {
    const j = rows[i];
    const y = top + i * (rowH + gap);
    ctx.save();
    ctx.shadowColor = 'rgba(15,23,42,0.12)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, 80, y, 1040, rowH, 28);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
    const logo = await loadImage(j.publisher?.logo_url);
    drawLogoTile(ctx, logo, j.publisher?.name ?? '', 110, y + (rowH - 100) / 2, 100);
    const salary = o.showSalary ? salaryOf(j) : null;
    ctx.font = font(800, 28);
    const salaryW = salary ? Math.min(ctx.measureText(salary).width, 400) : 0;
    const textW = 1040 - 170 - (salary ? salaryW + 50 : 40);
    const mid = y + rowH / 2;
    ctx.fillStyle = INK;
    ctx.font = font(800, 38);
    ctx.fillText(fit(ctx, j.title, textW), 240, mid - 8);
    ctx.fillStyle = MUTED;
    ctx.font = font(500, 27);
    const sub = [j.publisher?.name, o.showPlace ? placeOf(j) : null].filter(Boolean).join(' · ');
    ctx.fillText(fit(ctx, sub, textW), 240, mid + 36);
    if (salary) {
      ctx.fillStyle = BLUE;
      ctx.font = font(800, 28);
      ctx.textAlign = 'right';
      ctx.fillText(fit(ctx, salary, 400), 1090, mid + 12);
      ctx.textAlign = 'left';
    }
  }
  footer(ctx, o);
}

async function drawCompany(ctx: CanvasRenderingContext2D, jobs: JobRow[], o: Opts) {
  background(ctx, o.theme);
  await header(ctx, o);
  card(ctx, 80, 200, 1040, 820, o.theme);
  const company = jobs[0]?.publisher?.name ?? 'Company';
  const logo = await loadImage(jobs[0]?.publisher?.logo_url);
  drawLogoTile(ctx, logo, company, 140, 270, 150);
  ctx.fillStyle = INK;
  ctx.font = font(800, 68);
  const h = wrap(ctx, `${company} is hiring`, 140, 530, 920, 78, 2);
  ctx.fillStyle = MUTED;
  ctx.font = font(600, 30);
  ctx.fillText(`${jobs.length} open ${jobs.length === 1 ? 'role' : 'roles'} on MadeVisa`, 140, 530 + h + 10);
  let y = 530 + h + 90;
  for (const j of jobs.slice(0, 4)) {
    ctx.fillStyle = BLUE;
    ctx.beginPath();
    ctx.arc(152, y - 11, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = font(700, 32);
    ctx.fillText(fit(ctx, j.title, 880), 180, y);
    y += 58;
  }
  if (jobs.length > 4) {
    ctx.fillStyle = MUTED;
    ctx.font = font(600, 28);
    ctx.fillText(`+ ${jobs.length - 4} more`, 180, y);
  }
  footer(ctx, o);
}

type Output = { key: string; name: string; render: (ctx: CanvasRenderingContext2D) => Promise<void> };

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'job';
}

// ---------------------------------------------------------------------------

export function VacancyImageGenerator() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [salaryOnly, setSalaryOnly] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [template, setTemplate] = useState<Template>('spotlight');
  const [theme, setTheme] = useState<Theme>('blue');
  const [headline, setHeadline] = useState('New job');
  const [cta, setCta] = useState('Apply at madevisa.com');
  const [showSalary, setShowSalary] = useState(true);
  const [showPlace, setShowPlace] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from('sponsored_jobs')
      .select(
        'id, title, city, remote, employment_type, work_arrangement, compensation_text, salary_status, salary_min, salary_max, salary_currency, salary_period, created_at, source_posted_at, publisher:program_publishers(name, logo_url), country:countries(name, iso_code)',
      )
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(80);
    if (q.trim().length >= 2) query = query.ilike('title', `%${q.trim().replace(/[%,()]/g, ' ')}%`);
    if (salaryOnly) query = query.or('compensation_text.not.is.null,salary_min.not.is.null,salary_max.not.is.null');
    const { data, error: err } = await query;
    if (err) setError(err.message);
    setJobs(((data ?? []) as unknown as JobRow[]).filter((j) => !salaryOnly || salaryOf(j)));
    setLoading(false);
  }, [q, salaryOnly]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(t);
  }, [load]);

  // Headline follows the template until the admin edits it.
  const [headlineTouched, setHeadlineTouched] = useState(false);
  useEffect(() => {
    if (!headlineTouched) setHeadline(template === 'list' ? 'New jobs this week' : template === 'company' ? 'Now hiring' : template === 'salary' ? 'Salary shown' : 'New job');
  }, [template, headlineTouched]);

  const picked = useMemo(() => selected.map((id) => jobs.find((j) => j.id === id)).filter((j): j is JobRow => Boolean(j)), [selected, jobs]);
  const opts: Opts = { theme, headline, cta, showSalary, showPlace };

  const outputs: Output[] = useMemo(() => {
    if (!picked.length) return [];
    if (template === 'list') return [{ key: 'list', name: `madevisa-jobs-${picked.length}`, render: (ctx) => drawList(ctx, picked, opts) }];
    if (template === 'company') {
      const byCompany = new Map<string, JobRow[]>();
      for (const j of picked) {
        const k = j.publisher?.name ?? '—';
        byCompany.set(k, [...(byCompany.get(k) ?? []), j]);
      }
      return [...byCompany.entries()].map(([name, list]) => ({ key: `c-${name}`, name: `madevisa-${slug(name)}-hiring`, render: (ctx) => drawCompany(ctx, list, opts) }));
    }
    return picked.slice(0, 12).map((j) => ({
      key: j.id,
      name: `madevisa-${slug(j.publisher?.name ?? '')}-${slug(j.title)}`,
      render: (ctx) => drawSpotlight(ctx, j, opts, template === 'salary'),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, template, theme, headline, cta, showSalary, showPlace]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-12)));

  // Same wording as the images, for the post caption.
  const captionJobs: CaptionJob[] = useMemo(
    () => picked.map((j) => ({ title: j.title, company: j.publisher?.name ?? null, place: placeOf(j) || null, salary: salaryOf(j) })),
    [picked]
  );

  return (
    <section className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-500">
          <ImageIcon className="h-4 w-4" /> Social images · 1200 × 1200
        </h2>
        <p className="text-xs text-ink-400">Pick jobs, a template and a colour — then download PNGs for LinkedIn, Instagram or Telegram.</p>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[380px_1fr]">
        {/* CONTROLS */}
        <div className="space-y-4">
          <div className="rounded-xl border border-ink-200 bg-white p-4">
            <p className="text-[12px] font-bold uppercase tracking-wide text-ink-400">Template</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTemplate(t.key)}
                  className={`rounded-lg border px-3 py-2 text-left transition ${template === t.key ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:border-brand-300'}`}
                >
                  <span className="block text-[13px] font-bold text-ink-900">{t.label}</span>
                  <span className="block text-[11px] text-ink-500">{t.hint}</span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-[12px] font-bold uppercase tracking-wide text-ink-400">Colour</p>
            <div className="mt-2 flex gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTheme(t.key)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold ${theme === t.key ? 'border-brand-600 text-brand-700' : 'border-ink-200 text-ink-600'}`}
                >
                  <span className="h-4 w-4 rounded-full ring-1 ring-ink-200" style={{ background: t.swatch }} /> {t.label}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-2">
              <label className="text-[12px] font-semibold text-ink-600">
                Tag (top right)
                <input
                  value={headline}
                  maxLength={28}
                  onChange={(e) => {
                    setHeadline(e.target.value);
                    setHeadlineTouched(true);
                  }}
                  className="mt-1 h-9 w-full rounded-md border border-ink-200 px-2 text-sm"
                />
              </label>
              <label className="text-[12px] font-semibold text-ink-600">
                Call to action (bottom)
                <input value={cta} maxLength={40} onChange={(e) => setCta(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-ink-200 px-2 text-sm" />
              </label>
              <div className="flex flex-wrap gap-4 pt-1 text-[12px] font-semibold text-ink-700">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={showSalary} onChange={(e) => setShowSalary(e.target.checked)} /> Show salary
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={showPlace} onChange={(e) => setShowPlace(e.target.checked)} /> Show location
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-ink-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-bold uppercase tracking-wide text-ink-400">Jobs · {selected.length} selected</p>
              <button onClick={() => void load()} className="text-ink-400 hover:text-ink-700" aria-label="Reload">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search job titles" className="h-9 w-full rounded-md border border-ink-200 pl-8 pr-2 text-sm" />
            </div>
            <div className="mt-2 flex items-center justify-between text-[12px]">
              <label className="flex items-center gap-1.5 font-semibold text-ink-700">
                <input type="checkbox" checked={salaryOnly} onChange={(e) => setSalaryOnly(e.target.checked)} /> With salary only
              </label>
              {selected.length > 0 && (
                <button onClick={() => setSelected([])} className="font-semibold text-ink-500 hover:text-ink-800">
                  Clear
                </button>
              )}
            </div>
            {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
            <ul className="mt-2 max-h-[420px] divide-y divide-ink-100 overflow-y-auto overscroll-contain rounded-md border border-ink-100">
              {loading && !jobs.length && (
                <li className="flex items-center gap-2 px-3 py-3 text-xs text-ink-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading newest jobs…
                </li>
              )}
              {!loading && !jobs.length && <li className="px-3 py-3 text-xs text-ink-400">No jobs found.</li>}
              {jobs.map((j) => {
                const on = selected.includes(j.id);
                return (
                  <li key={j.id}>
                    <button onClick={() => toggle(j.id)} className={`flex w-full items-start gap-2 px-3 py-2 text-left ${on ? 'bg-brand-50' : 'hover:bg-ink-50'}`}>
                      <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300'}`}>
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-ink-900">{j.title}</span>
                        <span className="block truncate text-[11px] text-ink-500">
                          {[j.publisher?.name, placeOf(j), salaryOf(j)].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* PREVIEWS */}
        <div>
          {outputs.length === 0 ? (
            <div className="grid h-full min-h-[320px] place-items-center rounded-xl border border-dashed border-ink-300 bg-white p-8 text-center text-sm text-ink-500">
              Select one or more jobs to see the images.
            </div>
          ) : (
            <>
              <PostCaptionBuilder jobs={captionJobs} />
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink-700">
                  {outputs.length} image{outputs.length === 1 ? '' : 's'}
                </p>
                <button
                  onClick={async () => {
                    for (const o of outputs) {
                      await downloadOne(o);
                      await new Promise((r) => setTimeout(r, 350));
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700"
                >
                  <Download className="h-3.5 w-3.5" /> Download all
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {outputs.map((o) => (
                  <Preview key={o.key} output={o} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

async function renderToCanvas(o: Output): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  try {
    await document.fonts?.load(font(800, 40));
    await document.fonts?.load(font(600, 40));
  } catch {
    /* system font fallback */
  }
  await o.render(ctx);
  return canvas;
}

async function downloadOne(o: Output) {
  const canvas = await renderToCanvas(o);
  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${o.name}.png`;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
      resolve();
    }, 'image/png');
  });
}

function Preview({ output }: { output: Output }) {
  const [url, setUrl] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    setUrl(null);
    renderToCanvas(output).then((c) => {
      if (!alive.current) return;
      try {
        setUrl(c.toDataURL('image/png'));
      } catch {
        setUrl(null);
      }
    });
    return () => {
      alive.current = false;
    };
  }, [output]);
  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <div className="aspect-square bg-ink-50">
        {url ? <img src={url} alt="" className="h-full w-full" /> : <div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-ink-300" /></div>}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="truncate text-[11px] text-ink-500">{output.name}.png</span>
        <button onClick={() => void downloadOne(output)} className="flex shrink-0 items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-semibold text-ink-700 hover:bg-ink-50">
          <Download className="h-3 w-3" /> PNG
        </button>
      </div>
    </div>
  );
}
