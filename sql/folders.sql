-- =========================================================
-- Case Manager - Folders Migration
-- اگر schema.sql کامل را اجرا نمی‌کنی، فقط این فایل را در Supabase اجرا کن.
-- =========================================================

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.folders(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_starred boolean not null default false,
  check (length(trim(name)) between 1 and 80)
);

alter table public.folders add column if not exists is_starred boolean not null default false;

alter table public.folders enable row level security;

create index if not exists idx_folders_parent_id on public.folders(parent_id);
create index if not exists idx_folders_created_by on public.folders(created_by);
create index if not exists idx_folders_starred on public.folders(created_by, is_starred);

create unique index if not exists folders_unique_root_name_per_user
on public.folders (created_by, lower(name))
where parent_id is null;

create unique index if not exists folders_unique_child_name_per_parent
on public.folders (created_by, parent_id, lower(name))
where parent_id is not null;

drop trigger if exists set_folders_updated_at on public.folders;
create trigger set_folders_updated_at
before update on public.folders
for each row execute function public.set_updated_at();

drop function if exists public.folder_breadcrumbs(uuid);

create function public.folder_breadcrumbs(folder_id_input uuid)
returns table (
  id uuid,
  name text
)
language sql
stable
security invoker
as $$
  with recursive folder_chain as (
    select f.id, f.name, f.parent_id, 0 as depth
    from public.folders f
    where f.id = folder_id_input
      and f.created_by = auth.uid()

    union all

    select parent.id, parent.name, parent.parent_id, folder_chain.depth + 1
    from public.folders parent
    join folder_chain on folder_chain.parent_id = parent.id
    where parent.created_by = auth.uid()
  )
  select folder_chain.id, folder_chain.name
  from folder_chain
  order by folder_chain.depth desc;
$$;

grant execute on function public.folder_breadcrumbs(uuid) to authenticated;

drop policy if exists "folders_select_own" on public.folders;
create policy "folders_select_own"
on public.folders for select
to authenticated
using (created_by = auth.uid());

drop policy if exists "folders_insert_own" on public.folders;
create policy "folders_insert_own"
on public.folders for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    parent_id is null
    or exists (
      select 1 from public.folders parent
      where parent.id = public.folders.parent_id
        and parent.created_by = auth.uid()
    )
  )
);

drop policy if exists "folders_update_own" on public.folders;
create policy "folders_update_own"
on public.folders for update
to authenticated
using (created_by = auth.uid())
with check (
  created_by = auth.uid()
  and (
    parent_id is null
    or exists (
      select 1 from public.folders parent
      where parent.id = public.folders.parent_id
        and parent.created_by = auth.uid()
    )
  )
);

drop policy if exists "folders_delete_own" on public.folders;
create policy "folders_delete_own"
on public.folders for delete
to authenticated
using (created_by = auth.uid());
