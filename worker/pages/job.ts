import { ago, button, dialog, esc, icon, layout, SITE, win } from '../html';
import { job, sameCompany, type Env, type JobRow } from '../db';
import { jobPath, JOB_ID_RE } from '../../shared/jobs';
import { countryName, guideByCode, placeOf, jobList, visaWord } from '../parts';

/** /jobs/<company>/<title>-<id> and the old one-part form /jobs/<slug>-<id>. */
export async function jobPage(env: Env, url: URL, lastSegment: string): Promise<Response> {
  const id = lastSegment.split('-').pop() ?? '';
  const j = JOB_ID_RE.test(id) ? await job(env, id) : null;
  if (!j) return closed(env, url);
  const canonical = jobPath(j);
  if (decodeURIComponent(url.pathname) !== canonical) return Response.redirect(`${url.origin}${canonical}`, 301);

  const place = placeOf(j);
  const guide = j.country ? guideByCode.get(j.country) : undefined;
  const fact = (label: string, value: string | null | undefined) =>
    value ? `<div class="fact"><dt>${label}</dt><dd>${value}</dd></div>` : '';
  const arrangement = j.arrangement ? j.arrangement.replace('onsite', 'On-site').replace(/^./, (c) => c.toUpperCase()) : j.remote ? 'Remote' : null;

  const apply = (where: string) =>
    `<a class="btn-apply" href="${esc(j.url)}" target="_blank" rel="noopener nofollow" data-apply="${where}"><span>Apply now</span><small>on ${esc(j.company)}’s careers page ▶</small></a>`;
  const toolbar = `${apply('top')}
<a class="btn" href="/">◀ All jobs</a><a class="btn" href="/?company=${encodeURIComponent(j.company)}">More at ${esc(j.company)}</a>
<button class="btn" type="button" data-copy="${esc(SITE + canonical)}">Copy link</button>`;

  const host = (() => {
    try {
      return new URL(j.url).hostname;
    } catch {
      return 'company site';
    }
  })();
  const description = j.description
    ? `<div class="notepad" id="job-desc">${j.description.replace(/<a /g, '<a rel="nofollow noopener" target="_blank" ')}</div>`
    : `<div class="notepad" id="job-desc"><p>The full text of this ad is on the company’s page.</p></div>`;

  const main = win(
    `${esc(j.title)} — ${esc(j.company)}`,
    `<h1 class="job-h1">${esc(j.title)}</h1><p class="job-sub">${Date.now() - Date.parse(j.posted_at) < 6 * 3600_000 ? '<span class="tag tag-new">NEW</span> ' : ''}<b>${esc(j.company)}</b> · ${esc(place)} · posted ${esc(ago(j.posted_at))}</p>${description}
<div class="apply-bottom">${apply('bottom')}<p class="small">You apply directly with ${esc(j.company)} — on their own job page (${esc(host)}). MadeVisa doesn’t edit ads; check the details there before applying.</p></div>`,
    { icon: 'doc', cls: 'white w-job', toolbar, status: [`Posted ${esc(j.posted_at.slice(0, 10))}`, j.salary ? 'Salary stated' : 'Salary not stated', j.visa === 'offered' ? 'Visa: offered' : 'Visa: see ad'] }
  );

  const props = win(
    'Properties',
    `<fieldset><legend>Visa sponsorship</legend><p class="visa-line">${visaWord(j.visa)}</p></fieldset>
<fieldset><legend>The job</legend><dl class="facts">
${fact('Location', esc(j.location || place))}
${fact('Country', j.country ? esc(countryName.get(j.country) ?? j.country) : null)}
${fact('Work', arrangement ? esc(arrangement) : null)}
${fact('Type', j.employment ? esc(j.employment) : null)}
${fact('Experience', j.experience ? esc(j.experience) : null)}
${fact('Salary', j.salary ? esc(j.salary) : null)}
${fact('Team', j.department ? esc(j.department) : null)}
${fact('Posted', esc(ago(j.posted_at)))}
</dl></fieldset>`,
    { icon: 'info', cls: 'w-props' }
  );

  const cv = win(
    'CV Match',
    `<div id="cv-match" data-title="${esc(j.title)}"><p>Add your CV to see how well it fits this job. It stays in your browser.</p><p><a class="btn" href="/cv-match">Add my CV</a></p></div>`,
    { icon: 'cv', cls: 'w-cv' }
  );

  const more = guide
    ? dialog(`Work visas — ${esc(guide.name)}`, 'globe', `<p>${esc(guide.blurb)}</p><p><a href="/destinations/${guide.slug}">See the visa routes »</a></p>`)
    : '';

  const others = await sameCompany(env, j.company, j.id, 6);
  const similar = others.length
    ? win(`More jobs at ${esc(j.company)}`, jobList(others), { cls: 'white' })
    : '';

  const ld = jobPostingLd(j, canonical);
  return layout({
    title: `${j.title} at ${j.company} — ${place} | MadeVisa`,
    description: `${j.title} at ${j.company}, ${place}.${j.visa === 'offered' ? ' Visa sponsorship stated.' : ''} Posted ${ago(j.posted_at)}. Read the ad, check your CV match and apply on the company’s site.`,
    path: canonical,
    active: '/',
    body: `<div class="job-wrap"><div class="job-main">${main}${similar}</div><aside class="job-side xp-side">${props}${cv}${more}${dialog('Before you apply', 'warn', '<p>MadeVisa doesn’t issue visas, act as an immigration adviser or guarantee a job or a visa. You apply on the company’s own site. Never pay anyone to apply for a job.</p>')}</aside></div>`,
    jsonLd: [ld],
    scripts: ['/js/cv.js'],
  });
}

