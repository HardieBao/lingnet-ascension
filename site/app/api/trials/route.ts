import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { REALM_TRIAL_HISTORY_SQL, REALM_TRIAL_OFFERS_SQL, REALM_TRIAL_START_SQL, type RealmTrial, type RealmTrialOffer } from "@/lib/realm-trials";
import { readSmallJson } from "@/lib/small-json";
import { rejectForeignMutation } from "@/lib/request-origin";
import { settleRealmTrials } from "@/lib/realm-trial-runtime";
import { getRealmState } from "@/lib/realm-state";
import { assessBreakthrough } from "@/lib/realms";

export async function GET() {
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const state = await getRealmState(cultivator.id);
    const db = database();
    const [records, offers] = await Promise.all([
      db.prepare(REALM_TRIAL_HISTORY_SQL).bind(cultivator.id).all<RealmTrial>(),
      db.prepare(REALM_TRIAL_OFFERS_SQL).bind(cultivator.id, Date.now()).all<RealmTrialOffer>(),
    ]);
    const entry = state.next.rule?.trial ? assessBreakthrough(state.realm, { ...state.progress, trialPassed: true }) : null;
    return Response.json({ trials: records.results, offers: offers.results, realm: state.realm,
      progress: state.progress, next: state.next, entry }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "渡劫记录暂不可用，请稍后重试" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  const input = await readSmallJson(request) as { claimId?: unknown } | null;
  if (typeof input?.claimId !== "string" || !input.claimId || input.claimId.length > 100) {
    return Response.json({ error: "认领编号无效" }, { status: 400 });
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await settleRealmTrials(cultivator.id, now);
    const db = database();
    const result = await db.prepare(REALM_TRIAL_START_SQL)
      .bind(id, now, now, input.claimId, cultivator.id, now, cultivator.id, cultivator.id).run();
    if (result.meta.changes < 1) {
      return Response.json({ error: "专属契约或突破资格未就绪，认领已失效、已提交或已开始渡劫；金丹还需一次已采纳独立复验" }, { status: 409 });
    }
    const trial = await db.prepare("SELECT * FROM realm_trials WHERE id = ? AND cultivator_id = ?").bind(id, cultivator.id).first<RealmTrial>();
    if (!trial) return Response.json({ error: "暂时无法确认渡劫记录，请刷新记录和余额后核对" }, { status: 503 });
    return Response.json({ trial }, { status: 201 });
  } catch {
    return Response.json({ error: "未能确认渡劫结果，请先核对记录、资格与可用游戏 Token，再决定是否重试" }, { status: 409 });
  }
}
