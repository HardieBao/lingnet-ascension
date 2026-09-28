import { FORMAL_RESULTS_COUNT_SUBQUERY } from "./formal-results.ts";

export const ADVANCE_QI_INSERT_SQL = `
  INSERT INTO realm_events (id, cultivator_id, from_realm, to_realm, created_at)
  SELECT ?, id, 'mortal', 'qi', ? FROM cultivators
  WHERE id = ? AND realm = 'mortal'
    AND (SELECT COALESCE(SUM(delta), 0) FROM ledger_events WHERE cultivator_id = ? AND resource = 'cultivation') >= 100
    AND (SELECT COALESCE(SUM(delta), 0) FROM ledger_events WHERE cultivator_id = ? AND resource = 'merit') >= 5
    AND ${FORMAL_RESULTS_COUNT_SUBQUERY} >= 1
    AND NOT EXISTS (SELECT 1 FROM realm_events WHERE cultivator_id = ? AND to_realm = 'qi')
`;
