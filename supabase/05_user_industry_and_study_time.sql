-- Optional main-industry selection and active study-time tracking.
alter table public.profiles
  add column if not exists primary_field_id uuid references public.fields (id) on delete set null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, primary_field_id)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    case
      when coalesce(new.raw_user_meta_data ->> 'primary_field_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and exists (
         select 1 from public.fields f
         where f.id = (new.raw_user_meta_data ->> 'primary_field_id')::uuid and f.is_published
       )
      then (new.raw_user_meta_data ->> 'primary_field_id')::uuid
      else null
    end
  )
  on conflict (id) do nothing;
  return new;
end;
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
    if new.primary_field_id is distinct from old.primary_field_id
       and new.primary_field_id is not null
       and not public.is_admin()
       and not exists (select 1 from public.fields where id = new.primary_field_id and is_published) then
      raise exception 'Ngành chính phải là ngành đang hiển thị.';
    end if;
    if old.role = 'admin' and not new.is_active then
      raise exception 'Không thể ẩn tài khoản quản trị viên.';
    end if;
  end if;
  return new;
end;
$$;

create table if not exists public.study_runs (
  id               uuid primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  unit_id          uuid not null references public.units (id) on delete cascade,
  section          text not null check (section in ('bank', 'vocab', 'lang', 'read')),
  ex_key           text not null,
  ex_title         text not null,
  total            int not null,
  answered         int not null,
  correct          int not null,
  started_at       timestamptz not null,
  updated_at       timestamptz not null default now(),
  duration_seconds int not null default 0
);
create index if not exists study_runs_user_idx on public.study_runs (user_id, started_at desc);

create table if not exists public.answer_log (
  id            bigint generated always as identity primary key,
  run_id        uuid not null references public.study_runs (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  unit_id       uuid not null references public.units (id) on delete cascade,
  question_id   uuid references public.questions (id) on delete set null,
  word_id       uuid references public.words (id) on delete set null,
  q_text        text not null,
  given_text    text not null,
  correct_text  text not null,
  ok            boolean not null,
  created_at    timestamptz not null default now()
);
create index if not exists answer_log_run_idx on public.answer_log (run_id, id);
create index if not exists answer_log_user_idx on public.answer_log (user_id, created_at desc);

create table if not exists public.reminders (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  sender_id  uuid references auth.users (id) on delete set null,
  message    text not null,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reminders_user_idx on public.reminders (user_id, created_at desc);

alter table public.study_runs
  add column if not exists duration_seconds integer not null default 0;

alter table public.study_runs enable row level security;
alter table public.answer_log enable row level security;
alter table public.reminders enable row level security;

drop policy if exists study_runs_owner on public.study_runs;
drop policy if exists study_runs_admin on public.study_runs;
create policy study_runs_owner on public.study_runs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy study_runs_admin on public.study_runs for select to authenticated using (public.is_admin());

drop policy if exists answer_log_owner_select on public.answer_log;
drop policy if exists answer_log_owner_insert on public.answer_log;
drop policy if exists answer_log_admin on public.answer_log;
create policy answer_log_owner_select on public.answer_log for select to authenticated
  using (user_id = auth.uid());
create policy answer_log_owner_insert on public.answer_log for insert to authenticated
  with check (user_id = auth.uid());
create policy answer_log_admin on public.answer_log for select to authenticated
  using (public.is_admin());

drop policy if exists reminders_owner_select on public.reminders;
drop policy if exists reminders_owner_update on public.reminders;
drop policy if exists reminders_admin_select on public.reminders;
drop policy if exists reminders_admin_insert on public.reminders;
create policy reminders_owner_select on public.reminders for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy reminders_owner_update on public.reminders for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reminders_admin_insert on public.reminders for insert to authenticated
  with check (public.is_admin() and sender_id = auth.uid());

drop policy if exists study_runs_active_guard on public.study_runs;
create policy study_runs_active_guard on public.study_runs as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
drop policy if exists answer_log_active_guard on public.answer_log;
create policy answer_log_active_guard on public.answer_log as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
drop policy if exists reminders_active_guard on public.reminders;
create policy reminders_active_guard on public.reminders as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());

grant select, insert, update, delete on public.study_runs to authenticated;
grant select, insert on public.answer_log to authenticated;
grant select, insert, update on public.reminders to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop function if exists public.admin_users();
create function public.admin_users()
returns table (
  id uuid, email text, display_name text, role text, created_at timestamptz, is_active boolean,
  primary_field_id uuid, primary_field_name text,
  answered int, correct int, last_active timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select p.id, p.email, p.display_name, p.role, p.created_at, p.is_active,
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
