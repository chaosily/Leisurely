import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// 경찰관 직무집행법 핵심 조문 (하드코딩)
const LAW_ARTICLES = [
  {
    법령명칭: "경찰관 직무집행법 제10조의4(무기사용)",
    조문내용:
      "경찰관은 직무수행 중 다음 각 호에 해당하는 경우 필요한 한도 내에서 무기를 사용할 수 있다. 1호. 경찰관에 항거하는 경우 2호. 범인의 도주 방지 3호. 자기 또는 타인의 생명·신체 방어. 단, 위해를 가하는 행위는 최소한에 그쳐야 하며 과잉금지 원칙을 준수해야 한다.",
    키워드: ["무기", "권총", "총기", "발사", "사격"],
  },
  {
    법령명칭: "경찰관 직무집행법 제10조의2(경찰장구 사용)",
    조문내용:
      "경찰관은 현행범인인 경우, 사형·무기 또는 장기 3년 이상의 죄를 범한 범인의 체포·도주 방지, 자기 또는 타인의 생명·신체 위해 방어, 공무집행 항거 제지를 위해 필요하면 최소한의 범위에서 경찰장구(수갑, 포승, 삼단봉, 방패 등)를 사용할 수 있다. 상황에 비례한 장구를 사용해야 하며 불필요한 물리력 행사는 금지된다.",
    키워드: ["삼단봉", "수갑", "테이저", "경찰장구", "포승", "장구"],
  },
  {
    법령명칭: "경찰관 직무집행법 제5조(위험 발생의 방지)",
    조문내용:
      "경찰관은 사람의 생명 또는 신체에 위해를 끼칠 우려가 있는 위험한 사태가 있을 때에는 그 자리에 있는 자에게 필요한 경고를 하고, 위해 방지상 특히 급하다고 인정될 때에는 위해를 받을 우려가 있는 자를 피난시키거나 피난 조치를 취할 수 있다. 흉기를 소지한 피의자에 대한 대치 상황에서 시민 대피 명령은 적법한 조치이다.",
    키워드: ["위험", "위협", "흉기", "칼", "경고", "대피"],
  },
  {
    법령명칭: "경찰관 직무집행법 제3조(불심검문)",
    조문내용:
      "경찰관은 수상한 거동 기타 주위 사정을 합리적으로 판단하여 죄를 범하였거나 범하려 하고 있다고 의심할 만한 상당한 이유가 있는 자를 정지시켜 질문할 수 있다. 질문 시 자신의 신분을 표시하는 증표를 제시하면서 소속과 성명을 밝히고 질문의 목적과 이유를 설명하여야 한다.",
    키워드: ["불심검문", "질문", "정지", "의심", "신분"],
  },
  {
    법령명칭: "경찰관 직무집행법 제1조(목적) 및 제2조(직무의 범위)",
    조문내용:
      "이 법은 국민의 자유와 권리를 보호하고 사회공공의 질서를 유지하기 위한 경찰관의 직무 수행에 필요한 사항을 규정함을 목적으로 한다. 경찰관은 범죄의 예방·진압 및 수사, 경비·주요 인사 경호, 치안정보의 수집·작성 및 배포, 교통 단속, 외국 정부기관 및 국제기구와의 국제협력 등의 직무를 수행한다.",
    키워드: ["직무", "경찰", "목적", "권리", "치안"],
  },
  {
    법령명칭: "경찰관 직무집행법 제11조의2(손실보상) 및 과잉금지원칙",
    조문내용:
      "경찰관의 직무수행으로 인하여 재산상의 손실을 입은 자에 대해서는 손실보상을 청구할 수 있다. 경찰 물리력 행사는 헌법상 과잉금지원칙(비례원칙)에 따라 목적의 정당성, 수단의 적합성, 침해의 최소성, 법익의 균형성을 갖추어야 하며, 이에 위반한 행위는 위법한 공무집행으로 민·형사 책임이 발생한다.",
    키워드: ["보고", "보상", "법규", "위법", "과잉", "비례", "책임"],
  },
];

function findArticle(keyword: string) {
  const kw = keyword.toLowerCase();
  for (const article of LAW_ARTICLES) {
    if (article.키워드.some((k) => kw.includes(k))) {
      return article;
    }
  }
  // keyword가 없거나 매칭 안 되면 직무집행법 기본 조항 반환
  return LAW_ARTICLES[4];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { keyword } = await req.json();
    const article = findArticle(keyword || "경찰관 직무집행법");

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          LawSearch: {
            law: [
              {
                법령명칭: article.법령명칭,
                조문내용: article.조문내용,
              },
            ],
          },
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS },
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS },
      }
    );
  }
});
