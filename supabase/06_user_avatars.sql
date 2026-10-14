-- User-uploaded circular profile pictures.
alter table public.profiles
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  )
  with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop function if exists public.admin_users();
create function public.admin_users()
returns table (
  id uuid, email text, display_name text, avatar_url text, role text, created_at timestamptz, is_active boolean,
  primary_field_id uuid, primary_field_name text,
  answered int, correct int, last_active timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select p.id, p.email, p.display_name, p.avatar_url, p.role, p.created_at, p.is_active,
         p.primary_field_id, coalesce(nullif(f.name_vi, ''), f.name),
         count(g.id)::int,
         (count(g.id) filter (where g.ok))::int,
         max(g.updated_at)
  from public.profiles p
  left join public.progress g on g.user_id = p.id
  left join public.fields f on f.id = p.primary_field_id
  where public.is_admin()
  group by p.id, f.name, f.name_vi
  order by p.created_at desc;
$$;

revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;
