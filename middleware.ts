// Link previews (WhatsApp, LinkedIn, Facebook, X, Slack, Telegram, Discord…).
//
// MadeVisa is a single-page app: every URL returns the same index.html, so
// link-preview bots (which don't run JavaScript) would all see the same
// card. For those bots only, this returns a tiny HTML page with the page's
// own title, description and 1200×630 share image (api/og/*):
//   /jobs/<job>          → job image (company, title, salary, location…)
//   /companies/<company> → company image (open jobs, visa jobs, reply rate)
//   /u/<username>        → profile image (photo, headline, public stats)
//   /, /jobs, /programs, /study, /companies, /destinations, /network,
//   /feedback            → page images with live numbers
// Real visitors — and search engines, which render JavaScript — pass
// straight through to the normal site, so nothing is "cloaked".

import { next } from '@vercel/edge';
import { fetchShareJob, jobIdFromPath, shareDescription } from './api/_jobShare';
import { PAGES, pageKeyForPath } from './api/_pages';
import { escHtml as esc, fetchShareCompany, fetchShareProfile } from './api/_supa';

export const config = {
  matcher: [
    '/',
    '/jobs',
    '/jobs/:path+',
    '/programs',
    '/study',
    '/companies',
    '/companies/:path+',
    '/destinations',
    '/destinations/:path+',
    '/network',
    '/experts',
    '/feedback',
    '/feedback/:path+',
    '/u/:path+',
  ],
};

const PREVIEW_BOTS =
  /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|slack-imgproxy|discordbot|telegrambot|whatsapp|skypeuripreview|pinterest|redditbot|embedly|vkshare|quora link preview|tumblr|bitlybot|iframely|mastodon|signal|viber|line-poker|kakaotalk/i;

type Preview = { title: string; description: string; image: string; alt: string };

function html(p: Preview, pageUrl: string): Response {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MadeVisa">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:image" content="${esc(p.image)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(p.alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${esc(p.image)}">
</head><body><h1>${esc(p.title)}</h1><p>${esc(p.description)}</p><a href="${esc(pageUrl)}">View on MadeVisa</a></body></html>`;
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}

const titleCase = (slug: string) => slug.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

async function previewFor(url: URL): Promise<Preview | null> {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const o = url.origin;

  if (path.startsWith('/jobs/')) {
    const id = jobIdFromPath(path);
    const job = id ? await fetchShareJob(id).catch(() => null) : null;
    if (!job) return null;
    const title = `${job.title} at ${job.company}`;
    return { title: `${title} | MadeVisa`, description: shareDescription(job), image: `${o}/api/og/job?id=${job.id.slice(0, 8)}`, alt: title };
  }

  if (path.startsWith('/companies/')) {
    const slug = path.slice('/companies/'.length);
    const c = await fetchShareCompany(slug).catch(() => null);
    if (!c) return null;
    const bits = [
      c.openJobs != null ? `${c.openJobs.toLocaleString('en-US')} open ${c.openJobs === 1 ? 'job' : 'jobs'}` : null,
      c.visaJobs ? `${c.visaJobs.toLocaleString('en-US')} with visa sponsorship` : null,
      c.replyRate != null ? `replies to ${c.replyRate}% of applicants` : null,
    ].filter(Boolean);
    return {
      title: c.replyRate != null ? `Does ${c.name} reply to applicants? ${c.replyRate}% do | MadeVisa` : `${c.name} is hiring — do they reply? | MadeVisa`,
      description: `${bits.length ? `${bits.join(', ')}. ` : ''}Hiring activity and reply rates from real applicants on MadeVisa.`,
      image: `${o}/api/og/company?slug=${encodeURIComponent(slug)}`,
      alt: `${c.name} company score on MadeVisa`,
    };
  }

  if (path.startsWith('/u/')) {
    const username = path.slice('/u/'.length);
    const p = await fetchShareProfile(username).catch(() => null);
    if (!p) return null;
    const status = p.intent === 'hiring' ? 'Hiring' : p.intent === 'looking' ? 'Open to work' : null;
    return {
      title: p.intent === 'hiring' ? `${p.name} is hiring | MadeVisa` : p.intent === 'looking' ? `${p.name} is open to work | MadeVisa` : `${p.name} (@${p.username}) | MadeVisa`,
      description: [status, p.headline, p.tracked ? `${p.tracked} applications tracked, ${p.replies} replies` : null].filter(Boolean).join(' · ') || `${p.name} on MadeVisa.`,
      image: `${o}/api/og/profile?u=${encodeURIComponent(p.username)}`,
      alt: `${p.name} on MadeVisa`,
    };
  }

  if (path.startsWith('/destinations/')) {
    const country = titleCase(path.slice('/destinations/'.length));
    return {
      title: `${country} — visas, sponsored jobs & companies hiring | MadeVisa`,
      description: `Visa routes for ${country}, years to residence and citizenship, plus live visa-sponsored jobs and the companies hiring there.`,
      image: `${o}/api/og/page?p=destinations`,
      alt: `${country} on MadeVisa`,
    };
  }

  if (path.startsWith('/feedback/')) {
    const m = PAGES.feedback;
    return { title: m.title, description: m.description, image: `${o}/api/og/page?p=feedback`, alt: m.headline };
  }

  const key = pageKeyForPath(path);
  if (!key) return null;
  const m = PAGES[key];
  return { title: m.title, description: m.description, image: `${o}/api/og/page?p=${key}`, alt: m.headline };
}

export default async function middleware(request: Request) {
  if (!PREVIEW_BOTS.test(request.headers.get('user-agent') ?? '')) return next();
  const url = new URL(request.url);
  const preview = await previewFor(url).catch(() => null);
  if (!preview) return next();
  return html(preview, `${url.origin}${url.pathname}`);
}
