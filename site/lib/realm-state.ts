import { database } from "@/db/runtime";
import { FORMAL_RESULTS_COUNT_SUBQUERY } from "@/lib/formal-results";
import { assessBreakthrough, realmNames, type Realm } from "@/lib/realms";
import { settleRealmTrials } from "@/lib/realm-trial-runtime";
import { INDEPENDENT_REVIEWS_COUNT_SUBQUERY } from "@/lib/revalidations";

export async function getRealmState(cultivatorId: string) {
  await settleRealmTrials(cultivatorId);
  const db = database();
  const [account, totals, completed, revalidated] = await Promise.all([
    db.prepare("SELECT realm FROM cultivators WHERE id = ?").bind(cultivatorId).first<{ realm: string }>(),
    db.prepare(
      "SELECT resource, COALESCE(SUM(delta), 0) AS balance FROM ledger_events WHERE cultivator_id = ? GROUP BY resource"
    ).bind(cultivatorId).all<{ resource: string; balance: number }>(),
    db.prepare(
      `SELECT ${FORMAL_RESULTS_COUNT_SUBQUERY} AS count`
    ).bind(cultivatorId).first<{ count: number }>(),
    db.prepare(`SELECT ${INDEPENDENT_REVIEWS_COUNT_SUBQUERY} AS count`)
      .bind(cultivatorId).first<{ count: number }>(),
  ]);
  if (!account || !(account.realm in realmNames)) throw new Error("修士境界数据无效");
  const realm = account.realm as Realm;
  const balances = Object.fromEntries(totals.results.map((row) => [row.resource, row.balance]));
  const progress = {
    cultivation: balances.cultivation ?? 0,
    merit: balances.merit ?? 0,
    token: balances.token ?? 0,
    formalResults: completed?.count ?? 0,
    independentReviews: revalidated?.count ?? 0,
    trialPassed: false,
  };
  return { realm, name: realmNames[realm], balances, progress, next: assessBreakthrough(realm, progress) };
}
