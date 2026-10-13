import { database } from "@/db/runtime";
import { loadPublicProfile } from "@/lib/cultivator-profile";

export async function GET(_request: Request, context: { params: Promise<{ publicId: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const { publicId } = await context.params;
  try {
    const profile = await loadPublicProfile(database(), publicId);
    return profile ? Response.json({ profile }, { headers })
      : Response.json({ error: "档案不存在或未公开" }, { status: 404, headers });
  } catch {
    return Response.json({ error: "档案暂不可用，请稍后重试" }, { status: 503, headers });
  }
}
