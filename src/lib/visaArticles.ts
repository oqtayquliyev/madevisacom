// Turns a country's visa guide (src/data/visa/countries/*.ts — already
// checked against official sources) into a long-form article for the blog.
// Nothing is invented: every fact comes from the guide, and the article
// links back to the interactive country page and the official sources.

import { applicationStepsFor, documentsFor, destinationPath, REQUIREMENT_LABEL, ROUTE_KIND_LABEL, CANDIDATE_COVER_THIRD_PERSON, type VisaGuide } from '@/data/visa';
import type { ArticleInput } from '@/lib/articles';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const years = (n: number | null) => (n == null ? 'no fixed period' : n === 0 ? 'on arrival (some routes)' : `${n} year${n === 1 ? '' : 's'}`);
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const reviewedLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return y && m ? new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : ym;
};

export function visaGuideArticle(g: VisaGuide, year = new Date().getFullYear()): ArticleInput {
  const work = g.routes.filter((r) => r.kind === 'work' || r.kind === 'talent');
  const other = g.routes.filter((r) => !(r.kind === 'work' || r.kind === 'talent'));
  const ordered = [...work, ...other];
  const topNames = ordered.slice(0, 3).map((r) => r.name);
  const employerRoutes = g.routes.filter((r) => r.employer);
  const dual = g.dualCitizenship === 'yes' ? 'allowed' : g.dualCitizenship === 'limited' ? 'allowed in some cases' : 'generally not allowed';

  const title = `${g.name} work visas in ${year}: routes, costs and the path to residence`;
  const excerpt = `${g.routes.length} ways to live and work in ${g.name} — including ${list(topNames)} — with fees, validity, what each asks for, and the years to permanent residence and citizenship.`;

  const html: string[] = [];
  html.push(`<p>${esc(g.blurb)} This guide covers every main route to live and work in ${esc(g.name)}, what each one asks of you, what it costs and how long until you can settle for good.</p>`);
  if (g.freeMovement) {
    html.push(`<p class="note">Citizens of the EU, EEA and Switzerland can live and work in ${esc(g.name)} without a visa. The routes below are for everyone else.</p>`);
  }
  html.push(
    `<div class="stat-grid">` +
      `<div class="stat"><strong>${g.routes.length}</strong><small>visa routes</small></div>` +
      `<div class="stat"><strong>${g.prYears ?? '—'}</strong><small>years to permanent residence</small></div>` +
      `<div class="stat"><strong>${g.citizenshipYears ?? '—'}</strong><small>years to citizenship</small></div>` +
      `<div class="stat"><strong>${g.dualCitizenship === 'yes' ? 'Yes' : g.dualCitizenship === 'limited' ? 'Limited' : 'No'}</strong><small>dual citizenship</small></div>` +
      `</div>`
  );

  html.push(`<h2>Do you need a visa for ${esc(g.name)}?</h2><p>${esc(g.shortStay)}</p>`);

  html.push(`<h2>The main routes at a glance</h2>`);
  html.push(
    `<table><thead><tr><th>Route</th><th>Type</th><th>Valid for</th><th>Fee</th><th>Leads to residence</th></tr></thead><tbody>` +
      ordered
        .map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(ROUTE_KIND_LABEL[r.kind] ?? r.kind)}</td><td>${esc(r.validity)}</td><td>${esc(r.fee ?? '—')}</td><td>${r.leadsToPR ? 'Yes' : 'No'}</td></tr>`)
        .join('') +
      `</tbody></table>`
  );

  html.push(`<h2>Each route in detail</h2>`);
  for (const r of ordered) {
    const asks = r.requires.map((q, i) => { const t = REQUIREMENT_LABEL[q] ?? q; return i === 0 ? t : t.charAt(0).toLowerCase() + t.slice(1); });
    html.push(`<h3>${esc(r.name)}</h3><p>${esc(r.summary)}</p><ul>`);
    html.push(`<li><strong>Valid for:</strong> ${esc(r.validity)}</li>`);
    if (r.fee) html.push(`<li><strong>Fee:</strong> ${esc(r.fee)}</li>`);
    if (asks.length) html.push(`<li><strong>What it asks for:</strong> ${esc(list(asks))}</li>`);
    html.push(`<li><strong>Counts toward permanent residence:</strong> ${r.leadsToPR ? 'yes' : 'no'}</li>`);
    html.push(`</ul>`);
    if (r.note) html.push(`<p>${esc(r.note)}</p>`);
    html.push(`<p><a href="${esc(r.url)}" rel="nofollow noopener" target="_blank">Official page for the ${esc(r.name)}</a></p>`);
  }

  html.push(`<h2>How to apply</h2><ol>${applicationStepsFor(g).map((s) => `<li><strong>${esc(s.title)}.</strong> ${esc(s.detail)}</li>`).join('')}</ol>`);
  html.push(`<h2>Documents you’ll usually need</h2><ul>${documentsFor(g).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`);

  html.push(`<h2>Permanent residence and citizenship</h2>`);
  html.push(`<p><strong>Permanent residence:</strong> ${esc(years(g.prYears))}. ${esc(g.prNote)}</p>`);
  html.push(`<p><strong>Citizenship:</strong> ${esc(years(g.citizenshipYears))}. ${esc(g.citizenshipNote)}</p>`);
  html.push(`<p><strong>Dual citizenship:</strong> ${dual}.</p>`);

  if (employerRoutes.length) {
    html.push(`<h2>For employers: hiring someone on these routes</h2>`);
    for (const r of employerRoutes) {
      const e = r.employer!;
      html.push(`<h3>${esc(r.name)}</h3><ul>`);
      html.push(`<li><strong>Sponsor licence needed:</strong> ${e.licenceNeeded ? 'yes' : 'no'}${e.licenceNote ? ` — ${esc(e.licenceNote)}` : ''}</li>`);
      html.push(`<li><strong>What usually happens:</strong> ${esc(e.timeline)}</li>`);
      if (e.employerCosts) html.push(`<li><strong>Employer costs:</strong> ${esc(e.employerCosts)}</li>`);
      if (e.candidateMayCover.length) html.push(`<li><strong>Costs the candidate may cover:</strong> ${esc(list(e.candidateMayCover.map((c) => (CANDIDATE_COVER_THIRD_PERSON[c] ?? c).toLowerCase())))}</li>`);
      html.push(`</ul>`);
    }
  }

  html.push(`<h2>Official sources</h2><ul>${g.officialLinks.map((l) => `<li><a href="${esc(l.url)}" rel="nofollow noopener" target="_blank">${esc(l.label)}</a></li>`).join('')}</ul>`);
  html.push(
    `<p class="note">Checked against official sources in ${esc(reviewedLabel(g.reviewed))}. Visa rules change — always confirm with the official source before you apply. This is general information, not legal advice.</p>`
  );
  html.push(
    `<p>See which of these routes fit your passport, experience and education on the <a href="${destinationPath(g)}">${esc(g.name)} visa page</a>, and browse <a href="/jobs">live jobs from company career pages</a> — filter for visa sponsorship to see employers that say they sponsor.</p>`
  );

  return {
    slug: `${g.slug}-work-visa-guide-${year}`,
    title,
    excerpt: excerpt.slice(0, 380),
    body_html: html.join('\n'),
    category: 'visas',
    tags: ['visa', g.slug, g.region.toLowerCase()],
    country_code: g.code,
    source: 'auto-visa',
    auto_key: `visa:${g.code}:${year}`,
    author_name: 'MadeVisa Editorial',
    status: 'published',
  };
}
