-- =========================================================
-- Fix for Supabase function return-type conflict
-- اگر هنگام اجرای schema با خطای 42P13 مواجه شدید، این فایل را اجرا کنید
-- و سپس schema.sql کامل را دوباره اجرا کنید.
-- =========================================================

drop function if exists public.search_document_pages(text);
drop function if exists public.get_email_by_username(text);

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
