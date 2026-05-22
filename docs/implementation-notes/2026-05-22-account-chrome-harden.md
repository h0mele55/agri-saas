# 2026-05-22 — Account/profile chrome — in-scope hardening

**Commit:** `<pending> chore(chrome): shared initials avatar + real notifications poll`

## Design

A scope-controlled hardening pass over the Roadmap-14 top-bar
account/profile chrome — `UserMenu`, `TenantSwitcher`,
`NotificationsBell`, `IdentityPill`. **Explicitly out of scope** (each
a separate roadmap, deliberately not touched): right-rail / aside
chrome, notification streaming (SSE/WebSocket), a separate `/orgs`
picker page, avatar-image upload.

Two genuine gaps were found and closed; no out-of-scope feature was
added.

### 1. Initials logic was duplicated four times

`UserMenu` (`initialsFromName`), `TenantSwitcher` (`initialsFromSlug`),
and both `IdentityPill` variants (`initials`) each carried their own
initials helper — three subtly-divergent algorithms — plus repeated
copies of the `bg-[var(--brand-subtle)]` circle recipe.

`src/components/ui/initials-avatar.tsx` is now the single home:
`getInitials(value, mode)` (`name` tokenises on whitespace, `slug`
also on `-`/`_`) and `<InitialsAvatar>` (size presets `sm`/`md`,
decorative `aria-hidden`). All four call sites use it.

**This is the deliberate seam for the future avatar-image-upload
roadmap.** Initials-only is a settled product decision; the
component's doc-comment states that when image upload is scheduled,
`<InitialsAvatar>` gains an optional `imageUrl` prop and every call
site upgrades for free — the future change is one file. No image
rendering is added now.

### 2. The notifications bell never actually polled

`NotificationsBell`'s doc-comment described "fetches on open +
periodic poll", but the code only fetched once on mount and on the
*first* popover open — the unread badge froze at its mount-time
value. The product decision is REST polling (streaming is a separate
roadmap), so the poll was made real:

- a fixed-cadence `setInterval` (`NOTIFICATIONS_POLL_INTERVAL_MS`,
  60s) keeps the badge live with no user action;
- the poll pauses while the tab is hidden and refetches on
  `visibilitychange` — a backgrounded tab never hammers the endpoint;
- every popover-open now pulls a fresh list (was: first-open only).

The doc-comment is rewritten to match reality and to name the
SSE/WebSocket upgrade as the one future change point — replace the
interval, nothing else.

## Files

| File | Role |
|------|------|
| `src/components/ui/initials-avatar.tsx` | NEW — `getInitials` + `<InitialsAvatar>`; the initials-only seam. |
| `src/components/layout/user-menu.tsx` | uses `getInitials`; local helper removed. |
| `src/components/layout/tenant-switcher.tsx` | uses `<InitialsAvatar>`; local helper + recipe removed. |
| `src/components/layout/IdentityPill.tsx` | uses `<InitialsAvatar>`; local helper + recipe removed. |
| `src/components/layout/notifications-bell.tsx` | real REST poll + visibility-aware; doc-comment corrected. |
| `tests/rendered/initials-avatar.test.tsx` | NEW — `getInitials` modes + `<InitialsAvatar>` render/size/a11y. |
| `tests/rendered/identity-pill-routing.test.tsx` | NEW — locks both pills → `/tenants` (scope boundary). |
| `tests/rendered/notifications-bell-behaviour.test.tsx` | + a poll-cadence test (fake timers). |

## Decisions

- **Scope discipline over completeness.** The four excluded
  roadmaps were left strictly alone — `/tenants` stays the pill
  destination, initials stay initials, the bell stays REST, no
  aside chrome. The `identity-pill-routing` test exists specifically
  to fail if the `/tenants` decision drifts.

- **`getInitials` *and* `<InitialsAvatar>`.** Most surfaces want the
  component; the `UserMenu` trigger is itself the avatar *button*
  (it carries focus/press/hover state), so it consumes the bare
  `getInitials` function instead of nesting a second circle.

- **The seam is documented, not built.** Avatar-image upload is a
  real future roadmap. Rather than scaffold a half-built `imageUrl`
  path now, the single extension point is named in the component
  doc-comment — obvious to the next contributor, zero present-day
  surface.

- **`org-switcher.tsx` left untouched.** It is a separate, older
  (Epic O-4) component with its own migration TODO — not part of
  the Roadmap-14 chrome under review. Pulling it into this pass
  would be the scope creep the brief warns against.
