alter table route_plans
  add column if not exists pickup_offsets_seconds integer[];
