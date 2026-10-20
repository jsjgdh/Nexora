-- The read log: an operator's read of a learner's record is processing.
--
-- The operator's log already carried who did what to whom, but only for the
-- things an operator DID. A read was invisible: the console could open a
-- learner's account, read their sessions, their consents and their verified
-- work, and the log would say nothing, so "who looked at this account" could
-- not be answered. An operator's read is processing of somebody's data, and
-- the product's own data-rights page promises a record of processing, so the
-- read has to leave a row.
--
-- Two columns make the row answer the question:
--
--   route       the endpoint that was called, so the row says what was read
--               (the account itself is in `target`).
--   request_id  the id the gateway minted and every service logs, so a row can
--               be tied to the request that made it, and to the logs of that
--               request.
--
-- Both are nullable and both are added to the table rather than replacing it:
-- a row written before this migration has no route and no request id, and
-- rewriting history to make it look tidier would be a worse lie than an empty
-- column.
ALTER TABLE admin_actions ADD COLUMN IF NOT EXISTS route TEXT;
ALTER TABLE admin_actions ADD COLUMN IF NOT EXISTS request_id TEXT;

-- The question the log is asked most often is "who looked at this account",
-- so the account is the column that is looked up by.
CREATE INDEX IF NOT EXISTS admin_actions_target_idx ON admin_actions (target);
