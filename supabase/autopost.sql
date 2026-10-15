-- badges.sql에 이어 실행. 멤버별 자동 등록 설정과 감지·완료 번호, 실행 잠금만 저장한다(본문/사진/쿠키 없음).
-- 한 멤버 전용이던 이전 표·함수(badge_autopost_state)는 지운다.

drop function if exists public.badge_autopost_claim(text, bigint, text);
drop function if exists public.badge_autopost_result(text, uuid, text);
drop function if exists public.badge_autopost_finish(text, uuid, boolean);
drop table if exists public.badge_autopost_state;

-- 상태 화면에서 고르는 대상: 멤버(SOOP ID)마다 켜짐과 와고 게시판
create table if not exists public.badge_autopost_targets (
  soop_id text primary key check (soop_id ~ '^[a-z0-9_]{1,50}$'),
  name text not null check (length(name) between 1 and 40),
  board text not null check (board ~ '^[a-z0-9_]{2,60}$'),
  enabled boolean not null default false,
  enabled_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.badge_autopost_targets enable row level security;
revoke all on public.badge_autopost_targets from public, anon, authenticated;

-- 켠 멤버마다 감지 상태. 켤 때·끌 때 지워서, 켠 뒤 첫 감지는 그때 글을 기준으로만 저장한다.
create table if not exists public.badge_autopost_target_state (
  soop_id text primary key references public.badge_autopost_targets(soop_id) on delete cascade,
  started_at timestamptz not null default now(),
  last_completed bigint not null,
  lease uuid unique,
  lease_title_no bigint,
  lease_until timestamptz,
  last_attempt_at timestamptz,
  attempts integer not null default 0,
  blocked boolean not null default false
);
alter table public.badge_autopost_target_state enable row level security;
revoke all on public.badge_autopost_target_state from public, anon, authenticated;

create or replace function public.badge_autopost_check_secret(p_secret text)
returns void language plpgsql security definer set search_path = '' as $$
declare want text;
begin
  select decrypted_secret into want from vault.decrypted_secrets where name = 'badge_write_secret' limit 1;
  if want is null or p_secret is distinct from want then raise exception 'forbidden' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.badge_autopost_check_secret(text) from public, anon, authenticated;

-- 설정과 감지 상태(상태 화면·감지기·등록 작업이 읽는다)
create or replace function public.badge_autopost_targets(p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.badge_autopost_check_secret(p_secret);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'soopId', t.soop_id, 'name', t.name, 'board', t.board, 'enabled', t.enabled,
      'enabledAt', t.enabled_at, 'blocked', coalesce(s.blocked, false), 'attempts', coalesce(s.attempts, 0)
    ) order by t.soop_id)
    from public.badge_autopost_targets t left join public.badge_autopost_target_state s using (soop_id)
  ), '[]'::jsonb);
end;
$$;

-- 상태 화면이 보낸 목록으로 바꾼다. 목록에 없는 멤버는 지우고, 새로 켜거나 끈 멤버는 감지 상태를 비운다.
create or replace function public.badge_autopost_targets_put(p_secret text, p_targets jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
  perform public.badge_autopost_check_secret(p_secret);
  if jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) > 100 then raise exception 'invalid targets'; end if;
  delete from public.badge_autopost_targets
    where soop_id not in (select x->>'soopId' from jsonb_array_elements(p_targets) x);
  for item in select * from jsonb_array_elements(p_targets) loop
    delete from public.badge_autopost_target_state s
      using public.badge_autopost_targets t
      where s.soop_id = t.soop_id and t.soop_id = item->>'soopId' and t.enabled <> (item->>'enabled')::boolean;
    insert into public.badge_autopost_targets (soop_id, name, board, enabled, enabled_at, updated_at)
    values (item->>'soopId', item->>'name', item->>'board', (item->>'enabled')::boolean,
            case when (item->>'enabled')::boolean then now() end, now())
    on conflict (soop_id) do update set
      name = excluded.name,
      board = excluded.board,
      enabled_at = case
        when not excluded.enabled then null
        when public.badge_autopost_targets.enabled then public.badge_autopost_targets.enabled_at
        else now() end,
      enabled = excluded.enabled,
      updated_at = now();
  end loop;
  return public.badge_autopost_targets(p_secret);
end;
$$;

create or replace function public.badge_autopost_claim(p_secret text, p_soop_id text, p_title_no bigint, p_reg_date text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  st public.badge_autopost_target_state%rowtype;
  enabled boolean;
  new_lease uuid;
  created boolean;
begin
  perform public.badge_autopost_check_secret(p_secret);
  if p_title_no is null or p_title_no <= 0 or p_reg_date is null or p_reg_date !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$' then raise exception 'invalid post'; end if;
  select t.enabled into enabled from public.badge_autopost_targets t where t.soop_id = p_soop_id;
  if enabled is not true then return jsonb_build_object('reason', 'disabled'); end if;
  insert into public.badge_autopost_target_state (soop_id, last_completed) values (p_soop_id, p_title_no) on conflict do nothing;
  created := found;
  select * into st from public.badge_autopost_target_state where soop_id = p_soop_id for update;
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
  update public.badge_autopost_target_state
    set lease = new_lease, lease_title_no = p_title_no,
        lease_until = now() + interval '20 minutes', last_attempt_at = now(),
        attempts = case when st.lease_title_no = p_title_no then st.attempts + 1 else 1 end
    where soop_id = p_soop_id;
  return jsonb_build_object('lease', new_lease);
end;
$$;

-- 워크플로 접수가 아닌 영구 이력 저장 결과를 받는다. 이전 실행의 늦은 콜백은 거절한다.
create or replace function public.badge_autopost_result(p_secret text, p_lease uuid, p_status text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.badge_autopost_check_secret(p_secret);
  if p_status is null or p_status not in ('complete', 'retry', 'blocked') then raise exception 'invalid result'; end if;
  update public.badge_autopost_target_state
    set last_completed = case when p_status = 'complete' then greatest(last_completed, lease_title_no) else last_completed end,
        blocked = (p_status = 'blocked'),
        lease_until = case when p_status = 'retry' then now() + interval '5 minutes' else null end,
        lease = null,
        lease_title_no = case when p_status = 'complete' then null else lease_title_no end,
        attempts = case when p_status = 'complete' then 0 else attempts end
    where lease = p_lease;
  return found;
end;
$$;

revoke all on function
  public.badge_autopost_targets(text),
  public.badge_autopost_targets_put(text, jsonb),
  public.badge_autopost_claim(text, text, bigint, text),
  public.badge_autopost_result(text, uuid, text)
from public;
grant execute on function
  public.badge_autopost_targets(text),
  public.badge_autopost_targets_put(text, jsonb),
  public.badge_autopost_claim(text, text, bigint, text),
  public.badge_autopost_result(text, uuid, text)
to anon, authenticated;
