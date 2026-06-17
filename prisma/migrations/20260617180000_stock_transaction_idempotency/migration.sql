-- Data-integrity: idempotency key for the stock ledger.
--
-- A retried spray-completion (UI double-click, webhook replay, a retry
-- that races before the first commit) must not double-post a CONSUMPTION
-- against the same operation. `appendStockTransaction` now accepts an
-- optional dedup key (`spray:<operationParcelId>`); a second append with
-- the same (tenantId, idempotencyKey) is a no-op. This PARTIAL unique
-- index is the race-safe DB backstop (NULL keys — receipts, manual
-- adjustments — are never deduplicated, hence the WHERE).
--
-- ADD COLUMN is DDL (not a row UPDATE), so the StockTransaction
-- append-only immutability trigger does not fire. Existing rows get NULL.

ALTER TABLE "StockTransaction" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "StockTransaction_tenantId_idempotencyKey_key"
    ON "StockTransaction" ("tenantId", "idempotencyKey")
    WHERE "idempotencyKey" IS NOT NULL;
