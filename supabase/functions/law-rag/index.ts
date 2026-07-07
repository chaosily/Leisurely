import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const LAW_API_OC = Deno.env.get('LAW_API_OC') ?? ''
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean)
const RATE_LIMIT_PER_MINUTE = 30
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function requestAllowed(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (ALLOWED_ORIGINS.length > 0 && origin && !ALLOWED_ORIGINS.includes(origin)) return false
  const id = (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('cf-connecting-ip') || 'unknown').trim()
  const now = Date.now()
  const bucket = rateBuckets.get(id)
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(id, { count: 1, resetAt: now + 60_000 })
    return true
  }
  bucket.count += 1
  return bucket.count <= RATE_LIMIT_PER_MINUTE
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'POST only' }), { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }
  if (!requestAllowed(req)) {
    return new Response(JSON.stringify({ success: false, error: '허용되지 않았거나 호출 횟수를 초과했습니다.' }), { status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }
  if (!req.headers.get('authorization')?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: '인증 헤더가 필요합니다.' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }

  try {
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > 4096) throw new Error('요청 본문이 너무 큽니다.')
    const rawBody = await req.text()
    if (new TextEncoder().encode(rawBody).byteLength > 4096) throw new Error('요청 본문이 너무 큽니다.')
    const { keyword } = JSON.parse(rawBody)
    if (typeof keyword !== 'string' || !keyword.trim() || keyword.length > 100) throw new Error('검색어는 1~100자여야 합니다.')
    if (!LAW_API_OC) throw new Error('LAW_API_OC secret이 설정되지 않았습니다.')
    
    const targetUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(LAW_API_OC)}&target=law&query=${encodeURIComponent(keyword.trim())}&type=json`;

    const apiResponse = await fetch(targetUrl)
    const data = await apiResponse.json()

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('law-rag error:', error)
    return new Response(JSON.stringify({ success: false, error: '법령 조회 요청을 처리하지 못했습니다.' }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
