begin;

create extension if not exists pgcrypto with schema extensions;

create type public.workspace_type as enum ('personal', 'business');
create type public.workspace_role as enum ('owner', 'admin', 'analyst', 'viewer');
create type public.plan_code as enum ('free', 'solo', 'team');
create type public.subscription_status as enum ('free', 'trialing', 'active', 'past_due', 'canceled', 'unpaid');
create type public.audit_status as enum ('draft', 'ready', 'running', 'complete', 'archived', 'failed');
create type public.source_provider as enum ('csv', 'pdf', 'quickbooks', 'stripe');
create type public.source_status as enum ('connected', 'needs_reauth', 'syncing', 'error', 'disconnected');
create type public.sync_status as enum ('queued', 'running', 'complete', 'failed');
create type public.finding_severity as enum ('critical', 'high', 'medium');
create type public.finding_confidence as enum ('high', 'medium', 'incomplete');
create type public.finding_status as enum ('complete', 'incomplete');

create table public.plans (
  code public.plan_code primary key,
  name text not null,
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  annual_price_cents integer not null check (annual_price_cents >= 0),
  seat_limit integer not null check (seat_limit > 0),
  client_limit integer not null check (client_limit > 0),
  audit_limit integer not null check (audit_limit > 0),
  storage_limit_bytes bigint not null check (storage_limit_bytes > 0),
  integrations_enabled boolean not null default false,
  scheduled_audits_enabled boolean not null default false,
  business_workspace_enabled boolean not null default false,
  active boolean not null default true
);

insert into public.plans (
  code, name, monthly_price_cents, annual_price_cents, seat_limit, client_limit,
  audit_limit, storage_limit_bytes, integrations_enabled, scheduled_audits_enabled,
  business_workspace_enabled
) values
  ('free', 'Free', 0, 0, 1, 3, 1, 52428800, false, false, false),
  ('solo', 'Solo', 3900, 39000, 1, 25, 25, 1073741824, true, true, false),
  ('team', 'Team', 12900, 129000, 5, 100, 100, 5368709120, true, true, true);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  is_platform_admin boolean not null default false,
  deletion_requested_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  type public.workspace_type not null default 'personal',
  created_by uuid not null references public.profiles(id),
  deletion_requested_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.workspace_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  plan_code public.plan_code not null default 'free' references public.plans(code),
  status public.subscription_status not null default 'free',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  billing_interval text check (billing_interval in ('month', 'year')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consent_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, terms_version, privacy_version)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.workspace_role not null check (role <> 'owner'),
  token_hash text not null unique,
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  currency text not null default 'USD' check (currency in ('USD', 'EUR', 'GBP', 'CAD', 'AUD')),
  status public.audit_status not null default 'draft',
  schema_version integer not null default 2,
  current_run_id uuid,
  created_by uuid not null references public.profiles(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  audit_id uuid not null references public.audits(id) on delete cascade,
  name text not null,
  external_id text,
  source public.source_provider not null default 'csv',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clients_audit_name_key on public.clients (audit_id, lower(name)) where deleted_at is null;
create unique index clients_external_key on public.clients (audit_id, source, external_id);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  audit_id uuid not null references public.audits(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null,
  hourly_rate numeric(14,2),
  retainer_amount numeric(14,2),
  included_hours numeric(12,2),
  payment_terms_days integer check (payment_terms_days between 0 and 365),
  annual_increase_percent numeric(6,3),
  start_date date,
  end_date date,
  confirmed boolean not null default false,
  source_name text,
  storage_path text,
  source_hash text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  audit_id uuid not null references public.audits(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null,
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  amount numeric(14,2) not null,
  hours numeric(12,2),
  rate numeric(14,2),
  status text not null default 'open',
  source public.source_provider not null default 'csv',
  source_name text,
  external_id text,
  source_updated_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audit_id, source, invoice_number)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  audit_id uuid not null references public.audits(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null,
  invoice_number text not null,
  payment_date date not null,
  amount numeric(14,2) not null,
  source public.source_provider not null default 'csv',
  source_name text,
  external_id text,
  source_updated_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audit_id, source, invoice_number, payment_date, amount)
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  audit_id uuid not null references public.audits(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null,
  entry_date date not null,
  hours numeric(12,2) not null check (hours >= 0),
  billable boolean not null default true,
  invoiced boolean not null default false,
  invoice_number text not null default '',
  description text not null default '',
  source public.source_provider not null default 'csv',
  source_name text,
  external_id text,
  source_updated_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audit_id, source, client_name, entry_date, hours, description)
);

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider public.source_provider not null check (provider in ('quickbooks', 'stripe')),
  status public.source_status not null default 'disconnected',
  external_account_id text,
  external_account_name text,
  last_synced_at timestamptz,
  last_cursor text,
  last_error_code text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, external_account_id)
);

