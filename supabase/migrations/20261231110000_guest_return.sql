/*
# Guest purchase → back where they were, signed in

Run AFTER 20261231100000_paywall_stats.sql. Safe to run more than once.

Someone without an account presses "Subscribe now" on a job. Their browser makes a random
token, keeps it (with the page they were on) and adds it to the Gumroad link (?mvg=…).
Gumroad sends it back with the sale (url_params[mvg]).

  guest_claims             one row per guest purchase: the token, the account the
                           membership went on (new or matched by email), when the
                           sign-in code was last sent, when it was used.
  guest_claim_mark(...)    the gumroad function, once the membership is on an account.
  guest_claim_status(t)    the site (anyone holding the token): has the payment arrived?
  guest_claim_take(t)      the gumroad function: the account's email, at most once a
                           minute and 6 times per purchase, for 24 hours.
  guest_claim_code(...)    the gumroad function: emails the 6-digit sign-in code.
  guest_claim_done(t)      the site, once signed in on that account.

Only the person who can read that inbox can sign in: holding the token is never enough.
*/

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.guest_claims (
  token uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  code_sent_at timestamptz,
  sends integer NOT NULL DEFAULT 0,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS guest_claims_created_idx ON public.guest_claims (created_at);
ALTER TABLE public.guest_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_claims FROM anon, authenticated;
DROP POLICY IF EXISTS "guest_claims admin read" ON public.guest_claims;
CREATE POLICY "guest_claims admin read" ON public.guest_claims FOR SELECT USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.guest_claim_mark(p_token uuid, p_user uuid, p_email text, p_subscription text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.guest_claims (token, user_id, email, subscription_id)
  SELECT p_token, p_user, lower(p_email), p_subscription
  WHERE p_token IS NOT NULL AND p_user IS NOT NULL AND coalesce(p_email, '') <> ''
  ON CONFLICT (token) DO NOTHING;
  DELETE FROM public.guest_claims WHERE created_at < now() - interval '30 days';
$$;
REVOKE ALL ON FUNCTION public.guest_claim_mark(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_claim_mark(uuid, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.guest_claim_status(p_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('ready', EXISTS (
    SELECT 1 FROM public.guest_claims WHERE token = p_token AND used_at IS NULL AND created_at > now() - interval '24 hours'));
$$;
REVOKE ALL ON FUNCTION public.guest_claim_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_claim_status(uuid) TO anon, authenticated;

-- {state:'send', email, user_id} | {state:'wait', email, seconds} | {state:'none'}
CREATE OR REPLACE FUNCTION public.guest_claim_take(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.guest_claims;
BEGIN
  SELECT * INTO c FROM public.guest_claims
  WHERE token = p_token AND used_at IS NULL AND created_at > now() - interval '24 hours'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('state', 'none'); END IF;
  IF c.sends >= 6 OR (c.code_sent_at IS NOT NULL AND c.code_sent_at > now() - interval '60 seconds') THEN
    RETURN jsonb_build_object('state', 'wait', 'email', c.email,
      'seconds', CASE WHEN c.sends >= 6 THEN 0 ELSE greatest(1, 60 - extract(epoch FROM now() - c.code_sent_at)::integer) END);
  END IF;
  UPDATE public.guest_claims SET code_sent_at = now(), sends = sends + 1 WHERE token = p_token;
  RETURN jsonb_build_object('state', 'send', 'email', c.email, 'user_id', c.user_id);
END;
$$;
REVOKE ALL ON FUNCTION public.guest_claim_take(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_claim_take(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.guest_claim_code(p_email text, p_user uuid, p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_html text;
BEGIN
  IF p_code !~ '^[0-9]{6,10}$' THEN RETURN false; END IF;
  v_html := public.mv_email_html(
    'Your sign-in code: ' || p_code,
    'Membership',
    'Your sign-in code',
    NULL,
    '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155">Your payment went through and your MadeVisa membership is on. Enter this code on MadeVisa to sign in and carry on where you left off:</p>'
      || '<div style="margin:0 0 18px;padding:18px;border-radius:14px;background:#eff6ff;border:1px solid #bfdbfe;text-align:center;font-size:34px;letter-spacing:8px;font-weight:800;color:#0f172a">' || p_code || '</div>'
      || '<p style="margin:0;font-size:13px;line-height:1.6;color:#64748b">It works for one hour. Didn''t ask for it? You can ignore this email.</p>',
    NULL, NULL,
    'You get this because you just paid for a MadeVisa membership with this email.',
    NULL, NULL);
  RETURN public.mv_send_email(p_email, 'Your MadeVisa sign-in code: ' || p_code, v_html,
    'Your payment went through and your MadeVisa membership is on.' || E'\n\nYour sign-in code: ' || p_code || E'\n\nIt works for one hour.',
    'membership', p_user, NULL, left('guest-code:' || p_user::text || ':' || p_code, 240));
END;
$$;
REVOKE ALL ON FUNCTION public.guest_claim_code(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_claim_code(text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.guest_claim_done(p_token uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.guest_claims SET used_at = now() WHERE token = p_token AND user_id = auth.uid() AND used_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.guest_claim_done(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guest_claim_done(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
