# Gumroad setup: lifetime access, $12.50 once

The website sells **one** thing: the MadeVisa Membership, **$12.50 once, for good**
(a launch price for the first 200 customers; regular price $250).
Checkout only opens when the Gumroad product charges exactly the price the site expects,
so set it up as below. Steps marked ⚠️ are required.

---

## 1. Create the product

Gumroad → Products → **New product** → **Digital product** ⚠️ (not "Membership").

**Name**
```
MadeVisa · Lifetime access
```

**Price** ⚠️: `12.50` USD.

**URL** ⚠️: **`lifetime`** → madevisa.gumroad.com/l/lifetime (the website links there).

**Description** (paste into the editor):

```
Ultimate access to everything MadeVisa has. Pay once, use it forever — no subscription.

95% off for the first 200 customers: $12.50 instead of $250.

Companies post new vacancies on their own careers page first — MadeVisa fetches them for you early. Jobs that aren't on LinkedIn or Indeed.

• Apply to every job
• Unlimited sponsorship documents
• CV tailoring suggestions on every job
• Direct contact to HRs & recruiters
• Visa sponsor proof on every job
• Move math and reply odds
• The fastest job alerts
• Jobs checked live and scam-screened

Our guarantee: if MadeVisa doesn't show you at least 10 open jobs in your field at companies with an official visa-sponsor record within your first 14 days, you get a full refund.

No account needed: pay with your email, and we create your MadeVisa account and send you a sign-in code.
```

## 2. Settings ⚠️

Switch all of these **off** on the product (the site refuses to connect otherwise):

- "Allow customers to pay what they want"
- Versions / variants with an extra price
- Purchasing power parity (Settings → Payments, or the product's own toggle)

Then **Publish**.

Optional: in the product's content, add a button to `https://madevisa.com/checkout/complete`
so buyers can come back to the site.

## 3. Connect it on the site

1. Admin → Plans → Gumroad → **Connect** with `https://madevisa.gumroad.com/l/lifetime`.
2. Keep the old membership product on Gumroad (don't delete it). When the new product
   replaces it, the site remembers the old product id, so everyone who already paid for
   3 months keeps their access until it ends.

## 4. The "places left" counter

Shown on the paywall and the pricing page as **"N of 200 left"**.
Admin → Plans → Gumroad → **Places left**: type the number and Save, or press
**After a purchase: −1**. Leave it empty to show the real count (200 minus one-time buyers).
At 0 the counter disappears.

## 5. After 200 customers: raise the price to $250

Do all four, in this order, so checkout never refuses a buyer:

1. **Gumroad**: product → Price → `250` → Save.
2. **Code**: `supabase/functions/_shared/plans.ts`
   - `starter.priceCents: 25000`
   - the launch box ("95% off for the first 200 customers" + ~~$250~~) is in
     `src/components/pro/LaunchOffer.tsx`; drop the top line and the strikethrough there.
   Then deploy the `gumroad` function and the website.
3. **Database** (SQL editor):
   ```sql
   UPDATE public.billing_plans SET price_amount = 25000, updated_at = now() WHERE id = 'starter';
   ```
4. Admin → Plans → Gumroad → **Connect** again with the same link, so the stored price matches.

Changing the price only in Gumroad makes the site refuse checkout ("price doesn't match"),
which is on purpose: nobody is ever charged an amount the site didn't show.

## 6. Discount codes (optional)

Gumroad → Checkout → Discounts. The site's "leaving" offer uses the code set in
`VITE_GUMROAD_DOWNSELL_CODE` (and `VITE_GUMROAD_DOWNSELL_PRICE`); it must apply to the lifetime product.
