// The translate function's logic (see index.ts for what it does and how to deploy it).

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_JOBS_PER_CALL = 12;

// ---------------------------------------------------------------------------
// Is it English already? (Then there is nothing to pay for.)
// ---------------------------------------------------------------------------
// Common words per language. A text is English when English words are at least as
// frequent as any other language's — which also works for a terse CV that is
// mostly nouns — and it isn't full of letters English doesn't use.
const WORDS: Record<string, string> = {
  en: 'the and of with for you your our are will this that from have has experience education skills languages summary present',
  de: 'und der die das mit für wir sie ist nicht eine einer sowie bei von zu den dem im auf als auch oder wird werden deine unser berufserfahrung ausbildung kenntnisse sprachen lebenslauf heute',
  fr: 'et les des pour avec vous nous une dans votre notre est sur du au aux que qui par expérience formation compétences langues',
  es: 'y los las para con una del que por nuestro el la se su al como experiencia educación habilidades idiomas actualidad',
  it: 'e il per con una del della che di nostro sono gli le nel alla dei esperienza istruzione competenze lingue',
  nl: 'en het een van voor met je wij onze bij zijn naar niet op te de aan als ook werkervaring opleiding vaardigheden talen heden',
  pt: 'e os as para com uma do da que em não nosso você ao dos das experiência formação competências idiomas',
  tr: 've bir ile için bu olarak çok gibi olan veya deneyim eğitim beceriler diller yetenekler',
  sv: 'och att som för med är du vi ett på av till inte erfarenhet utbildning',
  pl: 'i w na z do oraz się jest nie dla lub doświadczenie wykształcenie umiejętności',
};
const WORD_SETS = Object.entries(WORDS).map(([code, list]) => [code, new Set(list.split(' '))] as const);

