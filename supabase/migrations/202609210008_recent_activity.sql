begin;
create table if not exists public.activity_records (
 document_number text primary key,
 publication_date date not null,
 checked_at timestamptz not null,
 payload jsonb not null,
 check (payload->>'id'=document_number)
);
create table if not exists public.activity_assessments (
 fingerprint text primary key,
 document_number text not null references public.activity_records(document_number),
 created_at timestamptz not null default now(),
 payload jsonb not null,
 check (payload->>'fingerprint'=fingerprint)
);
alter table public.activity_records enable row level security;
alter table public.activity_assessments enable row level security;
revoke all on public.activity_records,public.activity_assessments from public,anon,authenticated;
grant select,insert,update on public.activity_records to service_role;
grant select,insert on public.activity_assessments to service_role;
create index if not exists activity_records_publication on public.activity_records(publication_date desc);
create or replace function public.save_activity_case(p_record jsonb)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 insert into public.activity_records(document_number,publication_date,checked_at,payload)
 values(p_record->>'id',(p_record->'selected'->>'publication_date')::date,(p_record->>'checked_at')::timestamptz,p_record)
 on conflict(document_number) do update set publication_date=excluded.publication_date,checked_at=excluded.checked_at,payload=excluded.payload
 where activity_records.checked_at <= excluded.checked_at;
 if not found then raise exception 'Stale activity check rejected'; end if;
 insert into public.activity_assessments(fingerprint,document_number,payload)
 values(p_record->>'fingerprint',p_record->>'id',p_record)
 on conflict(fingerprint) do nothing;
end;
$$;
revoke all on function public.save_activity_case(jsonb) from public,anon,authenticated;
grant execute on function public.save_activity_case(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
