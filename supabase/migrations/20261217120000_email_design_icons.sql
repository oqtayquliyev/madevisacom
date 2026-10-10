/*
# Email design: real logo, brand icons, no emojis
Run AFTER 20261217090000_outreach_senders.sql. Safe to run more than once.

- The header shows the real MadeVisa logo (https://madevisa.com/og-logo.png).
- Lists in emails get MadeVisa-blue icons instead of emojis. Icons are PNG files
  in public/email/icons (Gmail and Outlook don't show SVG), served from
  https://madevisa.com/email/icons/… once the site is deployed.
- Body markup for list items:
      - [target] Your best matches first        → icon "target"
      - 1. Pick your job titles                 → numbered step
      - Plain item                              → blue check
  Icons: target zap globe plane mail pause file bell sparkles chart clock check
         trending briefcase dashboard search send puzzle user rocket badge list
         calendar shield new star heart inbox award map
- Emojis are removed from every email on the way out (subject, text and HTML),
  so an emoji typed into a template can't reappear.
- The six built-in templates are rewritten without emojis.
*/

-- Emojis out (keeps ✓ and ordinary arrows/punctuation).
CREATE OR REPLACE FUNCTION public.mv_no_emoji(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
           regexp_replace(coalesce(p, ''), '[\U0001F000-\U0001FAFF☀-✒✔-➿⬀-⯿⏩-⏺⌚⌛️⃣‍]', '', 'g'),
           '([^ \n]) {2,}([^ \n])', '\1 \2', 'g');
$$;

CREATE OR REPLACE FUNCTION public.mv_email_icon(p_name text, p_size integer DEFAULT 36)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '<img src="https://madevisa.com/email/icons/'
    || CASE WHEN p_size >= 30 THEN 't-' ELSE 'i-' END
    || CASE WHEN p_name = ANY (ARRAY['target','zap','globe','plane','mail','pause','file','bell','sparkles','chart','clock','check','trending',
             'briefcase','dashboard','search','send','puzzle','user','rocket','badge','list','calendar','shield','new','star','heart','inbox','award','map'])
            THEN p_name ELSE 'check' END
    || '.png" width="' || p_size || '" height="' || p_size || '" alt="" style="display:block;width:' || p_size || 'px;height:' || p_size || 'px;border:0;outline:none">';
$$;

