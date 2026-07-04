// Supabase Edge Function: gemini-chat
// 브라우저 대신 서버에서 Gemini API를 호출하는 프록시.
// API 키는 이 함수의 환경변수(secret)에만 존재하며 클라이언트로 절대 노출되지 않는다.
//
// ── 배포 방법 (Supabase CLI) ──────────────────────────────────
//   supabase secrets set GEMINI_API_KEY=AIza실제키
//   supabase functions deploy gemini-chat
//
// CLI 없이 대시보드로도 가능:
//   Edge Functions → New Function → 이름 gemini-chat → 이 파일 내용 붙여넣기
//   → Settings → Edge Functions → Secrets 에 GEMINI_API_KEY 추가

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  if (!GEMINI_API_KEY) return json(500, { error: "GEMINI_API_KEY secret이 설정되지 않았습니다." });

  let payload: { userMessage?: string; systemPrompt?: string; highQuality?: boolean };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "잘못된 JSON 요청" });
  }

  const { userMessage, systemPrompt, highQuality = false } = payload;
  if (!userMessage || !systemPrompt) {
    return json(400, { error: "userMessage와 systemPrompt는 필수입니다." });
  }

  const MODELS = highQuality
    ? ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-2.5-flash"]
    : ["gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-3.5-flash", "gemini-2.5-flash"];
  const maxTokens = 8192;
  let lastStatus = 502;
  let lastError: unknown = null;

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // 2.5 계열: thinking 토큰이 출력 예산을 잠식해 본문이 잘리는 문제 방지
        const genCfg: Record<string, unknown> = { temperature: 0.7, maxOutputTokens: maxTokens };
        if (model.startsWith("gemini-2.5")) genCfg.thinkingConfig = { thinkingBudget: 0 };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
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
          return json(200, { text, model });
        }
        console.error(`[Gemini ${model}] HTTP ${response.status}:`, JSON.stringify(data));
        lastStatus = response.status;
        lastError = data;
        // 503(과부하)/429(쿼터): 잠시 후 같은 모델 1회 재시도, 그 외(404 등)는 다음 모델로
        if ((response.status === 503 || response.status === 429) && attempt === 0) {
          await sleep(1500);
          continue;
        }
        break;
      } catch (error) {
        console.error(`[Gemini ${model}] 네트워크 에러:`, (error as Error).message);
        lastError = (error as Error).message;
        if (attempt === 0) {
          await sleep(1000);
          continue;
        }
        break;
      }
    }
  }

  // 모든 모델 실패 — 클라이언트는 503/429면 재시도, 아니면 오프라인 폴백
  const status = lastStatus === 503 || lastStatus === 429 ? lastStatus : 502;
  return json(status, { error: "모든 Gemini 모델 호출 실패", detail: lastError });
});
