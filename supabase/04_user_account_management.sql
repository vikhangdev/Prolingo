alter table public.profiles
  add column if not exists is_active boolean not null default true;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

create or replace function public.is_account_active()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select is_active from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    if new.id <> old.id or new.email is distinct from old.email then
      raise exception 'Không được đổi id hoặc email.';
    end if;
    if new.role <> old.role then
      if not public.is_admin() then
        raise exception 'Chỉ admin mới được đổi quyền.';
      end if;
      if old.id = auth.uid() then
        raise exception 'Không thể tự đổi quyền của chính mình.';
      end if;
    end if;
    if new.is_active is distinct from old.is_active and not public.is_admin() then
      raise exception 'Chỉ admin mới được thay đổi trạng thái tài khoản.';
    end if;
    if old.role = 'admin' and not new.is_active then
      raise exception 'Không thể ẩn tài khoản quản trị viên.';
    end if;
  end if;
  return new;
end;
$$;

drop policy if exists profiles_active_guard on public.profiles;
create policy profiles_active_guard on public.profiles as restrictive for update to authenticated
  using (public.is_account_active()) with check (public.is_account_active());

drop policy if exists fields_active_guard on public.fields;
create policy fields_active_guard on public.fields as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
drop policy if exists units_active_guard on public.units;
create policy units_active_guard on public.units as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
drop policy if exists words_active_guard on public.words;
create policy words_active_guard on public.words as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
drop policy if exists glossary_active_guard on public.glossary;
create policy glossary_active_guard on public.glossary as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
drop policy if exists exercises_active_guard on public.exercises;
create policy exercises_active_guard on public.exercises as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
drop policy if exists questions_active_guard on public.questions;
create policy questions_active_guard on public.questions as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
drop policy if exists progress_active_guard on public.progress;
create policy progress_active_guard on public.progress as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
drop policy if exists scores_active_guard on public.scores;
create policy scores_active_guard on public.scores as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());

drop function if exists public.admin_users();
create function public.admin_users()
returns table (
  id uuid, email text, display_name text, role text, created_at timestamptz, is_active boolean,
  answered int, correct int, last_active timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select p.id, p.email, p.display_name, p.role, p.created_at, p.is_active,
         count(g.id)::int,
         (count(g.id) filter (where g.ok))::int,
         max(g.updated_at)
  from public.profiles p
  left join public.progress g on g.user_id = p.id
  where public.is_admin()
  group by p.id
  order by p.created_at desc;
$$;

create or replace function public.admin_delete_user(target_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  target_role text;
begin
  if not public.is_admin() then
    raise exception 'Chỉ admin mới được xóa tài khoản.';
  end if;
  if target_id = auth.uid() then
    raise exception 'Không thể tự xóa tài khoản đang đăng nhập.';
  end if;

  select role into target_role from public.profiles where id = target_id;
  if not found then
    raise exception 'Không tìm thấy tài khoản.';
  end if;
  if target_role = 'admin' then
    raise exception 'Không thể xóa tài khoản quản trị viên.';
  end if;

  delete from auth.users where id = target_id;
  if not found then
    raise exception 'Không tìm thấy tài khoản xác thực để xóa.';
  end if;
end;
$$;

revoke all on function public.is_account_active() from public, anon;
grant execute on function public.is_account_active() to authenticated;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;