create table public.oauth_credentials (
  data_source_id uuid primary key references public.data_sources(id) on delete cascade,
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scopes text[],
  key_version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table public.oauth_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider public.source_provider not null,
  state_hash text not null unique,
  code_verifier text,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz
);

create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  data_source_id uuid not null references public.data_sources(id) on delete cascade,
  status public.sync_status not null default 'queued',
  trigger text not null check (trigger in ('manual', 'scheduled', 'oauth')),
  records_read integer not null default 0,
  records_written integer not null default 0,
  error_code text,
  attempt integer not null default 1,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  audit_id uuid not null references public.audits(id) on delete cascade,
  engine_version text not null,
  schema_version integer not null,
  source_snapshot jsonb not null,
  source_hash text not null,
  finding_count integer not null default 0,
  recoverable_amount numeric(14,2) not null default 0,
  overdue_amount numeric(14,2) not null default 0,
  renewal_risk_amount numeric(14,2) not null default 0,
  requested_by uuid references public.profiles(id),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.audits add constraint audits_current_run_fk foreign key (current_run_id) references public.audit_runs(id) on delete set null;

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  audit_id uuid not null references public.audits(id) on delete cascade,
  audit_run_id uuid not null references public.audit_runs(id) on delete cascade,
  category text not null,
  client_name text not null,
  amount numeric(14,2),
  severity public.finding_severity not null,
  confidence public.finding_confidence not null,
  status public.finding_status not null,
  title text not null,
  explanation text not null,
  evidence text not null,
  recommended_action text not null,
  created_at timestamptz not null default now()
);

create table public.webhook_events (
  id text primary key,
  provider text not null,
  event_type text not null,
  status public.sync_status not null default 'queued',
  attempt integer not null default 1,
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.operational_events (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint operational_metadata_no_sensitive_keys check (
    not (metadata ?| array['token', 'secret', 'document', 'contract_text', 'financial_value'])
  )
);

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  subject text not null,
  body text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index memberships_user_idx on public.memberships(user_id);
create index audits_workspace_idx on public.audits(workspace_id) where deleted_at is null;
create index records_invoice_audit_idx on public.invoices(audit_id) where deleted_at is null;
create index records_payment_audit_idx on public.payments(audit_id) where deleted_at is null;
create index records_time_audit_idx on public.time_entries(audit_id) where deleted_at is null;
create index findings_audit_idx on public.findings(audit_id, audit_run_id);
create index sync_jobs_attention_idx on public.sync_jobs(status, created_at) where status in ('queued', 'failed');
create index operational_events_workspace_idx on public.operational_events(workspace_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','workspaces','subscriptions','clients','contracts','invoices','payments','time_entries','data_sources','support_requests']
  loop
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

create or replace function public.slugify(value text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(value, 'workspace')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.workspace_role_for(target_workspace_id uuid)
returns public.workspace_role
language sql stable security definer
set search_path = public
as $$
  select role from public.memberships
  where workspace_id = target_workspace_id and user_id = auth.uid();
$$;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where workspace_id = target_workspace_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_workspace(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.workspace_role_for(target_workspace_id) in ('owner','admin','analyst'), false);
$$;

create or replace function public.can_admin_workspace(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.workspace_role_for(target_workspace_id) in ('owner','admin'), false);
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_platform_admin);
$$;

create or replace function public.plan_for_workspace(target_workspace_id uuid)
returns public.plan_code language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when s.status in ('active','trialing') then s.plan_code else 'free'::public.plan_code end
    from public.subscriptions s where s.workspace_id = target_workspace_id
  ), 'free'::public.plan_code);
