/*
# Invite rewards (Batch 2)
Run AFTER 20261115090000_employer_replies.sql. Safe to run more than once.

Each person gets an invite link (madevisa.com/?ref=<code>). When someone who
signed up through it makes their first QUALIFYING purchase (a pack of 5+
document credits, Pro or Relocation), the inviter gets 2 document credits —
once per invited person.

Nothing is rewarded for sign-ups, clicks or reports — only for money that
was actually received (an admin activates every purchase). That one rule
makes most farming pointless; the rest closes the gaps:

- Fake accounts that never pay          → earn nothing.
- Inviting yourself with a 2nd account  → refused if it's the same account
                                          or the same network/browser as
                                          your own; otherwise you'd pay for
                                          5+ credits to get 2 — a discount
                                          at most, never a profit.
- Claiming an invite on an old account  → only accounts younger than 7 days,
                                          with no purchase yet, once.
- Mass sign-ups on one code             → max 30 claims per code per day.
- Reward farming at scale               → max 20 reward credits per inviter
                                          per calendar month.
- Refunds                               → an admin deletes the reward grant
                                          (reason starts with "Invite reward").
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Codes and referrals (server-only tables; read through the functions below)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_codes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9]{8}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referrals (
  referee_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded', 'capped', 'blocked')),
  credits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals (referrer_id, created_at DESC);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_codes FROM anon, authenticated;
REVOKE ALL ON public.referrals FROM anon, authenticated;

-- Your code (made on first use) and how your invites are doing.
CREATE OR REPLACE FUNCTION public.my_referral()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  c text;
BEGIN
  IF me IS NULL THEN RETURN NULL; END IF;
  SELECT code INTO c FROM public.referral_codes WHERE user_id = me;
  WHILE c IS NULL LOOP
    BEGIN
      c := substr(md5(gen_random_uuid()::text), 1, 8);
      INSERT INTO public.referral_codes (user_id, code) VALUES (me, c);
    EXCEPTION WHEN unique_violation THEN
      -- Either this person got a code a moment ago, or the code was taken: re-read / retry.
      SELECT code INTO c FROM public.referral_codes WHERE user_id = me;
    END;
  END LOOP;
  RETURN jsonb_build_object(
    'code', c,
    'joined', (SELECT count(*) FROM public.referrals WHERE referrer_id = me AND status <> 'blocked'),
    'paid', (SELECT count(*) FROM public.referrals WHERE referrer_id = me AND status IN ('rewarded', 'capped')),
    'credits', (SELECT coalesce(sum(credits), 0) FROM public.referrals WHERE referrer_id = me)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.my_referral() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_referral() TO authenticated;

-- A new account says who invited it. Returns 'ok' or a short reason.
CREATE OR REPLACE FUNCTION public.claim_referral(p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  ref uuid;
  h text := public.request_visitor_hash();
  n integer;
BEGIN
  IF me IS NULL THEN RETURN 'signed_out'; END IF;
  SELECT user_id INTO ref FROM public.referral_codes WHERE code = lower(btrim(coalesce(p_code, '')));
  IF ref IS NULL THEN RETURN 'unknown_code'; END IF;
  IF ref = me THEN RETURN 'self'; END IF;
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referee_id = me) THEN RETURN 'already'; END IF;
  IF (SELECT created_at FROM auth.users WHERE id = me) < now() - interval '7 days' THEN RETURN 'too_old'; END IF;
  IF EXISTS (SELECT 1 FROM public.plan_requests WHERE user_id = me AND status = 'active') THEN RETURN 'already_paid'; END IF;

  SELECT count(*) INTO n FROM public.referrals WHERE referrer_id = ref AND created_at > now() - interval '24 hours';
  IF n >= 30 THEN RETURN 'busy'; END IF;

  -- Same network + browser as the inviter → recorded, never rewarded.
  INSERT INTO public.referrals (referee_id, referrer_id, status)
  VALUES (me, ref, CASE WHEN public.brief_visitor_is_owner(ref, h) THEN 'blocked' ELSE 'pending' END)
  ON CONFLICT (referee_id) DO NOTHING;
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.claim_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_referral(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Reward: on the invited person's first qualifying activated purchase (once).
-- activate_plan() adds the credits first, then marks the request active,
-- so the credit grant for this request already exists here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.referral_reward_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.referrals;
  bought integer;
  earned_month integer;
  give integer := 2;
BEGIN
  IF NEW.status <> 'active' OR OLD.status = 'active' OR NEW.user_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO r FROM public.referrals WHERE referee_id = NEW.user_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Qualifying purchase: Pro / Relocation, or a pack of 5+ credits.
  IF NEW.plan IN ('brief_credits', 'hiring_brief') THEN
    SELECT coalesce(sum(credits), 0) INTO bought FROM public.brief_credit_grants
    WHERE user_id = NEW.user_id AND reason LIKE 'Request ' || NEW.id::text || '%';
    IF bought < 5 THEN RETURN NEW; END IF;   -- stays pending: a later bigger pack can still qualify
  ELSIF NEW.plan NOT IN ('pro', 'relocation') THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(sum(credits), 0) INTO earned_month FROM public.referrals
  WHERE referrer_id = r.referrer_id AND rewarded_at >= date_trunc('month', now());
  give := greatest(0, least(give, 20 - earned_month));

  UPDATE public.referrals
  SET status = CASE WHEN give > 0 THEN 'rewarded' ELSE 'capped' END, credits = give, rewarded_at = now()
  WHERE referee_id = r.referee_id;

  IF give > 0 THEN
    INSERT INTO public.brief_credit_grants (user_id, credits, reason)
    VALUES (r.referrer_id, give, 'Invite reward · ' || r.referee_id::text);
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (r.referrer_id, 'credits_added', give::text || ' document credits added — thank you!',
            'Someone you invited just bought a plan. Use your credits for your next sponsorship document.', '/offers');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A reward problem must never block activating someone's purchase.
  RAISE NOTICE 'referral_reward_on_purchase: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS referral_reward_on_purchase ON public.plan_requests;
CREATE TRIGGER referral_reward_on_purchase
  AFTER UPDATE OF status ON public.plan_requests
  FOR EACH ROW EXECUTE FUNCTION public.referral_reward_on_purchase();
