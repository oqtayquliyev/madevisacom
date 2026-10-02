/*
# Telegram channels (Batch 5)
Run AFTER 20261117090000_sponsor_proof_and_campaigns.sql. Safe to run more than once.

Telegram becomes a fifth social platform. One bot posts to any number of
channels: each campaign can name its own channel (e.g. a "Germany" campaign
with countries = {DE} posting to @madevisa_germany). Campaigns without a
channel post to the default channel (secret TELEGRAM_CHAT_ID).

Setup (once):
1. In Telegram, talk to @BotFather → /newbot → copy the token.
2. Create your channel(s); add the bot as an ADMIN with "Post messages".
3. Supabase → Edge Functions → Secrets:
     TELEGRAM_BOT_TOKEN = <token>
     TELEGRAM_CHAT_ID   = @your_main_channel   (optional default)
4. Admin → Social: switch Telegram on, then create campaigns with the
   Telegram channel field filled in.

The same job is never posted to two Telegram channels (job and company
cooldowns are per platform), so give each channel its own countries.
*/

SET lock_timeout = '5s';

ALTER TABLE public.social_platforms DROP CONSTRAINT IF EXISTS social_platforms_platform_check;
ALTER TABLE public.social_platforms ADD CONSTRAINT social_platforms_platform_check
  CHECK (platform IN ('facebook', 'instagram', 'linkedin', 'tiktok', 'telegram'));

-- Telegram channels are quick-moving: allow more, smaller gaps (editable in admin).
INSERT INTO public.social_platforms (platform, size, min_gap_minutes, max_per_day)
VALUES ('telegram', 'portrait', 15, 48)
ON CONFLICT (platform) DO NOTHING;

-- Which channel a campaign posts to: "@public_name" or a numeric chat id (-100…).
ALTER TABLE public.social_campaigns ADD COLUMN IF NOT EXISTS telegram_chat text;
ALTER TABLE public.social_campaigns DROP CONSTRAINT IF EXISTS social_campaigns_telegram_chat_check;
ALTER TABLE public.social_campaigns ADD CONSTRAINT social_campaigns_telegram_chat_check
  CHECK (telegram_chat IS NULL OR telegram_chat ~ '^(@[A-Za-z][A-Za-z0-9_]{4,31}|-100[0-9]{5,20})$');

-- Where a post goes (the Telegram channel), copied from its campaign when planned.
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS target text;

-- Example campaign, off until you switch it on.
INSERT INTO public.social_campaigns (name, kind, platforms, every_minutes, format, jobs_count, min_jobs, require_approval, enabled)
SELECT 'Telegram · fresh jobs', 'fresh', ARRAY['telegram'], 120, 'list', 5, 3, false, false
WHERE NOT EXISTS (SELECT 1 FROM public.social_campaigns WHERE name = 'Telegram · fresh jobs');
