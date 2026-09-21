-- General rule catalog, per-rule latest state, and six calendar months of changes.
-- Additive migration: preserves the original APOR identity and existing snapshots.
begin;
alter table public.rules add column latest_snapshot jsonb;
update public.rules r set latest_snapshot = (
  select snapshot from public.sync_runs s where s.rule_id = r.id order by synced_at desc limit 1
);
create index sync_runs_rule_latest_idx on public.sync_runs(rule_id, synced_at desc);

-- Excludes volatile retrieval fields. Must match lib/history.ts conceptually.
create function public.snapshot_content(s jsonb) returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'rule', s->'rule',
    'signals', coalesce((select jsonb_agg(v order by v::text) from (
      select jsonb_build_object('signal_type', x->'signal_type',
        'date', case when x->>'signal_type' = 'FR_CHECK' then 'null'::jsonb else x->'date' end,
        'date_precision', x->'date_precision', 'raw_wording', x->'raw_wording',
        'source_url', x->'source_url', 'source_name', x->'source_name') v
      from jsonb_array_elements(s->'signals') x) a), '[]'::jsonb),
    'forecast', (s->'forecast') - array['id','rule_id','updated_at','reasoning','evidence'],
    'warnings', coalesce((select jsonb_agg(x order by x::text) from jsonb_array_elements(s->'warnings') x), '[]'::jsonb)
  );
$$;
revoke all on function public.snapshot_content(jsonb) from public, anon, authenticated;
grant execute on function public.snapshot_content(jsonb) to service_role;

create or replace function public.save_rule_snapshot(p_snapshot jsonb)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  r jsonb := p_snapshot->'rule';
  f jsonb := p_snapshot->'forecast';
  s jsonb;
  previous_snapshot jsonb;
  checked_at timestamptz := (p_snapshot->>'synced_at')::timestamptz;
begin
  if coalesce(r->>'rin', '') !~ '^[0-9]{4}-[A-Z0-9]{4}$' or coalesce(r->>'id', '') !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$'
    or f->>'rule_id' is distinct from r->>'id' or checked_at is null
    or jsonb_typeof(p_snapshot->'signals') is distinct from 'array' then
    raise exception 'Invalid rule snapshot';
  end if;
  perform pg_advisory_xact_lock_shared(73142, 0);
  perform pg_advisory_xact_lock(73143, hashtext(r->>'id'));
  select latest_snapshot into previous_snapshot from public.rules where id = r->>'id';
  if previous_snapshot = p_snapshot then return; end if;
  if exists(select 1 from public.rules where id = r->>'id' and rin <> r->>'rin') then
    raise exception 'Rule identity cannot change';
  end if;
  if f->>'id' is distinct from 'forecast-' || (r->>'id') then raise exception 'Invalid forecast identity'; end if;
  if exists (select 1 from jsonb_array_elements(p_snapshot->'signals') x group by x->>'id' having count(*) > 1) then
    raise exception 'Duplicate signal identities';
  end if;
  if exists (
    select 1 from jsonb_each(f->'evidence') e, jsonb_array_elements_text(e.value) ref
    where not exists(select 1 from jsonb_array_elements(p_snapshot->'signals') evidence_signal where evidence_signal->>'id' = ref.value)
  ) then raise exception 'Evidence references missing signals'; end if;
  -- A slow, older refresh must not replace a newer completed refresh.
  if exists(select 1 from public.rules where id = r->>'id' and updated_at >= checked_at) then
    raise exception 'A newer refresh already completed; reload the dashboard';
  end if;

  insert into public.rules(id, rin, title, agency, cfr_citation, stage, summary, source_url, publication_id, legal_deadline, updated_at)
  values(r->>'id', r->>'rin', r->>'title', r->>'agency', array(select jsonb_array_elements_text(r->'cfr_citation')), r->>'stage', r->>'summary', r->>'source_url', r->>'publication_id', r->>'legal_deadline', checked_at)
  on conflict (id) do update set title=excluded.title, agency=excluded.agency, cfr_citation=excluded.cfr_citation, stage=excluded.stage, summary=excluded.summary, source_url=excluded.source_url, publication_id=excluded.publication_id, legal_deadline=excluded.legal_deadline, updated_at=excluded.updated_at;

  for s in select value from jsonb_array_elements(p_snapshot->'signals') loop
    if s->>'rule_id' is distinct from r->>'id' then raise exception 'Signal belongs to another rule'; end if;
    insert into public.signals(id, rule_id, signal_type, date, date_precision, title, description, raw_wording, source_url, source_name, observed_at)
    values(s->>'id', s->>'rule_id', s->>'signal_type', s->>'date', s->>'date_precision', s->>'title', s->>'description', s->>'raw_wording', s->>'source_url', s->>'source_name', (s->>'observed_at')::timestamptz)
    on conflict(id) do update set observed_at=greatest(signals.observed_at, excluded.observed_at), date=excluded.date
    where signals.rule_id = excluded.rule_id;
    if not found then raise exception 'Signal identity belongs to another rule'; end if;
  end loop;

  insert into public.forecasts(id, rule_id, likelihood, confidence, expected_change, summary_method, next_action, expected_action_date, final_rule_date, effective_date, reasoning, evidence, updated_at)
  values(f->>'id', f->>'rule_id', f->>'likelihood', f->>'confidence', f->>'expected_change', f->>'summary_method', f->>'next_action', f->>'expected_action_date', (f->>'final_rule_date')::date, (f->>'effective_date')::date, f->'reasoning', f->'evidence', (f->>'updated_at')::timestamptz)
  on conflict(id) do update set likelihood=excluded.likelihood, confidence=excluded.confidence, expected_change=excluded.expected_change, summary_method=excluded.summary_method, next_action=excluded.next_action, expected_action_date=excluded.expected_action_date, final_rule_date=excluded.final_rule_date, effective_date=excluded.effective_date, reasoning=excluded.reasoning, evidence=excluded.evidence, updated_at=excluded.updated_at;

  update public.rules set latest_snapshot = p_snapshot where id = r->>'id';
  if previous_snapshot is null or public.snapshot_content(previous_snapshot) is distinct from public.snapshot_content(p_snapshot) then
    insert into public.sync_runs(rule_id, synced_at, snapshot) values(r->>'id', checked_at, p_snapshot);
  end if;
  delete from public.sync_runs where rule_id = r->>'id' and synced_at < (current_timestamp at time zone 'UTC' - interval '6 months') at time zone 'UTC';
  delete from public.signals evidence where evidence.rule_id = r->>'id'
    and evidence.observed_at < (current_timestamp at time zone 'UTC' - interval '6 months') at time zone 'UTC'
    and not exists (select 1 from jsonb_array_elements(p_snapshot->'signals') current_signal where current_signal->>'id' = evidence.id)
    and not exists (select 1 from public.sync_runs history_row, jsonb_array_elements(history_row.snapshot->'signals') history_signal
      where history_row.rule_id = r->>'id' and history_signal->>'id' = evidence.id);
