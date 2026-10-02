/*
# Reels for the social content program (Batch 11)

Run AFTER 20261123090000_social_program.sql. Safe to run more than once.
(First handed out as 20261121090000_social_reels.sql — same content.)
Paste the whole file into ONE query tab in the Supabase SQL Editor and run it.
Then deploy:  supabase functions deploy auto-pipeline --no-verify-jwt

## What this adds
Six kinds of post are now short vertical videos (text over city footage):
"X is hiring", jobs in one city, a visa route, myth → fact, the Visa Plan, news.

- social_posts.video_url     the rendered MP4 (images[0] is then its cover)
- status "rendering"         a reel that is written and waiting for its video
- social-videos bucket       public; reels/ (written by the renderer, kept 10
                             days) and music/ (tracks you upload — optional)
- social_program.reels_at    when the renderer last reported in. Reel formats
                             are only planned while this is recent.

## Flow
program writes the reel (caption + a recipe in meta.reel, status "rendering")
  → GitHub Actions "Render reels" (scripts/render-reels.mjs) makes the MP4,
    uploads it here and sets the post to approved / awaiting approval
  → the normal queue publishes it: Instagram Reel, Facebook Reel, Telegram
    video. TikTok: "post by hand".
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Posts
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS video_url text;

ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_status_check;
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_status_check
  CHECK (status IN ('planned', 'rendering', 'awaiting_approval', 'approved', 'publishing', 'published', 'manual', 'failed', 'rejected', 'expired'));

ALTER TABLE public.social_program ADD COLUMN IF NOT EXISTS reels_at timestamptz;           -- renderer's last sign of life
ALTER TABLE public.social_program ADD COLUMN IF NOT EXISTS reels_note text;                -- what it did last
ALTER TABLE public.social_program ADD COLUMN IF NOT EXISTS reels_dispatch_at timestamptz;  -- when the pipeline last asked for a render

-- ---------------------------------------------------------------------------
-- 2. Storage: the videos (and optional music)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('social-videos', 'social-videos', true, 52428800, ARRAY['video/mp4', 'image/jpeg', 'audio/mpeg', 'audio/mp4'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 52428800, allowed_mime_types = ARRAY['video/mp4', 'image/jpeg', 'audio/mpeg', 'audio/mp4'];

-- Admins manage the music folder; reels/ is written by the renderer with the service key.
DROP POLICY IF EXISTS "social_videos_admin_list" ON storage.objects;
CREATE POLICY "social_videos_admin_list" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'social-videos' AND (SELECT public.is_admin()));
DROP POLICY IF EXISTS "social_videos_admin_insert" ON storage.objects;
CREATE POLICY "social_videos_admin_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'social-videos' AND (storage.foldername(name))[1] = 'music' AND (SELECT public.is_admin()));
DROP POLICY IF EXISTS "social_videos_admin_delete" ON storage.objects;
CREATE POLICY "social_videos_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'social-videos' AND (storage.foldername(name))[1] = 'music' AND (SELECT public.is_admin()));

-- ---------------------------------------------------------------------------
-- 3. Stop and rewrite also cover reels that are waiting for their video
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.social_program_stop()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slots integer;
  posts integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  UPDATE public.social_program SET running = false, stopped_at = now(), lock_until = NULL, updated_at = now() WHERE id;
  DELETE FROM public.social_posts WHERE origin = 'program' AND status = 'planned';
  GET DIAGNOSTICS slots = ROW_COUNT;
  UPDATE public.social_posts SET status = 'rejected', error = 'Program stopped'
  WHERE origin = 'program' AND status IN ('rendering', 'awaiting_approval', 'approved', 'failed');
  GET DIAGNOSTICS posts = ROW_COUNT;
  RETURN format('stopped: %s slots removed, %s posts withdrawn', slots, posts);
END;
$$;
REVOKE ALL ON FUNCTION public.social_program_stop() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_program_stop() TO authenticated;

CREATE OR REPLACE FUNCTION public.social_slot_rewrite(p_id uuid, p_kind text DEFAULT NULL, p_want text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  UPDATE public.social_posts SET
    status = 'planned',
    format = 'slot',
    kind = coalesce(nullif(p_kind, ''), kind),
    caption = '',
    headline = '',
    images = '[]'::jsonb,
    video_url = NULL,
    links = '[]'::jsonb,
    job_ids = '{}',
    topic_key = NULL,
    image_key = 'slot:' || id::text,
    validation = '{}'::jsonb,
    error = NULL,
    attempts = 0,
    write_at = now(),
    meta = (coalesce(meta, '{}'::jsonb) - 'want' - 'reply' - 'news_id' - 'reel' - 'ig_container' - 'ig_waits') || jsonb_build_object('force', true) || CASE WHEN p_want IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('want', p_want) END
  WHERE id = p_id AND origin = 'program' AND status IN ('planned', 'rendering', 'awaiting_approval', 'approved', 'failed', 'expired', 'rejected')
    AND scheduled_at > now() - interval '2 hours';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RETURN 'not changed (already published, or its time has passed)'; END IF;
  PERFORM public._pipeline_call(jsonb_build_object('cron', 'social'));
  RETURN 'writing';
END;
$$;
REVOKE ALL ON FUNCTION public.social_slot_rewrite(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_slot_rewrite(uuid, text, text) TO authenticated;

-- Admin: render a reel again — after editing its texts (p_reel = the new recipe)
-- or to get another background (p_reel with bg.salt raised). The caption stays.
CREATE OR REPLACE FUNCTION public.social_reel_render(p_id uuid, p_reel jsonb DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF p_reel IS NOT NULL AND (jsonb_typeof(p_reel->'layers') IS DISTINCT FROM 'array' OR jsonb_array_length(p_reel->'layers') = 0 OR coalesce(p_reel->>'frame', '') = '') THEN
    RAISE EXCEPTION 'That is not a reel recipe.';
  END IF;
  UPDATE public.social_posts SET
    -- Once rendered it goes back to where it was: approved stays approved, the rest waits for approval.
    meta = jsonb_set(
      coalesce(meta, '{}'::jsonb) - 'ig_container' - 'ig_waits',
      '{reel}',
      (coalesce(p_reel, meta->'reel') - 'bg_used' - 'rendered_at')
        || jsonb_build_object('after', CASE WHEN status = 'approved' THEN 'approved' WHEN status = 'rendering' THEN coalesce(meta->'reel'->>'after', 'awaiting_approval') ELSE 'awaiting_approval' END)
    ),
    status = 'rendering',
    video_url = NULL,
    images = '[]'::jsonb,
    error = NULL,
    attempts = 0
  WHERE id = p_id AND meta ? 'reel' AND status IN ('rendering', 'awaiting_approval', 'approved', 'failed', 'manual');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RETURN 'not changed (not a reel, or already published)'; END IF;
  PERFORM public._pipeline_call(jsonb_build_object('cron', 'social'));
  RETURN 'rendering';
END;
$$;
REVOKE ALL ON FUNCTION public.social_reel_render(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_reel_render(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. The 5-minute tick also wakes the pipeline for a reel that needs rendering
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.social_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prog public.social_program;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.social_platforms WHERE enabled) THEN RETURN 'nothing due'; END IF;
  SELECT * INTO prog FROM public.social_program WHERE id;
  IF NOT (
    -- a campaign is due, or an approved post's time has come
    EXISTS (SELECT 1 FROM public.social_campaigns WHERE enabled AND next_at <= now())
    OR EXISTS (SELECT 1 FROM public.social_posts WHERE status = 'approved' AND scheduled_at <= now())
    -- a slot to write (also a "Try it" post while the program is stopped)
    OR EXISTS (SELECT 1 FROM public.social_posts WHERE origin = 'program' AND status = 'planned' AND coalesce(write_at, scheduled_at) <= now())
    -- a reel the renderer hasn't been asked for yet, or one whose time passed without a video
    OR EXISTS (SELECT 1 FROM public.social_posts WHERE status = 'rendering' AND (updated_at > coalesce(prog.reels_dispatch_at, '-infinity'::timestamptz) OR scheduled_at < now() - interval '3 hours'))
    -- the program: time to plan again (hourly), or "+" comments to answer
    OR (coalesce(prog.running, false) AND (
      prog.planned_at IS NULL OR prog.planned_at < now() - interval '55 minutes'
      OR EXISTS (SELECT 1 FROM public.social_posts WHERE platform = 'instagram' AND status = 'published' AND meta ? 'reply' AND published_at > now() - interval '4 days')
    ))
  ) THEN
    RETURN 'nothing due';
  END IF;
  PERFORM public._pipeline_call(jsonb_build_object('cron', 'social'));
  RETURN 'sent';
END;
$$;
REVOKE ALL ON FUNCTION public.social_tick() FROM PUBLIC, anon, authenticated;
