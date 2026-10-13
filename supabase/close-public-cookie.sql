-- Phase 2: only after the new badges production reader is verified.
create or replace function public.badge_get(p_name text)
returns table(content text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select f.content,f.updated_at from public.badge_files f where f.name=p_name and f.name='schedule';
$$;
revoke all on function public.badge_get(text) from public;
grant execute on function public.badge_get(text) to anon, authenticated, service_role;
