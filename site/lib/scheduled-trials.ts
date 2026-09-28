import { database } from "@/db/runtime";
import { settleRealmTrials } from "./realm-trial-runtime";

export async function settleScheduledRealmTrials() {
  const active = await database().prepare(
    "SELECT DISTINCT cultivator_id FROM realm_trials WHERE state = 'active' ORDER BY cultivator_id"
  ).all<{ cultivator_id: string }>();
  const now = Date.now();
  let failed = 0;
  for (const { cultivator_id } of active.results) {
    try { await settleRealmTrials(cultivator_id, now); }
    catch { failed++; }
  }
  if (failed) throw new Error(`Scheduled trial settlement failed for ${failed} account(s)`);
}