$$;

create or replace function public.entitlement_limit(target_workspace_id uuid, resource text)
returns bigint language sql stable security definer set search_path = public as $$
  select case resource
    when 'seat' then p.seat_limit
    when 'client' then p.client_limit
    when 'audit' then p.audit_limit
    when 'storage' then p.storage_limit_bytes
    else 0 end
  from public.plans p where p.code = public.plan_for_workspace(target_workspace_id);
$$;

create or replace function public.workspace_usage(target_workspace_id uuid)
returns table (seats bigint, clients bigint, active_audits bigint, storage_bytes bigint)
language sql stable security definer set search_path = public, storage as $$
  select
    (select count(*) from public.memberships where workspace_id = target_workspace_id),
    (select count(distinct lower(name)) from public.clients where workspace_id = target_workspace_id and deleted_at is null),
    (select count(*) from public.audits where workspace_id = target_workspace_id and deleted_at is null and status <> 'archived'),
    coalesce((select sum(coalesce((metadata->>'size')::bigint, 0)) from storage.objects where bucket_id = 'contracts' and (storage.foldername(name))[1] = target_workspace_id::text), 0)
  where public.is_workspace_member(target_workspace_id);
$$;

create or replace function public.enforce_workspace_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  resource text;
  current_count bigint;
begin
  if tg_table_name = 'memberships' then
    resource := 'seat';
    select count(*) into current_count from public.memberships where workspace_id = new.workspace_id;
  elsif tg_table_name = 'clients' then
    resource := 'client';
    if exists (
      select 1 from public.clients c
      where c.workspace_id = new.workspace_id and c.deleted_at is null
        and (
          lower(c.name) = lower(new.name)
          or (new.external_id is not null and c.source = new.source and c.external_id = new.external_id)
        )
    ) then return new; end if;
    select count(distinct lower(name)) into current_count from public.clients where workspace_id = new.workspace_id and deleted_at is null;
  elsif tg_table_name = 'audits' then
    resource := 'audit';
    select count(*) into current_count from public.audits where workspace_id = new.workspace_id and deleted_at is null and status <> 'archived';
  else
    raise exception 'Unsupported entitlement resource';
  end if;
  if current_count >= public.entitlement_limit(new.workspace_id, resource) then
    raise exception using errcode = 'P0001', message = format('%s plan limit reached', resource);
  end if;
  return new;
end;
$$;

create trigger enforce_membership_limit before insert on public.memberships for each row execute function public.enforce_workspace_limit();
create trigger enforce_client_limit before insert on public.clients for each row execute function public.enforce_workspace_limit();
create trigger enforce_audit_limit before insert on public.audits for each row execute function public.enforce_workspace_limit();

create or replace function public.create_audit(target_workspace_id uuid, audit_name text, audit_currency text)
returns uuid language plpgsql security definer set search_path = public as $$
declare result uuid;
begin
  if not public.can_edit_workspace(target_workspace_id) then raise exception 'Not authorized'; end if;
  insert into public.audits (workspace_id, name, currency, created_by)
  values (target_workspace_id, trim(audit_name), audit_currency, auth.uid())
  returning id into result;
  insert into public.operational_events (workspace_id, actor_id, event_type, entity_type, entity_id)
  values (target_workspace_id, auth.uid(), 'audit.created', 'audit', result);
  return result;
