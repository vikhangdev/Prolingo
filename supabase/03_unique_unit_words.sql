do $$
declare
  duplicates text;
begin
  select string_agg(format('%s (%s dòng)', en_key, duplicate_count), ', ')
  into duplicates
  from (
    select en_key, count(*) as duplicate_count
    from public.words
    group by unit_id, en_key
    having count(*) > 1
    order by en_key
    limit 10
  ) as duplicate_words;

  if duplicates is not null then
    raise exception 'Không thể bật chống trùng từ vì dữ liệu hiện có bị trùng trong cùng Unit: %. Hãy xử lý các từ trùng này rồi chạy lại migration.', duplicates;
  end if;
end
$$;

create unique index if not exists words_unit_en_key_uidx
  on public.words (unit_id, en_key);
