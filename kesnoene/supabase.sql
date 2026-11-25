-- =====================================================================
-- KESNOENE · Supabase schema (ronde 2)
-- Veilig om meermaals uit te voeren in de SQL Editor.
--
-- Dit bestand bevat GEEN geheime inhoud (geen stopnamen, geen
-- vakjestekst, geen codes). Die komen uit supabase-seed.sql, dat je
-- apart en zelf uitvoert (en niet commit, zie .gitignore).
-- =====================================================================

create table if not exists ticks (
  player text not null,
  cell_id text not null,
  ticked_at timestamptz default now(),
  primary key (player, cell_id)
);

create table if not exists unlocks (
  stop_id text primary key,
  state text not null check (state in ('open','closed')),
  updated_at timestamptz default now()
);
alter table unlocks add column if not exists state text not null default 'open';
alter table unlocks add column if not exists updated_at timestamptz default now();

create table if not exists events (
  id bigint generated always as identity primary key,
  player text,
  kind text not null,          -- 'tick' | 'bingo' | 'fullcard' | 'unlock'
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb
);
-- bv. ('reveal', 'false')

-- een automatische ontgrendeling mag maar één keer een feedbericht geven,
-- ongeacht hoeveel toestellen tegelijk de overgang zien (zie A1)
create unique index if not exists events_unlock_once
  on events (kind, (payload ->> 'stop_id'))
  where kind = 'unlock';

-- elke rang wordt maar één keer per speler gemeld (kind 'promotion')
create unique index if not exists events_promotion_once
  on events (player, (payload ->> 'rank'))
  where kind = 'promotion';

-- ---------------------------------------------------------------------
-- geheime inhoud: enkel zichtbaar voor de spelleider (secret_stops,
-- secret_config) of voor iedereen zodra de stop open is (secret_cells)
-- ---------------------------------------------------------------------
create table if not exists secret_stops (
  id text primary key,
  name text not null,
  icon text not null,
  opens timestamptz not null
);

create table if not exists secret_cells (
  id text primary key,
  stop_id text not null references secret_stops (id),
  icon text not null,
  text text not null
);

create table if not exists secret_config (
  key text primary key,
  value text not null
);
-- verwachte keys: admin_code, player_code_<player-id> (bv. player_code_seppe)

-- realtime: enkel tabellen zonder geheime inhoud. secret_* staan er
-- bewust niet bij, ook al is realtime RLS-bewust.
do $$ begin
  begin alter publication supabase_realtime add table ticks;    exception when others then null; end;
  begin alter publication supabase_realtime add table unlocks;  exception when others then null; end;
  begin alter publication supabase_realtime add table events;   exception when others then null; end;
  begin alter publication supabase_realtime add table settings; exception when others then null; end;
end $$;

-- ---------------------------------------------------------------------
-- rechten op het schema + de gewone tabellen
-- (zonder dit: "permission denied for table ticks")
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on ticks, unlocks, events, settings
  to anon, authenticated;

-- secret_cells: enkel select, en enkel de rijen die de functie hieronder
-- vrijgeeft. secret_stops en secret_config krijgen BEWUST geen enkel
-- recht voor anon/authenticated: die blijven onbereikbaar, ook al zou
-- een policy ooit verkeerd staan.
grant select on secret_cells to anon, authenticated;
revoke all on secret_stops, secret_config from anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table ticks         enable row level security;
alter table unlocks       enable row level security;
alter table events        enable row level security;
alter table settings      enable row level security;
alter table secret_stops  enable row level security;
alter table secret_cells  enable row level security;
alter table secret_config enable row level security;

-- ticks: elke speler beheert zijn eigen vakjes rechtstreeks, iedereen
-- mag alles lezen (nodig voor scorebord en onthulling-rpc)
drop policy if exists "anon select ticks" on ticks;
drop policy if exists "anon insert ticks" on ticks;
drop policy if exists "anon update ticks" on ticks;
drop policy if exists "anon delete ticks" on ticks;
create policy "anon select ticks" on ticks for select using (true);
create policy "anon insert ticks" on ticks for insert with check (true);
create policy "anon update ticks" on ticks for update using (true);
create policy "anon delete ticks" on ticks for delete using (true);

