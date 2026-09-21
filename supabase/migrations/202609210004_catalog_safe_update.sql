-- Supabase safeupdate requires explicitly scoped UPDATE statements.
begin;
create or replace function public.save_rule_catalog(p_catalog jsonb) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
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
  update public.rule_catalog set is_current = false where is_current;
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
notify pgrst, 'reload schema';
commit;
