import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { loadOwnProfile, parseProfileUpdate, saveOwnProfile } from "@/lib/cultivator-profile";
import { rejectForeignMutation } from "@/lib/request-origin";
import { readSmallJson } from "@/lib/small-json";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401, headers });
  try {
    return Response.json({ profile: await loadOwnProfile(database(), cultivator) }, { headers });
  } catch {
    return Response.json({ error: "档案暂不可用，请稍后重试" }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const foreign = rejectForeignMutation(request);
  if (foreign) { foreign.headers.set("Cache-Control", "no-store"); return foreign; }
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401, headers });
  let input;
  try { input = parseProfileUpdate(await readSmallJson(request)); } catch { input = null; }
  if (!input) return Response.json({ error: "道号须为1–32个字且无控制字符；请同时提供隐私选项与当前版本" }, { status: 400, headers });
  try {
    const db = database();
    if (!await saveOwnProfile(db, cultivator.id, input)) {
      return Response.json({ error: "档案已变更，请刷新并重新核对隐私设置" }, { status: 409, headers });
    }
    return Response.json({ profile: await loadOwnProfile(db, cultivator) }, { headers });
  } catch {
    return Response.json({ error: "保存结果未确认，请刷新档案核对；不要重复提交" }, { status: 503, headers });
  }
}
