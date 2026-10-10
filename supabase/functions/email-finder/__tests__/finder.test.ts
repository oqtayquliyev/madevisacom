import { describe, expect, it } from 'vitest';
import { contactLinks, decodeCf, emailsIn, isJunk, normalizeUrl } from '../finder';

// Cloudflare encodes with a one-byte XOR key in front.
const cf = (email: string, key = 0x42) => key.toString(16).padStart(2, '0') + [...email].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, '0')).join('');

describe('email-finder', () => {
  it('finds mailto, plain, disguised and Cloudflare-protected addresses', () => {
    const html = `
      <a href="mailto:Jobs@Acme.de?subject=Hi">Write us</a>
      <p>HR: anna.mueller@acme.de.</p>
      <p>karriere [at] acme [dot] de</p>
      <p>info(at)acme.de</p>
      <a class="__cf_email__" data-cfemail="${cf('press@acme.de')}">[email protected]</a>
      <script>var x = "tracking@sentry.io";</script>
      <img src="logo@2x.png"> noreply@acme.de &#109;&#97;&#120;&#64;acme.de`;
    expect(emailsIn(html).sort()).toEqual(['anna.mueller@acme.de', 'info@acme.de', 'jobs@acme.de', 'karriere@acme.de', 'max@acme.de', 'press@acme.de']);
  });
  it('decodes Cloudflare', () => expect(decodeCf(cf('a@b.co', 0x13))).toBe('a@b.co'));
  it('filters junk', () => {
    expect(isJunk('noreply@x.com')).toBe(true);
    expect(isJunk('datenschutz@x.de')).toBe(true);
    expect(isJunk('a1b2c3d4e5f6a7b8c9d0e1f2@x.io')).toBe(true);
    expect(isJunk('hello@madevisa.com')).toBe(true);
    expect(isJunk('jobs@x.co.uk')).toBe(false);
  });
  it('picks same-site contact pages, contact first', () => {
    const html = `<a href="/about-us">About</a><a href="https://other.com/contact">x</a><a href="/kontakt/">Kontakt</a><a href="/blog">Blog</a><a href="https://www.acme.de/karriere">Karriere</a>`;
    expect(contactLinks(html, 'https://www.acme.de/', 'acme.de')).toEqual(['https://www.acme.de/kontakt/', 'https://www.acme.de/karriere', 'https://www.acme.de/about-us']);
  });
  it('normalizes urls and refuses local ones', () => {
    expect(normalizeUrl('acme.de')).toBe('https://acme.de/');
    expect(normalizeUrl('http://localhost:3000')).toBeNull();
    expect(normalizeUrl('192.168.0.1')).toBeNull();
  });
});
