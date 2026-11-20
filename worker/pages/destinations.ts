import { dialog, esc, fmt, icon, layout, win } from '../html';
import { stats, type Env } from '../db';
import { visaGuides, visaGuideBySlug, applicationStepsFor, documentsFor, REQUIREMENT_LABEL, ROUTE_KIND_LABEL } from '../../content/visa/index';
import { countrySlug } from '../parts';

export async function destinations(env: Env): Promise<Response> {
  const s = await stats(env);
  const count = new Map(s.byCountry.map(([c, n, v]) => [c, [n, v]]));
  const regions = new Map<string, typeof visaGuides>();
  for (const g of visaGuides) (regions.get(g.region) ?? regions.set(g.region, []).get(g.region)!).push(g);

  const folders = [...regions.entries()]
    .map(
      ([region, list]) => `<h2 class="explorer-h">${esc(region)}</h2><ul class="explorer">${list
        .map((g) => {
          const [n, v] = count.get(g.code) ?? [0, 0];
          return `<li><a href="/destinations/${g.slug}">${icon('folder', 32)}<span class="ex-name">${esc(g.name)}</span><span class="ex-meta">${g.routes.length} routes · ${fmt(n)} jobs${v ? ` · ${fmt(v)} visa` : ''}</span></a></li>`;
        })
        .join('')}</ul>`
    )
    .join('');

  const body = `<div class="center-wide">${win(
    'Work Visas by Country',
    `<p class="lead">The main work and residence routes for ${visaGuides.length} countries: what each asks for, how long until permanent residence, and the official links. Open a country.</p>${folders}`,
    { heading: 'h1', status: [`${visaGuides.length} countries`, 'Checked against official sources'] }
  )}</div>`;

  return layout({
    title: 'Work visas by country — routes, requirements and official links | MadeVisa',
    description: `Work visa and residence routes for ${visaGuides.length} countries — Germany, the Netherlands, the UK, Canada, the US and more: requirements, fees, time to permanent residence and official sources.`,
    path: '/destinations',
    active: '/destinations',
    body,
  });
}

