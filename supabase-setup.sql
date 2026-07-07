-- ═══════════════════════════════════════════════════════════════
-- KNP FTX 시뮬레이터 — Supabase 설정 SQL
-- Supabase 대시보드 → SQL Editor 에 전체 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.
-- ═══════════════════════════════════════════════════════════════

-- ── ① users 테이블: 익명 쓰기 허용 (로그인 기록이 안 쌓이던 원인) ──
-- 테이블은 이미 존재하지만 RLS에 INSERT 정책이 없어 게임의 기록 요청이
-- 조용히 거부되고 있었음 (게임 코드는 실패를 무시하고 진행)
alter table public.users enable row level security;

drop policy if exists "anon insert users" on public.users;
create policy "anon insert users"
  on public.users for insert
  with check (true);

-- ── ② training_results 테이블: 존재하지 않아서 생성 ──────────────
-- 훈련 종료 시 최종 성적을 저장하는 테이블 (게임 코드가 보내는 컬럼 그대로)
create table if not exists public.training_results (
  id           bigint generated always as identity primary key,
  name         text,
  rank         text,
  jurisdiction text,
  suspect_type text,
  crime_type   text,
  score        integer,
  control_rate integer,
  legal_rate   integer,
  hp           integer,
  mental       integer,
  end_reason   text,
  final_score  integer,
  turns        integer,
  difficulty   text,
  created_at   timestamptz default now()
);

alter table public.training_results enable row level security;

drop policy if exists "anon insert training_results" on public.training_results;
create policy "anon insert training_results"
  on public.training_results for insert
  with check (true);

-- 결과 조회도 허용 (랭킹판 등에 쓰려면 필요; 원치 않으면 이 정책만 지우세요)
drop policy if exists "anon read training_results" on public.training_results;
create policy "anon read training_results"
  on public.training_results for select
  using (true);

-- ── ③ api_keys 테이블: 공개 읽기 차단 ────────────────────────────
-- 키 로테이션은 이제 gemini-chat Edge Function이 관리자 권한(service_role)으로
-- 읽으므로, 브라우저(익명)가 키를 읽을 수 있는 정책은 제거해서 키를 숨긴다.
drop policy if exists "public read api_keys" on public.api_keys;
