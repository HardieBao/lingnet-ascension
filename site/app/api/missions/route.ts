import { listMissions } from "@/lib/missions";

export async function GET() {
  try {
    return Response.json({ missions: await listMissions() });
  } catch {
    return Response.json({ error: "任务大殿暂不可用" }, { status: 503 });
  }
}
