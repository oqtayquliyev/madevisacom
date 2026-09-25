// Link previews for job pages.
//
// MadeVisa is a single-page app: the HTML every URL returns is the same
// index.html, so WhatsApp / LinkedIn / Facebook / X / Slack / Telegram /
// Discord previews (which don't run JavaScript) would all look alike.
// For those link-preview bots only, this returns a tiny HTML page with the
// job's own title, description and generated image (/api/og/job).
// Real visitors — and search engines, which render JavaScript — are passed
// straight through to the normal site, so nothing is "cloaked".

import { next } from '@vercel/edge';
import { fetchShareJob, jobIdFromPath, shareDescription } from './api/_jobShare';

export const config = { matcher: ['/jobs/:path+'] };

const PREVIEW_BOTS =
  /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|slack-imgproxy|discordbot|telegrambot|whatsapp|skypeuripreview|pinterest|redditbot|embedly|vkshare|quora link preview|tumblr|bitlybot|iframely|mastodon|signal|viber|line-poker|kakaotalk/i;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default async function middleware(request: Request) {
  if (!PREVIEW_BOTS.test(request.headers.get('user-agent') ?? '')) return next();
  const url = new URL(request.url);
  const id = jobIdFromPath(url.pathname);
  if (!id) return next();
  const job = await fetchShareJob(id).catch(() => null);
  if (!job) return next();

  const title = `${job.title} at ${job.company}`;
  const description = shareDescription(job);
  const image = `${url.origin}/api/og/job?id=${job.id.slice(0, 8)}`;
  const pageUrl = `${url.origin}${url.pathname}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)} | MadeVisa</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MadeVisa">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
</head><body><h1>${esc(title)}</h1><p>${esc(description)}</p><a href="${esc(pageUrl)}">View on MadeVisa</a></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}
