-- Phase 1: apply before deploying the badges server reader.
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

-- ststat may retrieve the existing bridge credential; no browser or ordinary Auth user may do so.
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
