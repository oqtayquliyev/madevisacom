// Same sanitizer the website uses (src/lib/atsImport.ts → sanitizeJobHtml),
// so the cleaner sees exactly the HTML it saw in the browser.
import DOMPurify from 'npm:dompurify@3.4.15';
import { JSDOM } from 'npm:jsdom@26.1.0';

const { window } = new JSDOM('');
// deno-lint-ignore no-explicit-any
const purify = DOMPurify(window as any);

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

export function sanitizeJobHtml(rawHtml: string): string {
  return purify.sanitize(decodeEntities(rawHtml), { ALLOWED_TAGS, ALLOWED_ATTR: ['href'] }) as string;
}
