/** @jest-environment jsdom */

/**
 * Rendered (Tier-2) test — `<InitialsAvatar>` + `getInitials`.
 *
 * The initials primitive replaced four divergent per-component
 * `initials*()` helpers. This pins the unified behaviour: the
 * tokenisation modes, the empty-input placeholder, the size
 * presets, and the decorative `aria-hidden` contract.
 */
import { render, screen } from '@testing-library/react';
import * as React from 'react';

import { InitialsAvatar, getInitials } from '@/components/ui/initials-avatar';

describe('getInitials', () => {
    it('two-word name → first + last initial', () => {
        expect(getInitials('Ada Lovelace')).toBe('AL');
    });

    it('three-word name → first + last (middle skipped)', () => {
        expect(getInitials('Ada Byron Lovelace')).toBe('AL');
    });

    it('single word → one initial', () => {
        expect(getInitials('Cher')).toBe('C');
    });

    it('slug mode tokenises on hyphen and underscore', () => {
        expect(getInitials('acme-corp', 'slug')).toBe('AC');
        expect(getInitials('big_co', 'slug')).toBe('BC');
    });

    it('name mode does NOT split a hyphenated slug', () => {
        expect(getInitials('acme-corp')).toBe('A');
    });

    it('empty / whitespace / null / undefined → placeholder', () => {
        expect(getInitials('')).toBe('·');
        expect(getInitials('   ')).toBe('·');
        expect(getInitials(null)).toBe('·');
        expect(getInitials(undefined)).toBe('·');
    });
});

describe('<InitialsAvatar>', () => {
    it('renders the derived initials (name mode)', () => {
        render(<InitialsAvatar value="Ada Lovelace" />);
        expect(screen.getByText('AL')).toBeInTheDocument();
    });

    it('renders slug initials in slug mode', () => {
        render(<InitialsAvatar value="acme-corp" mode="slug" />);
        expect(screen.getByText('AC')).toBeInTheDocument();
    });

    it('is decorative — aria-hidden, so the parent control owns the label', () => {
        const { container } = render(<InitialsAvatar value="Ada Lovelace" />);
        expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    });

    it('size presets resolve to distinct dimension classes', () => {
        const sm = render(<InitialsAvatar value="X" size="sm" />);
        const md = render(<InitialsAvatar value="X" size="md" />);
        expect((sm.container.firstChild as HTMLElement).className).toContain('h-5');
        expect((md.container.firstChild as HTMLElement).className).toContain('h-8');
    });
});
