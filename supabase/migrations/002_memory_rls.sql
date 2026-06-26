alter table memory_events enable row level security;
alter table memory_items enable row level security;
alter table memory_embeddings enable row level security;
alter table memory_objects enable row level security;
alter table memory_versions enable row level security;
alter table memory_feedback enable row level security;
alter table memory_access_logs enable row level security;

alter table memory_events force row level security;
alter table memory_items force row level security;
alter table memory_embeddings force row level security;
alter table memory_objects force row level security;
alter table memory_versions force row level security;
alter table memory_feedback force row level security;
alter table memory_access_logs force row level security;

create policy memory_events_tenant_policy on memory_events
  for all
  to authenticated
  using (tenant_id::text = auth.jwt() ->> 'tenant_id')
  with check (tenant_id::text = auth.jwt() ->> 'tenant_id');

create policy memory_items_tenant_policy on memory_items
  for all
  to authenticated
  using (tenant_id::text = auth.jwt() ->> 'tenant_id')
  with check (tenant_id::text = auth.jwt() ->> 'tenant_id');

create policy memory_embeddings_tenant_policy on memory_embeddings
  for all
  to authenticated
  using (tenant_id::text = auth.jwt() ->> 'tenant_id')
  with check (tenant_id::text = auth.jwt() ->> 'tenant_id');

create policy memory_objects_tenant_policy on memory_objects
  for all
  to authenticated
  using (tenant_id::text = auth.jwt() ->> 'tenant_id')
  with check (tenant_id::text = auth.jwt() ->> 'tenant_id');

create policy memory_versions_tenant_policy on memory_versions
  for all
  to authenticated
  using (tenant_id::text = auth.jwt() ->> 'tenant_id')
  with check (tenant_id::text = auth.jwt() ->> 'tenant_id');

create policy memory_feedback_tenant_policy on memory_feedback
  for all
  to authenticated
  using (tenant_id::text = auth.jwt() ->> 'tenant_id')
  with check (tenant_id::text = auth.jwt() ->> 'tenant_id');

create policy memory_access_logs_tenant_policy on memory_access_logs
  for all
  to authenticated
  using (tenant_id::text = auth.jwt() ->> 'tenant_id')
  with check (tenant_id::text = auth.jwt() ->> 'tenant_id');
