-- 0080_home_cards.sql: which Home deck cards a user has switched on
-- (lib/homeCards.js). A comma-separated list of the cards that are ON;
-- keys not in the list are off, an empty string means every card is off,
-- and null (any account made after this ran) means the six defaults.
alter table public.profiles add column if not exists home_cards text;

update public.profiles set home_cards = 'remember,goals,rewards,multickles,rnrs,dayDots' where home_cards is null;
