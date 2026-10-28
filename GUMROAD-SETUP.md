# Gumroad setup: one membership, $2.99 for 3 months

The website now sells **one** thing: the MadeVisa Membership, **$2.99 every 3 months**.
Checkout only opens when Gumroad charges exactly that, so set the product up as below.
Steps marked ⚠️ are required.

---

## 1. Product tab

**Name**
```
MadeVisa Membership · 3 months for $2.99
```

**Description** (paste it into the editor and keep the bold titles):

```
Your job-landing partner for 3 months.

One payment of $2.99 (that's $1 a month) gives you everything MadeVisa has for 3 months:

• Apply to every job for 3 months
Unlimited applications to every job on MadeVisa, straight from company career pages — including roles you won't see on LinkedIn or Indeed.

• 60 sponsorship documents
20 a month: the proposal you send an employer when a job needs a visa — the route that may apply, what it asks of them, and the costs you offer to share.

• CV match on every job
Your match score, the skills the ad asks for that your CV doesn't show, and what to change before you apply.

• Visa sponsor proof on every job
Official government records that the company sponsors visas: UK Home Office, US H-1B approvals, Netherlands IND.

• Move math and reply odds
What's left each month after tax and rent there compared with home, and how likely the company is to reply.

• 5 job alerts, new jobs every day
Tell us what you want once; new matching jobs come to you daily for the whole 3 months.

• Jobs checked live and scam-screened
Every imported job is re-checked on the company's careers page, and ads that ask for fees are flagged.

• Unlimited saved jobs and a tracker
Save every job you like and track every application until the company replies.

Our guarantee: if MadeVisa doesn't show you at least 10 open jobs in your field at companies with an official visa-sponsor record within your first 14 days, you get a full refund.

Renews every 3 months at $2.99. Cancel anytime. You keep everything until the end of the 3 months you paid for.

No account needed: pay with your email, and we create your MadeVisa account and send you a sign-in code.
```

**URL** ⚠️: keep it **`membership`** (madevisa.gumroad.com/l/membership). The website links there.

**Cover** (optional): a 1280×720 image with the line "Your job-landing partner for 3 months · $2.99".

**Summary** (the "You'll get" line, if your editor shows it):
```
3 months of every job, CV match, sponsor proof and 60 sponsorship documents.
```

**Call to action** (the button): **Subscribe**.

---

## 2. Pricing ⚠️

1. Product type: **Membership**.
2. Keep exactly **one tier**. Name it:
   ```
   MadeVisa Membership
   ```
   Tier description:
   ```
   Everything on MadeVisa for 3 months.
   ```
3. Under the tier's billing periods, switch on **only "Every 3 months" (quarterly)** and set it to **$2.99**.
   **Switch monthly OFF** (and yearly and every other period). If a second period is left on, the website refuses to open checkout: buyers could otherwise pick another price on Gumroad's page.
4. **Purchasing power parity: OFF** for this product. The price is the same in every country.
5. "Pay what you want": **off**.
6. Free trial: **off**. The guarantee does that job.

---

## 3. Content tab (what the buyer sees after paying)

Add a button:
- Label:
  ```
  Open MadeVisa
  ```
- Link:
  ```
  https://madevisa.com/checkout/complete
  ```

Text above it:
```
Welcome to your 3 months on MadeVisa!
Your membership is on the account with the email you paid with. Open MadeVisa, sign in with that email (we send a one-time code), and every Apply button is unlocked.
Start here: upload your CV once — every job then shows your match score.
```

---

## 4. Receipt tab

Custom message:
```
Thank you! Your MadeVisa Membership runs for 3 months and renews at $2.99 every 3 months until you cancel. Cancel anytime from the link in this receipt or in MadeVisa → Settings → Billing.
Questions or a refund: hello@madevisa.com
```

---

## 5. After saving in Gumroad ⚠️

1. Supabase SQL Editor: run `supabase/migrations/20261231150000_three_month_membership.sql`.
2. Deploy the payment function: `supabase functions deploy gumroad --no-verify-jwt`.
3. MadeVisa **Admin → Plans → Card payments**: press **Connect** again on the membership with `https://madevisa.gumroad.com/l/membership`. It re-reads the price; it must say **$2.99 every 3 months**. If anything is off, the error message says exactly what to change.
4. Push the website.
5. Test: open a job while signed out, press Unlock, and check that Gumroad's form shows **$2.99 every 3 months**.

**People already paying $2.29 a month:** Gumroad keeps existing subscriptions on what they bought. Their membership keeps working on MadeVisa; nothing to do.
