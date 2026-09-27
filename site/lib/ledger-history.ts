export const LEDGER_PAGE_SIZE = 30;

export const LEDGER_BALANCES_SQL = `
  SELECT
    COALESCE(SUM(CASE WHEN resource = 'token' THEN delta ELSE 0 END), 0) AS token,
    COALESCE(SUM(CASE WHEN resource = 'token_locked' THEN delta ELSE 0 END), 0) AS token_locked,
    COALESCE(SUM(CASE WHEN resource = 'cultivation' THEN delta ELSE 0 END), 0) AS cultivation,
    COALESCE(SUM(CASE WHEN resource = 'merit' THEN delta ELSE 0 END), 0) AS merit,
    COALESCE(SUM(CASE WHEN resource = 'token' AND delta > 0 THEN delta ELSE 0 END), 0) AS token_in,
    COALESCE(SUM(CASE WHEN resource = 'token' AND delta < 0 THEN -delta ELSE 0 END), 0) AS token_out
  FROM ledger_events WHERE cultivator_id = ?
`;

export const LEDGER_EVENTS_SQL = `
  SELECT id, resource, delta, source_key, created_at
  FROM ledger_events
  WHERE cultivator_id = ? AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
  ORDER BY created_at DESC, id DESC LIMIT ?
`;

export function ledgerSourceLabel(sourceKey: string): string {
  if (sourceKey.startsWith("trial:")) {
    if (sourceKey.endsWith(":hold")) return "渡劫费用冻结";
    if (sourceKey.endsWith(":locked")) return "渡劫费用转入冻结";
    if (sourceKey.endsWith(":passed:unlock")) return "渡劫成功费用结算";
    if (sourceKey.endsWith(":refund")) return "渡劫未成功费用退还";
    if (sourceKey.endsWith(":unlock")) return "渡劫费用解冻";
  }
  if (sourceKey.startsWith("admin-adjustment:")) return "管理员双人调账";
  if (sourceKey.startsWith("equipment:")) return "装备购买";
  if (sourceKey.endsWith(":deposit:hold")) return "任务押金冻结";
  if (sourceKey.endsWith(":deposit:locked")) return "押金转入冻结";
  if (sourceKey.endsWith(":verified")) return "复核接受奖励";
  if (sourceKey.endsWith(":official")) return "正式成果奖励";
  if (sourceKey.endsWith(":integrated:refund") || sourceKey.endsWith(":review:refund") || sourceKey.endsWith(":release:refund") || sourceKey.endsWith(":expire:refund")) return "押金退还";
  if (sourceKey.endsWith(":integrated:unlock") || sourceKey.endsWith(":review:unlock") || sourceKey.endsWith(":release:unlock") || sourceKey.endsWith(":expire:unlock")) return "押金解冻";
  return "其他账本事件";
}
