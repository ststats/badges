-- 캄몬라이더 10분 경기(api/rider-tick.js). autopost-tick.sql처럼 기존 2분 live-status 작업에 호출만 덧붙인다.
-- 다시 실행해도 한 번만 붙는다. 끄려면 GitHub 저장소 변수 RIDER_RACE_ENABLED=false.
do $migration$
declare
  existing_job record;
  extra text := $command$

-- badges-rider-tick-v1
select net.http_post(
  url := 'https://staruniv-badges.vercel.app/api/rider-tick',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'badge_write_secret' limit 1)
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 30000
);
$command$;
begin
  if (select count(*) from cron.job where jobname = 'live-status') <> 1 then
    raise exception 'Expected exactly one existing live-status cron job';
  end if;
  select * into existing_job from cron.job where jobname = 'live-status';
  if existing_job.schedule <> '*/2 * * * *' then
    raise exception 'Existing live-status schedule must be verified before changing its command';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'badge_write_secret') then
    raise exception 'Existing badge_write_secret is required';
  end if;
  if position('badges-rider-tick-v1' in existing_job.command) = 0 then
    perform cron.alter_job(existing_job.jobid, command := rtrim(existing_job.command, E' \n\r\t;') || ';' || extra);
    raise notice 'live-status 작업에 캄몬라이더 호출을 붙였습니다';
  else
    raise notice '이미 붙어 있습니다(바꾼 것 없음)';
  end if;
end;
$migration$;

-- 확인: 1이면 붙어 있다
select count(*) as rider_tick_attached from cron.job
where jobname = 'live-status' and position('badges-rider-tick-v1' in command) > 0;
