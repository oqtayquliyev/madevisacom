# Starter and Pro: native checkout and one entitlement system

Built 12 Oct 2026. This replaces the single PPP-priced **MadeVisa Pro** ($5–$19 a month or yearly) with two flat monthly plans: **Starter at $2.99** and **Pro at $8.99**, in USD, the same everywhere. It adds a native MadeVisa checkout page in front of Gumroad and makes one server-side resolver decide what every account has.

Decisions confirmed before building: flat prices (no PPP, no yearly for new buyers, and existing members keep their old price), and **two Gumroad membership products**, one per plan.

---

## 1. Audit: what was already there

| Area | Found | Verdict |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind, path-based routing in `App.tsx`, `lucide-react` icons, the `ink`/`brand` palette | Reused. New pages follow the same conventions |
| Auth / DB | Supabase auth, `profiles`, RLS everywhere, SECURITY DEFINER RPCs, idempotent hand-run migrations | Reused |
| Plans | One plan, Pro. `subscriptions` (one row per user), `is_pro()` | Extended. No parallel tables |
| Pricing | `_shared/planPrice.ts`: income-based price per country, local currency from hard-coded FX rates, yearly = 149/19 | **Retired for plans** (the spec forbids FX-converted prices and invented discounts). FX rates kept only for comparing job salaries |
| Gumroad | `gumroad` edge function with a solid design: webhooks are never trusted (it re-reads the membership from the API), a checkout id `mv=` links the account, an advisory lock per membership, refunds, disputes, cancellations and a 3-day grace all handled, discount codes per checkout for PPP | **Kept and extended.** No rewrite |
| Gates | `is_pro()` used about 35 times: CV report, documents, alerts, sponsors data, Auto Apply, emails | Routed through a new resolver |
| Lifecycle | Cancellation, refund, dispute, lapse and "check my payment" all exist. Payment failure kept access but nobody was told | Payment-failure notice and billing UI added |
| Tests | Vitest (143), SQL tests run with psql on a scratch DB | Extended |
| Missing | Saved jobs, a billing section in Settings, a Starter tier, a per-plan product map, a funnel by plan and source | Built |
| Not built anywhere | Proof of Fit, Career Mode, interview prep, recruiter outreach drafts, standalone cover letters for Starter | **Not advertised as included.** Listed only as "Coming to Pro — not included yet" |

## 2. What each plan unlocks (enforced in the database)

| Feature (`plan_entitlements.feature`) | Free | Starter | Pro | Enforced by |
|---|---|---|---|---|
| `cv_missing_skills` | 3 jobs/day | every job | every job | `cv_check()` |
| `cv_full_report` (score breakdown, what to change, all matches) | – | ✓ | ✓ | `cv_check`/`cv_checks_today` *(see limitation 4)* |
| `saved_jobs` (new) | 5 | no limit | no limit | `save_job()` with an advisory lock |
| `job_alerts` | 1 (a new one replaces it) | 5 | 10 | `create_job_alert()` and a new `job_alerts_cap` trigger |
| `sponsorship_insights` (visa sponsors, reply data) | – | ✓ | ✓ | `visa_sponsors_in()` |
| `sponsorship_documents` / month | – | 10 | 50 | `brief_credits_for()` and the `hiring_briefs_guard` trigger (plus 30 in any 7 days) |
| `auto_apply` (allowance + service) | trial (`apply_settings.free_monthly`) | trial | `pro_monthly` (150) | existing `is_pro()` gates, which now mean the Pro plan |

Application tracking stays **free** because it was already free; removing it would break a working feature.

## 3. What was built

**Server (migration `20261219090000_starter_pro_plans.sql`)**
- `billing_plans` (prices in cents, Gumroad product per plan) and `plan_entitlements` (feature, limit, period). Billing records stay separate from benefit definitions.
- Resolver: `plan_tier()`, `is_paid()`, `entitlement()`, `has_feature()`, `feature_limit()`. `is_pro()` now means `plan_tier() = 'pro'`. Access comes from the admin-granted `subscriptions` row **or** any Gumroad membership whose `access_until` hasn't passed. So a Starter that keeps running after a Pro refund still counts, and expiry needs no event.
- `my_entitlements()` for the app (plan, Gumroad state, renewal date, payment issue, other running memberships, usage). `billing_catalog()` is public and exposes no product ids.
- `gumroad_apply()` extended: the plan comes from the **verified product**, `access_until` is stored, the person's row shows their best membership, and people are notified only on a real change (activated, changed, ended, payment failed). Re-applying the same state is a no-op.
- `gumroad_checkout_begin()`: the price comes from `billing_plans`, never the caller. Refused unless Gumroad's price equals the plan price. Reuses an open checkout. 20 a day per person. Records the `source`.
- `saved_jobs` table plus `save_job`/`unsave_job`/`my_saved_jobs`. `activate_plan` handles Starter requests. Admin funnel by plan and source.

