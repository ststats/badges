-- badges.sql에 이어 실행. 본문/사진/쿠키 없이 감지·완료 번호와 실행 잠금만 저장한다.
create table if not exists public.badge_autopost_state (
  id integer primary key check (id = 1),
  started_at timestamptz not null default now(),
  last_completed bigint not null,
  lease uuid,
  lease_title_no bigint,
  lease_until timestamptz,
  last_attempt_at timestamptz,
  attempts integer not null default 0,
  blocked boolean not null default false
);
-- 이전 버전의 현재 번호를 기준선으로 보존한다. 등록 이력은 초기화하지 않는다.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='badge_autopost_state' and column_name='last_dispatched') then
    alter table public.badge_autopost_state rename column last_dispatched to last_completed;
    alter table public.badge_autopost_state rename column last_dispatched_at to last_attempt_at;
  end if;
end $$;
alter table public.badge_autopost_state add column if not exists attempts integer not null default 0;
alter table public.badge_autopost_state add column if not exists blocked boolean not null default false;
alter table public.badge_autopost_state enable row level security;
revoke all on public.badge_autopost_state from public, anon, authenticated;

create or replace function public.badge_autopost_claim(p_secret text, p_title_no bigint, p_reg_date text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  want text;
  st public.badge_autopost_state%rowtype;
  new_lease uuid;
  created boolean;
begin
  select decrypted_secret into want from vault.decrypted_secrets where name = 'badge_write_secret' limit 1;
  if want is null or p_secret is distinct from want then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_title_no is null or p_title_no <= 0 or p_reg_date is null or p_reg_date !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$' then raise exception 'invalid post'; end if;
  insert into public.badge_autopost_state (id, last_completed) values (1, p_title_no) on conflict do nothing;
  created := found;
  select * into st from public.badge_autopost_state where id = 1 for update;
  if created then return jsonb_build_object('reason', 'baseline'); end if;
  if st.blocked then return jsonb_build_object('reason', 'blocked'); end if;
  if st.last_completed >= p_title_no or (p_reg_date::timestamp at time zone 'Asia/Seoul') < st.started_at then
    return jsonb_build_object('reason', 'unchanged');
  end if;
  if st.lease_until > now() or st.last_attempt_at > now() - interval '5 minutes' then
    return jsonb_build_object('reason', 'cooldown');
  end if;
  if st.lease_title_no = p_title_no and st.attempts >= 3 then
    return jsonb_build_object('reason', 'retry_limit');
  end if;
  new_lease := gen_random_uuid();
  update public.badge_autopost_state
    set lease = new_lease, lease_title_no = p_title_no,
        lease_until = now() + interval '20 minutes', last_attempt_at = now(),
        attempts = case when st.lease_title_no = p_title_no then st.attempts + 1 else 1 end
    where id = 1;
  return jsonb_build_object('lease', new_lease);
end;
$$;

-- 워크플로 접수가 아닌 영구 이력 저장 결과를 받는다. 이전 실행의 늦은 콜백은 거절한다.
create or replace function public.badge_autopost_result(p_secret text, p_lease uuid, p_status text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare want text;
begin
  select decrypted_secret into want from vault.decrypted_secrets where name = 'badge_write_secret' limit 1;
  if want is null or p_secret is distinct from want then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('complete', 'retry', 'blocked') then raise exception 'invalid result'; end if;
  update public.badge_autopost_state
    set last_completed = case when p_status = 'complete' then greatest(last_completed, lease_title_no) else last_completed end,
        blocked = (p_status = 'blocked'),
        lease_until = case when p_status = 'retry' then now() + interval '5 minutes' else null end,
        lease = null,
        lease_title_no = case when p_status = 'complete' then null else lease_title_no end,
        attempts = case when p_status = 'complete' then 0 else attempts end
    where id = 1 and lease = p_lease;
  return found;
end;
$$;
revoke all on function public.badge_autopost_claim(text, bigint, text), public.badge_autopost_result(text, uuid, text) from public;
grant execute on function public.badge_autopost_claim(text, bigint, text), public.badge_autopost_result(text, uuid, text) to anon, authenticated;
drop function if exists public.badge_autopost_finish(text, uuid, boolean);
