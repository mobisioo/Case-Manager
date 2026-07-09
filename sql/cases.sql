-- =========================================================
-- Case Manager - Cases Migration
-- پرونده‌ها: ابتدا پرونده ساخته می‌شود، سپس فایل‌ها/اسناد داخل پرونده آپلود می‌شوند.
-- این فایل چندبار هم قابل اجراست.
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

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- اگر جدول cases قبلاً از نسخه‌های قدیمی وجود داشته باشد، آن را با ساختار فولدری هماهنگ می‌کنیم.
alter table public.cases add column if not exists folder_id uuid references public.folders(id) on delete cascade;
alter table public.cases add column if not exists label text;
alter table public.cases add column if not exists details text;
alter table public.cases add column if not exists case_date date;
alter table public.cases add column if not exists status text not null default 'ثبت اولیه';
alter table public.cases add column if not exists created_by uuid references auth.users(id) on delete cascade;
alter table public.cases add column if not exists created_at timestamptz not null default now();
alter table public.cases add column if not exists updated_at timestamptz not null default now();

-- در نسخه قدیمی binder_id اجباری بود؛ برای ساخت پرونده داخل فولدر باید اختیاری شود.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cases'
      and column_name = 'binder_id'
  ) then
    alter table public.cases alter column binder_id drop not null;
  end if;
end $$;

alter table public.cases enable row level security;

create index if not exists idx_cases_folder_id on public.cases(folder_id);
create index if not exists idx_cases_created_by_v2 on public.cases(created_by);
create index if not exists idx_cases_case_date on public.cases(case_date);
create index if not exists idx_cases_label on public.cases(label);

alter table public.cases drop constraint if exists cases_title_length_check;
alter table public.cases add constraint cases_title_length_check check (length(trim(title)) between 1 and 120);

drop trigger if exists set_cases_updated_at on public.cases;
create trigger set_cases_updated_at
before update on public.cases
for each row execute function public.set_updated_at();

drop policy if exists "cases_select_own" on public.cases;
create policy "cases_select_own"
on public.cases for select
to authenticated
using (created_by = auth.uid());

drop policy if exists "cases_insert_own" on public.cases;
create policy "cases_insert_own"
on public.cases for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    folder_id is null
    or exists (
      select 1 from public.folders f
      where f.id = public.cases.folder_id
        and f.created_by = auth.uid()
    )
  )
);

drop policy if exists "cases_update_own" on public.cases;
create policy "cases_update_own"
on public.cases for update
to authenticated
using (created_by = auth.uid())
with check (
  created_by = auth.uid()
  and (
    folder_id is null
    or exists (
      select 1 from public.folders f
      where f.id = public.cases.folder_id
        and f.created_by = auth.uid()
    )
  )
);

drop policy if exists "cases_delete_own" on public.cases;
create policy "cases_delete_own"
on public.cases for delete
to authenticated
using (created_by = auth.uid());

-- =========================================================
-- v10: Jalali date, case stars, and case documents upload
-- =========================================================

alter table public.cases add column if not exists case_date_jalali text;
alter table public.cases add column if not exists is_starred boolean not null default false;

alter table public.cases alter column status drop default;
alter table public.cases alter column status drop not null;
update public.cases set status = null where status = 'ثبت اولیه';

create index if not exists idx_cases_is_starred on public.cases(is_starred);
create index if not exists idx_cases_case_date_jalali on public.cases(case_date_jalali);

create table if not exists public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_size bigint,
  mime_type text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.case_documents enable row level security;

create index if not exists idx_case_documents_case_id on public.case_documents(case_id);
create index if not exists idx_case_documents_created_by on public.case_documents(created_by);

alter table public.case_documents drop constraint if exists case_documents_file_name_check;
alter table public.case_documents add constraint case_documents_file_name_check check (length(trim(file_name)) between 1 and 255);

insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do nothing;

drop policy if exists "case_documents_select_own" on public.case_documents;
create policy "case_documents_select_own"
on public.case_documents for select
to authenticated
using (created_by = auth.uid());

drop policy if exists "case_documents_insert_own" on public.case_documents;
create policy "case_documents_insert_own"
on public.case_documents for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.cases c
    where c.id = public.case_documents.case_id
      and c.created_by = auth.uid()
  )
);

drop policy if exists "case_documents_delete_own" on public.case_documents;
create policy "case_documents_delete_own"
on public.case_documents for delete
to authenticated
using (created_by = auth.uid());

drop policy if exists "case_documents_storage_select_own" on storage.objects;
create policy "case_documents_storage_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'case-documents'
  and owner = auth.uid()
);

drop policy if exists "case_documents_storage_insert_own" on storage.objects;
create policy "case_documents_storage_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'case-documents'
  and owner = auth.uid()
);

drop policy if exists "case_documents_storage_delete_own" on storage.objects;
create policy "case_documents_storage_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'case-documents'
  and owner = auth.uid()
);

-- v11: اجازه ویرایش نام مستندات پرونده
drop policy if exists "case_documents_update_own" on public.case_documents;
create policy "case_documents_update_own"
on public.case_documents for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());
