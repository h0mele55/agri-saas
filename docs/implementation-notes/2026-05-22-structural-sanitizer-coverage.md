# 2026-05-22 — Structural rich-text sanitiser coverage

**Commit:** `<pending> test(guardrails): structural rich-text sanitiser coverage (drop the numeric floor)`

## Design

`tests/guardrails/sanitize-rich-text-coverage.test.ts` previously
guarded sanitiser coverage with a hand-curated list of 8 usecases
plus `SANITISER_COVERAGE_FLOOR = 8` — a MINIMUM. Two weaknesses:

- **"At least N" cannot prove completeness.** A new rich-text write
  path could land with no sanitiser and the floor-of-8 would never
  notice — the eight known entries were all still there.
- The signal had already gone stale: the real coverage had drifted
  to **15** sanitised usecases while the floor stayed at 8. The
  curated list tracked 8 of 15.

The redesign derives the rich-text inventory from an authoritative,
already-maintained registry: `ENCRYPTED_FIELDS` in
`src/lib/security/encrypted-fields.ts`. Epic B requires every
business-content text field to be listed there, so every encrypted
business-content model IS a rich-text surface. The guardrail now
asserts **every `ENCRYPTED_FIELDS` model is classified** into one of
three buckets:

- `RICH_TEXT_COVERAGE` — model → the usecase(s) that sanitise it +
  the expected sanitiser (17 models);
- `NON_RICH_TEXT_MODELS` — the encrypted value is not user-supplied
  rich text, e.g. `TenantSecuritySettings.auditStreamSecretEncrypted`
  (a generated HMAC secret) — with a written reason;
- `KNOWN_UNCOVERED` — a real, named gap, ratcheting to zero.

A new rich-text field forces its model into `ENCRYPTED_FIELDS`; if
that model is in none of the three buckets, the completeness test
fails. That is the guarantee the numeric floor lacked — and an
explicit in-test regression proof demonstrates it.

The per-usecase check is kept: every `RICH_TEXT_COVERAGE` usecase
must import AND call its sanitiser (a dangling import is a silent
bypass).

### Honest finding: one real gap surfaced

The structural classification surfaced `EvidenceReview` —
`EvidenceReview.comment` is encrypted at rest but its write path is
not yet registered with a sanitiser. The old floor-of-8 hid this
(along with 10 other models it simply never tracked). It is now an
explicit `KNOWN_UNCOVERED` entry with a ratchet target, visible in
every CI run instead of invisible.

## Files

| File | Role |
|------|------|
| `tests/guardrails/sanitize-rich-text-coverage.test.ts` | Rewritten — structural completeness derived from `ENCRYPTED_FIELDS`; `SANITISER_COVERAGE_FLOOR` removed. |

## Decisions

- **`encrypted-fields.ts` as the source of truth.** It is the one
  registry the codebase already forces contributors to maintain for
  any new business-content field. Keying the sanitiser guardrail off
  it links the two structurally — a new encrypted field cannot be
  added without also being classified for sanitiser coverage.

- **Three buckets, not two.** A simple covered/uncovered split would
  force either a false "covered" claim or a CI-blocking failure for
  `EvidenceReview`. The `KNOWN_UNCOVERED` ratchet records the gap
  honestly (with a reason + a target) without wedging the pipeline —
  the standard repo ratchet pattern.

- **Model-keyed, not usecase-keyed.** The old list was keyed by
  usecase file, so completeness could not be checked against
  anything. Keying by model lets the test cross-reference
  `Object.keys(ENCRYPTED_FIELDS)` directly — completeness becomes a
  set comparison.
