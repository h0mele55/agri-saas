# 2026-05-24 — B10 advanced analytics

**Commit:** `<sha> feat(b10): quantitative risk analytics + LossExceedanceCurve chart`

## Design

B10 of the 10-bundle 26-item roadmap. Closes the roadmap's
"advanced statistics for quantitative risk assessment" + "advanced
charts" pair. Adds:

  1. **Two quantitative columns on `Risk`** — `sleAmount Float?`
     (Single Loss Expectancy) and `aroAmount Float?` (Annualised
     Rate of Occurrence). ALE (Annual Loss Expectancy) is the
     product; it is **not** stored — see the decision section.
  2. **`getRiskQuantitativeAnalytics` usecase** that emits
     totals + top-10 by ALE + category distribution + loss-
     exceedance-curve points.
  3. **`GET /api/t/[slug]/risks/analytics`** route delegating to
     the usecase.
  4. **`<LossExceedanceCurve>` chart primitive** — a visx-based
     step-curve plotting `threshold` (x) vs `exceedanceFraction`
     (y) painted through the `--chart-series-1` token. Re-exported
     via the chart barrel.
  5. **Risk dashboard adoption** — new "Quantitative analytics"
     card mounting the KPI tiles + top-10 ALE list + LEC, gated on
     `analytics.totals.quantifiedCount > 0`. Qualitative-only
     portfolios continue to render the pre-existing dashboard
     unchanged.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/compliance.prisma` | `Risk.sleAmount` + `Risk.aroAmount` Float? columns |
| `prisma/migrations/20260524180000_b10_risk_quantitative/migration.sql` | Hand-written DDL — `ADD COLUMN ... DOUBLE PRECISION` ×2 |
| `src/app-layer/usecases/risk-analytics.ts` | usecase + the four payload types |
| `src/app/api/t/[tenantSlug]/risks/analytics/route.ts` | `GET` delegating to the usecase |
| `src/components/ui/charts/loss-exceedance-curve.tsx` | visx step-curve primitive |
| `src/components/ui/charts/index.ts` | barrel re-export |
| `src/app/t/[tenantSlug]/(app)/risks/dashboard/page.tsx` | Quantitative analytics card |
| `tests/unit/risk-analytics.test.ts` | 4 behavioural assertions across totals + filtering + top-N cap + LEC |
| `tests/guardrails/b10-advanced-analytics.test.ts` | 17 structural assertions across schema + migration + usecase + route + primitive + adoption |

## Decisions

* **ALE is derived, not stored.** Storing a third `aleAmount Float?`
  column would mean carrying the invariant `aleAmount IS NULL ⇔
  sleAmount IS NULL OR aroAmount IS NULL` in every write path. The
  analytics usecase materialises ALE at read time — a 4-byte
  multiplication per row, even on a 10k-risk portfolio. The cost is
  immaterial; the consistency win is real.

* **`frameworkKey`-style soft link, not a junction table.** Future
  Monte-Carlo simulation, scenario branching, or per-risk PDF/CDF
  parameterisation would all warrant a `RiskQuantitativeProfile`
  table. Today the LEC is a rank-based curve over the deterministic
  ALE per risk — no simulation, no convolution — and two columns on
  `Risk` are enough. The decision aligns with the rest of the
  product: optimise for the visible feature, leave a clean migration
  path to the next surface.

* **Pure-SVG primitive, no animation.** The R16/R18 chart family
  ships rich motion (mount draws, hover crosshairs, sheen sweeps).
  The LossExceedanceCurve is a single-purpose audience-of-one
  visualisation (CFO / CRO showing the curve to a board) — animation
  would distract from the information density. Token-themed through
  `--chart-series-1` so a future re-theme works without touching the
  primitive.

* **`curveStepAfter` (not `curveCatmullRom`).** A loss exceedance
  curve is genuinely discrete — each step corresponds to one risk's
  ALE. A smoothed curve would imply a continuous distribution we
  haven't actually fit. The step interpolation reads as "this many
  risks; this many losses; here's the cumulative" — the right
  semantic for the chart's audience.

* **Failure-soft dashboard fetch.** The dashboard's analytics fetch
  is a separate effect from the main `/risks` list. A 5xx on
  analytics just hides the new card; the rest of the dashboard
  still renders. The fetch uses `r.ok ? r.json() : null` so a 401 /
  403 / 500 all collapse to "no analytics", keeping the dashboard
  usable in degraded states.
