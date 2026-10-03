// supabase/functions/translate/index.ts
//
// English versions of job ads and CVs that are written in another language,
// so "Check your match" can compare them. MadeVisa's match rules read
// English best; an ad in German and a CV in Turkish are both brought to
// English first, and then compared the usual way.
//
// Requests (POST, JSON):
//   { jobs: ["<job uuid>", ...] }   anyone, up to 12 published jobs a call
//       → { translations: { <id>: { title, html, lang } }, same: [ids already in English],
//           skipped: { <id>: "budget" | "error" }, off?: true }
//       Each ad is translated once and saved (job_translations); later
//       requests for it cost nothing. The ad's text is read from the
//       database here — the function never translates text a caller sends,
//       so it can't be used as a free translator.
//   { cv: true }                    signed-in people only (their own CV)
//       → { text_en } | { same: true } | { error }
//       Saved with the CV (user_cvs.text_en); at most 3 a day per account.
//
// Translation service — whichever secret is set on this function:
//   GOOGLE_TRANSLATE_API_KEY                         Google Cloud Translation (Basic, v2)
//   AZURE_TRANSLATOR_KEY (+ AZURE_TRANSLATOR_REGION) Microsoft Azure Translator
// With neither, the function answers { off: true } and the site matches in
// the original languages, as before.
//
// Cost guard: a monthly character budget (translate_settings.monthly_chars;
// by default just under the service's free allowance — Google 500,000 and
// Azure 2,000,000 characters a month). When it is used up, nothing more is
// translated until next month.
//
// Deploy: supabase functions deploy translate --no-verify-jwt
// (the function checks access itself). Needs migration 20261128090000.

import { handle } from './core.ts';

Deno.serve(handle);
