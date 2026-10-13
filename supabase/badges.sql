-- 소주양 뱃지(ststats/badges)가 쓰는 작은 저장소. 스타유니브 Supabase SQL 편집기에서 한 번 실행한다.
-- 일정(schedule)과 암호화된 쿠키(cookie)를 저장하면 뱃지에 바로 반영된다(재배포 없음).
-- 일정은 공개 RPC로, 쿠키 읽기와 쓰기는 Vault의 badge_write_secret을 검증하는 RPC로 처리한다.

create table if not exists public.badge_files (
  name text primary key,
  content text not null,
  updated_at timestamptz not null default now()
);
alter table public.badge_files enable row level security;
revoke all on public.badge_files from anon, authenticated;

-- 공개 읽기는 일정만. 암호화된 쿠키는 서버 인증을 거친 badge_get_secret으로 읽는다.
create or replace function public.badge_get(p_name text)
returns table (content text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.content, f.updated_at from public.badge_files f where f.name = p_name and f.name = 'schedule';
$$;

-- 쓰기: p_expected(불러온 때의 updated_at)가 있으면 그사이 바뀌었는지 확인한다
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
  if p_name not in ('schedule', 'cookie') then
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

revoke all on function public.badge_get(text), public.badge_put(text, text, text, timestamptz) from public;
grant execute on function public.badge_get(text), public.badge_put(text, text, text, timestamptz) to anon, authenticated;

-- 쓰기 비밀값(아래 문자열을 바꿔서 실행하고, 같은 값을 Vercel 환경 변수 BADGE_WRITE_SECRET에 넣는다)
-- select vault.create_secret('<긴 아무 문자열>', 'badge_write_secret');


-- 서버 전용 쿠키 읽기. 암호문도 익명 호출자에게 반환하지 않는다.
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
