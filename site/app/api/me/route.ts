import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { recoveryState } from "@/lib/recovery-state";

export async function GET() {
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ cultivator: null }, { status: 401 });
  const db = database();
  const [totals, recovery] = await Promise.all([db.prepare(
    "SELECT resource, COALESCE(SUM(delta), 0) AS balance FROM ledger_events WHERE cultivator_id = ? GROUP BY resource"
  ).bind(cultivator.id).all<{ resource: string; balance: number }>(), recoveryState(db, cultivator.id)]);
  const balances = Object.fromEntries(totals.results.map((row) => [row.resource, row.balance]));
  return Response.json({
    cultivator,
    recovery,
    balances: {
      token: balances.token ?? 0,
      tokenLocked: balances.token_locked ?? 0,
      cultivation: balances.cultivation ?? 0,
      merit: balances.merit ?? 0,
    },
  });
}
