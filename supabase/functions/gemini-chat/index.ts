// Supabase Edge Function: gemini-chat
// 브라우저 대신 서버에서 Gemini API를 호출하는 프록시.
// api_keys 테이블의 gemini1, gemini2, gemini3 키를 돌려가며 사용한다.
// 한 키가 한도 초과(429)나 차단(403)이면 자동으로 다음 키로 전환.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
// service_role 키: Edge Function에 자동 주입되는 관리자 키. RLS를 무시하고 테이블을 읽는다.
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((v) => v.trim()).filter(Boolean);
const RATE_LIMIT_PER_MINUTE = 20;
const MAX_BODY_BYTES = 64 * 1024;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function clientId(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("cf-connecting-ip") || "unknown").trim();
}
function isRateLimited(req: Request): boolean {
  const id = clientId(req);
  const now = Date.now();
  const bucket = rateBuckets.get(id);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(id, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_PER_MINUTE;
}
function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  return ALLOWED_ORIGINS.length === 0 || !origin || ALLOWED_ORIGINS.includes(origin);
}

// ── 키 로테이션 상태 (함수 인스턴스가 살아있는 동안 유지) ──────────
let cachedKeys: string[] = [];
let keysLoadedAt = 0;
const KEY_CACHE_MS = 5 * 60 * 1000; // 5분마다 테이블에서 키 목록 갱신

async function loadGeminiKeys(): Promise<string[]> {
  const now = Date.now();
  if (cachedKeys.length > 0 && now - keysLoadedAt < KEY_CACHE_MS) return cachedKeys;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/api_keys?select=service,key_value&service=like.gemini*&order=service`,
    { headers: { "apikey": SERVICE_ROLE_KEY, "Authorization": `Bearer ${SERVICE_ROLE_KEY}` } },
  );
  if (!res.ok) throw new Error(`api_keys 테이블 조회 실패: HTTP ${res.status}`);
  const rows: { service: string; key_value: string }[] = await res.json();
  const keys = rows.map((r) => r.key_value).filter(Boolean);
  if (keys.length > 0) {
    cachedKeys = keys;
    keysLoadedAt = now;
  }
  return cachedKeys;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  if (!originAllowed(req)) return json(403, { error: "허용되지 않은 출처입니다." });
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return json(401, { error: "인증 헤더가 필요합니다." });
  if (isRateLimited(req)) return json(429, { error: "호출 횟수가 너무 많습니다. 잠시 후 다시 시도하세요." });
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json(413, { error: "요청 본문이 너무 큽니다." });

  let payload: { userMessage?: string; systemPrompt?: string; highQuality?: boolean };
  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return json(413, { error: "요청 본문이 너무 큽니다." });
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "잘못된 JSON 요청" });
  }

  const { userMessage, systemPrompt, highQuality = false } = payload;
  if (typeof userMessage !== "string" || typeof systemPrompt !== "string" || !userMessage.trim() || !systemPrompt.trim()) {
    return json(400, { error: "userMessage와 systemPrompt는 필수입니다." });
  }
  if (userMessage.length > 12_000 || systemPrompt.length > 48_000) {
    return json(413, { error: "요청 텍스트가 허용 길이를 초과했습니다." });
  }

  let keys: string[];
  try {
    keys = await loadGeminiKeys();
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
  if (keys.length === 0) {
    return json(500, { error: "api_keys 테이블에 gemini 키가 없습니다 (service가 gemini로 시작하는 행 필요)." });
  }

  const MODELS = highQuality
    ? ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-2.5-flash"]
    : ["gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-3.5-flash", "gemini-2.5-flash"];
  const maxTokens = 8192;
  let lastStatus = 502;
  let lastError: unknown = null;

  // 요청마다 무작위 키로 시작해 3개 키에 부하를 고르게 분산
  // (서버 인스턴스가 요청마다 바뀔 수 있어 카운터 대신 무작위 사용)
  const startKey = Math.floor(Math.random() * keys.length);

  for (const model of MODELS) {
    // 각 모델에 대해 키를 순서대로 시도. 한도 초과 키는 건너뛰고 다음 키로.
    for (let k = 0; k < keys.length; k++) {
      const keyIdx = (startKey + k) % keys.length;
      const apiKey = keys[keyIdx];
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          // 2.5 계열: thinking 토큰이 출력 예산을 잠식해 본문이 잘리는 문제 방지
          const genCfg: Record<string, unknown> = { temperature: 0.7, maxOutputTokens: maxTokens };
          if (model.startsWith("gemini-2.5")) genCfg.thinkingConfig = { thinkingBudget: 0 };

          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: "user", parts: [{ text: userMessage }] }],
              generationConfig: genCfg,
            }),
          });
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            if (data.candidates[0].finishReason === "MAX_TOKENS") {
              console.warn(`[Gemini ${model}] 출력이 토큰 상한(${maxTokens})에서 잘렸습니다.`);
            }
            return json(200, { text, model, keyIndex: keyIdx + 1 });
          }
          console.error(`[Gemini ${model} / 키${keyIdx + 1}] HTTP ${response.status}:`, JSON.stringify(data));
          lastStatus = response.status;
          lastError = data;
          // 429(쿼터 소진)/403(키 차단): 이 키는 포기하고 즉시 다음 키로
          if (response.status === 429 || response.status === 403) break;
          // 503(서버 과부하): 잠시 후 같은 키로 1회 재시도
          if (response.status === 503 && attempt === 0) { await sleep(1500); continue; }
          // 그 외(404 등): 이 모델 자체가 문제 — 키 루프 탈출, 다음 모델로
          k = keys.length;
          break;
        } catch (error) {
          console.error(`[Gemini ${model} / 키${keyIdx + 1}] 네트워크 에러:`, (error as Error).message);
          lastError = (error as Error).message;
          if (attempt === 0) { await sleep(1000); continue; }
          break;
        }
      }
    }
  }

  // 모든 모델·모든 키 실패 — 클라이언트는 503/429면 재시도, 아니면 오프라인 폴백
  const status = lastStatus === 503 || lastStatus === 429 ? lastStatus : 502;
  console.error("모든 Gemini 모델·키 호출 실패:", lastError);
  return json(status, { error: "AI 응답 생성에 실패했습니다." });
});
