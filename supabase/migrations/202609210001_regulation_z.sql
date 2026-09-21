-- All writes are server-side. No anon/authenticated policies are intentional.
begin;

create table public.rules (
  id text primary key,
  rin text not null unique,
  title text not null,
  agency text not null,
  cfr_citation text[] not null,
  stage text not null,
  summary text not null,
  source_url text not null,
  publication_id text not null,
  legal_deadline text not null,
  updated_at timestamptz not null
);

create table public.signals (
  id text primary key,
  rule_id text not null references public.rules(id),
  signal_type text not null check (signal_type in ('AGENDA_LISTED','EXPECTED_CHANGE','CFR_AFFECTED','LEGAL_DEADLINE','PROPOSED_RULE_STAGE','NPRM_SCHEDULED','NPRM_PUBLISHED','COMMENT_PERIOD_OPEN','COMMENT_PERIOD_CLOSED','FINAL_RULE_STAGE','FINAL_RULE_PUBLISHED','EFFECTIVE_DATE','FR_CHECK','REVIEW_REQUIRED')),
  -- Text preserves YYYY-MM precision; no fabricated day is stored.
  date text,
  date_precision text not null check (date_precision in ('day','month','unknown')),
  title text not null,
  description text not null,
  raw_wording text not null,
  source_url text not null,
  source_name text not null,
  observed_at timestamptz not null,
  first_observed_at timestamptz not null default now()
);
create index signals_rule_id_idx on public.signals(rule_id);

create table public.forecasts (
  id text primary key,
  rule_id text not null unique references public.rules(id),
  likelihood text not null check (likelihood in ('EARLY','DEVELOPING','STRONG','HIGH SIGNAL','VERY HIGH SIGNAL','FINALIZED','REVIEW REQUIRED')),
  confidence text not null,
  expected_change text not null,
  summary_method text not null check (summary_method in ('official-excerpt','gemini')),
  next_action text not null,
  expected_action_date text,
  final_rule_date date,
  effective_date date,
  reasoning jsonb not null,
  evidence jsonb not null,
  updated_at timestamptz not null
);

-- Each successful refresh is a complete, auditable snapshot. History is not
-- reused as active evidence: the newest snapshot contains only current signals.
create table public.sync_runs (
  id bigint generated always as identity primary key,
  rule_id text not null references public.rules(id),
  synced_at timestamptz not null,
  snapshot jsonb not null,
  unique (rule_id, synced_at)
);
create index sync_runs_latest_idx on public.sync_runs(synced_at desc);

alter table public.rules enable row level security;
alter table public.signals enable row level security;
alter table public.forecasts enable row level security;
alter table public.sync_runs enable row level security;
revoke all on public.rules, public.signals, public.forecasts, public.sync_runs from anon, authenticated;
grant select, insert, update on public.rules, public.signals, public.forecasts, public.sync_runs to service_role;
grant usage, select on sequence public.sync_runs_id_seq to service_role;

create function public.save_rule_snapshot(p_snapshot jsonb)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  r jsonb := p_snapshot->'rule';
  f jsonb := p_snapshot->'forecast';
  s jsonb;
  checked_at timestamptz := (p_snapshot->>'synced_at')::timestamptz;
begin
  if r->>'rin' is distinct from '3170-AB57' or r->>'id' is distinct from 'apor-contingency'
    or f->>'rule_id' is distinct from r->>'id' or checked_at is null
    or jsonb_typeof(p_snapshot->'signals') is distinct from 'array' then
    raise exception 'Invalid rule snapshot';
  end if;
  perform pg_advisory_xact_lock(hashtext('regulation-z-3170-AB57'));
  -- A slow, older refresh must not replace a newer completed refresh.
  if exists(select 1 from public.rules where id = r->>'id' and updated_at > checked_at) then
    raise exception 'A newer refresh already completed; reload the dashboard';
  end if;

  insert into public.rules(id, rin, title, agency, cfr_citation, stage, summary, source_url, publication_id, legal_deadline, updated_at)
  values(r->>'id', r->>'rin', r->>'title', r->>'agency', array(select jsonb_array_elements_text(r->'cfr_citation')), r->>'stage', r->>'summary', r->>'source_url', r->>'publication_id', r->>'legal_deadline', checked_at)
  on conflict (id) do update set title=excluded.title, agency=excluded.agency, cfr_citation=excluded.cfr_citation, stage=excluded.stage, summary=excluded.summary, source_url=excluded.source_url, publication_id=excluded.publication_id, legal_deadline=excluded.legal_deadline, updated_at=excluded.updated_at;

  for s in select value from jsonb_array_elements(p_snapshot->'signals') loop
    if s->>'rule_id' is distinct from r->>'id' then raise exception 'Signal belongs to another rule'; end if;
    insert into public.signals(id, rule_id, signal_type, date, date_precision, title, description, raw_wording, source_url, source_name, observed_at)
    values(s->>'id', s->>'rule_id', s->>'signal_type', s->>'date', s->>'date_precision', s->>'title', s->>'description', s->>'raw_wording', s->>'source_url', s->>'source_name', (s->>'observed_at')::timestamptz)
    on conflict(id) do update set observed_at=greatest(signals.observed_at, excluded.observed_at);
  end loop;

  insert into public.forecasts(id, rule_id, likelihood, confidence, expected_change, summary_method, next_action, expected_action_date, final_rule_date, effective_date, reasoning, evidence, updated_at)
  values(f->>'id', f->>'rule_id', f->>'likelihood', f->>'confidence', f->>'expected_change', f->>'summary_method', f->>'next_action', f->>'expected_action_date', (f->>'final_rule_date')::date, (f->>'effective_date')::date, f->'reasoning', f->'evidence', (f->>'updated_at')::timestamptz)
  on conflict(id) do update set likelihood=excluded.likelihood, confidence=excluded.confidence, expected_change=excluded.expected_change, summary_method=excluded.summary_method, next_action=excluded.next_action, expected_action_date=excluded.expected_action_date, final_rule_date=excluded.final_rule_date, effective_date=excluded.effective_date, reasoning=excluded.reasoning, evidence=excluded.evidence, updated_at=excluded.updated_at;

  insert into public.sync_runs(rule_id, synced_at, snapshot) values(r->>'id', checked_at, p_snapshot)
  on conflict(rule_id, synced_at) do nothing;
end;
$$;
revoke all on function public.save_rule_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.save_rule_snapshot(jsonb) to service_role;
commit;