end;
$$;

create or replace function public.create_business_workspace(workspace_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare result uuid;
declare suffix text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
begin
  select w.id into result
    from public.workspaces w
    join public.memberships m on m.workspace_id = w.id
    join public.subscriptions s on s.workspace_id = w.id
    where m.user_id = auth.uid() and m.role = 'owner' and s.plan_code = 'team' and s.status in ('active','trialing')
    order by w.created_at limit 1;
  if result is null then raise exception 'A Team subscription is required'; end if;
  update public.workspaces
    set name = trim(workspace_name), slug = public.slugify(workspace_name) || '-' || suffix, type = 'business'
    where id = result;
  return result;
end;
$$;

create or replace function public.my_workspaces()
returns table (id uuid, name text, type public.workspace_type, slug text, role public.workspace_role, plan_code public.plan_code, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select w.id, w.name, w.type, w.slug, m.role, public.plan_for_workspace(w.id), w.created_at
  from public.workspaces w join public.memberships m on m.workspace_id = w.id
  where m.user_id = auth.uid() and w.deletion_requested_at is null
  order by w.created_at;
$$;

create or replace function public.workspace_members(target_workspace_id uuid)
returns table (user_id uuid, role public.workspace_role, display_name text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, m.role, p.display_name, p.email
  from public.memberships m join public.profiles p on p.id = m.user_id
  where m.workspace_id = target_workspace_id and public.is_workspace_member(target_workspace_id)
  order by case m.role when 'owner' then 1 when 'admin' then 2 when 'analyst' then 3 else 4 end, p.display_name;
$$;

create or replace function public.accept_workspace_invitation(raw_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare invitation public.invitations%rowtype;
begin
  select * into invitation from public.invitations
  where token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex')
    and accepted_at is null and expires_at > now()
  for update;
  if invitation.id is null then raise exception 'Invitation is invalid or expired'; end if;
  if lower(invitation.email) <> lower((select email from public.profiles where id = auth.uid())) then
    raise exception 'Invitation belongs to another email address';
  end if;
  insert into public.memberships(workspace_id, user_id, role)
  values (invitation.workspace_id, auth.uid(), invitation.role);
  update public.invitations set accepted_at = now() where id = invitation.id;
  insert into public.operational_events(workspace_id, actor_id, event_type, entity_type, entity_id)
  values (invitation.workspace_id, auth.uid(), 'membership.accepted', 'invitation', invitation.id);
  return invitation.workspace_id;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare workspace_id uuid;
declare base_name text := coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email, '@', 1));
declare suffix text := substr(replace(new.id::text, '-', ''), 1, 8);
begin
  insert into public.profiles(id, email, display_name) values (new.id, new.email, base_name);
  insert into public.workspaces(name, slug, type, created_by)
  values (base_name || '''s workspace', public.slugify(base_name) || '-' || suffix, 'personal', new.id)
  returning id into workspace_id;
  insert into public.memberships(workspace_id, user_id, role) values (workspace_id, new.id, 'owner');
  insert into public.subscriptions(workspace_id, plan_code, status) values (workspace_id, 'free', 'free');
  if coalesce(new.raw_user_meta_data->>'consent_version','') <> '' then
    insert into public.consent_acceptances(user_id, terms_version, privacy_version)
    values (new.id, new.raw_user_meta_data->>'consent_version', new.raw_user_meta_data->>'consent_version');
  end if;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.subscriptions enable row level security;
alter table public.consent_acceptances enable row level security;
alter table public.invitations enable row level security;
alter table public.audits enable row level security;
alter table public.clients enable row level security;
alter table public.contracts enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.time_entries enable row level security;
alter table public.data_sources enable row level security;
alter table public.oauth_credentials enable row level security;
alter table public.oauth_states enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.audit_runs enable row level security;
alter table public.findings enable row level security;
alter table public.webhook_events enable row level security;
alter table public.operational_events enable row level security;
alter table public.support_requests enable row level security;

create policy plans_public_read on public.plans for select using (active);
create policy profile_self_read on public.profiles for select using (id = auth.uid());
create policy profile_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and is_platform_admin = public.is_platform_admin());
create policy workspace_member_read on public.workspaces for select using (public.is_workspace_member(id));
create policy workspace_admin_update on public.workspaces for update using (public.can_admin_workspace(id)) with check (public.can_admin_workspace(id));
create policy membership_member_read on public.memberships for select using (public.is_workspace_member(workspace_id));
create policy membership_admin_insert on public.memberships for insert with check (public.can_admin_workspace(workspace_id));
create policy membership_owner_update on public.memberships for update using (public.workspace_role_for(workspace_id) = 'owner') with check (public.workspace_role_for(workspace_id) = 'owner');
create policy membership_owner_delete on public.memberships for delete using (public.workspace_role_for(workspace_id) = 'owner' and role <> 'owner');
create policy subscription_member_read on public.subscriptions for select using (public.is_workspace_member(workspace_id));
create policy consent_self_read on public.consent_acceptances for select using (user_id = auth.uid());
create policy invitation_admin_read on public.invitations for select using (public.can_admin_workspace(workspace_id));
create policy invitation_admin_delete on public.invitations for delete using (public.can_admin_workspace(workspace_id));

do $$
declare table_name text;
begin
  foreach table_name in array array['audits','clients','contracts','invoices','payments','time_entries','data_sources','support_requests']
  loop
    execute format('create policy %I_member_read on public.%I for select using (public.is_workspace_member(workspace_id))', table_name, table_name);
    execute format('create policy %I_editor_insert on public.%I for insert with check (public.can_edit_workspace(workspace_id))', table_name, table_name);
    execute format('create policy %I_editor_update on public.%I for update using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id))', table_name, table_name);
    execute format('create policy %I_admin_delete on public.%I for delete using (public.can_admin_workspace(workspace_id))', table_name, table_name);
  end loop;
end $$;

create policy sync_jobs_member_read on public.sync_jobs for select using (public.is_workspace_member(workspace_id));
create policy audit_runs_member_read on public.audit_runs for select using (public.is_workspace_member(workspace_id));
create policy findings_member_read on public.findings for select using (public.is_workspace_member(workspace_id));
create policy operational_owner_read on public.operational_events for select using (public.can_admin_workspace(workspace_id) or public.is_platform_admin());
create policy operational_admin_read on public.webhook_events for select using (public.is_platform_admin());

revoke all on public.oauth_credentials from anon, authenticated;
revoke all on public.oauth_states from anon, authenticated;
revoke all on public.webhook_events from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contracts', 'contracts', false, 15728640, array['application/pdf','text/csv'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy contracts_member_read on storage.objects for select to authenticated
using (bucket_id = 'contracts' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy contracts_editor_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'contracts'
  and public.can_edit_workspace(((storage.foldername(name))[1])::uuid)
  and coalesce((metadata->>'size')::bigint, 0)
    + coalesce((select storage_bytes from public.workspace_usage(((storage.foldername(name))[1])::uuid)), 0)
    <= public.entitlement_limit(((storage.foldername(name))[1])::uuid, 'storage')
);
create policy contracts_admin_delete on storage.objects for delete to authenticated
using (bucket_id = 'contracts' and public.can_admin_workspace(((storage.foldername(name))[1])::uuid));

grant execute on function public.my_workspaces() to authenticated;
grant execute on function public.workspace_members(uuid) to authenticated;
grant execute on function public.workspace_usage(uuid) to authenticated;
grant execute on function public.create_audit(uuid,text,text) to authenticated;
grant execute on function public.create_business_workspace(text) to authenticated;
grant execute on function public.accept_workspace_invitation(text) to authenticated;

commit;