function jobPostingLd(j: JobRow, path: string) {
  const plain = (j.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: j.title,
    description: j.description || plain || j.title,
    datePosted: j.posted_at,
    validThrough: new Date(Date.parse(j.posted_at) + 45 * 86_400_000).toISOString(),
    hiringOrganization: { '@type': 'Organization', name: j.company },
    url: `${SITE}${path}`,
    directApply: false,
  };
  if (j.country || j.city) {
    ld.jobLocation = { '@type': 'Place', address: { '@type': 'PostalAddress', ...(j.city ? { addressLocality: j.city } : {}), ...(j.country ? { addressCountry: j.country } : {}) } };
  }
  if (j.remote) {
    ld.jobLocationType = 'TELECOMMUTE';
    if (j.country) ld.applicantLocationRequirements = { '@type': 'Country', name: countryName.get(j.country) ?? j.country };
  }
  if (j.employment) {
    const map: Record<string, string> = { 'Full time': 'FULL_TIME', 'Part time': 'PART_TIME', Internship: 'INTERN', 'Contract / Freelance': 'CONTRACTOR' };
    if (map[j.employment]) ld.employmentType = map[j.employment];
  }
  return ld;
}

/** A job that has closed (or an old link from before November 2026). 410 tells search engines it's gone. */
export async function closed(_env: Env, url: URL): Promise<Response> {
  const guess = decodeURIComponent(url.pathname.split('/')[2] ?? '').replace(/-/g, ' ');
  const body = `<div class="center-col">${dialog(
    'Job not found',
    'error',
    `<h1 class="dialog-h1">This job has closed</h1><p>The company took this job down, or it’s an old link. MadeVisa only keeps jobs that are still on the company’s page and were posted in the last two weeks.</p>`,
    `${guess && url.pathname.split('/').length > 3 ? button(`Jobs at “${esc(guess)}”`, `/?q=${encodeURIComponent(guess)}`) : ''}${button('Browse fresh jobs', '/', 'btn-default')}`
  )}</div>`;
  return layout({ title: 'This job has closed | MadeVisa', description: 'This job is no longer available.', path: url.pathname, body, noindex: true, status: 410, active: '/' });
}
