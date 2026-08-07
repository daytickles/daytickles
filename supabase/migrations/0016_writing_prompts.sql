-- =====================================================================
-- writing_prompts
-- Small, admin-managed reference table for the optional rotating
-- prompt shown on a blank New Tickle screen. Same RLS posture as
-- app_config/animation_templates: publicly readable, no client write
-- policy -- content is managed via the Supabase dashboard / service
-- role, not the app.
-- =====================================================================
create table public.writing_prompts (
  id           uuid primary key default gen_random_uuid(),
  prompt_text  text not null check (char_length(prompt_text) between 1 and 200),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.writing_prompts enable row level security;

create policy "writing_prompts are publicly readable"
  on public.writing_prompts for select using (active = true);
