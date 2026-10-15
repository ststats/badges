-- Supabase SQL Editor에서 실행. 외부 요청 없이 테스트하고 원래 상태로 롤백한다.
begin;
set local lock_timeout = '3s';
do $$ declare s text; a jsonb; old_lease uuid; current_lease uuid; i integer; d text; saved jsonb; begin
 select decrypted_secret into s from vault.decrypted_secrets where name='badge_write_secret' limit 1;
 d := to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS');
 saved := (select coalesce(jsonb_agg(jsonb_build_object('soopId',soop_id,'name',name,'board',board,'enabled',enabled)),'[]') from public.badge_autopost_targets);
 -- 켜지 않은 멤버는 감지하지 않는다
 perform public.badge_autopost_targets_put(s, saved || '[{"soopId":"sqltest01","name":"시험","board":"pan_sqltest01","enabled":false}]');
 assert public.badge_autopost_claim(s,'sqltest01',100,d)->>'reason'='disabled', 'disabled target';
 assert public.badge_autopost_claim(s,'nobody',100,d)->>'reason'='disabled', 'unknown target';
 -- 켠 뒤 첫 감지는 기준만 저장한다
 perform public.badge_autopost_targets_put(s, saved || '[{"soopId":"sqltest01","name":"시험","board":"pan_sqltest01","enabled":true}]');
 assert public.badge_autopost_claim(s,'sqltest01',100,d)->>'reason'='baseline', 'baseline on enable';
 update public.badge_autopost_target_state set started_at=now()-interval '1 day' where soop_id='sqltest01';
 a:=public.badge_autopost_claim(s,'sqltest01',101,d);
 assert a ? 'lease', 'first claim'; old_lease:=(a->>'lease')::uuid;
 assert (select last_completed=100 from public.badge_autopost_target_state where soop_id='sqltest01'), 'dispatch must not complete';
 assert public.badge_autopost_claim(s,'sqltest01',101,d)->>'reason'='cooldown', 'active lease';
 assert public.badge_autopost_result(s,old_lease,'retry'), 'retry accepted';
 assert (select last_completed=100 from public.badge_autopost_target_state where soop_id='sqltest01'), 'retry must not complete';
 for i in 2..3 loop
  update public.badge_autopost_target_state set lease_until=now()-interval '1 second',last_attempt_at=now()-interval '6 minutes' where soop_id='sqltest01';
  a:=public.badge_autopost_claim(s,'sqltest01',101,d);
  assert a ? 'lease','bounded retry available'; current_lease:=(a->>'lease')::uuid;
  assert not public.badge_autopost_result(s,old_lease,'complete'), 'stale callback rejected';
  assert public.badge_autopost_result(s,current_lease,'retry'), 'retry callback';
 end loop;
 update public.badge_autopost_target_state set lease_until=now()-interval '1 second',last_attempt_at=now()-interval '6 minutes' where soop_id='sqltest01';
 assert public.badge_autopost_claim(s,'sqltest01',101,d)->>'reason'='retry_limit','three attempt cap';
 a:=public.badge_autopost_claim(s,'sqltest01',102,d);
 assert a ? 'lease','new notice can proceed'; current_lease:=(a->>'lease')::uuid;
 assert public.badge_autopost_result(s,current_lease,'complete'),'completion accepted';
 assert (select last_completed=102 and attempts=0 and lease is null from public.badge_autopost_target_state where soop_id='sqltest01'),'completion persisted';
 assert public.badge_autopost_claim(s,'sqltest01',102,d)->>'reason'='unchanged','completed not retried';
 update public.badge_autopost_target_state set last_attempt_at=now()-interval '6 minutes' where soop_id='sqltest01';
 a:=public.badge_autopost_claim(s,'sqltest01',103,d);
 assert public.badge_autopost_result(s,(a->>'lease')::uuid,'blocked'),'pending block';
 assert public.badge_autopost_claim(s,'sqltest01',104,d)->>'reason'='blocked','pending blocks even next notice';
 -- 껐다 켜면 감지 상태를 비우고 다시 기준부터
 perform public.badge_autopost_targets_put(s, saved || '[{"soopId":"sqltest01","name":"시험","board":"pan_sqltest01","enabled":false}]');
 perform public.badge_autopost_targets_put(s, saved || '[{"soopId":"sqltest01","name":"시험","board":"pan_sqltest01","enabled":true}]');
 assert public.badge_autopost_claim(s,'sqltest01',105,d)->>'reason'='baseline','re-enable resets state';
 -- 목록에서 빠진 멤버는 지운다
 perform public.badge_autopost_targets_put(s, saved);
 assert not exists (select 1 from public.badge_autopost_targets where soop_id='sqltest01'),'removed target deleted';
 begin
  perform public.badge_autopost_claim('wrong','sqltest01',106,d);
  raise exception 'unauthorized claim accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.badge_autopost_targets('wrong');
  raise exception 'unauthorized read accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'delivery SQL assertions passed; test changes rolled back' as result;
