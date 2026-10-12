-- badges.sql에 이어 실행. 공개 member_posts와 분리해 번호/감지 상태만 저장한다.
create table if not exists public.badge_autopost_state (
  id integer primary key check (id = 1),
  started_at timestamptz not null default now(),
  last_dispatched bigint not null,
  lease uuid,
  lease_title_no bigint,
  lease_until timestamptz,
  last_dispatched_at timestamptz
);
alter table public.badge_autopost_state enable row level security;
revoke all on public.badge_autopost_state from public, anon, authenticated;

create or replace function public.badge_autopost_claim(p_secret text, p_title_no bigint, p_reg_date text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  want text;
  st public.badge_autopost_state%rowtype;
  new_lease uuid;
  created boolean;
begin
  select decrypted_secret into want from vault.decrypted_secrets where name = 'badge_write_secret' limit 1;
  if want is null or p_secret is distinct from want then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_title_no is null or p_title_no <= 0 or p_reg_date is null or p_reg_date !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$' then raise exception 'invalid post'; end if;
  -- 첫 요청은 현재 글을 기준으로만 저장해 과거 공지를 올리지 않는다.
  insert into public.badge_autopost_state (id, last_dispatched) values (1, p_title_no) on conflict do nothing;
  created := found;
  select * into st from public.badge_autopost_state where id = 1 for update;
  if created then return jsonb_build_object('reason', 'baseline'); end if;
  if st.last_dispatched >= p_title_no or (p_reg_date::timestamp at time zone 'Asia/Seoul') < st.started_at then
    return jsonb_build_object('reason', 'unchanged');
  end if;
  if st.lease_until > now() or st.last_dispatched_at > now() - interval '5 minutes' then
    return jsonb_build_object('reason', 'cooldown');
  end if;
  new_lease := gen_random_uuid();
  update public.badge_autopost_state set lease = new_lease, lease_title_no = p_title_no, lease_until = now() + interval '5 minutes' where id = 1;
  return jsonb_build_object('lease', new_lease);
end;
$$;

create or replace function public.badge_autopost_finish(p_secret text, p_lease uuid, p_success boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare want text;
begin
  select decrypted_secret into want from vault.decrypted_secrets where name = 'badge_write_secret' limit 1;
  if want is null or p_secret is distinct from want then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.badge_autopost_state
    set last_dispatched = case when p_success then lease_title_no else last_dispatched end,
        last_dispatched_at = case when p_success then now() else last_dispatched_at end,
        lease_until = case when p_success then null else now() + interval '2 minutes' end,
        lease = null, lease_title_no = null
    where id = 1 and lease = p_lease;
  return found;
end;
$$;
revoke all on function public.badge_autopost_claim(text, bigint, text), public.badge_autopost_finish(text, uuid, boolean) from public;
grant execute on function public.badge_autopost_claim(text, bigint, text), public.badge_autopost_finish(text, uuid, boolean) to anon, authenticated;