-- unlocks: iedereen mag lezen (nodig voor realtime + de "is dit open"
-- check), maar enkel de admin-rpc's mogen schrijven. Rechtstreeks
-- schrijven via de REST-API met enkel de publishable key lukt niet
-- meer, ook al staat insert/update/delete nog in de GRANT hierboven.
drop policy if exists "anon select unlocks" on unlocks;
drop policy if exists "anon insert unlocks" on unlocks;
drop policy if exists "anon update unlocks" on unlocks;
drop policy if exists "anon delete unlocks" on unlocks;
create policy "anon select unlocks" on unlocks for select using (true);

-- events: iedereen mag de feed lezen en een eigen gebeurtenis
-- toevoegen (tick/bingo/fullcard/unlock). Wijzigen/verwijderen gaat
-- enkel via admin_reset_all (security definer, negeert RLS).
drop policy if exists "anon select events" on events;
drop policy if exists "anon insert events" on events;
drop policy if exists "anon update events" on events;
drop policy if exists "anon delete events" on events;
create policy "anon select events" on events for select using (true);
create policy "anon insert events" on events for insert with check (true);

-- settings: iedereen mag lezen (de reveal-vlag is niet geheim), enkel
-- admin_set_reveal / admin_reset_all mogen schrijven.
drop policy if exists "anon select settings" on settings;
drop policy if exists "anon insert settings" on settings;
drop policy if exists "anon update settings" on settings;
drop policy if exists "anon delete settings" on settings;
create policy "anon select settings" on settings for select using (true);

-- secret_stops, secret_config: geen enkele policy voor anon/authenticated,
-- dus onleesbaar, ook los van de ontbrekende GRANT hierboven.

-- secret_cells krijgt zijn policy verderop, want die heeft de functie
-- is_stop_open() nodig die hieronder pas wordt aangemaakt.

-- ---------------------------------------------------------------------
-- functies
-- ---------------------------------------------------------------------

