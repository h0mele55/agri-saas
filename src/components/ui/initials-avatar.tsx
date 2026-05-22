/**
 * `<InitialsAvatar>` — the single initials-avatar primitive.
 *
 * Before this existed, four chrome surfaces (`UserMenu`,
 * `TenantSwitcher`, `TenantIdentityPill`, `OrgIdentityPill`) each
 * carried their own `initials*()` helper and their own
 * `bg-[var(--brand-subtle)]` circle recipe — four subtly-divergent
 * copies of one idea. This is the one home.
 *
 * ── Deliberate scope: initials only ──────────────────────────────
 * The account / workspace chrome represents identity with INITIALS,
 * never an uploaded image — a settled product decision. Avatar-image
 * upload is a SEPARATE roadmap (image upload already exists in
 * Settings; surfacing it in the chrome is future work).
 *
 * This component is the safe seam for that future roadmap: when it
 * lands, `<InitialsAvatar>` gains an optional `imageUrl` prop and
 * renders the image with the initials as the fallback — and every
 * call site upgrades for free, with no churn. Until that roadmap is
 * scheduled, do NOT add image rendering here. Keeping the seam in
 * one component is the whole point: the future change is one file.
 */
import { cn } from '@dub/utils';

// ─── Initials ──────────────────────────────────────────────────────

/**
 * Derive 1–2 uppercase initials from a display name or a slug.
 *
 * `mode: 'name'` (default) tokenises on whitespace — "Ada Lovelace"
 * → "AL". `mode: 'slug'` also tokenises on `-`/`_` — "acme-corp" →
 * "AC". Empty / whitespace-only input returns the `·` placeholder
 * so the avatar circle is never blank.
 */
export function getInitials(
    value: string | null | undefined,
    mode: 'name' | 'slug' = 'name',
): string {
    const cleaned = (value ?? '').trim();
    if (!cleaned) return '·';
    const separator = mode === 'slug' ? /[-_\s]+/ : /\s+/;
    const parts = cleaned.split(separator).filter(Boolean);
    if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
    return (
        parts[0]!.charAt(0).toUpperCase() +
        parts[parts.length - 1]!.charAt(0).toUpperCase()
    );
}

// ─── Component ──────────────────────────────────────────────────────

/** Size presets — `sm` is the inline pill avatar, `md` the user-menu trigger. */
const SIZE_CLASS = {
    sm: 'h-5 w-5 text-[10px]',
    md: 'h-8 w-8 text-[11px]',
} as const;

export interface InitialsAvatarProps {
    /** The display name or slug the initials are derived from. */
    value: string | null | undefined;
    /** Tokenisation mode — `name` (whitespace) or `slug` (also `-`/`_`). */
    mode?: 'name' | 'slug';
    /** Size preset. Defaults to `sm` (the pill avatar). */
    size?: keyof typeof SIZE_CLASS;
    className?: string;
}

/**
 * A round, brand-subtle circle showing 1–2 initials. Decorative —
 * `aria-hidden`; the interactive parent (button / link) carries the
 * accessible label.
 */
export function InitialsAvatar({
    value,
    mode = 'name',
    size = 'sm',
    className,
}: InitialsAvatarProps) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'flex items-center justify-center rounded-full bg-[var(--brand-subtle)] font-semibold text-[var(--brand-emphasis)]',
                SIZE_CLASS[size],
                className,
            )}
        >
            {getInitials(value, mode)}
        </span>
    );
}
