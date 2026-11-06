-- 0079_home_palette.sql: which Home colour set a user has picked (null = Classic)
alter table public.profiles add column if not exists home_palette text check (home_palette in ('classic','plum_gold','forest_clay','berry_teal'));
