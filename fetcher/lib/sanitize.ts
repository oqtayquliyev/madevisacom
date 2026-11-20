// deno-lint-ignore-file no-explicit-any
// Same allow-list the website uses (src/lib/atsImport.ts → sanitizeJobHtml),
// so the cleaner sees the HTML the browser would. Uses sanitize-html +
// linkedom instead of DOMPurify + jsdom: jsdom was too heavy for Edge
// Function CPU limits.
import sanitizeHtml from 'sanitize-html';
import { DOMParser } from 'linkedom';

function decodeEntities(html: string): string {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

const ALLOWED_TAGS = ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'br', 'a', 'span'];
const BOLD_STYLE = /font-weight\s*:\s*(?:bold|bolder|[6-9]00)/i;

/**
 * Career sites (Workday especially) mark headings with
 * <span style="font-weight:bold"> — the style is stripped by the
 * sanitizer, so the heading would turn into plain text. Turn them into
 * <strong> first; h1/h5/h6 become h2/h4 so they survive too.
 */
function keepBold(html: string): string {
  if (!BOLD_STYLE.test(html) && !/<h[156]\b/i.test(html)) return html;
  const doc = new (DOMParser as any)().parseFromString(`<!doctype html><html><head></head><body>${html}</body></html>`, 'text/html');
  for (const el of [...doc.body.querySelectorAll('[style]')] as any[]) {
    if (!BOLD_STYLE.test(el.getAttribute('style') ?? '')) continue;
    const strong = doc.createElement('strong');
    while (el.firstChild) strong.appendChild(el.firstChild);
    el.appendChild(strong);
  }
  for (const el of [...doc.body.querySelectorAll('h1, h5, h6')] as any[]) {
    const h = doc.createElement(el.tagName === 'H1' ? 'h2' : 'h4');
    while (el.firstChild) h.appendChild(el.firstChild);
    el.parentNode.replaceChild(h, el);
  }
  return doc.body.innerHTML;
}

export function sanitizeJobHtml(rawHtml: string): string {
  const html = keepBold(decodeEntities(rawHtml));
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    // Block wrappers become paragraphs so text doesn't run together; the
    // cleaner removes any that end up empty. Other unknown tags keep their text.
    transformTags: { div: 'p', section: 'p', article: 'p', td: 'p', dd: 'p', dt: 'p', blockquote: 'p', h1: 'h2', h5: 'h4', h6: 'h4' },
    nonTextTags: ['script', 'style', 'textarea', 'noscript', 'iframe', 'svg', 'template'],
  }) as string;
}
