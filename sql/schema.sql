-- =========================================================
-- Case Manager - Supabase SQL Schema
-- شامل Auth Profile + Username Login + جدول‌های پایه پروژه
-- این فایل را داخل Supabase SQL Editor اجرا کنید.
-- =========================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------
-- تابع بروزرسانی updated_at
-- ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------
-- پروفایل کاربران
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  full_name text,
  avatar_url text,
  role text not null default 'کاربر' check (role in ('مدیر', 'کارشناس', 'اپراتور', 'مشاهده‌گر', 'کاربر')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists role text not null default 'کاربر';
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_username_unique_lower
on public.profiles (lower(username))
where username is not null;

alter table public.profiles enable row level security;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- هنگام ثبت‌نام، username و full_name از metadata داخل profiles ذخیره می‌شود.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_username text;
begin
  raw_username := lower(nullif(trim(new.raw_user_meta_data ->> 'username'), ''));

  insert into public.profiles (id, username, full_name, avatar_url)
  values (
    new.id,
    raw_username,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    username = coalesce(excluded.username, public.profiles.username),
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- این تابع برای لاگین با نام کاربری استفاده می‌شود.
-- اگر نسخه قبلی تابع خروجی متفاوتی داشته باشد، create or replace خطای 42P13 می‌دهد.
drop function if exists public.get_email_by_username(text);

-- Supabase Auth به صورت پیش‌فرض password login را با email انجام می‌دهد،
-- پس ابتدا username به email تبدیل می‌شود و سپس signInWithPassword اجرا می‌شود.
create function public.get_email_by_username(input_username text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(trim(input_username))
    and p.is_active = true
  limit 1;
$$;

revoke all on function public.get_email_by_username(text) from public;
grant execute on function public.get_email_by_username(text) to anon, authenticated;


-- ---------------------------------------------------------
-- فولدرهای تو در تو
-- ---------------------------------------------------------
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

-- مسیر فولدر را از ریشه تا فولدر فعلی برمی‌گرداند.
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

-- ---------------------------------------------------------
-- زونکن‌ها
-- ---------------------------------------------------------
create table if not exists public.binders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  color text default '#0f2748',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.binders enable row level security;

drop trigger if exists set_binders_updated_at on public.binders;
create trigger set_binders_updated_at
before update on public.binders
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- پرونده‌ها
-- ---------------------------------------------------------
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  binder_id uuid not null references public.binders(id) on delete cascade,
  title text not null,
  case_number text,
  case_type text,
  status text not null default 'ثبت اولیه',
  plaintiff text,
  defendant text,
  responsible_name text,
  description text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cases enable row level security;

drop trigger if exists set_cases_updated_at on public.cases;
create trigger set_cases_updated_at
before update on public.cases
for each row execute function public.set_updated_at();

create index if not exists idx_cases_binder_id on public.cases(binder_id);
create index if not exists idx_cases_created_by on public.cases(created_by);
create index if not exists idx_cases_case_number on public.cases(case_number);

-- ---------------------------------------------------------
-- اسناد پرونده
-- ---------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  title text not null,
  document_type text,
  file_path text not null,
  file_type text,
  file_size bigint,
  page_count int not null default 0,
  ocr_status text not null default 'در انتظار پردازش' check (ocr_status in ('در انتظار پردازش', 'در حال پردازش', 'تکمیل شده', 'ناموفق')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents enable row level security;

drop trigger if exists set_documents_updated_at on public.documents;
create trigger set_documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

create index if not exists idx_documents_case_id on public.documents(case_id);
create index if not exists idx_documents_created_by on public.documents(created_by);

-- ---------------------------------------------------------
-- صفحات سند و متن OCR شده
-- ---------------------------------------------------------
create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  page_number int not null,
  image_path text,
  ocr_text text,
  normalized_text text,
  ocr_confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(document_id, page_number)
);

alter table public.document_pages enable row level security;

drop trigger if exists set_document_pages_updated_at on public.document_pages;
create trigger set_document_pages_updated_at
before update on public.document_pages
for each row execute function public.set_updated_at();

create index if not exists idx_document_pages_document_id on public.document_pages(document_id);
create index if not exists idx_document_pages_normalized_text_trgm on public.document_pages using gin (normalized_text gin_trgm_ops);

-- ---------------------------------------------------------
-- خلاصه پرونده‌ها
-- ---------------------------------------------------------
create table if not exists public.case_summaries (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  summary_text text,
  important_dates jsonb default '[]'::jsonb,
  important_people jsonb default '[]'::jsonb,
  keywords jsonb default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(case_id)
);

alter table public.case_summaries enable row level security;

drop trigger if exists set_case_summaries_updated_at on public.case_summaries;
create trigger set_case_summaries_updated_at
before update on public.case_summaries
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- برچسب‌ها
-- ---------------------------------------------------------
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  color text default '#153761',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(title, created_by)
);

alter table public.tags enable row level security;

create table if not exists public.case_tags (
  case_id uuid not null references public.cases(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (case_id, tag_id)
);

alter table public.case_tags enable row level security;

-- ---------------------------------------------------------
-- لاگ فعالیت‌ها
-- ---------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

-- ---------------------------------------------------------
-- Storage Bucket
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'case-files',
  'case-files',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------
-- RLS Policies - پروفایل
-- ---------------------------------------------------------
drop policy if exists "profile_select_own" on public.profiles;
create policy "profile_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "profile_update_own" on public.profiles;
create policy "profile_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());


-- ---------------------------------------------------------
-- RLS Policies - فولدرهای تو در تو
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- RLS Policies - زونکن‌ها
-- ---------------------------------------------------------
drop policy if exists "binders_select_own" on public.binders;
create policy "binders_select_own"
on public.binders for select
to authenticated
using (created_by = auth.uid());

drop policy if exists "binders_insert_own" on public.binders;
create policy "binders_insert_own"
on public.binders for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "binders_update_own" on public.binders;
create policy "binders_update_own"
on public.binders for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists "binders_delete_own" on public.binders;
create policy "binders_delete_own"
on public.binders for delete
to authenticated
using (created_by = auth.uid());

-- ---------------------------------------------------------
-- RLS Policies - پرونده‌ها
-- ---------------------------------------------------------
drop policy if exists "cases_select_own" on public.cases;
create policy "cases_select_own"
on public.cases for select
to authenticated
using (created_by = auth.uid());

drop policy if exists "cases_insert_own" on public.cases;
create policy "cases_insert_own"
on public.cases for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "cases_update_own" on public.cases;
create policy "cases_update_own"
on public.cases for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists "cases_delete_own" on public.cases;
create policy "cases_delete_own"
on public.cases for delete
to authenticated
using (created_by = auth.uid());

-- ---------------------------------------------------------
-- RLS Policies - اسناد
-- ---------------------------------------------------------
drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own"
on public.documents for select
to authenticated
using (created_by = auth.uid());

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own"
on public.documents for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own"
on public.documents for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own"
on public.documents for delete
to authenticated
using (created_by = auth.uid());

-- ---------------------------------------------------------
-- RLS Policies - صفحات OCR
-- ---------------------------------------------------------
drop policy if exists "document_pages_select_own" on public.document_pages;
create policy "document_pages_select_own"
on public.document_pages for select
to authenticated
using (
  exists (
    select 1 from public.documents d
    where d.id = document_pages.document_id
      and d.created_by = auth.uid()
  )
);

drop policy if exists "document_pages_insert_own" on public.document_pages;
create policy "document_pages_insert_own"
on public.document_pages for insert
to authenticated
with check (
  exists (
    select 1 from public.documents d
    where d.id = document_pages.document_id
      and d.created_by = auth.uid()
  )
);

drop policy if exists "document_pages_update_own" on public.document_pages;
create policy "document_pages_update_own"
on public.document_pages for update
to authenticated
using (
  exists (
    select 1 from public.documents d
    where d.id = document_pages.document_id
      and d.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.documents d
    where d.id = document_pages.document_id
      and d.created_by = auth.uid()
  )
);

-- ---------------------------------------------------------
-- RLS Policies - خلاصه‌ها
-- ---------------------------------------------------------
drop policy if exists "case_summaries_select_own" on public.case_summaries;
create policy "case_summaries_select_own"
on public.case_summaries for select
to authenticated
using (
  exists (
    select 1 from public.cases c
    where c.id = case_summaries.case_id
      and c.created_by = auth.uid()
  )
);

drop policy if exists "case_summaries_insert_own" on public.case_summaries;
create policy "case_summaries_insert_own"
on public.case_summaries for insert
to authenticated
with check (
  exists (
    select 1 from public.cases c
    where c.id = case_summaries.case_id
      and c.created_by = auth.uid()
  )
);

drop policy if exists "case_summaries_update_own" on public.case_summaries;
create policy "case_summaries_update_own"
on public.case_summaries for update
to authenticated
using (
  exists (
    select 1 from public.cases c
    where c.id = case_summaries.case_id
      and c.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.cases c
    where c.id = case_summaries.case_id
      and c.created_by = auth.uid()
  )
);

-- ---------------------------------------------------------
-- RLS Policies - برچسب‌ها
-- ---------------------------------------------------------
drop policy if exists "tags_all_own" on public.tags;
create policy "tags_all_own"
on public.tags for all
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists "case_tags_select_own" on public.case_tags;
create policy "case_tags_select_own"
on public.case_tags for select
to authenticated
using (
  exists (
    select 1 from public.cases c
    where c.id = case_tags.case_id
      and c.created_by = auth.uid()
  )
);

drop policy if exists "case_tags_insert_own" on public.case_tags;
create policy "case_tags_insert_own"
on public.case_tags for insert
to authenticated
with check (
  exists (
    select 1 from public.cases c
    where c.id = case_tags.case_id
      and c.created_by = auth.uid()
  )
);

drop policy if exists "case_tags_delete_own" on public.case_tags;
create policy "case_tags_delete_own"
on public.case_tags for delete
to authenticated
using (
  exists (
    select 1 from public.cases c
    where c.id = case_tags.case_id
      and c.created_by = auth.uid()
  )
);

-- ---------------------------------------------------------
-- RLS Policies - Storage
-- مسیر پیشنهادی فایل‌ها: user-id/file-name.ext
-- ---------------------------------------------------------
drop policy if exists "case_files_select_own" on storage.objects;
create policy "case_files_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'case-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "case_files_insert_own" on storage.objects;
create policy "case_files_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'case-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "case_files_update_own" on storage.objects;
create policy "case_files_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'case-files'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'case-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "case_files_delete_own" on storage.objects;
create policy "case_files_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'case-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------------------------------------------------------
-- تابع جستجوی ساده داخل متن OCR شده
-- اگر نسخه قبلی تابع خروجی متفاوتی داشته باشد، create or replace خطای 42P13 می‌دهد.
-- ---------------------------------------------------------
drop function if exists public.search_document_pages(text);

create function public.search_document_pages(search_text text)
returns table (
  page_id uuid,
  document_id uuid,
  page_number int,
  ocr_text text,
  document_title text,
  case_id uuid,
  case_title text
)
language sql
stable
security invoker
as $$
  select
    dp.id as page_id,
    d.id as document_id,
    dp.page_number,
    dp.ocr_text,
    d.title as document_title,
    c.id as case_id,
    c.title as case_title
  from public.document_pages dp
  join public.documents d on d.id = dp.document_id
  join public.cases c on c.id = d.case_id
  where d.created_by = auth.uid()
    and dp.normalized_text ilike '%' || search_text || '%'
  order by dp.created_at desc;
$$;
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