end;
$$;

grant delete on public.sync_runs, public.signals to service_role;

create function public.prune_rule_history() returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  -- Exclusive maintenance lock prevents deletion of evidence while a save runs.
  perform pg_advisory_xact_lock(73142, 0);
  delete from public.sync_runs where synced_at < (current_timestamp at time zone 'UTC' - interval '6 months') at time zone 'UTC';
  delete from public.signals s where s.observed_at < (current_timestamp at time zone 'UTC' - interval '6 months') at time zone 'UTC'
    and not exists (select 1 from public.rules r, jsonb_array_elements(r.latest_snapshot->'signals') x where x->>'id' = s.id)
    and not exists (select 1 from public.sync_runs r, jsonb_array_elements(r.snapshot->'signals') x where x->>'id' = s.id);
end;
$$;
revoke all on function public.prune_rule_history() from public, anon, authenticated;
grant execute on function public.prune_rule_history() to service_role;

create table public.catalog_import (
  singleton boolean primary key default true check(singleton),
  publication_id text not null,
  source_url text not null,
  imported_at timestamptz not null,
  entry_count integer not null check(entry_count > 0)
);
create table public.rule_catalog (
  id text primary key,
  rin text not null unique,
  entry jsonb not null,
  is_current boolean not null default true,
  imported_at timestamptz not null,
  agency_code text generated always as (entry->>'agency_code') stored,
  search_text text generated always as (
    coalesce(entry->>'title','') || ' ' || coalesce(entry->>'rin','') || ' ' ||
    coalesce(entry->>'agency','') || ' ' || coalesce((entry->'cfr_citation')::text,'') || ' ' || coalesce(entry->>'summary','')
  ) stored,
  check (rin ~ '^[0-9]{4}-[A-Z0-9]{4}$'),
  check (entry->>'id' = id and entry->>'rin' = rin)
);
create index rule_catalog_agency_idx on public.rule_catalog(agency_code) where is_current;
alter table public.rule_catalog enable row level security;
alter table public.catalog_import enable row level security;
revoke all on public.rule_catalog, public.catalog_import from anon, authenticated;
grant select, insert, update on public.rule_catalog, public.catalog_import to service_role;

create function public.save_rule_catalog(p_catalog jsonb) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  imported timestamptz := (p_catalog->>'imported_at')::timestamptz;
  edition text := p_catalog->>'publication_id';
  item jsonb;
begin
  perform pg_advisory_xact_lock(73144, 0);
  if jsonb_typeof(p_catalog->'entries') is distinct from 'array' or jsonb_array_length(p_catalog->'entries') = 0
    or imported is null or coalesce(edition,'') !~ '^[0-9]{6}$' then raise exception 'Invalid catalog'; end if;
  if exists(select 1 from public.catalog_import where imported_at > imported or publication_id > edition) then raise exception 'Stale catalog'; end if;
  if exists(select 1 from jsonb_array_elements(p_catalog->'entries') e group by e->>'rin' having count(*) > 1) then raise exception 'Duplicate catalog RIN'; end if;
  update public.rule_catalog set is_current = false;
  for item in select value from jsonb_array_elements(p_catalog->'entries') loop
    if item->>'publication_id' is distinct from edition or coalesce(item->>'title','') = ''
      or coalesce(item->>'id','') !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$' then raise exception 'Invalid catalog entry'; end if;
    insert into public.rule_catalog(id, rin, entry, imported_at) values(item->>'id',item->>'rin',item,imported)
    on conflict(id) do update set entry=excluded.entry, imported_at=excluded.imported_at, is_current=true
    where rule_catalog.rin=excluded.rin;
    if not found then raise exception 'Catalog identity cannot change'; end if;
  end loop;
  insert into public.catalog_import(singleton,publication_id,source_url,imported_at,entry_count)
    values(true,edition,p_catalog->>'source_url',imported,jsonb_array_length(p_catalog->'entries'))
    on conflict(singleton) do update set publication_id=excluded.publication_id, source_url=excluded.source_url, imported_at=excluded.imported_at, entry_count=excluded.entry_count;
end;
$$;
revoke all on function public.save_rule_catalog(jsonb) from public, anon, authenticated;
grant execute on function public.save_rule_catalog(jsonb) to service_role;

-- Prune on migration, on per-rule writes, and through the maintenance command.
select public.prune_rule_history();
notify pgrst, 'reload schema';
commit;
