// CV match, entirely in the browser. The CV is read here (PDF via pdf.js, Word/ODT via unzip),
// saved in localStorage, and compared with the job ad using the same engine the old site used
// (lib/cv). Nothing is uploaded.

import { unzipSync, strFromU8 } from 'fflate';
import { parseCv, type CvProfile } from '../lib/cv/cvProfile';
import { parseJob } from '../lib/cv/jobProfile';
import { matchCv, type MatchResult } from '../lib/cv/match';
import { skillName } from '../lib/cv/skills';

const KEY = 'mv:cv';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_CHARS = 60_000;

type Stored = { name: string; text: string; at: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function readStored(): Stored | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && typeof v.text === 'string' && v.text ? (v as Stored) : null;
  } catch {
    return null;
  }
}
function save(cv: Stored | null) {
  try {
    if (cv) localStorage.setItem(KEY, JSON.stringify(cv));
    else localStorage.removeItem(KEY);
  } catch {
    alert('Your browser would not let MadeVisa save the CV (private mode or storage full).');
  }
}

// ---------------------------------------------------------------------------
// Reading files
// ---------------------------------------------------------------------------

function tidy(text: string): string {
  return text.replace(/\r/g, '').replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_CHARS);
}

let pdfjsReady: Promise<any> | null = null;
function loadPdfJs(): Promise<any> {
  pdfjsReady ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/js/pdfjs/pdf.min.js';
    s.onload = () => {
      const lib = (window as any).pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc = '/js/pdfjs/pdf.worker.min.js';
      resolve(lib);
    };
    s.onerror = () => reject(new Error('Could not load the PDF reader.'));
    document.head.appendChild(s);
  });
  return pdfjsReady;
}

async function pdfText(buf: ArrayBuffer): Promise<string> {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 15); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let last = -1;
    let line = '';
    const lines: string[] = [];
    for (const item of content.items as { str: string; transform: number[] }[]) {
      const y = Math.round(item.transform[5]);
      if (last !== -1 && Math.abs(y - last) > 2) {
        lines.push(line);
        line = '';
      }
      line += (line && !line.endsWith(' ') ? ' ' : '') + item.str;
      last = y;
    }
    lines.push(line);
    pages.push(lines.join('\n'));
  }
  return pages.join('\n\n');
}