**Gumroad function (`supabase/functions/gumroad/core.ts`)**
- `checkout {plan, source}`: whitelists the plan, refuses yearly, and **reads the product live from Gumroad** before every checkout (one tier, monthly price = plan price, no other periods, no Gumroad PPP), otherwise refuses. Returns `already` or `switch` instead of starting a second membership. No discount codes for new plans.
- Webhook and sync map product → plan (the old Pro product → Pro). Pings for other products are ignored. The plan is never taken from the ping or the URL.
- `connect {plan, product_url}` and `disconnect {plan}` per plan. Webhooks are kept while any product or old members need them.

**App**
- `/checkout?plan=starter|pro&source=…`: two columns (plan, benefits and limits | order summary and pay). It stacks on mobile, with a sticky price bar. Plan switching keeps the URL in sync. Server prices are shown, as are the renewal date and amount and a tax note. Payment methods are left to Gumroad ("Gumroad shows the methods available where you are"). It handles signed-out, already-on-plan, switch, request-form fallback and errors.
- `/checkout/complete`: shows success **only** when the server resolves the plan. Until then it shows a pending state, auto-polls and asks Gumroad again, has a "Check again" button (never a new purchase), and times out at 10 minutes with support instructions.
- Settings → **Billing** card: plan, status, price, next renewal or end date, payment-failure alert with the Gumroad link, other running memberships, usage against limits, Manage/cancel on Gumroad, Switch plan, Check my payment. There is no local-only cancel button.
- Pricing page rebuilt for Free, Starter and Pro with a comparison table and new FAQ. PPP and the yearly toggle are removed. The SSR `/pricing` in `api/seo.ts` prints the same numbers.
- Contextual, dismissible upgrade prompts (benefit first, then price, hidden for a week after dismissing): `UpgradePrompt`, a feature-aware `ProLock`, and CV-report, document, alert, top-matches and Auto Apply CTAs, all pointing to `/checkout` with a `source`.
- Save job button on job pages and a Saved jobs list on the dashboard.
- New legal page **/subscription-terms** (prices, limits, billing, cancel, switching, refunds). Document terms and privacy policy updated.
- Funnel events via the existing Vercel Analytics: `pricing_viewed`, `checkout_viewed`, `plan_selected`, `checkout_started`, `payment_pending`, `payment_confirmed`, `upgrade_prompt_shown/clicked/dismissed`, `feature_limit_reached`, `payment_failed_shown`, `billing_manage_clicked`. They carry no personal data.

## 4. Files

**New:** `supabase/migrations/20261219090000_starter_pro_plans.sql`, `supabase/functions/_shared/plans.ts`, `src/lib/billing.ts`, `src/lib/billingCore.ts`, `src/pages/checkout/CheckoutPage.tsx`, `src/pages/checkout/CheckoutCompletePage.tsx`, `src/components/billing/BillingCard.tsx`, `src/components/billing/SavedJobs.tsx`, `src/components/pro/UpgradePrompt.tsx`, `supabase/tests/plans_billing.test.sql`, `src/lib/__tests__/billing.test.ts`, `src/lib/__tests__/gumroadCore.test.ts`.

**Changed:** `supabase/functions/gumroad/core.ts`, `index.ts`, `_shared/planPrice.ts` (PPP removed), `src/lib/plans.ts`, `gumroad.ts`, `pricing.ts`, `planPrice.ts`, `sponsorOffer.ts`, `cv/checks.ts`, `seoMeta.ts`, `authIntent.ts`, `src/App.tsx`, the pricing, offers, CV match, brief, job, profile and admin (Plans, GumroadCard) pages, `components/pro/*`, `components/cv/{MatchPanel,MatchBits,SponsorDocRow,TopMatches}`, `components/briefs/*`, `components/apply/{ApplicationSummary,AutoApplyService,ApplicationCredits,ApplicationProgress}`, `data/legalContent.ts`, `legalOrder.ts`, `infoContent.ts`, `api/seo.ts`, `vercel.json`, `public/robots.txt`.

**Deleted:** `src/components/pro/PlanCheckoutDialog.tsx` (replaced by the checkout pages).

## 5. Tests run

