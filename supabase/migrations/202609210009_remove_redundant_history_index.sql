-- The UNIQUE (rule_id, synced_at) constraint already supplies a btree index.
-- With rule_id fixed, scanning it backward serves newest-first history reads.
-- Keep sync_runs_latest_idx for pruning by timestamp across all rules.
begin;
drop index if exists public.sync_runs_rule_latest_idx;
commit;
