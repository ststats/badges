-- 뱃지(ststats/badges)가 쓰는 작은 저장소: 암호화된 SOOP 쿠키(cookie) 하나. 스타유니브 Supabase SQL 편집기에서 실행한다.
-- 읽기·쓰기 모두 Vault의 badge_write_secret을 확인하는 함수로만 한다. 일정은 스타유니브 api_schedule에서 읽는다.

create table if not exists public.badge_files (
  name text primary key,
  content text not null,
  updated_at timestamptz not null default now()
);
alter table public.badge_files enable row level security;
revoke all on public.badge_files from anon, authenticated;

-- 쓰기: 쿠키 암호문 하나를 덮어쓴다(비밀값이 맞을 때만)
create or replace function public.badge_put(p_content text, p_secret text)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  want text;
  ts timestamptz := clock_timestamp();
begin
  select decrypted_secret into want from vault.decrypted_secrets where name = 'badge_write_secret' limit 1;
  if want is null or p_secret is distinct from want then
    raise exception 'badge_put: forbidden' using errcode = '42501';
  end if;
  if length(p_content) > 100000 then
    raise exception 'badge_put: too long' using errcode = '22001';
  end if;
  insert into public.badge_files (name, content, updated_at) values ('cookie', p_content, ts)
  on conflict (name) do update set content = excluded.content, updated_at = ts;
  return ts;
end;
$$;

revoke all on function public.badge_put(text, text) from public;
grant execute on function public.badge_put(text, text) to anon, authenticated;

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

-- ststat이 공지 연결용 비밀값을 읽는다. 브라우저·일반 로그인 사용자는 못 읽는다.
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
