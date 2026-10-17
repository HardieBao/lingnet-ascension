import { database } from "@/db/runtime";
import { getCurrentCultivator, isMaintainer } from "@/lib/auth";
import { loadOwnSectState } from "@/lib/sects";

export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const actor = await getCurrentCultivator();
    if (!actor) return Response.json({ error: "请先登录" }, { status: 401, headers });
    return Response.json(await loadOwnSectState(database(), actor.id, isMaintainer(actor)), { headers });
  } catch { return Response.json({ error: "本人宗门记录暂不可用" }, { status: 503, headers }); }
}