function zipXmlText(buf: ArrayBuffer, file: string, para: RegExp): string {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === file });
  const xml = files[file] ? strFromU8(files[file]) : '';
  return xml
    .replace(para, '\n')
    .replace(/<w:tab\/>|<text:tab\/>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function fileText(file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error('That file is larger than 5 MB.');
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const buf = await file.arrayBuffer();
  if (ext === 'pdf' || file.type === 'application/pdf') return pdfText(buf);
  if (ext === 'docx') return zipXmlText(buf, 'word/document.xml', /<\/w:p>/g);
  if (ext === 'odt') return zipXmlText(buf, 'content.xml', /<\/text:(p|h)>/g);
  const text = new TextDecoder().decode(buf);
  if (ext === 'rtf') return text.replace(/\\par[d]?/g, '\n').replace(/\{\*?\\[^{}]+}|[{}]|\\[a-z]+-?\d* ?/gi, '');
  if (ext === 'doc') throw new Error('Old .doc files can’t be read in the browser. Save it as PDF or .docx and try again.');
  return text;
}

// ---------------------------------------------------------------------------
// Showing it
// ---------------------------------------------------------------------------

function cvSummary(cv: Stored, p: CvProfile): string {
  const skills = Object.keys(p.skills).slice(0, 24).map((id) => `<span class="chip">${esc(skillName(id))}</span>`).join('');
  const langs = p.languages.map((l) => esc(l.name)).join(', ');
  return `<fieldset><legend>Your CV: ${esc(cv.name)}</legend>
<dl class="facts">
${p.titles[0] ? `<div class="fact"><dt>Latest role</dt><dd>${esc(p.titles[0])}</dd></div>` : ''}
${p.years ? `<div class="fact"><dt>Experience</dt><dd>About ${Math.round(p.years)} years</dd></div>` : ''}
${langs ? `<div class="fact"><dt>Languages</dt><dd>${langs}</dd></div>` : ''}
<div class="fact"><dt>Skills found</dt><dd>${Object.keys(p.skills).length}</dd></div>
</dl>${skills ? `<div class="chips">${skills}</div>` : '<p class="small">No skills recognised — is this the right file?</p>'}</fieldset>`;
}

function matchHtml(m: MatchResult): string {
  const cls = m.score >= 65 ? 'good' : m.score >= 45 ? 'mid' : 'low';
  const parts = m.parts
    .filter((p) => p.score !== null)
    .map((p) => `<tr><td>${esc(p.name)}</td><td><b>${p.score}</b> / 100</td></tr>`)
    .join('');
  const matched = m.skills.matched.slice(0, 12).map((s) => `<span class="chip ok">✓ ${esc(s)}</span>`).join('');
  const missing = m.skills.missing.slice(0, 10).map((s) => `<span class="chip no">✗ ${esc(s.name)}${s.required ? '' : ' (nice)'}</span>`).join('');
  const fixes = m.fixes.slice(0, 4).map((f) => `<li>${esc(f)}</li>`).join('');
  return `<div class="match ${cls}"><p class="match-score">Your match: <b>${m.score}%</b> — ${esc(m.label)}</p>
${m.capReason ? `<p class="small">${esc(m.capReason)}</p>` : ''}
<table class="grid plain parts"><tbody>${parts}</tbody></table>
${matched ? `<p class="req-h">Skills you have:</p><div class="chips">${matched}</div>` : ''}
${missing ? `<p class="req-h">Asked for, not in your CV:</p><div class="chips">${missing}</div>` : ''}
${fixes ? `<details><summary>How to improve your CV for this job</summary><ul>${fixes}</ul></details>` : ''}
<p class="small"><a href="/cv-match">Change CV</a></p></div>`;
}

function pickerHtml(id: string, label: string): string {
  return `<div class="field-row-stacked"><label for="${id}">${label}</label><input type="file" id="${id}" accept=".pdf,.docx,.odt,.rtf,.txt,.md"></div><p class="small">Stays in your browser — never uploaded.</p>`;
}

async function addFromFile(file: File, status: HTMLElement): Promise<Stored | null> {
  status.innerHTML = '<p><b>Reading your CV…</b> please wait.</p>';
  try {
    const text = tidy(await fileText(file));
    if (text.length < 200) throw new Error('Not much text could be read from this file. If it’s a scanned PDF, use the paste option instead.');
    const cv = { name: file.name, text, at: new Date().toISOString() };
    save(cv);
    return cv;
  } catch (e) {
    status.innerHTML = `<p class="err">${esc(e instanceof Error ? e.message : 'That file could not be read.')}</p>`;
    return null;
  }
}

// /cv-match
function wizard(app: HTMLElement) {
  const show = () => {
    const cv = readStored();
    if (!cv) return;
    const p = parseCv(cv.text);
    app.innerHTML = `<h2 class="wiz-h">Your CV is ready</h2><p>Open any job: its page now shows your match.</p>${cvSummary(cv, p)}
<p class="btn-row"><a class="btn btn-primary" href="/">Browse jobs ▶</a><label class="btn" for="cv-file">Replace CV</label><button type="button" class="btn" id="cv-remove">Remove my CV</button></p>
<input type="file" id="cv-file" class="sr-only" accept=".pdf,.docx,.odt,.rtf,.txt,.md"><div id="cv-status"></div>`;
    bind();
  };
  const bind = () => {
    const input = app.querySelector<HTMLInputElement>('#cv-file');
    const status = app.querySelector<HTMLElement>('#cv-status') ?? app.appendChild(Object.assign(document.createElement('div'), { id: 'cv-status' }));
    input?.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (f && (await addFromFile(f, status))) show();
    });
    app.querySelector('#cv-remove')?.addEventListener('click', () => {
      save(null);
      location.reload();
    });
    app.querySelector('#cv-paste-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      app.querySelector<HTMLElement>('#cv-paste')!.hidden = false;
    });
    app.querySelector('#cv-paste-go')?.addEventListener('click', () => {
      const text = tidy(app.querySelector<HTMLTextAreaElement>('#cv-text')?.value ?? '');
      if (text.length < 200) {
        status.innerHTML = '<p class="err">That’s quite short for a CV — paste the whole text.</p>';
        return;
      }
      save({ name: 'Pasted CV', text, at: new Date().toISOString() });
      show();
    });
  };
  if (readStored()) show();
  else bind();
}

// Job pages
function jobPanel(box: HTMLElement) {
  const desc = document.getElementById('job-desc');
  const title = box.dataset.title ?? '';
  const run = () => {
    const cv = readStored();
    if (!cv) {
      box.innerHTML = `<p>See how well your CV fits this job.</p>${pickerHtml('cv-quick', 'Add your CV')}<div id="cv-status"></div>`;
      const input = box.querySelector<HTMLInputElement>('#cv-quick')!;
      input.addEventListener('change', async () => {
        const f = input.files?.[0];
        if (f && (await addFromFile(f, box.querySelector('#cv-status')!))) run();
      });
      return;
    }
    try {
      const profile = parseCv(cv.text);
      const job = parseJob({ title, description: desc?.innerHTML ?? '' });
      box.innerHTML = matchHtml(matchCv(profile, cv.text, job));
    } catch {
      box.innerHTML = '<p>Your match couldn’t be worked out for this job.</p>';
    }
  };
  run();
}

const app = document.getElementById('cv-app');
if (app) wizard(app);
const panel = document.getElementById('cv-match');
if (panel) jobPanel(panel);
