-- Supabase SQL Editor에서 실행하세요
-- 경찰 훈련 시뮬레이터 - 접속 기록 테이블

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rank text not null,
  jurisdiction text not null,
  created_at timestamptz default now()
);

-- 누구나 insert 가능 (로그인 없이 사용하므로)
alter table public.users enable row level security;

create policy "allow_insert_users"
  on public.users
  for insert
  with check (true);

-- 직접 조회는 막음 (개인정보 보호)
create policy "deny_select_users"
  on public.users
  for select
  using (false);
