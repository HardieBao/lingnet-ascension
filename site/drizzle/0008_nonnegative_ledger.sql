CREATE TRIGGER IF NOT EXISTS ledger_events_no_negative
AFTER INSERT ON ledger_events
WHEN NEW.resource IN ('token', 'token_locked', 'cultivation', 'merit')
  AND (SELECT COALESCE(SUM(delta), 0) FROM ledger_events
       WHERE cultivator_id = NEW.cultivator_id AND resource = NEW.resource) < 0
BEGIN
  SELECT RAISE(ABORT, 'ledger balance cannot be negative');
END;