export async function destination(env: Env, slug: string): Promise<Response | null> {
  const g = visaGuideBySlug.get(slug);
  if (!g) return null;
  const s = await stats(env);
  const c = s.byCountry.find((x) => x[0] === g.code);
  const yes = (b: boolean) => (b ? 'Yes' : 'No');

  const overview = `<dl class="facts cols">
<div class="fact"><dt>Region</dt><dd>${esc(g.region)}</dd></div>
<div class="fact"><dt>Languages</dt><dd>${esc(g.languages)}</dd></div>
<div class="fact"><dt>Currency</dt><dd>${esc(g.currency)}</dd></div>
<div class="fact"><dt>Schengen</dt><dd>${yes(g.schengen)}</dd></div>
<div class="fact"><dt>EU free movement</dt><dd>${yes(g.freeMovement)}</dd></div>
<div class="fact"><dt>Permanent residence</dt><dd>${g.prYears === null ? 'No fixed period' : g.prYears === 0 ? 'Some routes on arrival' : `About ${g.prYears} years`}</dd></div>
<div class="fact"><dt>Citizenship</dt><dd>${g.citizenshipYears === null ? 'No fixed period' : `About ${g.citizenshipYears} years`}</dd></div>
<div class="fact"><dt>Dual citizenship</dt><dd>${g.dualCitizenship === 'yes' ? 'Allowed' : g.dualCitizenship === 'limited' ? 'Limited' : 'Not allowed'}</dd></div>
</dl><p class="small">${esc(g.prNote)}</p><p class="small">${esc(g.citizenshipNote)}</p>`;

  const routes = g.routes
    .map(
      (r) => `<fieldset class="route"><legend>${esc(r.name)} <span class="tag">${esc(ROUTE_KIND_LABEL[r.kind] ?? r.kind)}</span>${r.leadsToPR ? ' <span class="tag tag-visa">LEADS TO PR</span>' : ''}</legend>
<p>${esc(r.summary)}</p>
<dl class="facts"><div class="fact"><dt>Valid for</dt><dd>${esc(r.validity)}</dd></div>${r.fee ? `<div class="fact"><dt>Fee</dt><dd>${esc(r.fee)}</dd></div>` : ''}</dl>
${r.requires.length ? `<p class="req-h">What it asks for:</p><ul class="checks">${r.requires.map((q) => `<li>${esc(REQUIREMENT_LABEL[q] ?? q)}</li>`).join('')}</ul>` : ''}
${r.note ? `<p class="small">${esc(r.note)}</p>` : ''}
${r.employer ? `<details><summary>What the employer has to do</summary><ol>${r.employer.steps.map((st) => `<li>${esc(st.text)}${st.effort ? ` <span class="small">(${esc(st.effort)})</span>` : ''}</li>`).join('')}</ol><p class="small">${esc(r.employer.timeline)}</p>${r.employer.employerCosts ? `<p class="small">${esc(r.employer.employerCosts)}</p>` : ''}</details>` : ''}
<p><a href="${esc(r.url)}" target="_blank" rel="noopener">Official page »</a></p></fieldset>`
    )
    .join('');

  const steps = `<ol class="steps">${applicationStepsFor(g).map((st) => `<li><b>${esc(st.title)}</b><br>${esc(st.detail)}</li>`).join('')}</ol>`;
  const docs = `<ul class="checks">${documentsFor(g).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`;
  const links = `<ul class="tree">${g.officialLinks.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a></li>`).join('')}</ul>`;

  const jobsBox = dialog(
    `Jobs in ${esc(g.name)}`,
    'jobs',
    `<p><b>${fmt(c?.[1] ?? 0)}</b> fresh jobs in ${esc(g.name)} right now${c?.[2] ? `, <b>${fmt(c[2])}</b> state visa sponsorship` : ''}.</p>`,
    `<a class="btn btn-default" href="/jobs/in/${countrySlug(g.code)}">See the jobs</a>${c?.[2] ? `<a class="btn" href="/jobs/in/${countrySlug(g.code)}?visa=1">Visa only</a>` : ''}`
  );

  const body = `<div class="guide-wrap"><div class="guide-main">${win(
    `${esc(g.name)} — work visa guide`,
    `<h1 class="job-h1">Working in ${esc(g.name)}: visas and routes</h1><p class="lead">${esc(g.blurb)}</p>
<fieldset><legend>At a glance</legend>${overview}</fieldset>
<fieldset><legend>When do you need a visa?</legend><p>${esc(g.shortStay)}</p></fieldset>
<h2 class="sec-h">${icon('visa')} Routes (${g.routes.length})</h2>${routes}
<h2 class="sec-h">${icon('doc')} How to apply</h2>${steps}
<h2 class="sec-h">${icon('folder')} Documents you’ll usually need</h2>${docs}
<h2 class="sec-h">${icon('globe')} Official sources</h2>${links}`,
    { cls: 'white', toolbar: `<a href="/destinations">« All countries</a>`, status: [`Last checked ${esc(g.reviewed)}`, 'Not legal advice — confirm on the official site'] }
  )}</div><aside class="guide-side">${jobsBox}${dialog('Rules change', 'warn', '<p>This guide is general information, checked against official sources on the date shown. Always confirm on the official site or with a licensed adviser before you apply.</p>')}</aside></div>`;

  return layout({
    title: `${g.name} work visa — routes, requirements and time to PR | MadeVisa`,
    description: `How to work in ${g.name}: ${g.routes.map((r) => r.name).slice(0, 4).join(', ')}. Requirements, fees, documents, time to permanent residence and official links.`,
    path: `/destinations/${g.slug}`,
    active: '/destinations',
    body,
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'Article', headline: `Working in ${g.name}: visas and routes`, dateModified: `${g.reviewed}-01`, author: { '@type': 'Organization', name: 'MadeVisa' } }],
  });
}
