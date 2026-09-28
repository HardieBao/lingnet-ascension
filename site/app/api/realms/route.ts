import { getCurrentCultivator } from "@/lib/auth";
import { getRealmState } from "@/lib/realm-state";

export async function GET() {
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  const state = await getRealmState(cultivator.id);
  return Response.json(state, { headers: { "Cache-Control": "private, no-store" } });
}
