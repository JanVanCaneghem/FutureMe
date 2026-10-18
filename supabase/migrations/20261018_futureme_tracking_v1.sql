-- FutureMe anonymous tracking. No personal data: random install id, shop domain, amounts.
-- Applied to Supabase project "FutureMe" (vlnakwrjuzogrkpbklod) on 2026-10-18.

create table public.installs (
  install_id   uuid primary key,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  version      text check (char_length(version) <= 20),
  browser      text check (char_length(browser) <= 20)
);

create table public.skips (
  id           bigint generated always as identity primary key,
  install_id   uuid not null references public.installs(install_id) on delete cascade,
  created_at   timestamptz not null default now(),
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 2000000),
  currency     text not null default 'EUR' check (char_length(currency) = 3),
  shop_domain  text check (char_length(shop_domain) <= 100)
);

create table public.qr_shown (
  id           bigint generated always as identity primary key,
  install_id   uuid not null references public.installs(install_id) on delete cascade,
  created_at   timestamptz not null default now(),
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 10000000)
);

create table public.transfers (
  id           bigint generated always as identity primary key,
  install_id   uuid not null references public.installs(install_id) on delete cascade,
  created_at   timestamptz not null default now(),
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 10000000),
  confirmed    boolean not null
);

create index on public.skips (install_id);
create index on public.qr_shown (install_id);
create index on public.transfers (install_id);
create index on public.installs (last_seen_at);

-- Lock everything down: RLS on, no policies, no direct table access for the client roles.
alter table public.installs  enable row level security;
alter table public.skips     enable row level security;
alter table public.qr_shown  enable row level security;
alter table public.transfers enable row level security;
revoke all on public.installs, public.skips, public.qr_shown, public.transfers from anon, authenticated;

-- Write-only entry points for the add-on.
create or replace function public.log_install(p_install_id uuid, p_version text default null, p_browser text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.installs (install_id, version, browser)
  values (p_install_id, left(p_version, 20), left(p_browser, 20))
  on conflict (install_id) do update
    set last_seen_at = now(),
        version = coalesce(excluded.version, public.installs.version),
        browser = coalesce(excluded.browser, public.installs.browser);
$$;

create or replace function public.log_skip(p_install_id uuid, p_amount_cents integer, p_shop_domain text default null, p_currency text default 'EUR')
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_install(p_install_id);
  insert into public.skips (install_id, amount_cents, shop_domain, currency)
  values (p_install_id, p_amount_cents, lower(left(p_shop_domain, 100)), upper(coalesce(p_currency, 'EUR')));
end $$;

create or replace function public.log_qr_shown(p_install_id uuid, p_amount_cents integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_install(p_install_id);
  insert into public.qr_shown (install_id, amount_cents) values (p_install_id, p_amount_cents);
end $$;

create or replace function public.log_transfer(p_install_id uuid, p_amount_cents integer, p_confirmed boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_install(p_install_id);
  insert into public.transfers (install_id, amount_cents, confirmed) values (p_install_id, p_amount_cents, p_confirmed);
end $$;

-- Public, aggregate-only summary for the website.
create or replace function public.public_stats()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'active_installs',      (select count(*) from public.installs where last_seen_at > now() - interval '30 days'),
    'total_installs',       (select count(*) from public.installs),
    'purchases_paused',     (select count(*) from public.skips),
    'total_pledged_eur',    (select coalesce(sum(amount_cents), 0) / 100.0 from public.skips),
    'qr_shown_eur',         (select coalesce(sum(amount_cents), 0) / 100.0 from public.qr_shown),
    'total_transferred_eur',(select coalesce(sum(amount_cents), 0) / 100.0 from public.transfers where confirmed),
    'pledged_to_transferred_rate',
      (select case when coalesce(sum(s.amount_cents),0) = 0 then 0
              else round((select coalesce(sum(amount_cents),0) from public.transfers where confirmed)::numeric / sum(s.amount_cents), 3) end
       from public.skips s),
    'updated_at', now()
  );
$$;

revoke all on function public.log_install(uuid, text, text), public.log_skip(uuid, integer, text, text),
  public.log_qr_shown(uuid, integer), public.log_transfer(uuid, integer, boolean), public.public_stats() from public;
grant execute on function public.log_install(uuid, text, text), public.log_skip(uuid, integer, text, text),
  public.log_qr_shown(uuid, integer), public.log_transfer(uuid, integer, boolean), public.public_stats() to anon, authenticated;