/** Is this text English already? (The browser and the server use the same test before a translation is paid for.) */
export function isEnglish(text: string): boolean {
  const words = text.slice(0, 5000).toLowerCase().split(/[^\p{L}']+/u).filter(Boolean);
  if (words.length < 25) return true; // too short to tell, and too short to matter
  const latin = words.filter((w) => /^[a-z'À-ɏ]+$/.test(w)).length / words.length;
  if (latin < 0.85) return false; // Cyrillic, Arabic, Chinese…
  const accented = words.filter((w) => /[^a-z']/.test(w)).length / words.length;
  if (accented > 0.06) return false; // ı ş ğ ä ö ü é ç ñ ø ə … in more than a word in twenty
  let en = 0;
  let other = 0;
  for (const [code, set] of WORD_SETS) {
    const n = words.filter((w) => set.has(w)).length;
    if (code === 'en') en = n;
    else other = Math.max(other, n);
  }
  return en >= other;
}

// ---------------------------------------------------------------------------
// A job ad, cut down to what a translator needs: headings, paragraphs and
// lists without attributes, scripts or styling — fewer characters to pay for.
// ---------------------------------------------------------------------------
const KEEP = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'strong', 'b', 'br']);
export function slimHtml(html: string, max: number): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|noscript|iframe|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(div|section|article|tr|table|header|footer)\b[^>]*>/gi, (m) => (m[1] === '/' ? '</p>' : '<p>'))
    .replace(/<(\/?)([a-zA-Z0-9]+)\b[^>]*>/g, (_m, slash: string, tag: string) => (KEEP.has(tag.toLowerCase()) ? `<${slash}${tag.toLowerCase()}>` : ' '))
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/(<p>\s*<\/p>|<p>\s*(?=<p>))/g, '')
    .trim();
  if (s.length > max) {
    s = s.slice(0, max);
    // End on a whole tag or a whole word.
    const cut = Math.max(s.lastIndexOf('>'), s.lastIndexOf(' '));
    if (cut > max * 0.8) s = s.slice(0, cut + 1);
  }
  return s;
}
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');

// ---------------------------------------------------------------------------
// Translation services
// ---------------------------------------------------------------------------
type Out = { text: string; lang: string | null }[];
type Provider = { name: 'google' | 'azure'; freeChars: number; run(texts: string[], html: boolean): Promise<Out> };

export function provider(): Provider | null {
  const g = Deno.env.get('GOOGLE_TRANSLATE_API_KEY') ?? '';
  if (g) {
    return {
      name: 'google',
      freeChars: 480_000, // free allowance: 500,000 a month
      async run(texts, html) {
        const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(g)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: texts, target: 'en', format: html ? 'html' : 'text' }),
          signal: AbortSignal.timeout(25_000),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(`Google Translate answered ${res.status}${body?.error?.message ? `: ${String(body.error.message).slice(0, 160)}` : ''}`);
        const list = (body?.data?.translations ?? []) as { translatedText: string; detectedSourceLanguage?: string }[];
        return list.map((t) => ({ text: t.translatedText, lang: t.detectedSourceLanguage ?? null }));
      },
    };
  }
  const a = Deno.env.get('AZURE_TRANSLATOR_KEY') ?? '';
  if (a) {
    const region = Deno.env.get('AZURE_TRANSLATOR_REGION') ?? '';
    return {
      name: 'azure',
      freeChars: 1_900_000, // free allowance: 2,000,000 a month
      async run(texts, html) {
        const res = await fetch(`https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=en&textType=${html ? 'html' : 'plain'}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': a, ...(region ? { 'Ocp-Apim-Subscription-Region': region } : {}) },
          body: JSON.stringify(texts.map((Text) => ({ Text }))),
          signal: AbortSignal.timeout(25_000),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(`Azure Translator answered ${res.status}${body?.error?.message ? `: ${String(body.error.message).slice(0, 160)}` : ''}`);
        return ((body ?? []) as { detectedLanguage?: { language: string }; translations: { text: string }[] }[]).map((t) => ({ text: t.translations?.[0]?.text ?? '', lang: t.detectedLanguage?.language ?? null }));
      },
    };
  }
  return null;
}

// deno-lint-ignore no-explicit-any
type Service = any;

async function noteError(service: Service, message: string | null) {
  await service.from('translate_settings').update({ last_error: message ? `${new Date().toISOString().slice(0, 16)} ${message}`.slice(0, 300) : null }).eq('id', true);
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
export async function translateJobs(service: Service, p: Provider, ids: string[]) {
  const translations: Record<string, { title: string; html: string; lang: string | null }> = {};
  const same: string[] = [];
  const skipped: Record<string, string> = {};

  const { data: settings, error: setErr } = await service.from('translate_settings').select('enabled, max_job_chars').eq('id', true).maybeSingle();
  if (setErr) return { off: true, reason: 'Run the migration 20261128090000_top_matches_translation.sql first.' };
  if (settings && settings.enabled === false) return { off: true };
  const max = Number(settings?.max_job_chars) || 5000;

  const { data: done } = await service.from('job_translations').select('job_id, title, html, source_lang').in('job_id', ids);
  for (const r of (done ?? []) as { job_id: string; title: string | null; html: string; source_lang: string | null }[]) translations[r.job_id] = { title: r.title ?? '', html: r.html, lang: r.source_lang };
  const todo = ids.filter((id) => !translations[id]);
  if (!todo.length) return { translations, same, skipped };

  const { data: jobs } = await service.from('sponsored_jobs').select('id, title, description, status, awaiting_release').in('id', todo).eq('status', 'published');
  for (const j of (jobs ?? []) as { id: string; title: string; description: string | null; awaiting_release?: boolean | null }[]) {
    if (j.awaiting_release) continue;
    const html = slimHtml(j.description ?? '', max);
    if (!html || isEnglish(plain(html))) {
      same.push(j.id);
      continue;
    }
    const chars = j.title.length + html.length;
    const { data: ok } = await service.rpc('translate_reserve', { p_chars: chars, p_default_cap: p.freeChars, p_provider: p.name });
    if (ok !== true) {
      skipped[j.id] = 'budget';
      continue;
    }
    try {
      const [title, body] = await p.run([j.title, html], true);
      if (!body?.text) throw new Error('empty answer');
      const row = { job_id: j.id, source_lang: body.lang, title: title?.text || j.title, html: body.text, chars, provider: p.name };
      await service.from('job_translations').upsert(row, { onConflict: 'job_id' });
      translations[j.id] = { title: row.title, html: row.html, lang: row.source_lang };
    } catch (e) {
      skipped[j.id] = 'error';
      await noteError(service, e instanceof Error ? e.message : 'translation failed');
      // A refused key or a quota error won't get better within this call.
      if (e instanceof Error && /answered (40[0-3]|429)/.test(e.message)) break;
    }
  }
  return { translations, same, skipped };
}

// ---------------------------------------------------------------------------
// The caller's own CV
// ---------------------------------------------------------------------------
/** A CV without email addresses, phone numbers and links. */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g, ' ')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
    .replace(/\b(?:linkedin|github|gitlab|behance|t)\.(?:com|me)\/\S+/gi, ' ')
    .replace(/(?:\+|00)?\d[\d\s().-]{7,}\d/g, (m) => (/^(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}$/.test(m.trim()) ? m : ' '))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\| *(?:\| *)+/g, ' | ');
}
export async function translateCv(service: Service, p: Provider, userId: string) {
  const { data: settings } = await service.from('translate_settings').select('enabled, max_cv_chars').eq('id', true).maybeSingle();
  if (settings && settings.enabled === false) return { off: true };
  const { data: cv, error } = await service.from('user_cvs').select('text, text_en').eq('user_id', userId).maybeSingle();
  if (error) return { off: true, reason: 'Run the migration 20261128090000_top_matches_translation.sql first.' };
  if (!cv?.text) return { error: 'No CV is saved with this account yet.' };
  if (cv.text_en) return { text_en: cv.text_en as string };
  if (isEnglish(cv.text as string)) return { same: true };

  // Contact details have nothing to do with matching: they are taken out before the text leaves.
  const text = redact(cv.text as string).slice(0, Number(settings?.max_cv_chars) || 12_000);
  const { data: allowed } = await service.rpc('translate_cv_allow', { p_user: userId });
  if (allowed !== true) return { error: 'Your CV was translated 3 times today already. Try again tomorrow.' };
  const { data: ok } = await service.rpc('translate_reserve', { p_chars: text.length, p_default_cap: p.freeChars, p_provider: p.name });
  if (ok !== true) return { skipped: 'budget' };
  try {
    const [out] = await p.run([text], false);
    if (!out?.text) throw new Error('empty answer');
    await service.from('user_cvs').update({ text_en: out.text }).eq('user_id', userId);
    return { text_en: out.text, lang: out.lang };
  } catch (e) {
    await noteError(service, e instanceof Error ? e.message : 'translation failed');
    return { skipped: 'error' };
  }
}

// ---------------------------------------------------------------------------
export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const body = await req.json().catch(() => null);
  // No translation key set: the site compares the original texts, as before.
  const p = provider();
  if (!p) return json({ off: true });
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) return json({ error: 'Not configured' }, 500);
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });

  if (Array.isArray(body?.jobs)) {
    const ids = [...new Set((body.jobs as unknown[]).filter((x): x is string => typeof x === 'string' && UUID.test(x)))].slice(0, MAX_JOBS_PER_CALL);
    if (!ids.length) return json({ translations: {}, same: [], skipped: {} });
    return json(await translateJobs(service, p, ids));
  }
  if (body?.cv === true) {
    const auth = req.headers.get('Authorization') ?? '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data } = await asUser.auth.getUser();
    if (!data?.user) return json({ error: 'Sign in to have your CV translated.' }, 401);
    return json(await translateCv(service, p, data.user.id));
  }
  return json({ error: 'Send { jobs: [...] } or { cv: true }.' }, 400);
}
