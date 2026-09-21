-- Supabase supplies pg_cron. Standalone Postgres can use the maintenance CLI.
begin;
do $migration$
begin
  if exists(select 1 from pg_available_extensions where name = 'pg_cron')
    and current_setting('shared_preload_libraries') like '%pg_cron%' then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'forecast-monitor-history-retention',
      '30 3 * * *',
      'select public.prune_rule_history();'
    );
  else
    raise notice 'pg_cron unavailable: schedule npm run history:prune daily on the application host';
  end if;
end;
$migration$;
commit;
