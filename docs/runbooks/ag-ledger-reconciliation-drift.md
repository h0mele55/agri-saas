# Runbook — Ag Stock-Ledger Reconciliation Drift

> Fires from `AgLedgerReconciliationDrift`
> (`infra/observability/prometheus/rules/alerting-rules.yml`, group
> `inflect_ag_operations_slo`). **Severity: critical, `compliance: "true"`.**
>
> First-look dashboard: **inflect-compliance — Ag Field Operations**
> (`docs/grafana/ag-operations.json`, UID `inflect-ag-operations`).

---

## Trigger

- `AgLedgerReconciliationDrift` —
  `increase(ag_operation_count_total{ag_operation="inventory.reconcileStockLedger",ag_outcome="failure"}[1h]) > 0`
  for 5m. The reconcile usecase emits `ag_outcome="failure"` when the
  `StockTransaction` hash-chain verification returns `valid:false`.

## What it means

**This is an integrity incident, not a routine ops alert.** The stock
ledger (`StockTransaction`) is append-only and hash-chained: every row
carries a hash over its own contents plus the previous row's hash.
`inventory.reconcileStockLedger` walks the chain and recomputes it. A
`valid:false` result means a row's stored hash no longer matches the
recomputed value — the chain is **broken**.

The only ways this happens:

- An **out-of-band write** mutated, inserted, or deleted a
  `StockTransaction` row directly (bypassing the usecase), breaking the
  link. The append-only immutability is enforced by a DB trigger, so this
  implies the trigger was bypassed (raw SQL as a superuser, a migration,
  or tampering).
- Genuine **data tampering** — treat as a potential security/compliance
  event until proven otherwise.

Do **NOT** treat this as "the reconcile job is flaky." A failing
reconcile is the detector working correctly.

## Triage

```bash
# 1. Re-run the reconciliation to get the break point (firstBreakId).
APP_POD=$(kubectl --namespace inflect-production get pod \
  -l "app.kubernetes.io/component=app" \
  -o jsonpath='{.items[0].metadata.name}')

kubectl --namespace inflect-production exec "$APP_POD" -c inflect -- \
  curl -s -X POST http://127.0.0.1:3000/api/t/<slug>/ag/inventory/reconcile | jq .
# Want: { valid: false, firstBreakId: "<txId>", expectedHash, actualHash, ... }
```

```bash
# 2. Inspect the breaking StockTransaction row and its neighbours.
#    READ ONLY — do not UPDATE/DELETE. Use the inflect_readonly user.
psql "$DIRECT_DATABASE_URL" -c "
  SELECT id, \"tenantId\", \"itemId\", kind, quantity, \"prevHash\", hash,
         \"createdAt\", \"createdById\"
  FROM \"StockTransaction\"
  WHERE id = '<firstBreakId>'
     OR id = (SELECT \"prevId\" FROM \"StockTransaction\" WHERE id = '<firstBreakId>')
  ORDER BY \"createdAt\";"
# Compare hash/prevHash linkage. A mismatch at firstBreakId means the row
# (or the one before it) was altered after insertion.
```

```bash
# 3. Look for out-of-band writes around the break in the audit trail.
psql "$DIRECT_DATABASE_URL" -c "
  SELECT \"createdAt\", \"actorType\", \"userId\", category, action, \"entityId\"
  FROM \"AuditLog\"
  WHERE \"entityType\" = 'StockTransaction'
    AND \"createdAt\" BETWEEN now() - interval '7 days' AND now()
  ORDER BY \"createdAt\" DESC
  LIMIT 50;"
# A legitimate write goes through inventory.recordInputApplication and is
# audited. A break with NO corresponding audit row = out-of-band write.
```

```bash
# 4. Confirm the immutability trigger is still installed (it should reject
#    any UPDATE/DELETE on StockTransaction).
psql "$DIRECT_DATABASE_URL" -c "
  SELECT tgname, tgenabled
  FROM pg_trigger
  WHERE tgrelid = '\"StockTransaction\"'::regclass
    AND NOT tgisinternal;"
# An absent or disabled (tgenabled='D') trigger is itself a finding.
```

## Remediation

**The ledger is immutable. Do NOT mutate it to "fix" the chain.**
Editing or deleting rows to make reconciliation pass destroys the very
evidence an auditor needs and compounds the integrity breach.

1. **Stop the bleed.** If the trigger is disabled or a credential with
   raw write access is suspected, revoke it immediately and rotate.
2. **Preserve evidence.** Snapshot the affected ledger range for
   forensics — do not alter it:
   ```bash
   pg_dump -t '"StockTransaction"' --data-only --column-inserts \
     "$DIRECT_DATABASE_URL" > stock-ledger-incident-$(date +%s).sql
   ```
3. **Correct forward, never backward.** The accounting fix for a wrong
   balance is a **new** `ADJUSTMENT` transaction posted through
   `inventory.recordInputApplication` (or the adjustment usecase) — it
   appends a fresh, correctly-hashed row that restores the running
   balance without touching history.
4. **Escalate as a compliance event** (see below) before declaring the
   incident resolved.

## Escalation

- Page the on-call **and** escalate to security + compliance leadership —
  a hash-chain break is treated like the audit-log tamper path in
  `docs/incident-response.md` §7 (Data Breach Response).
- File legal/compliance notification if customer inventory records are
  affected and the cause is confirmed tampering.
- Post-mortem within 7 days under `docs/post-mortems/` — root cause must
  identify HOW an out-of-band write reached `StockTransaction` (which
  credential, which path) and close that hole.

---

**Dashboard:** [inflect-compliance — Ag Field Operations](../grafana/ag-operations.json) (UID `inflect-ag-operations`)
