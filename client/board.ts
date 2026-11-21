// The jobs board: downloads the whole list once (~250 KB compressed), then filters,
// searches and pages it in the browser — instant, and no database reads per search.

import { jobPath, type BoardList, type BoardRow } from '../shared/jobs';

const PAGE = 50;
const CACHE_KEY = 'mv:jobs';
const CACHE_MS = 10 * 60_000;

const board = document.getElementById('board');
const form = document.getElementById('filters') as HTMLFormElement | null;
const list = document.getElementById('board-list');
const pager = document.getElementById('board-pager');
const count = document.getElementById('board-count');
const names: Record<string, string> = JSON.parse(document.getElementById('country-names')?.textContent || '{}');

const presetCountry = board?.dataset.country ?? '';
const presetVisa = board?.dataset.visa === '1';
let rows: BoardRow[] = [];
let page = Math.max(1, Number(new URLSearchParams(location.search).get('page')) || 1);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (n: number) => n.toLocaleString('en-US');
const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

function ago(sec: number): string {
  const s = Math.max(0, Date.now() / 1000 - sec);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

function place(r: BoardRow): string {
  const c = r[3] ? names[r[3]] ?? r[3] : '';
  const parts = [r[4] && r[4] !== c ? r[4] : '', c].filter(Boolean);
  if (!parts.length) return r[5] ? 'Remote' : 'Several locations';
  return parts.join(', ') + (r[5] ? ' · remote' : '');
}

async function load(): Promise<BoardRow[]> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw) as { at: number; data: BoardList };
      if (Date.now() - c.at < CACHE_MS && c.data?.jobs) return c.data.jobs;
    }
  } catch {
    /* private mode / full storage */
  }
  const res = await fetch('/api/jobs.json');
  const data = (await res.json()) as BoardList;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* too big for this browser's storage — fine */
  }
  return data.jobs ?? [];
}

type Filters = { q: string; country: string; days: number; visa: boolean; remote: boolean; salary: boolean; company: string };

function read(): Filters {
  const f = new FormData(form!);
  return {
    q: String(f.get('q') ?? '').trim(),
    country: presetCountry || String(f.get('country') ?? ''),
    days: Number(f.get('days') || 0),
    visa: presetVisa || f.get('visa') === '1',
    remote: f.get('remote') === '1',
    salary: f.get('salary') === '1',
    company: String(f.get('company') ?? '').trim(),
  };
}

function apply(f: Filters): BoardRow[] {
  const words = norm(f.q).split(/\s+/).filter(Boolean);
  const since = f.days ? Date.now() / 1000 - f.days * 86400 : 0;
  const company = f.company.toLowerCase();
  return rows.filter((r) => {
    if (f.country && r[3] !== f.country) return false;
    if (f.visa && r[6] !== 1) return false;
    if (f.remote && !(r[5] === 1 || r[8] === 'remote')) return false;
    if (f.salary && r[9] !== 1) return false;
    if (since && r[7] < since) return false;
    if (company && r[2].toLowerCase() !== company) return false;
    if (words.length) {
      const hay = norm(`${r[1]} ${r[2]} ${r[4]} ${names[r[3]] ?? ''} ${r[5] ? 'remote' : ''}`);
      for (const w of words) if (!hay.includes(w)) return false;
    }
    return true;
  });
}

function badges(r: BoardRow): string {
  let b = '';
  if (Date.now() / 1000 - r[7] < 6 * 3600) b += '<span class="tag tag-new" title="Posted in the last 6 hours">NEW</span>';
  if (r[6] === 1) b += '<span class="tag tag-visa" title="The ad says the company sponsors visas">VISA</span>';
  if (r[5] === 1 || r[8] === 'remote') b += '<span class="tag tag-remote">REMOTE</span>';
  else if (r[8] === 'hybrid') b += '<span class="tag">HYBRID</span>';
  return b;
}

function render() {
  if (!form || !list || !pager) return;
  const f = read();
  const found = apply(f);
  const pages = Math.max(1, Math.ceil(found.length / PAGE));
  page = Math.min(page, pages);
  const start = (page - 1) * PAGE;
  const slice = found.slice(start, start + PAGE);
  if (count) count.textContent = fmt(found.length);

  list.innerHTML = slice.length
    ? `<ol class="joblist" start="${start + 1}" style="counter-reset: job ${start}">${slice
        .map((r) => {
          const href = jobPath({ id: r[0], title: r[1], company: r[2] });
          return `<li><a class="jl-t" href="${esc(href)}">${esc(r[1])}</a>${badges(r)}<br><span class="jl-m"><b>${esc(r[2])}</b> · ${esc(place(r))} · ${ago(r[7])}</span></li>`;
        })
        .join('')}</ol>`
    : `<p class="empty">No jobs match. Try fewer words, another country, or untick a filter.</p>`;

  const btn = (label: string, to: number, off: boolean) =>
    `<button type="button" class="btn" data-page="${to}"${off ? ' disabled' : ''}>${label}</button>`;
  pager.innerHTML = `${btn('« Previous', page - 1, page === 1)}<span>${found.length ? `${fmt(start + 1)}–${fmt(start + slice.length)} of ${fmt(found.length)}` : 'No jobs'} · page ${page} of ${pages}</span>${btn('Next »', page + 1, page === pages)}`;

  // Keep the address in step, so a search can be shared or bookmarked.
  const q = new URLSearchParams();
  if (f.q) q.set('q', f.q);
  if (!presetCountry && f.country) q.set('country', f.country);
  if (f.days) q.set('days', String(f.days));
  if (!presetVisa && f.visa) q.set('visa', '1');
  if (f.remote) q.set('remote', '1');
  if (f.salary) q.set('salary', '1');
  if (f.company) q.set('company', f.company);
  if (page > 1) q.set('page', String(page));
  const qs = q.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
}

if (board && form && list && pager) {
  let timer = 0;
  const again = () => {
    page = 1;
    clearTimeout(timer);
    timer = window.setTimeout(render, 120);
  };
  form.addEventListener('input', again);
  form.addEventListener('change', again);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    page = 1;
    render();
  });
  pager.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-page]');
    if (!b || b.disabled) return;
    page = Number(b.dataset.page);
    render();
    board.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  load()
    .then((r) => {
      rows = r;
      if (rows.length) render();
    })
    .catch(() => {
      /* the server-rendered list stays */
    });
}