/* The layout every email uses — real logo, emojis removed. */
CREATE OR REPLACE FUNCTION public.mv_email_html(
  p_preheader text,
  p_eyebrow text,
  p_title text,
  p_intro text,
  p_body text,
  p_cta_label text DEFAULT NULL,
  p_cta_url text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_unsub_url text DEFAULT NULL,
  p_unsub_all_url text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
SELECT public.mv_no_emoji(
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  || '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' || mv_esc(p_title) || '</title></head>'
  || '<body style="margin:0;padding:0;background:#f1f4f9;-webkit-text-size-adjust:100%">'
  || '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f1f4f9">' || mv_esc(coalesce(p_preheader, '')) || '&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;</div>'
  || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f4f9"><tr><td align="center" style="padding:28px 12px">'
  || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">'
  -- header: the real logo
  || '<tr><td style="padding:0 6px 18px">'
  || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
  || '<td valign="middle"><a href="https://madevisa.com/?s=em" style="text-decoration:none;display:inline-block">'
  || '<img src="https://madevisa.com/og-logo.png" width="132" height="27" alt="MadeVisa" style="display:block;width:132px;height:27px;border:0;outline:none;border-radius:6px"></a></td>'
  || CASE WHEN p_eyebrow IS NOT NULL THEN '<td align="right" valign="middle" style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:#1d4ed8;letter-spacing:0.6px;text-transform:uppercase">' || mv_esc(p_eyebrow) || '</td>' ELSE '' END
  || '</tr></table></td></tr>'
  -- card
  || '<tr><td style="background:#ffffff;border-radius:18px;border:1px solid #e2e8f0;padding:32px 28px;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">'
  || '<h1 style="margin:0 0 12px;font-size:25px;line-height:1.28;font-weight:800;letter-spacing:-0.5px;color:#0f172a">' || mv_esc(p_title) || '</h1>'
  || CASE WHEN coalesce(p_intro, '') <> '' THEN '<p style="margin:0 0 20px;font-size:15.5px;line-height:1.6;color:#475569">' || p_intro || '</p>' ELSE '' END
  || coalesce(p_body, '')
  || CASE WHEN p_cta_url IS NOT NULL THEN
       '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 4px"><tr><td style="border-radius:12px;background:#1d4ed8">'
       || '<a href="' || mv_esc(p_cta_url) || '" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;white-space:nowrap">' || mv_esc(btrim(public.mv_no_emoji(coalesce(p_cta_label, 'Open MadeVisa')))) || ' &rarr;</a>'
       || '</td></tr></table>'
     ELSE '' END
  || '</td></tr>'
  -- footer
  || '<tr><td style="padding:22px 10px 0;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#94a3b8;text-align:center">'
  || '<p style="margin:0 0 6px;color:#64748b;font-weight:600">MadeVisa &middot; Find your path to a new life abroad</p>'
  || CASE WHEN p_reason IS NOT NULL THEN '<p style="margin:0 0 8px">' || mv_esc(p_reason) || '</p>' ELSE '' END
  || '<p style="margin:0 0 8px">'
  || '<a href="https://madevisa.com/profile?tab=settings#emails" style="color:#64748b;text-decoration:underline">Email settings</a>'
  || CASE WHEN p_unsub_url IS NOT NULL THEN ' &nbsp;&middot;&nbsp; <a href="' || mv_esc(p_unsub_url) || '" style="color:#64748b;text-decoration:underline">Unsubscribe</a>' ELSE '' END
  || CASE WHEN p_unsub_all_url IS NOT NULL THEN ' &nbsp;&middot;&nbsp; <a href="' || mv_esc(p_unsub_all_url) || '" style="color:#64748b;text-decoration:underline">Unsubscribe from all</a>' ELSE '' END
  || '</p>'
  || '<p style="margin:0">&copy; ' || extract(year FROM now())::int || ' MadeVisa &middot; <a href="https://madevisa.com/?s=em" style="color:#94a3b8;text-decoration:none">madevisa.com</a> &middot; <a href="mailto:hello@madevisa.com" style="color:#94a3b8;text-decoration:none">hello@madevisa.com</a></p>'
  || '</td></tr>'
  || '</table></td></tr></table></body></html>');
$$;

/* Body markup → HTML: blank line = paragraph; "- " list items with an icon ("- [target] …"),
   a number ("- 1. …") or a check; **bold**. Escapes everything else. */
CREATE OR REPLACE FUNCTION public.mv_body_html(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  blk text;
  ln text;
  out text := '';
  items text;
  n_items integer;
  para text;
  m text[];
  lead_cell text;
  item text;
  list_open constant text := '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px">';
  p_style constant text := '<p style="margin:0 0 16px;font-size:15.5px;line-height:1.65;color:#334155">';
BEGIN
  FOREACH blk IN ARRAY regexp_split_to_array(btrim(public.mv_no_emoji(p), E' \n\r\t'), E'\\n\\s*\\n') LOOP
    blk := btrim(blk, E' \n\r\t');
    CONTINUE WHEN blk = '';
    items := '';
    n_items := 0;
    para := '';
    FOREACH ln IN ARRAY regexp_split_to_array(blk, E'\\n') LOOP
      ln := btrim(ln);
      CONTINUE WHEN ln = '';
      IF ln LIKE '- %' THEN
        IF para <> '' THEN out := out || p_style || para || '</p>'; para := ''; END IF;
        item := btrim(substr(ln, 3));
        m := regexp_match(item, '^\[([a-z]+)\]\s*(.*)$');
        IF m IS NOT NULL THEN
          lead_cell := public.mv_email_icon(m[1], 36);
          item := m[2];
        ELSE
          m := regexp_match(item, '^(\d{1,2})[.)]\s+(.*)$');
          IF m IS NOT NULL THEN
            lead_cell := '<div style="width:36px;height:36px;line-height:36px;border-radius:10px;background:#1d4ed8;color:#ffffff;text-align:center;font-size:15px;font-weight:800;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">' || m[1] || '</div>';
            item := m[2];
          ELSE
            lead_cell := public.mv_email_icon('check', 36);
          END IF;
        END IF;
        items := items || '<tr>'
          || '<td width="36" valign="middle" style="width:36px;padding:12px 0 12px 14px;' || CASE WHEN n_items > 0 THEN 'border-top:1px solid #e9eef5;' ELSE '' END || '">' || lead_cell || '</td>'
          || '<td valign="middle" style="padding:12px 16px 12px 14px;font-size:15px;line-height:1.5;color:#0f172a;' || CASE WHEN n_items > 0 THEN 'border-top:1px solid #e9eef5;' ELSE '' END || '">'
          || regexp_replace(mv_esc(item), '\*\*(.+?)\*\*', '<b>\1</b>', 'g') || '</td></tr>';
        n_items := n_items + 1;
      ELSE
        IF items <> '' THEN out := out || list_open || items || '</table>'; items := ''; n_items := 0; END IF;
        para := para || CASE WHEN para <> '' THEN '<br>' ELSE '' END || regexp_replace(mv_esc(ln), '\*\*(.+?)\*\*', '<b style="color:#0f172a">\1</b>', 'g');
      END IF;
    END LOOP;
    IF items <> '' THEN out := out || list_open || items || '</table>'; END IF;
    IF para <> '' THEN out := out || p_style || para || '</p>'; END IF;
  END LOOP;
  RETURN out;
END;
$$;

/* One email from a template, for one address. Returns {subject, html, text, preheader, unsub}. */
CREATE OR REPLACE FUNCTION public.mv_render_template(p_key text, p_email text, p_name text DEFAULT NULL, p_user uuid DEFAULT NULL, p_token uuid DEFAULT NULL, p_country text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.email_templates;
  n public.outreach_numbers := public.outreach_counts();
  uid uuid := coalesce(p_user, (SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1));
  first text;
  matches integer := 0;
  has_cv boolean := false;
  cv_line text;
  dash text;
  unsub text;
  v jsonb;
  stats text := '';
  subject text;
  body text;
  headline text;
  pre text;
BEGIN
  SELECT * INTO t FROM public.email_templates WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'No template %', p_key; END IF;
  first := nullif(split_part(btrim(coalesce(nullif(p_name, ''), (SELECT full_name FROM public.profiles WHERE id = uid), '')), ' ', 1), '');
  IF uid IS NOT NULL THEN
    has_cv := EXISTS (SELECT 1 FROM public.user_cvs WHERE user_id = uid);
    matches := public.mv_match_count(uid);
  END IF;
  cv_line := CASE
    WHEN has_cv AND matches > 0 THEN 'Good news: your CV matches the titles of **' || to_char(matches, 'FM999,999') || ' live jobs** on MadeVisa right now.'
    WHEN has_cv THEN 'Your CV is on MadeVisa, and new jobs that fit it arrive every day.'
    ELSE 'First step: upload your CV. It takes about 10 seconds, and you instantly see the jobs you match best.' END;
  dash := 'https://madevisa.com/my?t=' || coalesce(p_token::text, '');
  v := jsonb_build_object(
    'first_name', coalesce(first, 'Hi there'),
    'jobs_live', to_char(n.jobs_live, 'FM999,999'),
    'jobs_today', to_char(n.jobs_today, 'FM999,999'),
    'jobs_visa', to_char(n.jobs_visa, 'FM999,999'),
    'matches', to_char(matches, 'FM999,999'),
    'cv_line', cv_line,
    'country', coalesce(p_country, ''),
    'dashboard_url', dash);
  subject := mv_fill(CASE WHEN first IS NULL THEN regexp_replace(t.subject, '^\{\{first_name\}\},\s*', '') ELSE t.subject END, v);
  subject := btrim(public.mv_no_emoji(subject));
  subject := upper(left(subject, 1)) || substr(subject, 2);
  body := mv_fill(t.body, v);
  headline := btrim(public.mv_no_emoji(mv_fill(t.headline, v)));
  pre := btrim(public.mv_no_emoji(mv_fill(t.preheader, v)));
  unsub := CASE WHEN p_token IS NOT NULL THEN 'https://madevisa.com/alerts/unsubscribe?k=all&t=' || p_token::text END;

  IF t.show_stats THEN
    stats := '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px"><tr>'
      || (SELECT string_agg('<td width="33%" valign="top" style="padding:0 4px"><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px 12px">'
           || public.mv_email_icon(ic, 22)
           || '<div style="margin-top:10px;font-size:22px;line-height:1.1;font-weight:800;color:#0f172a">' || num || '</div>'
           || '<div style="margin-top:4px;font-size:12px;line-height:1.35;color:#64748b">' || lbl || '</div></div></td>', '' ORDER BY o)
          FROM (VALUES (1, 'globe', to_char(n.jobs_live, 'FM999,999'), 'Live jobs'),
                       (2, 'new', to_char(n.jobs_today, 'FM999,999'), 'New today'),
                       (3, 'plane', to_char(n.jobs_visa, 'FM999,999'), 'Visa sponsorship')) s(o, ic, num, lbl))
      || '</tr></table>';
  END IF;

  RETURN jsonb_build_object(
    'subject', left(subject, 200),
    'preheader', pre,
    'html', public.mv_email_html(
      pre, t.eyebrow, headline,
      'Hi ' || mv_esc(coalesce(first, 'there')) || ',',
      stats || public.mv_body_html(body)
        || CASE WHEN p_token IS NOT NULL THEN
             '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0"><tr>'
             || '<td valign="middle" style="padding-right:8px">' || public.mv_email_icon('dashboard', 20) || '</td>'
             || '<td valign="middle" style="font-size:13.5px;line-height:1.5;color:#64748b"><a href="' || mv_esc(dash) || '" style="color:#1d4ed8;font-weight:700;text-decoration:none">Your MadeVisa dashboard</a> &middot; your jobs, matches and applications in one place</td>'
             || '</tr></table>'
           ELSE '' END,
      btrim(public.mv_no_emoji(t.cta_label)), t.cta_url,
      CASE WHEN uid IS NOT NULL THEN 'You get this because you have a MadeVisa account.' ELSE 'You get this because your address is on the MadeVisa mailing list.' END,
      unsub, NULL),
    'text', public.mv_no_emoji(headline || E'\n\n' || regexp_replace(regexp_replace(body, '\*\*', '', 'g'), '(^|\n)- \[[a-z]+\]\s*', '\1- ', 'g')
            || E'\n\n' || btrim(t.cta_label) || ': ' || t.cta_url
            || CASE WHEN p_token IS NOT NULL THEN E'\n\nYour dashboard: ' || dash || E'\nUnsubscribe: ' || unsub ELSE '' END),
    'unsub', unsub
  );
END;
$$;
REVOKE ALL ON FUNCTION public.mv_render_template(text, text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- Built-in templates, rewritten without emojis
-- ===========================================================================
UPDATE public.email_templates AS t SET
  subject = x.subject, preheader = x.preheader, eyebrow = x.eyebrow, headline = x.headline, body = x.body, cta_label = x.cta_label, updated_at = now()
FROM (VALUES
('promo_cv',
 '{{first_name}}, {{jobs_today}} fresh jobs landed today. Which ones fit you?',
 'Upload your CV once and see your best matches in seconds.',
 'CV Match',
 'Your next job abroad might already be here',
 'We just added **{{jobs_today}} fresh jobs**. **{{jobs_live}}** are live right now, and **{{jobs_visa}}** offer visa sponsorship.

Upload your CV to CV Match and you get:

- [target] Your best matches first, with your score on each job
- [puzzle] The skills each ad asks for that your CV doesn’t show yet
- [zap] Auto Apply: MadeVisa applies to your top matches for you

It takes about 10 seconds. No forms, and no account needed to see your first matches.',
 'Upload my CV'),
('promo_auto_apply',
 'Stop applying one by one. Let MadeVisa apply for you',
 'Your CV and your answers: applications sent every day for a month.',
 'Auto Apply',
 'Hundreds of jobs. One setup.',
 'Job hunting abroad is a numbers game. The more good applications you send, the more replies you get.

With **Auto Apply**, MadeVisa sends applications to the jobs your CV matches best, **every day for a month**, using your CV and the answers you give once:

- [mail] An email the moment each application is sent
- [target] Only jobs your CV matches well. You choose the minimum match
- [globe] The countries and roles you pick
- [pause] Pause or stop any time

**{{jobs_live}} live jobs** are waiting to be matched with your CV.',
 'Start with my CV'),
('promo_fresh_jobs',
 '{{jobs_today}} new jobs today. Be one of the first to apply',
 'Early applications get read first.',
 'Fresh today',
 'Early applicants get noticed first',
 'Recruiters often read the first applications most closely. Here’s what’s new on MadeVisa:

- [new] **{{jobs_today}}** jobs added in the last 24 hours
- [plane] **{{jobs_visa}}** live jobs with visa sponsorship
- [globe] **{{jobs_live}}** live jobs from company career pages

Upload your CV and we’ll show you the ones you match. Then Auto Apply can send your applications for you.',
 'Show my matches'),
('nurture_1',
 '{{first_name}}, let MadeVisa apply to jobs for you this month',
 'Your best matches, applied to every day. You just watch the replies come in.',
 'Auto Apply',
 'Meet Auto Apply',
 '{{cv_line}}

Here’s how Auto Apply works:

- 1. Pick your job titles, countries and the lowest match you’d accept
- 2. Answer the usual application questions **once**
- 3. MadeVisa applies to your best matches every day for a month

You get an email for every application, and employers reply straight to you.',
 'Turn on Auto Apply'),
('nurture_2',
 'More applications, more interviews, on autopilot',
 'Applying takes hours. Auto Apply takes 2 minutes to set up.',
 'Auto Apply',
 'You prepare for interviews. We send the applications.',
 'Most people stop after a handful of applications. It simply takes too long.

{{cv_line}}

With Auto Apply you set it up once (about 2 minutes), and MadeVisa keeps applying to your best matches every day:

- [target] Only jobs your CV matches well
- [plane] Includes jobs with visa sponsorship
- [mail] One email per application, so you always know what went out',
 'See my matches'),
('nurture_3',
 '{{first_name}}, your best matches won’t stay open forever',
 'Jobs close fast. Let Auto Apply get your applications in early.',
 'Last reminder',
 'Your shortlist is waiting',
 '{{cv_line}}

New jobs arrive every day, and the good ones close fast. MadeVisa Pro includes:

- [zap] **Auto Apply** for one month: applications sent for you, every day
- [chart] The full CV match report on every job
- [file] Sponsorship documents for employers who need a nudge

This is the last email in this series. We won’t keep nudging you.',
 'Get Pro and Auto Apply')
) AS x(key, subject, preheader, eyebrow, headline, body, cta_label)
WHERE t.key = x.key;

-- Any other template: emojis removed.
UPDATE public.email_templates SET
  subject = btrim(public.mv_no_emoji(subject)), preheader = btrim(public.mv_no_emoji(preheader)), headline = btrim(public.mv_no_emoji(headline)),
  body = public.mv_no_emoji(body), cta_label = btrim(public.mv_no_emoji(cta_label)), updated_at = now()
WHERE key NOT IN ('promo_cv', 'promo_auto_apply', 'promo_fresh_jobs', 'nurture_1', 'nurture_2', 'nurture_3')
  AND (subject || preheader || headline || body || cta_label) <> public.mv_no_emoji(subject || preheader || headline || body || cta_label);

NOTIFY pgrst, 'reload schema';
