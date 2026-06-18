# 2026-06-18 — Mobile data-entry PR-4: glove-and-sun-friendly field capture

**Commit:** `<sha> feat(mobile-data-entry): number pads + camera + StepWizard`

Fourth of the 6-PR mobile initiative. Fast field capture: number pads,
direct camera capture, and a guided multi-step wizard that completes offline.

## Design

### Numeric ergonomics (one line, everywhere)
`<Input type="number">` now defaults `inputMode="decimal"` — so every
number field opens the phone's decimal number pad (dose 2.5, qty, yield,
cost, GDD). A caller can override (`inputMode="numeric"` for integers); the
prop spread wins. `<NumberStepper>` already carried `inputMode="numeric"`.
The field ag forms (inventory / yield / bins / contracts / journal
quantities) all use `<Input>`, so they're covered automatically — the audit
found no raw `<input type="number">` left in field forms.

### Camera capture
`<FileUpload>` gains `capture?: 'environment' | 'user' | boolean` →
forwarded to the file input, so a phone opens the REAR camera on tap. Wired
into the journal photos tab via a dedicated **"Take photo"** input
(`accept="image/*" capture="environment"`) next to the existing document
"Upload" input. An **instant local thumbnail** renders immediately on
capture (`URL.createObjectURL`, revoked on replace/unmount) — offline-safe,
no upload needed. `resizeImage()` (FileUpload `targetResolution`) is intact.
Evidence (a 13-type FileDropzone) is deliberately NOT camera-only.

### StepWizard
New `<StepWizard>` (`src/components/ui/step-wizard.tsx`) wraps the
responsive `<Modal>` (Vaul bottom-drawer on phones): one decision per
screen, progress dots, large Back/Next buttons, `canAdvance` per-step gate.
`onFinish` returns `{ queued: true }` to surface a "saved offline, will
sync" state — wire it to `useOfflineSync().submit(...)`.

Applied as the **"New spray job" wizard** on the location detail
(`SprayJobWizard.tsx`): parcels (checkboxes) → product (Combobox) → rate
(number `<Input>` + unit Combobox) → confirm. `onFinish` calls
`useOfflineSync().submit({ url: …/operations, method: POST, body })` and
returns `{ queued }` — so a spray job created with no signal is queued in
the outbox and syncs on reconnect, reusing the OfflineFieldPanel posture.
Launched from a `data-testid="new-spray-job"` header button (disabled when
the location has no parcels). Current-user id comes from `/api/auth/me`
(no client `SessionProvider` in this app).

### Voice-to-text (stretch) — skipped, justified
The journal note is a TipTap `<RichTextEditor>` (controlled HTML), not a
`<textarea>`. Appending a Web Speech transcript cleanly needs an imperative
insert on the editor primitive (not modifiable here); string-concatenating
onto serialized HTML risks corrupting ProseMirror state. Deferred.

## Files

| File | Role |
| --- | --- |
| `src/components/ui/step-wizard.tsx` | New — multi-step field wizard primitive. |
| `src/components/ui/input.tsx` | `type=number` defaults `inputMode="decimal"`. |
| `src/components/ui/file-upload.tsx` | New `capture` prop (camera). |
| `locations/[locationId]/SprayJobWizard.tsx` | New — offline spray-job wizard. |
| `locations/[locationId]/page.tsx` | Launch button + wizard mount. |
| `journal/[id]/JournalPhotosTab.tsx` | "Take photo" camera input + instant thumbnail. |
| `tests/rendered/mobile-data-entry.test.tsx` | Input inputMode, FileUpload capture, StepWizard (nav/dots/offline). |
| `tests/e2e/mobile/data-entry.spec.ts` | `@mobile`: wizard launch + parcel-step navigation. |

## Decisions

- **inputMode on the Input primitive, not per-field.** One change covers
  every `<Input type="number">` call site; overridable.
- **StepWizard offline via `onFinish` → `{ queued }`**, not coupled to
  `useOfflineSync` — the consumer wires it (SprayJobWizard does). The
  primitive's queued/nav behaviour is unit-tested; the full product/rate
  chain isn't E2E'd (needs seeded Items + RATE units the shared tenant
  lacks + fragile Combobox steps) — the E2E proves launch + step nav.
- **Budgets bumped:** `step-wizard.tsx` (Next/Finish are mutually exclusive
  primaries) and the location detail (+1 for the Spray job launcher).
