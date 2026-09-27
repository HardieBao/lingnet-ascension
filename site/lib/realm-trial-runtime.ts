import { database } from "@/db/runtime";
import { REALM_TRIAL_EXPIRE_SQL, REALM_TRIAL_PASS_SQL } from "@/lib/realm-trials";

export async function settleRealmTrials(cultivatorId: string, now = Date.now()) {
  const db = database();
  await db.batch([
    db.prepare(REALM_TRIAL_PASS_SQL).bind(now, cultivatorId, null, null, cultivatorId, cultivatorId),
    db.prepare(REALM_TRIAL_EXPIRE_SQL).bind(now, now, now, cultivatorId, now, now),
  ]);
}
