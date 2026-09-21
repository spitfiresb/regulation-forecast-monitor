-- Forecast issues are immutable and independent of six-month operational history.
begin;
create table public.prediction_issues (
 id text primary key check (id ~ '^[a-f0-9]{64}$'),
 rule_id text not null references public.rules(id),
 issued_at timestamptz not null,
 window_end timestamptz not null,
 payload jsonb not null,
 check (payload->>'id'=id and payload->>'rule_id'=rule_id),
 check ((payload->>'issued_at')::timestamptz=issued_at and (payload->>'window_end')::timestamptz=window_end)
);
create index prediction_issues_latest on public.prediction_issues(rule_id,issued_at desc);
create table public.prediction_resolutions (
 id bigint generated always as identity primary key,
 prediction_id text not null references public.prediction_issues(id) on delete cascade,
 checked_at timestamptz not null,
 outcome text not null check (outcome in ('occurred','did_not_occur','pending','unresolved')),
 evidence jsonb not null,
 reason text not null
);
alter table public.prediction_issues enable row level security;
alter table public.prediction_resolutions enable row level security;
revoke all on public.prediction_issues,public.prediction_resolutions from anon,authenticated;
grant select,insert on public.prediction_issues,public.prediction_resolutions to service_role;
grant usage,select on sequence public.prediction_resolutions_id_seq to service_role;
-- No UPDATE grant: revisions are new issues and resolutions are appended.
create function public.prune_prediction_ledger() returns void language sql security definer set search_path=public,pg_temp as $$
 delete from public.prediction_issues where issued_at < now()-interval '12 months' and window_end < now()-interval '30 days';
$$;
revoke all on function public.prune_prediction_ledger() from public,anon,authenticated;
grant execute on function public.prune_prediction_ledger() to service_role;
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('forecast-monitor-prediction-retention','45 3 * * *','select public.prune_prediction_ledger();');
 end if;
end $$;

create index rule_catalog_search_vector on public.rule_catalog using gin(to_tsvector('english',search_text));
create function public.search_rule_catalog(p_query text default '',p_agency text default null,p_limit integer default 10,p_offset integer default 0)
returns table(entry jsonb,has_snapshot boolean,total bigint)
language sql stable security invoker set search_path=public,pg_temp as $$
 with matches as (
  select c.entry,c.id,c.rin,
   (exists(select 1 from public.rules r where r.id=c.id and r.latest_snapshot is not null)) as checked,
   case when lower(c.rin)=lower(trim(p_query)) then 1000.0
    when position(lower(trim(p_query)) in lower(c.entry->>'title'))>0 then 100.0
    else 0.0 end + ts_rank(to_tsvector('english',c.search_text),websearch_to_tsquery('english',left(p_query,200))) as rank
  from public.rule_catalog c where c.is_current
   and (p_agency is null or c.agency_code=p_agency)
   and (trim(p_query)='' or to_tsvector('english',c.search_text) @@ websearch_to_tsquery('english',left(p_query,200))
      or position(lower(trim(left(p_query,200))) in lower(c.search_text))>0)
 )
 select matches.entry,checked,count(*) over() from matches order by rank desc,rin limit least(greatest(p_limit,1),100) offset least(greatest(p_offset,0),100000);
$$;
revoke all on function public.search_rule_catalog(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.search_rule_catalog(text,text,integer,integer) to service_role;
notify pgrst,'reload schema';
commit;
