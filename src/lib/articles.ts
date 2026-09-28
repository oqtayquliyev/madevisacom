// Articles (/blog). Table: articles (migration 20261102090000).
// Public: published and publish_at <= now (the database enforces it).
// Admin: everything, including drafts and scheduled posts.

import DOMPurify from 'dompurify';
import { supabase } from '@/lib/supabase';
import { slugify } from '@/lib/jobUrl';

export type ArticleCategory = 'guides' | 'insights' | 'visas' | 'hiring' | 'news';

export const CATEGORY_LABEL: Record<ArticleCategory, string> = {
  insights: 'Hiring reports',
  visas: 'Visa guides',
  guides: 'Career guides',
  hiring: 'For employers',
  news: 'News',
};
export const CATEGORY_ORDER: ArticleCategory[] = ['insights', 'visas', 'guides', 'hiring', 'news'];

export type Article = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body_html: string;
  category: ArticleCategory;
  tags: string[];
  country_code: string | null;
  cover_url: string | null;
  author_name: string;
  status: 'draft' | 'published';
  publish_at: string | null;
  source: 'manual' | 'auto-report' | 'auto-visa';
  auto_key: string | null;
  reading_minutes: number;
  created_at: string;
  updated_at: string;
};

export type ArticleCard = Omit<Article, 'body_html'>;

const CARD_COLS = 'id, slug, title, excerpt, category, tags, country_code, cover_url, author_name, status, publish_at, source, auto_key, reading_minutes, created_at, updated_at';

export const articlePath = (a: Pick<Article, 'slug'>) => `/blog/${a.slug}`;

/** What articles may contain: text formatting, headings, lists, links, tables, quotes, images. */
export function purifyArticleHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'br', 'a', 'span', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'figcaption', 'img', 'div', 'small'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'data-stat'],
  });
}

export function articleSlug(title: string): string {
  return slugify(title, 90) || `article-${Date.now().toString(36)}`;
}

// --- Public ------------------------------------------------------------------

export async function fetchArticles(opts: { category?: ArticleCategory | null; limit?: number; country?: string | null } = {}): Promise<ArticleCard[]> {
  let q = supabase.from('articles').select(CARD_COLS).eq('status', 'published').lte('publish_at', new Date().toISOString()).order('publish_at', { ascending: false }).limit(opts.limit ?? 60);
  if (opts.category) q = q.eq('category', opts.category);
  if (opts.country) q = q.eq('country_code', opts.country);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as ArticleCard[];
}

export async function fetchArticle(slug: string): Promise<Article | null> {
  const { data, error } = await supabase.from('articles').select('*').eq('slug', slug).maybeSingle();
  if (error || !data) return null;
  return data as Article;
}

// --- Admin -------------------------------------------------------------------

export async function fetchAllArticlesAdmin(): Promise<ArticleCard[] | null> {
  const { data, error } = await supabase.from('articles').select(CARD_COLS).order('publish_at', { ascending: false, nullsFirst: true }).limit(500);
  if (error) return null;
  return (data ?? []) as ArticleCard[];
}

export type ArticleInput = Partial<Omit<Article, 'id' | 'created_at' | 'updated_at' | 'reading_minutes'>> & { id?: string };

export async function saveArticle(a: ArticleInput): Promise<{ ok: true; article: Article } | { ok: false; error: string }> {
  const row = { ...a };
  delete (row as { id?: string }).id;
  const q = a.id ? supabase.from('articles').update(row).eq('id', a.id).select('*').single() : supabase.from('articles').insert(row).select('*').single();
  const { data, error } = await q;
  if (error || !data) return { ok: false, error: error?.message.includes('articles_slug_key') ? 'That address (slug) is already used by another article.' : error?.message ?? 'Could not save.' };
  return { ok: true, article: data as Article };
}

/** Inserts many (generated) articles; ones whose auto_key already exists are skipped. */
export async function insertGeneratedArticles(rows: ArticleInput[]): Promise<{ added: number; skipped: number; error?: string }> {
  if (!rows.length) return { added: 0, skipped: 0 };
  const keys = rows.map((r) => r.auto_key).filter((k): k is string => Boolean(k));
  const { data: existing } = await supabase.from('articles').select('auto_key, slug').or(`auto_key.in.(${keys.map((k) => `"${k}"`).join(',')}),slug.in.(${rows.map((r) => r.slug).join(',')})`);
  const takenKeys = new Set(((existing ?? []) as { auto_key: string | null }[]).map((r) => r.auto_key));
  const takenSlugs = new Set(((existing ?? []) as { slug: string }[]).map((r) => r.slug));
  const fresh = rows.filter((r) => !(r.auto_key && takenKeys.has(r.auto_key)) && !(r.slug && takenSlugs.has(r.slug)));
  if (!fresh.length) return { added: 0, skipped: rows.length };
  const { error } = await supabase.from('articles').insert(fresh);
  if (error) return { added: 0, skipped: rows.length - fresh.length, error: error.message };
  return { added: fresh.length, skipped: rows.length - fresh.length };
}

export async function deleteArticle(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('articles').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export type SeoSettings = {
  auto_reports_enabled: boolean;
  reports_per_week: number;
  reports_spread_hours: number;
  min_jobs_for_report: number;
  google_indexing_enabled: boolean;
  google_daily_cap: number;
  google_sent_today: number;
  google_day: string | null;
  last_reports_at: string | null;
};

export async function fetchSeoSettings(): Promise<SeoSettings | null> {
  const { data, error } = await supabase.from('seo_settings').select('*').eq('id', true).maybeSingle();
  if (error || !data) return null;
  return data as SeoSettings;
}

export async function updateSeoSettings(patch: Partial<SeoSettings>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('seo_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', true);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function runReportsNow(): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('articles_run_now');
  return error ? { ok: false, error: error.message } : { ok: true };
}
