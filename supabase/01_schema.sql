-- ============================================================
--  NGHÉ ENGLISH · Schema Supabase
--  Cách chạy: Supabase Dashboard → SQL Editor → New query → dán toàn bộ file → Run.
--  File an toàn khi chạy lại nhiều lần (idempotent).
-- ============================================================

-- ---------- 1. HỒ SƠ NGƯỜI DÙNG + PHÂN QUYỀN ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  role         text not null default 'user' check (role in ('user', 'admin')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table public.profiles
  add column if not exists is_active boolean not null default true;

-- Hàm kiểm tra admin (security definer để dùng được trong policy mà không bị đệ quy RLS)
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_active);
$$;

create or replace function public.is_account_active()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select is_active from public.profiles where id = auth.uid()), false);
$$;

-- Tự tạo profile khi có người đăng ký
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Chặn user tự nâng quyền; admin không tự hạ quyền của chính mình.
-- (Chạy từ SQL Editor thì auth.uid() = null nên không bị chặn → dùng để tạo admin đầu tiên)
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

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------- 2. NỘI DUNG: NGÀNH → UNIT → TỪ VỰNG / BÀI TẬP → CÂU HỎI ----------
-- Quy tắc xóa: ON DELETE RESTRICT — không xóa được cha khi còn con (phải xóa từ dưới lên).
-- Riêng bảng tiến độ (progress/scores) vẫn CASCADE: xóa câu hỏi/từ thì tiến độ liên quan tự mất.
create table if not exists public.fields (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  name_vi      text not null default '',
  icon         text not null default '📘',
  hue          int  not null default 210 check (hue between 0 and 360),
  color_hex    text check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  description  text not null default '',
  sort_order   int  not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table public.profiles
  add column if not exists primary_field_id uuid references public.fields (id) on delete set null,
  add column if not exists avatar_url text;

create table if not exists public.units (
  id           uuid primary key default gen_random_uuid(),
  field_id     uuid not null references public.fields (id) on delete restrict,
  name         text not null,
  name_vi      text not null default '',
  icon         text not null default '📖',
  hue          int check (hue between 0 and 360),
  sort_order   int  not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists units_field_idx on public.units (field_id, sort_order);

create table if not exists public.words (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references public.units (id) on delete restrict,
  en         text not null,
  vi         text not null,
  sort_order int  not null default 0,
  en_key     text generated always as (lower(btrim(en))) stored
);
create index if not exists words_unit_idx on public.words (unit_id, sort_order);
create index if not exists words_key_idx  on public.words (en_key);
create unique index if not exists words_unit_en_key_uidx on public.words (unit_id, en_key);

-- Từ điển tra nhanh (từ thông dụng không thuộc unit nào)
create table if not exists public.glossary (
  en_key text primary key,
  vi     text not null
);

create table if not exists public.exercises (
  id             uuid primary key default gen_random_uuid(),
  unit_id        uuid not null references public.units (id) on delete restrict,
  section        text not null check (section in ('vocab', 'lang', 'read')),
  kind           text not null default 'quiz' check (kind in ('quiz', 'match')),
  title          text not null,
  instruction    text not null default '',
  instruction_vi text not null default '',
  passage        text not null default '',      -- bài đọc (dùng cho section = 'read')
  config         jsonb not null default '{}',   -- vd. {"b_order": [...]} cho bài nối
  sort_order     int  not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists exercises_unit_idx on public.exercises (unit_id, section, sort_order);

create table if not exists public.questions (
  id          uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  kind        text not null check (kind in ('mc', 'tf', 'ms', 'fl', 'pair')),
  content     jsonb not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists questions_ex_idx on public.questions (exercise_id, sort_order);

-- ---------- 3. TIẾN ĐỘ HỌC TẬP ----------
create table if not exists public.progress (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  unit_id     uuid not null references public.units (id) on delete cascade,
  section     text not null check (section in ('bank', 'vocab', 'lang', 'read')),
  question_id uuid references public.questions (id) on delete cascade,
  word_id     uuid references public.words (id) on delete cascade,
  ok          boolean not null,
  updated_at  timestamptz not null default now(),
  check ((question_id is not null)::int + (word_id is not null)::int = 1),
  unique (user_id, question_id),
  unique (user_id, word_id)
);
create index if not exists progress_user_idx on public.progress (user_id, unit_id);

create table if not exists public.scores (
  user_id    uuid not null references auth.users (id) on delete cascade,
  unit_id    uuid not null references public.units (id) on delete cascade,
  ex_key     text not null,                -- id bài tập, hoặc 'bank:ev' / 'bank:ve' / 'bank:ty'
  best       int  not null,
  last       int  not null,
  attempts   int  not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, ex_key)
);

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

-- ---------- 4. VIEW THỐNG KÊ + HÀM ADMIN ----------
create or replace view public.unit_stats
with (security_invoker = true) as
select
  u.id as unit_id,
  u.field_id,
  (select count(*) from public.words w where w.unit_id = u.id)::int as n_words,
  (select count(*) from public.questions q join public.exercises e on e.id = q.exercise_id
     where e.unit_id = u.id and e.section = 'vocab')::int as n_vocab,
  (select count(*) from public.questions q join public.exercises e on e.id = q.exercise_id
     where e.unit_id = u.id and e.section = 'lang')::int as n_lang,
  (select count(*) from public.questions q join public.exercises e on e.id = q.exercise_id
     where e.unit_id = u.id and e.section = 'read')::int as n_read
from public.units u;

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

-- Hàm kiểm tra unit có được phép xem (đã xuất bản, hoặc là admin)
create or replace function public.unit_visible(uid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.units u join public.fields f on f.id = u.field_id
    where u.id = uid and u.is_published and f.is_published
  );
$$;

create or replace function public.exercise_visible(eid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select public.unit_visible(e.unit_id) from public.exercises e where e.id = eid), false);
$$;

-- ---------- 5. ROW LEVEL SECURITY ----------
alter table public.profiles  enable row level security;
alter table public.fields    enable row level security;
alter table public.units     enable row level security;
alter table public.words     enable row level security;
alter table public.glossary  enable row level security;
alter table public.exercises enable row level security;
alter table public.questions enable row level security;
alter table public.progress  enable row level security;
alter table public.scores    enable row level security;
alter table public.study_runs enable row level security;
alter table public.answer_log enable row level security;
alter table public.reminders  enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_active_guard on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy profiles_active_guard on public.profiles as restrictive for update to authenticated
  using (public.is_account_active()) with check (public.is_account_active());

-- fields: ai cũng xem được ngành đã xuất bản (để hiện ở trang chủ trước khi đăng nhập)
drop policy if exists fields_read  on public.fields;
drop policy if exists fields_admin on public.fields;
create policy fields_read  on public.fields for select to anon, authenticated
  using (is_published or public.is_admin());
create policy fields_admin on public.fields for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- units
drop policy if exists units_read  on public.units;
drop policy if exists units_admin on public.units;
create policy units_read  on public.units for select to authenticated
  using (public.is_admin() or (is_published and exists (
    select 1 from public.fields f where f.id = field_id and f.is_published)));
create policy units_admin on public.units for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- words
drop policy if exists words_read  on public.words;
drop policy if exists words_admin on public.words;
create policy words_read  on public.words for select to authenticated using (public.unit_visible(unit_id));
create policy words_admin on public.words for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- glossary
drop policy if exists glossary_read  on public.glossary;
drop policy if exists glossary_admin on public.glossary;
create policy glossary_read  on public.glossary for select to authenticated using (true);
create policy glossary_admin on public.glossary for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- exercises
drop policy if exists exercises_read  on public.exercises;
drop policy if exists exercises_admin on public.exercises;
create policy exercises_read  on public.exercises for select to authenticated using (public.unit_visible(unit_id));
create policy exercises_admin on public.exercises for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- questions
drop policy if exists questions_read  on public.questions;
drop policy if exists questions_admin on public.questions;
create policy questions_read  on public.questions for select to authenticated using (public.exercise_visible(exercise_id));
create policy questions_admin on public.questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- progress / scores: mỗi người chỉ thấy & sửa dữ liệu của mình; admin chỉ được xem
drop policy if exists progress_own   on public.progress;
drop policy if exists progress_admin on public.progress;
create policy progress_own   on public.progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy progress_admin on public.progress for select to authenticated using (public.is_admin());

drop policy if exists scores_own   on public.scores;
drop policy if exists scores_admin on public.scores;
create policy scores_own   on public.scores for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy scores_admin on public.scores for select to authenticated using (public.is_admin());

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

-- Chặn tài khoản đã ẩn truy cập các API dữ liệu, kể cả khi phiên đăng nhập còn hiệu lực.
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
drop policy if exists study_runs_active_guard on public.study_runs;
create policy study_runs_active_guard on public.study_runs as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
drop policy if exists answer_log_active_guard on public.answer_log;
create policy answer_log_active_guard on public.answer_log as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
drop policy if exists reminders_active_guard on public.reminders;
create policy reminders_active_guard on public.reminders as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());

-- ---------- 6. QUYỀN TRUY CẬP API ----------
grant usage on schema public to anon, authenticated;
grant select on public.fields to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.unit_stats to authenticated;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.is_account_active() from public, anon;
grant execute on function public.is_account_active() to authenticated;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ============================================================
--  TẠO ADMIN ĐẦU TIÊN
--  1) Đăng ký một tài khoản trên web.
--  2) Chạy lệnh sau trong SQL Editor (thay email của bạn):
--
--     update public.profiles set role = 'admin' where email = 'email-cua-ban@example.com';
-- ============================================================
