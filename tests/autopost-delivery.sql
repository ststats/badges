-- Supabase SQL Editor에서 실행. 외부 요청 없이 테스트하고 원래 상태로 롤백한다.
begin;
set local lock_timeout = '3s';
do $$ declare s text; a jsonb; old_lease uuid; current_lease uuid; i integer; d text; begin
 select decrypted_secret into s from vault.decrypted_secrets where name='badge_write_secret' limit 1;
 d := to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS');
 update public.badge_autopost_state set started_at=now()-interval '1 day',last_completed=100,lease=null,lease_title_no=null,lease_until=null,last_attempt_at=null,attempts=0,blocked=false where id=1;
 a:=public.badge_autopost_claim(s,101,d);
 assert a ? 'lease', 'first claim'; old_lease:=(a->>'lease')::uuid;
 assert (select last_completed=100 from public.badge_autopost_state where id=1), 'dispatch must not complete';
 assert public.badge_autopost_claim(s,101,d)->>'reason'='cooldown', 'active lease';
 assert public.badge_autopost_result(s,old_lease,'retry'), 'retry accepted';
 assert (select last_completed=100 from public.badge_autopost_state where id=1), 'retry must not complete';
 for i in 2..3 loop
  update public.badge_autopost_state set lease_until=now()-interval '1 second',last_attempt_at=now()-interval '6 minutes' where id=1;
  a:=public.badge_autopost_claim(s,101,d);
  assert a ? 'lease','bounded retry available'; current_lease:=(a->>'lease')::uuid;
  assert not public.badge_autopost_result(s,old_lease,'complete'), 'stale callback rejected';
  assert public.badge_autopost_result(s,current_lease,'retry'), 'retry callback';
 end loop;
 update public.badge_autopost_state set lease_until=now()-interval '1 second',last_attempt_at=now()-interval '6 minutes' where id=1;
 assert public.badge_autopost_claim(s,101,d)->>'reason'='retry_limit','three attempt cap';
 a:=public.badge_autopost_claim(s,102,d);
 assert a ? 'lease','new notice can proceed'; current_lease:=(a->>'lease')::uuid;
 assert public.badge_autopost_result(s,current_lease,'complete'),'completion accepted';
 assert (select last_completed=102 and attempts=0 and lease is null from public.badge_autopost_state where id=1),'completion persisted';
 assert public.badge_autopost_claim(s,102,d)->>'reason'='unchanged','completed not retried';
 update public.badge_autopost_state set last_attempt_at=now()-interval '6 minutes' where id=1;
 a:=public.badge_autopost_claim(s,103,d);
 assert public.badge_autopost_result(s,(a->>'lease')::uuid,'blocked'),'pending block';
 assert public.badge_autopost_claim(s,104,d)->>'reason'='blocked','pending blocks even next notice';
 begin
  perform public.badge_autopost_claim('wrong',105,d);
  raise exception 'unauthorized claim accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'delivery SQL assertions passed; test changes rolled back' as result;
