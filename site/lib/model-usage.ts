import { MODEL_CONTRACT } from "./model-budget.ts";

type ReportBudget = { status: "unknown" | "unavailable" | "observed"; knownSpent: number | null;
  remaining: number | null; reserved: number | null; halted: boolean | null };
export type ModelUsageReport = { schemaVersion: 1; source: "local-runner-observation"; claimId: string; cultivatorId: string;
  missionId: string; baseCommit: string; model: { id: string; tokenBudget: number; maxOutputTokens: number };
  observedAt: number; budget: ReportBudget };
export type SavedUsageReport = { id: string; claimId: string; receivedAt: number; report: ModelUsageReport; trust: "self-reported" };

function fields(value: unknown, names: string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => names.includes(key));
}
export function parseUsageReport(value: unknown, now = Date.now()): ModelUsageReport | null {
  if (!fields(value, ["schemaVersion", "source", "claimId", "cultivatorId", "missionId", "baseCommit", "model", "observedAt", "budget"]) ||
      value.schemaVersion !== 1 || value.source !== "local-runner-observation" ||
      typeof value.claimId !== "string" || !/^[a-f0-9-]{36}$/i.test(value.claimId) ||
      typeof value.cultivatorId !== "string" || !/^[a-zA-Z0-9_:.-]{1,160}$/.test(value.cultivatorId) ||
      typeof value.missionId !== "string" || !/^[A-Z][A-Z0-9_-]{0,63}$/.test(value.missionId) ||
      typeof value.baseCommit !== "string" || !/^[a-f0-9]{40}$/i.test(value.baseCommit) ||
      typeof value.observedAt !== "number" || !Number.isSafeInteger(value.observedAt) || value.observedAt < 0 || value.observedAt > now + 5000 ||
      !fields(value.model, ["id", "tokenBudget", "maxOutputTokens"]) || value.model.id !== MODEL_CONTRACT.id ||
      value.model.tokenBudget !== MODEL_CONTRACT.tokenBudget || value.model.maxOutputTokens !== MODEL_CONTRACT.maxOutputTokens ||
      !fields(value.budget, ["status", "knownSpent", "remaining", "reserved", "halted"])) return null;
  const budget = value.budget;
  if (budget.status === "observed") {
    if (![budget.knownSpent, budget.remaining, budget.reserved].every((amount) => typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0 && amount <= MODEL_CONTRACT.tokenBudget) ||
        Number(budget.knownSpent) + Number(budget.remaining) + Number(budget.reserved) !== MODEL_CONTRACT.tokenBudget || typeof budget.halted !== "boolean") return null;
  } else if (!["unknown", "unavailable"].includes(String(budget.status)) ||
      [budget.knownSpent, budget.remaining, budget.reserved, budget.halted].some((amount) => amount !== null)) return null;
  return { schemaVersion: 1, source: "local-runner-observation", claimId: value.claimId, cultivatorId: value.cultivatorId,
    missionId: value.missionId, baseCommit: value.baseCommit.toLowerCase(), observedAt: value.observedAt,
    model: { id: MODEL_CONTRACT.id, tokenBudget: MODEL_CONTRACT.tokenBudget, maxOutputTokens: MODEL_CONTRACT.maxOutputTokens },
    budget: { status: budget.status as ReportBudget["status"], knownSpent: budget.knownSpent as number | null,
      remaining: budget.remaining as number | null, reserved: budget.reserved as number | null, halted: budget.halted as boolean | null } };
}

export async function saveOwnUsageReport(db: D1Database, actorId: string, report: ModelUsageReport) {
  if (report.cultivatorId !== actorId) return { status: 403, error: "用量报告不属于当前修士" };
  const claim = await db.prepare("SELECT cultivator_id,mission_id,reward_snapshot,started_at FROM claims WHERE id=?")
    .bind(report.claimId).first<{ cultivator_id: string; mission_id: string; reward_snapshot: string; started_at: number | null }>();
  if (!claim || claim.cultivator_id !== actorId || claim.mission_id !== report.missionId || claim.started_at === null || report.observedAt < claim.started_at - 5000) {
    return { status: 409, error: "认领与用量报告不匹配，或尚未开始闭关" };
  }
  let snapshot;
  try { snapshot = JSON.parse(claim.reward_snapshot); } catch { return { status: 409, error: "认领契约无效" }; }
  if (snapshot.baseCommit?.toLowerCase() !== report.baseCommit || snapshot.budgetTokens !== MODEL_CONTRACT.tokenBudget ||
      Object.entries(MODEL_CONTRACT).some(([key, value]) => snapshot.modelContract?.[key] !== value)) return { status: 409, error: "用量报告与锁定模型契约不一致" };
  const content = JSON.stringify(report), hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  const digest = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const existing = () => db.prepare("SELECT id,received_at AS receivedAt FROM model_usage_reports WHERE claim_id=? AND digest=? AND cultivator_id=?")
    .bind(report.claimId, digest, actorId).first<{ id: string; receivedAt: number }>();
  const previous = await existing();
  if (previous) return { status: 200, report: { ...previous, trust: "self-reported" }, created: false };
  const id = crypto.randomUUID(), receivedAt = Date.now();
  const result = await db.prepare(`INSERT INTO model_usage_reports (id,claim_id,cultivator_id,digest,report_json,received_at)
    SELECT ?,id,cultivator_id,?,?,? FROM claims WHERE id=? AND cultivator_id=? AND started_at IS NOT NULL AND reward_snapshot=?
    ON CONFLICT(claim_id,digest) DO NOTHING`).bind(id, digest, content, receivedAt, report.claimId, actorId, claim.reward_snapshot).run();
  if (result.meta.changes === 1) return { status: 201, report: { id, receivedAt, trust: "self-reported" }, created: true };
  const repeated = await existing();
  return repeated ? { status: 200, report: { ...repeated, trust: "self-reported" }, created: false }
    : { status: 409, error: "认领契约已变化，请刷新核对" };
}

export async function loadOwnUsageReports(db: D1Database, ownerId: string, claimId?: string, before?: string) {
  const cursor = before ? /^(\d{1,16}):([a-f0-9-]{36})$/i.exec(before) : null;
  if (before !== undefined && (!cursor || !Number.isSafeInteger(Number(cursor[1])))) throw new Error("Invalid usage cursor");
  const time = cursor ? Number(cursor[1]) : null;
  const rows = await db.prepare(`SELECT id,claim_id AS claimId,received_at AS receivedAt,report_json AS content
    FROM model_usage_reports WHERE cultivator_id=? AND (? IS NULL OR claim_id=?)
      AND (? IS NULL OR received_at<? OR (received_at=? AND id<?)) ORDER BY received_at DESC,id DESC LIMIT 31`)
    .bind(ownerId, claimId ?? null, claimId ?? null, time, time, time, cursor?.[2] ?? null)
    .all<{ id: string; claimId: string; receivedAt: number; content: string }>();
  const reports: SavedUsageReport[] = rows.results.slice(0, 30).map(({ content, ...row }) => ({ ...row,
    report: JSON.parse(content) as ModelUsageReport, trust: "self-reported" }));
  const last = reports.at(-1);
  return { reports, nextCursor: rows.results.length > 30 && last ? `${last.receivedAt}:${last.id}` : null };
}
