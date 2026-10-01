import { database } from "@/db/runtime";

export type Claim = {
  id: string;
  mission_id: string;
  cultivator_id: string;
  state: string;
  claimed_at: number;
  started_at: number | null;
  expires_at: number;
  reward_snapshot: string;
};

export async function expireClaims(now = Date.now()) {
  const db = database();
  const expired = await db.prepare(
    "SELECT id, cultivator_id, reward_snapshot FROM claims WHERE state IN ('claimed', 'running') AND expires_at <= ?"
  ).bind(now).all<Pick<Claim, "id" | "cultivator_id" | "reward_snapshot">>();

  for (const claim of expired.results) {
    const snapshot = JSON.parse(claim.reward_snapshot) as { deposit: number };
    const operations = [
      db.prepare("UPDATE claims SET state = 'expired' WHERE id = ? AND state IN ('claimed', 'running') AND expires_at <= ?")
        .bind(claim.id, now),
    ];
    if (snapshot.deposit > 0) {
      operations.push(
        db.prepare(
          "INSERT OR IGNORE INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at) SELECT ?, ?, 'token', ?, ?, ? WHERE EXISTS (SELECT 1 FROM claims WHERE id = ? AND state = 'expired')"
        ).bind(crypto.randomUUID(), claim.cultivator_id, snapshot.deposit, `${claim.id}:expire:refund`, now, claim.id),
        db.prepare(
          "INSERT OR IGNORE INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at) SELECT ?, ?, 'token_locked', ?, ?, ? WHERE EXISTS (SELECT 1 FROM claims WHERE id = ? AND state = 'expired')"
        ).bind(crypto.randomUUID(), claim.cultivator_id, -snapshot.deposit, `${claim.id}:expire:unlock`, now, claim.id)
      );
    }
    await db.batch(operations);
  }
}

export async function getClaim(id: string): Promise<Claim | null> {
  return database().prepare(
    "SELECT id, mission_id, cultivator_id, state, claimed_at, started_at, expires_at, reward_snapshot FROM claims WHERE id = ?"
  ).bind(id).first<Claim>();
}

export type ClaimHistoryRow = Pick<Claim, "id" | "mission_id" | "state" | "claimed_at" | "expires_at">;

export type ClaimHistoryPage = { claims: ClaimHistoryRow[]; nextCursor: string | null; error: string | null };

export async function getClaimHistory(cultivatorId: string, cursor?: string | string[]): Promise<ClaimHistoryPage> {
  const match = typeof cursor === "string" ? /^(\d{1,16}):([^\r\n]{1,128})$/.exec(cursor) : null;
  if (cursor && (!match || !Number.isSafeInteger(Number(match[1])))) {
    return { claims: [], nextCursor: null, error: "认领历史参数无效，请返回最新记录。" };
  }
  const before = match ? Number(match[1]) : null;
  const rows = await database().prepare(
    "SELECT id, mission_id, state, claimed_at, expires_at FROM claims WHERE cultivator_id = ? AND (? IS NULL OR claimed_at < ? OR (claimed_at = ? AND id < ?)) ORDER BY claimed_at DESC, id DESC LIMIT 31"
  ).bind(cultivatorId, before, before, before, match?.[2] ?? null).all<ClaimHistoryRow>();
  const claims = rows.results.slice(0, 30);
  const last = claims.at(-1);
  return { claims, nextCursor: rows.results.length > 30 && last ? `${last.claimed_at}:${last.id}` : null, error: null };
}
