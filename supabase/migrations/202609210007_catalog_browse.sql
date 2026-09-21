-- Agency-based browsing groups use the same ranking and pagination as search.
begin;
create or replace function public.browse_rule_catalog(p_query text default '',p_agency text default null,p_limit integer default 10,p_offset integer default 0,p_prefixes text[] default null)
returns table(entry jsonb,has_snapshot boolean,total bigint)
language sql stable security invoker set search_path=public,pg_temp as $$
 with matches as (
  select c.entry,c.id,c.rin,
   (exists(select 1 from public.rules r where r.id=c.id and r.latest_snapshot is not null)) as checked,
   case when lower(c.rin)=lower(trim(p_query)) then 1000.0
    when to_tsvector('english',c.entry->>'title') @@ websearch_to_tsquery('english',left(p_query,200)) then 100.0
    when to_tsvector('english',c.search_text) @@ websearch_to_tsquery('english',left(p_query,200)) then 50.0
    else 0.0 end + ts_rank(to_tsvector('english',c.search_text),websearch_to_tsquery('english',left(p_query,200))) as rank
  from public.rule_catalog c where c.is_current
   and (p_prefixes is null or exists (select 1 from unnest(p_prefixes) prefix where starts_with(c.agency_code,prefix)))
   and (p_agency is null or c.agency_code=p_agency)
   and (trim(p_query)='' or to_tsvector('english',c.search_text) @@ websearch_to_tsquery('english',left(p_query,200))
      or position(lower(trim(left(p_query,200))) in lower(c.rin))>0
      or position(lower(trim(left(p_query,200))) in lower(coalesce(c.entry->'cfr_citation','[]'::jsonb)::text))>0
      or (length(trim(p_query))>=5 and position(lower(trim(left(p_query,200))) in lower(c.entry->>'title'))>0))
 )
 select matches.entry,checked,count(*) over() from matches order by rank desc,rin limit least(greatest(p_limit,1),100) offset least(greatest(p_offset,0),100000);
$$;
revoke all on function public.browse_rule_catalog(text,text,integer,integer,text[]) from public,anon,authenticated;
grant execute on function public.browse_rule_catalog(text,text,integer,integer,text[]) to service_role;
notify pgrst,'reload schema';
commit;
