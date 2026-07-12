-- Timeline de atendimentos por cliente
-- Rode este script no SQL Editor do Supabase (projeto NailDash)

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  note text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_notes_client_idx
  on public.client_notes (client_id, created_at desc);

create index if not exists client_notes_appointment_idx
  on public.client_notes (appointment_id);

alter table public.client_notes enable row level security;

drop policy if exists "client_notes_select" on public.client_notes;
create policy "client_notes_select" on public.client_notes
  for select using (salon_id in (select get_my_salon_ids()));

drop policy if exists "client_notes_insert" on public.client_notes;
create policy "client_notes_insert" on public.client_notes
  for insert with check (salon_id in (select get_my_salon_ids()));

drop policy if exists "client_notes_update" on public.client_notes;
create policy "client_notes_update" on public.client_notes
  for update using (salon_id in (select get_my_salon_ids()));

drop policy if exists "client_notes_delete" on public.client_notes;
create policy "client_notes_delete" on public.client_notes
  for delete using (salon_id in (select get_my_salon_ids()));
