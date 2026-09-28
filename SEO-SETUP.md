# SEO, blog & insights — setup

1. Copy these files into the project (same paths).
2. DELETE public/sitemap.xml  (a static file would hide the new live sitemap).
3. Supabase SQL Editor → run supabase/migrations/20261102090000_seo_articles_insights.sql
4. Terminal: supabase functions deploy auto-pipeline --no-verify-jwt
5. Deploy the site (Vercel).
6. Google Search Console → Sitemaps → submit https://madevisa.com/sitemap.xml
7. Admin → Articles → schedule visa guides; switch on weekly hiring reports.
8. Optional: Google Indexing API (see supabase/functions/auto-pipeline/indexing.ts header).
