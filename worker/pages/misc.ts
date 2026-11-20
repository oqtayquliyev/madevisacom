import { button, dialog, esc, icon, layout, win } from '../html';
import { textPages } from '../../content/pages';
import { BOOK_INSIDE, DEFAULT_BOOK_PROMO, GENERAL_INSIGHT } from '../../content/bookPromo';

/** Where "Buy the book" goes. Change it to the book's own Gumroad link if it has one. */
export const BOOK_URL = 'https://madevisa.gumroad.com/';
export const BOOK_TITLE = 'How to Survive in the 2026–2027 Job Market';

export function cvMatch(): Response {
  const wizard = `<section class="window wizard" aria-labelledby="cv-h">
<div class="title-bar"><h1 class="title-bar-text" id="cv-h">${icon('cv')}<span>CV Match Setup Wizard</span></h1><div class="title-bar-controls" aria-hidden="true"><span class="tb-btn">×</span></div></div>
<div class="window-body wizard-body"><div class="wizard-art" aria-hidden="true">${icon('cv', 64)}</div>
<div class="wizard-main" id="cv-app">
  <h2 class="wiz-h">Welcome to CV Match</h2>
  <p>Add your CV once. Every job page then shows how well it fits: skills, role, experience, languages and education — with the reasons.</p>
  <p><b>Your CV never leaves this computer.</b> It is read and saved in your browser only. MadeVisa never sees it.</p>
  <div class="field-row-stacked"><label for="cv-file">Your CV (PDF, Word .docx, .odt, .rtf or .txt — up to 5 MB)</label><input type="file" id="cv-file" accept=".pdf,.docx,.odt,.rtf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"></div>
  <p class="small">Or paste the text: <a href="#" id="cv-paste-link">paste CV text</a></p>
  <div id="cv-paste" hidden><label for="cv-text" class="sr-only">CV text</label><textarea id="cv-text" rows="8" placeholder="Paste your CV here…"></textarea><p><button type="button" class="btn" id="cv-paste-go">Use this text</button></p></div>
  <noscript><p>CV match needs JavaScript.</p></noscript>
</div></div>
<div class="wizard-foot"><a class="btn" href="/jobs">Browse jobs</a></div></section>`;
  return layout({
    title: 'CV match — see how well your CV fits each job | MadeVisa',
    description: 'Add your CV once and see your match on every job abroad: skills, experience, languages and education. Your CV stays in your browser. Free.',
    path: '/cv-match',
    active: '/cv-match',
    body: `<div class="center-col">${wizard}</div>`,
    scripts: ['/js/cv.js'],
  });
}

export function book(): Response {
  const promo = DEFAULT_BOOK_PROMO;
  const reviews = promo.reviews
    .filter((r) => r.published)
    .map((r) => `<fieldset><legend>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} ${esc(r.name)} · ${esc(r.profession)}</legend><p>${esc(r.text)}</p></fieldset>`)
    .join('');
  const pages = [1, 2, 3, 4, 5].map((n) => `<img src="/book-preview/page-${n}.webp" alt="Preview page ${n}" loading="lazy" width="180">`).join('');

  const body = `<div class="book-wrap">${win(
    `${BOOK_TITLE}.exe`,
    `<div class="book-top"><img class="book-cover" src="/book-cover.webp" alt="Book cover: ${esc(BOOK_TITLE)}" width="240">
<div><h1 class="job-h1">${esc(BOOK_TITLE)}</h1>
<p class="stars" aria-label="Rated ${promo.rating} out of 5">${'★'.repeat(Math.round(promo.rating))}${'☆'.repeat(5 - Math.round(promo.rating))} <span class="small">${promo.rating} · ${promo.ratingCount} reviews</span></p>
<p>${esc(GENERAL_INSIGHT)}</p>
<fieldset><legend>What’s inside</legend><ul class="checks">${BOOK_INSIDE.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></fieldset>
<p><a class="btn btn-primary btn-big" href="${BOOK_URL}" target="_blank" rel="noopener">${icon('book')} Get the book</a></p>
<p class="small">Sold and delivered by Gumroad. Digital download (PDF).</p></div></div>
<h2 class="sec-h">Preview</h2><div class="book-pages sunken">${pages}</div>
<h2 class="sec-h">Reviews</h2>${reviews}`,
    { icon: 'book' }
  )}</div>`;

  return layout({
    title: `${BOOK_TITLE} — Book | MadeVisa`,
    description: `${BOOK_TITLE}: how AI is changing 40+ industries, which responsibilities stay human, and how to adapt with remote work, freelancing and your own digital product.`,
    path: '/book',
    active: '/book',
    image: 'https://madevisa.com/book-cover.jpg',
    body,
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'Book', name: BOOK_TITLE, author: { '@type': 'Organization', name: 'MadeVisa' }, image: 'https://madevisa.com/book-cover.jpg', aggregateRating: { '@type': 'AggregateRating', ratingValue: promo.rating, reviewCount: promo.ratingCount } }],
  });
}

export function textPage(slug: string): Response | null {
  const p = textPages[slug];
  if (!p) return null;
  const sections = p.sections
    .map(
      (s) => `<h2 class="sec-h">${esc(s.heading)}</h2>${(s.paragraphs ?? []).map((x) => `<p>${x}</p>`).join('')}${s.bullets ? `<ul class="checks">${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}`
    )
    .join('');
  const others = Object.values(textPages)
    .filter((x) => x.slug !== slug)
    .map((x) => `<li><a href="/${x.slug}">${icon(x.icon)} ${esc(x.title)}</a></li>`)
    .join('');
  const body = `<div class="guide-wrap"><div class="guide-main">${win(
    `${esc(p.title)} — Notepad`,
    `<div class="notepad doc"><h1 class="job-h1">${esc(p.title)}</h1><p class="lead">${esc(p.intro)}</p>${sections}</div>`,
    { icon: p.icon, toolbar: '<span class="menu-item">File</span><span class="menu-item">Edit</span><span class="menu-item">Search</span><span class="menu-item">Help</span>' }
  )}</div><aside class="guide-side">${win('More', `<ul class="tree">${others}</ul>`, { icon: 'folder', inactive: true })}</aside></div>`;
  return layout({ title: `${p.title} | MadeVisa`, description: p.description, path: `/${p.slug}`, body });
}

export function notFound(path: string): Response {
  const body = `<div class="center-col">${dialog(
    'MadeVisa',
    'error',
    `<h1 class="dialog-h1">Page not found</h1><p>Cannot find <code>${esc(path)}</code>. Make sure the address is right, or start from one of these.</p>`,
    `${button('Jobs', '/jobs', 'btn-default')}${button('Work visas', '/destinations')}${button('Home', '/')}`
  )}</div>`;
  return layout({ title: 'Page not found | MadeVisa', description: 'This page does not exist.', path, body, noindex: true, status: 404 });
}
