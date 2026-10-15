/**
 * A file under /assets/ that doesn't exist (usually one from an older or newer
 * deploy). Answered "not found" with no caching, so a browser never keeps the
 * miss: the long cache in vercel.json is meant only for files that exist.
 */
export const config = { runtime: 'edge' };

export default function handler(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store, max-age=0', 'CDN-Cache-Control': 'no-store' },
  });
}