- **Unit (bun, vitest API):** 188 pass, 0 fail (143 existing + 45 new). New tests cover the prices ($2.99/$8.99), that the plans nest, no "unlimited AI" or guarantee copy, the **SQL seed matching the TS catalogue**, the plan view, the order summary and renewal dates, limit rows, checkout answer parsing (non-Gumroad URLs or plan mismatch rejected), checkout validation in the function (unknown plan or yearly → 400, client amount ignored, price, tier, yearly and PPP mismatches refused, no second membership), webhook key, unknown products, an unconfirmable ping not applied, plan taken from the product, legacy product → Pro, refund, duplicate pings, refresh, and admin connect.
- **SQL (scratch Postgres 16 with all 120 migrations):** `plans_billing.test.sql` passes with **114 assertions**: catalogue, pending (no access), verified purchase, duplicate notifications (no duplicate rows or notices), every server gate for Free and Starter, Starter→Pro switch, Pro refund falling back to Starter, Starter ending, saved data kept, renewal, failed payment with grace and a single notice, expiry without any event, dispute, unmatched buyer, unverified email not claiming, linked membership not hijackable, admin grants, legacy Pro, price mismatch refused, browser can't start checkouts, private checkout lookup. Existing `email_finder`, `emails_auto_apply_service` and `outreach` suites still pass. `auto_apply.test.sql` fails at line 359 **with or without this change** (an older email-text assertion; checked on a database without the new migration).
- **Typecheck:** no new errors (7 existing ones remain: `apply/facts.ts`, `worker/`). ESLint: 0 errors.
- **Visual:** desktop and 390 px screenshots of checkout (guest, free, on Starter), confirmation (pending, confirmed), pricing and billing. No horizontal overflow on the new pages. (Settings → Profile has an existing input that overflows at 390 px, outside the billing card.)
- **Not run here:** `vite build` (the bundled `node_modules` are macOS binaries and npm is blocked in this sandbox). The app was bundled with Bun instead to prove every import resolves. Run `npm ci && npm run build && npm test` once locally.

## 6. Deploy steps

1. **Gumroad:** create two products of type **Membership**: "MadeVisa Starter" with one tier at **$2.99 monthly** and "MadeVisa Pro" with one tier at **$8.99 monthly**. No yearly or other periods, Gumroad's PPP discount off for both, then publish. Optionally add a content button to `https://madevisa.com/checkout/complete`. (You can reuse the old Pro product for Pro only after setting it to $8.99 monthly-only. Its existing members keep their price on Gumroad.)
2. **Supabase SQL Editor:** run `supabase/migrations/20261219090000_starter_pro_plans.sql`. It is safe to re-run and deletes nothing.
3. **Function:** `supabase functions deploy gumroad --no-verify-jwt`. The `GUMROAD_ACCESS_TOKEN` secret is already set; it needs `view_sales`.
4. **Site:** `npm ci && npm test && npm run build`, then push (Vercel).
5. **Admin → Plans → Card payments:** paste each product link in Starter and Pro → Connect. Try `/checkout` as an admin (a seller test purchase is free), then tick **Card checkout on for everyone**.
6. **Optional, recommended:** run `psql -f supabase/tests/plans_billing.test.sql` against a scratch copy.

No new environment variables or dependencies.

## 7. Known limitations

1. **Switching plans is not automatic.** Gumroad can't move a membership between products, so the flow is: cancel the current plan on Gumroad (it runs to the period end), then start the other one. The UI explains this, the server blocks a second live membership, and the higher plan applies while both run. There is no proration.
2. **Old Pro members** stay on their PPP or yearly price until they cancel. They show as Pro.
3. **Tax** is calculated by Gumroad. The page says so and never shows a tax figure. The renewal date shown is "if you subscribe today"; after purchase, Gumroad's `paid_until` is used.
4. **The full CV report is computed in the browser** (rule-based, no AI cost), so its gate is display-level. The server records the daily free limit, and paid-cost features (documents, alerts, saved jobs, Auto Apply, sponsor data) are all enforced in the database.
5. Recruiter outreach drafts, Proof of Fit, interview prep, Career Mode and standalone cover letters for Starter **don't exist yet**. They are shown only as "coming".
6. There is no fixed country or currency pricing. One USD price is used everywhere. `billing_plans.currency` lets a currency be added later, but only after a matching Gumroad product exists.
7. **Legal copy** (`/subscription-terms`, the refund rules carried over from the old 14-day policy) should be reviewed by you before going live.
8. The admin email-campaign audience "free/pro" (`outreach_audience`) still treats Starter as "free" for Pro upsell emails. This is intentional, but worth knowing.
