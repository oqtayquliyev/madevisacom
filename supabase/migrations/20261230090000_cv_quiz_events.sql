-- CV match quiz: which steps visitors reach and what they answer, to find the step where people drop off.
-- Anonymous: a random visitor id from the browser, never an email or the CV text. Only admins can read it.
-- Written through cv_quiz_track() (no direct insert), which caps how much one visitor can write.

create table if not exists public.cv_quiz_events (
  id bigint generated always as identity primary key,
  visitor text not null check (length(visitor) between 8 and 64),
  step text not null check (length(step) between 1 and 40),
  detail jsonb not null default '{}'::jsonb,
  user_id uuid references auth.users (id) on delete set null,
  from_country text check (from_country is null or length(from_country) <= 3),
  source text check (source is null or length(source) <= 160),
  created_at timestamptz not null default now()
);

create index if not exists cv_quiz_events_created_idx on public.cv_quiz_events (created_at desc);
create index if not exists cv_quiz_events_visitor_idx on public.cv_quiz_events (visitor, created_at);

alter table public.cv_quiz_events enable row level security;

drop policy if exists "cv_quiz_events admin read" on public.cv_quiz_events;
create policy "cv_quiz_events admin read" on public.cv_quiz_events for select using (public.is_admin());

drop policy if exists "cv_quiz_events admin delete" on public.cv_quiz_events;
create policy "cv_quiz_events admin delete" on public.cv_quiz_events for delete using (public.is_admin());

-- One event. At most 300 a day per visitor; small details only.
create or replace function public.cv_quiz_track(p_visitor text, p_step text, p_detail jsonb default '{}'::jsonb, p_from text default null, p_source text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_visitor is null or length(p_visitor) not between 8 and 64 or p_step is null or length(p_step) not between 1 and 40 then
    return;
  end if;
  if pg_column_size(coalesce(p_detail, '{}'::jsonb)) > 1500 then
    p_detail := '{}'::jsonb;
  end if;
  if (select count(*) from public.cv_quiz_events where visitor = p_visitor and created_at > now() - interval '1 day') >= 300 then
    return;
  end if;
  insert into public.cv_quiz_events (visitor, step, detail, user_id, from_country, source)
  values (p_visitor, p_step, coalesce(p_detail, '{}'::jsonb), auth.uid(), left(upper(p_from), 3), left(p_source, 160));
end;
$$;

revoke all on function public.cv_quiz_track(text, text, jsonb, text, text) from public;
grant execute on function public.cv_quiz_track(text, text, jsonb, text, text) to anon, authenticated;

-- Keep 180 days.
create or replace function public.cv_quiz_events_prune()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.cv_quiz_events where created_at < now() - interval '180 days';
$$;
