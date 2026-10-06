import { useEffect } from 'react';

const SITE_URL = 'https://madevisa.com';
const DEFAULT_OG_IMAGE = 'https://madevisa.com/api/og/page?p=home';

type SeoOptions = {
  title: string;
  description: string;
  /** Path only, e.g. "/jobs" or "/programs/abc123" — the canonical/OG URL for THIS exact page. */
  path: string;
  /** Set true for private/utility pages (admin, profile, auth, submit forms) that shouldn't be indexed. */
  noindex?: boolean;
  ogImage?: string;
};

function setMetaByName(name: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setMetaByProperty(property: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('property', property);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setCanonical(href: string) {
  let tag = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!tag) {
    tag = document.createElement('link');
    tag.setAttribute('rel', 'canonical');
    document.head.appendChild(tag);
  }
  tag.setAttribute('href', href);
}

/**
 * Sets this page's title/description/canonical/OG/Twitter tags and
 * robots directive. Every route in this SPA previously shared one
 * static set of tags from index.html (wrong title everywhere, and a
 * canonical hardcoded to "/" on every page, which actively told
 * search engines every other page was a duplicate of the homepage).
 * Call this once near the top of each top-level page component.
 */
/**
 * Pages served by api/seo.ts arrive with their structured data already in
 * the HTML (marked data-ssr-path). After moving to another page in the
 * app, that data describes the wrong page — remove it.
 */
function clearStaleServerData(path: string) {
  document.querySelectorAll<HTMLElement>('[data-ssr-path]').forEach((el) => {
    if (el.dataset.ssrPath !== path && el.dataset.ssrPath !== window.location.pathname) el.remove();
  });
}

export function useSeo({ title, description, path, noindex = false, ogImage = DEFAULT_OG_IMAGE }: SeoOptions) {
  useEffect(() => {
    clearStaleServerData(path);
    const fullTitle = title.includes('MadeVisa') ? title : `${title} | MadeVisa`;
    const url = `${SITE_URL}${path}`;

    document.title = fullTitle;
    setMetaByName('description', description);
    // Same directives as the server-rendered HTML (api/seo.ts). "follow" even on noindex pages, so
    // links from them (closed jobs → other jobs at the company) still count.
    setMetaByName('robots', noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1');
    setCanonical(url);

    setMetaByProperty('og:title', fullTitle);
    setMetaByProperty('og:description', description);
    setMetaByProperty('og:url', url);
    setMetaByProperty('og:image', ogImage);
    setMetaByProperty('og:type', 'website');

    setMetaByName('twitter:title', fullTitle);
    setMetaByName('twitter:description', description);
    setMetaByName('twitter:image', ogImage);
  }, [title, description, path, noindex, ogImage]);
}
