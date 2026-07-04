-- ── 현재 구조 ────────────────────────────────────────────────
-- Gemini API 키는 더 이상 DB 테이블에 저장하지 않습니다.
-- Edge Function(supabase/functions/gemini-chat)이 서버에서 Gemini를 호출하고,
-- 키는 함수 secret(GEMINI_API_KEY)에만 존재합니다. 배포 방법은 해당 파일 상단 주석 참고.

-- ── 정리: 예전 api_keys 테이블을 만들었다면 삭제하세요 ──────────
-- (키가 익명 읽기로 노출되는 테이블이므로 Edge Function 전환 후엔 반드시 제거)
drop table if exists public.api_keys;
