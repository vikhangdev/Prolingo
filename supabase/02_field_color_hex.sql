alter table public.fields
  add column if not exists color_hex text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fields_color_hex_check'
      and conrelid = 'public.fields'::regclass
  ) then
    alter table public.fields
      add constraint fields_color_hex_check
      check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end
$$;
