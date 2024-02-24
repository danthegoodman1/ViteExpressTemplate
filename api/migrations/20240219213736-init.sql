
-- +migrate Up
CREATE EXTENSION if not exists pg_trgm;

create table channel_users (
  channel_id text not null,
  opaque_id text not null,
  twitch_id text,
  coins int8 not null,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),

  primary key (channel_id, opaque_id)
)
;
create index channel_users_by_opaque_id on channel_users(opaque_id);

create table channel (
  channel_id text not null,
  initial_coins int8 not null,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),

  primary key(channel_id)
)
;

create table emote_library (
  emote_id text not null,
  src text not null,
  category text,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),

  primary key (emote_id)
)
;
create index emote_id_search on emote_library using GIN(emote_id gin_trgm_ops);
create index emote_category_search on emote_library using GIN(category gin_trgm_ops);

create table channel_library(
  channel_id text not null,
  emote_id text not null,
  src text, -- joined if null, means it's from library
  custom boolean not null,
  cost int8 not null,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),

  primary key(channel_id, emote_id)
)
;
create index channel_search on channel_library using GIN(emote_id gin_trgm_ops);

-- +migrate Down
drop table channel_users;
drop table channel;
drop table emote_library;
drop table channel_library;
