// Plain-text helpers for job descriptions, with no sanitizer attached, so pages that only need
// text (the homepage) don't load DOMPurify. The sanitizing lives in atsImport.ts.

/**
 * Greenhouse's `content` field comes back with its angle brackets
 * HTML-entity-encoded (e.g. the literal text "&lt;h2&gt;", not a real
 * tag) — decoding entities is what turns that into real markup.
 * Decoding must happen BEFORE sanitizing, not after, or the entities
 * decode into literal "<h2>" *text* once tags have already been
 * stripped, which is the "raw tags showing up" bug.
 */
export function decodeEntities(html: string): string {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Plain-text fallback (e.g. for meta descriptions or previews). */
export function stripHtml(html: string): string {
  return decodeEntities(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
