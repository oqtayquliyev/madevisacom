/*
# Social program: reels first, posts 15–30 minutes apart

1. social_program.video_share — the share of posts that are reels on the
   networks that take them (Instagram, Facebook, TikTok, Telegram).
   Default 0.6: about six posts in ten. The planner and the admin preview
   read it; without this column they use the same 0.6.
2. The pause between any two posts stays in social_program.gap_min, but it
   now means "the longest pause": each post draws between half of it and all
   of it. 30 → 15–30 minutes. Rows still on the old default keep 30.
3. Nothing else changes: how many posts a day each network gets stays as you
   set it (Strategy → "Use the recommended settings" raises Instagram and
   Facebook to 4 a day).

Safe to run more than once. Run after 20261127090000.
*/

ALTER TABLE public.social_program ADD COLUMN IF NOT EXISTS video_share numeric(3, 2) NOT NULL DEFAULT 0.6;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_program_video_share_check') THEN
    ALTER TABLE public.social_program ADD CONSTRAINT social_program_video_share_check CHECK (video_share >= 0 AND video_share <= 0.9);
  END IF;
END $$;

COMMENT ON COLUMN public.social_program.video_share IS 'Share of posts that are reels where the network takes them (0–0.9).';
COMMENT ON COLUMN public.social_program.gap_min IS 'Longest pause the planner aims for between any two posts; the shortest is half of it (30 → 15–30 minutes).';
