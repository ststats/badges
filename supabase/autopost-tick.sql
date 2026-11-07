-- autopost.sql 적용 후 실행한다.
-- 기존 2분 live-status 작업에 호출만 덧붙인다. 새 cron 작업/주기를 만들지 않는다.
do $migration$
declare
  existing_job record;
  extra text := $command$

-- badges-autopost-tick-v1
select net.http_post(
  url := 'https://staruniv-badges.vercel.app/api/autopost-detect',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'badge_write_secret' limit 1)
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
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
  if position('badges-autopost-tick-v1' in existing_job.command) = 0 then
    perform cron.alter_job(existing_job.jobid, command := rtrim(existing_job.command, E' \n\r\t;') || ';' || extra);
  end if;
end;
$migration$;
