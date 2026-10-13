
create table if not exists public.badge_files (
  name text primary key,
  content text not null,
  updated_at timestamptz not null default now()
);
alter table public.badge_files enable row level security;
revoke all on public.badge_files from anon, authenticated;

drop function if exists public.badge_get(text);

create or replace function public.badge_put(p_name text, p_content text, p_secret text, p_expected timestamptz default null)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  want text;
  cur timestamptz;
  ts timestamptz := clock_timestamp();
begin
  select decrypted_secret into want from vault.decrypted_secrets where name = 'badge_write_secret' limit 1;
  if want is null or p_secret is distinct from want then
    raise exception 'badge_put: forbidden' using errcode = '42501';
  end if;
  if p_name <> 'cookie' then
    raise exception 'badge_put: unknown name %', p_name using errcode = '22023';
  end if;
  if length(p_content) > 100000 then
    raise exception 'badge_put: too long' using errcode = '22001';
  end if;
  select f.updated_at into cur from public.badge_files f where f.name = p_name for update;
  if p_expected is not null and cur is not null and cur <> p_expected then
    raise exception 'badge_put: conflict' using errcode = '40001';
  end if;
  insert into public.badge_files (name, content, updated_at) values (p_name, p_content, ts)
  on conflict (name) do update set content = excluded.content, updated_at = ts;
  return ts;
end;
$$;

revoke all on function public.badge_put(text, text, text, timestamptz) from public;
grant execute on function public.badge_get(text), public.badge_put(text, text, text, timestamptz) to anon, authenticated;



create or replace function public.badge_get_secret(p_secret text)
returns table(content text, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare want text;
begin
  select s.decrypted_secret into want from vault.decrypted_secrets s where s.name='badge_write_secret' limit 1;
  if want is null or p_secret is distinct from want then
    raise exception 'forbidden' using errcode='42501';
  end if;
  return query select f.content,f.updated_at from public.badge_files f where f.name='cookie';
end;
$$;
revoke all on function public.badge_get_secret(text) from public;
grant execute on function public.badge_get_secret(text) to anon, authenticated, service_role;

create or replace function public.badge_notice_bridge_secret() returns text
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'forbidden' using errcode='42501';
  end if;
  return (select s.decrypted_secret from vault.decrypted_secrets s where s.name='badge_write_secret' limit 1);
end;
$$;
revoke all on function public.badge_notice_bridge_secret() from public, anon, authenticated;
grant execute on function public.badge_notice_bridge_secret() to service_role;