-- is de stop open? eerst de handmatige override (unlocks), anders het
-- uur uit secret_stops vergeleken met de klok van de server (nooit die
-- van de gsm). security definer: mag secret_stops lezen zonder dat
-- anon daar zelf rechten op heeft.
create or replace function is_stop_open(p_stop_id text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_state text;
  v_opens timestamptz;
begin
  select state into v_state from unlocks where stop_id = p_stop_id;
  if v_state is not null then
    return v_state = 'open';
  end if;
  select opens into v_opens from secret_stops where id = p_stop_id;
  if v_opens is null then
    return false;
  end if;
  return now() >= v_opens;
end;
$$;
revoke all on function is_stop_open(text) from public;
grant execute on function is_stop_open(text) to anon, authenticated;

-- secret_cells: enkel leesbaar als de bijhorende stop open is
drop policy if exists "open secret_cells" on secret_cells;
create policy "open secret_cells" on secret_cells
  for select using (is_stop_open(stop_id));

-- enkel de openingstijden, zonder naam/icoon, zodat de gsm weet
-- wanneer hij opnieuw moet kijken
create or replace function get_stop_times()
returns table(stop_id text, opens timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select id, opens from secret_stops order by opens;
$$;
revoke all on function get_stop_times() from public;
grant execute on function get_stop_times() to anon, authenticated;

-- aanmelden
create or replace function verify_player(p_player text, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_code text;
begin
  select value into v_code from secret_config where key = 'player_code_' || p_player;
  return v_code is not null and v_code = p_code;
end;
$$;
revoke all on function verify_player(text, text) from public;
grant execute on function verify_player(text, text) to anon, authenticated;

-- interne helper: faalt luidop als de admincode fout is
create or replace function check_admin_code(p_admin_code text)
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_code text;
begin
  select value into v_code from secret_config where key = 'admin_code';
  if v_code is null or v_code <> p_admin_code then
    raise exception 'invalid_admin_code';
  end if;
end;
$$;
revoke all on function check_admin_code(text) from public;
-- enkel voor andere functies hieronder, niet rechtstreeks voor anon

create or replace function admin_list_stops(p_admin_code text)
returns table(stop_id text, name text, icon text, opens timestamptz, override_state text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform check_admin_code(p_admin_code);
  return query
    select s.id, s.name, s.icon, s.opens, u.state
    from secret_stops s
    left join unlocks u on u.stop_id = s.id
    order by s.opens;
end;
$$;
revoke all on function admin_list_stops(text) from public;
grant execute on function admin_list_stops(text) to anon, authenticated;

create or replace function admin_set_stop(p_admin_code text, p_stop_id text, p_state text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform check_admin_code(p_admin_code);
  if p_state not in ('open', 'closed', 'auto') then
    raise exception 'invalid_state';
  end if;

  if p_state = 'auto' then
    delete from unlocks where stop_id = p_stop_id;
  else
    insert into unlocks (stop_id, state, updated_at)
    values (p_stop_id, p_state, now())
    on conflict (stop_id) do update set state = excluded.state, updated_at = now();
  end if;

  if p_state = 'open' then
    insert into events (player, kind, payload)
    values (null, 'unlock', jsonb_build_object('stop_id', p_stop_id))
    on conflict (kind, (payload ->> 'stop_id')) where kind = 'unlock' do nothing;
  end if;
end;
$$;
revoke all on function admin_set_stop(text, text, text) from public;
grant execute on function admin_set_stop(text, text, text) to anon, authenticated;

create or replace function admin_set_reveal(p_admin_code text, p_reveal boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform check_admin_code(p_admin_code);
  insert into settings (key, value) values ('reveal', to_jsonb(p_reveal))
  on conflict (key) do update set value = excluded.value;
end;
$$;
revoke all on function admin_set_reveal(text, boolean) from public;
grant execute on function admin_set_reveal(text, boolean) to anon, authenticated;

create or replace function admin_reset_player(p_admin_code text, p_player_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform check_admin_code(p_admin_code);
  delete from ticks where player = p_player_id;
  -- ook de bevorderingen, zodat die speler zijn rangen opnieuw kan halen
  delete from events where player = p_player_id and kind = 'promotion';
end;
$$;
revoke all on function admin_reset_player(text, text) from public;
grant execute on function admin_reset_player(text, text) to anon, authenticated;

create or replace function admin_reset_all(p_admin_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform check_admin_code(p_admin_code);
  -- "where true": Supabase's safeupdate weigert een DELETE zonder WHERE
  delete from ticks where true;
  delete from events where true;
  delete from unlocks where true;
  insert into settings (key, value) values ('reveal', 'false'::jsonb)
  on conflict (key) do update set value = excluded.value;
  -- de andere gsm's zien deze wijziging en wissen hun lokale kaart en cache
  insert into settings (key, value)
  values ('reset_epoch', to_jsonb((extract(epoch from clock_timestamp()) * 1000)::bigint))
  on conflict (key) do update set value = excluded.value;
end;
$$;
revoke all on function admin_reset_all(text) from public;
grant execute on function admin_reset_all(text) to anon, authenticated;

-- onthulling: geeft alle ticks van alle spelers terug, maar enkel als
-- de spelleider de knop heeft omgezet
create or replace function get_reveal_data()
returns table(player text, cell_id text)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_reveal boolean;
begin
  select (value = 'true'::jsonb) into v_reveal from settings where key = 'reveal';
  if v_reveal is not true then
    raise exception 'reveal_not_enabled';
  end if;
  return query select t.player, t.cell_id from ticks t;
end;
$$;
revoke all on function get_reveal_data() from public;
grant execute on function get_reveal_data() to anon, authenticated;
