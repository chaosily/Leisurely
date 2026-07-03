-- Supabase SQL Editor에서 1회 실행하세요.
-- Groq API 키를 저장하는 테이블 + 읽기 전용 공개 정책

create table if not exists public.api_keys (
  service    text primary key,          -- 예: 'groq'
  key_value  text not null,             -- 실제 API 키
  updated_at timestamptz default now()
);

alter table public.api_keys enable row level security;

-- 익명(publishable) 키로 SELECT만 허용. INSERT/UPDATE/DELETE 정책은 만들지 않음
-- → 키 등록/변경은 Supabase 대시보드(Table Editor)에서만 가능
drop policy if exists "public read api_keys" on public.api_keys;
create policy "public read api_keys"
  on public.api_keys
  for select
  using (true);

-- 실제 Groq 키로 바꿔서 실행하세요 (재실행 시 키 갱신됨)
insert into public.api_keys (service, key_value)
values ('groq', 'gsk_여기에_실제_GROQ_키_입력')
on conflict (service)
do update set key_value = excluded.key_value, updated_at = now();
