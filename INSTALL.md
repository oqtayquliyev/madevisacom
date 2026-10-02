# Social content program — install

Copy the folders in this zip over your project (same paths). 2 files are replaced, 17 are new.

**Replaced**
- `src/pages/admin/SocialSection.tsx`
- `supabase/functions/auto-pipeline/social.ts`

**New**
- `api/_post.ts`, `api/og/post.ts` — the new image templates
- `api/social/content.ts` — visa facts as JSON, read from `src/data/visa`
- `src/pages/admin/social/` — 8 files (the admin panels)
- `supabase/functions/auto-pipeline/program.ts`, `programCatalog.ts`, `programSchedule.ts`, `programFormats.ts`, `programVoice.ts`
- `supabase/migrations/20261120090000_social_program.sql`

## Order matters

1. **Build and deploy the site first.** The pipeline checks every image against `madevisa.com/api/og/post` and reads `madevisa.com/api/social/content` before it queues a post. If the site isn't deployed yet, every slot is skipped.
   Check: open `https://madevisa.com/api/social/content` (JSON) and
   `https://madevisa.com/api/og/post?t=text&h=Hello%20from%20MadeVisa&hl=MadeVisa` (an image).
2. **Run the migration**: paste all of `20261120090000_social_program.sql` into one query tab in the Supabase SQL Editor and run it. Safe to run twice.
3. **Deploy the function**: `supabase functions deploy auto-pipeline --no-verify-jwt`
4. **Admin → Social media**: check Platforms, then press **Start the program**.

## Good to know

- A network that isn't connected starts at 0 posts a day (otherwise its posts pile up as "post by hand").
- The "Connected" label updates when the pipeline runs — press **Run now** after adding a secret.
- Telegram needs `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (`@madevisacom`); the bot must be an admin of the channel.
- "Comment + to get the list" posts: Instagram replies are sent automatically only if the token has the comments permission (`instagram_manage_comments`, or `instagram_business_manage_comments` with Instagram login). Otherwise reply by hand, or switch the format off under Content ideas.
- Country photos are optional (Content ideas → Country photos). Without one, the image uses the flag on the blue gradient.
- While the program runs, campaigns pause on the networks it covers. A Telegram campaign with its own channel keeps running.
- Stop withdraws everything that hasn't gone out yet.
