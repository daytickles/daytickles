-- =====================================================================
-- DayTickles — migration: Multickle icon
-- =====================================================================
-- Each Multickle (tales row) gets an Ionicons name, picked once at
-- creation in app/tales.js and shown on the Manage list, the Multickle
-- view header, and EntryCard's chip. The allowed set lives client-side
-- in lib/tales.js (TALE_ICONS); anything unrecognised renders as the
-- default. NOT NULL with a default, so existing rows backfill to
-- 'book-outline' -- the icon every Multickle showed before this.

alter table public.tales
  add column icon text not null default 'book-outline';

comment on column public.tales.icon is
  'Ionicons name chosen at creation (lib/tales.js TALE_ICONS). Default book-outline.';
