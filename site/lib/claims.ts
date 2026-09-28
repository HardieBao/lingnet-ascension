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
