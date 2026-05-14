/**
 * Roadmap-18 PR-1 — `<ChartGloss>` specular-highlight primitive.
 *
 * A glass surface catches light: brightest where the light hits,
 * fading as the surface curves away. `<ChartGloss>` is the SVG
 * `<linearGradient>` def that produces that sheen — a white →
 * transparent ramp consumers paint as an OVERLAY on top of an
 * already-coloured chart shape (donut arc, bar, area).
 *
 * It is deliberately a sibling to the R16 `<ChartGradient>` family
 * (chart-gradient.tsx), not part of it:
 *
 *   - ChartGradient defs carry the segment's COLOUR (the series
 *     token). They answer "what hue is this shape?"
 *   - ChartGloss carries the LIGHT. It answers "where is the
 *     light hitting this shape?" — and the answer is always the
 *     same white sheen regardless of the shape's hue, exactly
 *     like a real specular highlight.
 *
 * Composition contract (the "two-layer paint"):
 *
 *   1. Paint the shape with its colour gradient:
 *        <path d={arc} fill={`url(#${colourId})`} />
 *   2. Paint the SAME shape again, on top, with the gloss:
 *        <path d={arc} fill={`url(#${glossId})`} />
 *
 *   The gloss layer's white-to-transparent ramp lets the colour
 *   layer show through everywhere except the sheen band. Two
 *   <path>s, same `d`, stacked — that's the whole technique.
 *
 * Why white, not a tinted highlight: a real glass/gloss highlight
 * is the colour of the LIGHT SOURCE, not the surface. A tinted
 * sheen reads as "the colour got lighter"; a white sheen reads as
 * "light is hitting glass." White is theme-independent for the
 * same reason — the light source doesn't change between light and
 * dark mode.
 *
 * Direction:
 *   vertical   — light from above (default). Donut arcs, bars,
 *                area fills — anything where "up" is toward the
 *                viewer's light.
 *   diagonal   — light from the upper-left. The "polished tile"
 *                angle; pairs with the R16 diagonal colour
 *                gradient on card-like chart surfaces.
 *
 * Intensity — three steps, mapped to the peak stop-opacity:
 *   subtle  — 0.18. A breath of sheen. Dense multi-series charts
 *             where a strong gloss would compete with the data.
 *   default — 0.32. The standard glass catch-light.
 *   bright  — 0.48. Hero surfaces — a single big donut, a
 *             masthead sparkline — where the gloss IS part of
 *             the visual statement.
 */
import { type ReactElement } from 'react';

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Light direction for the gloss ramp.
 *   vertical — top → bottom (light from above).
 *   diagonal — top-left → bottom-right (light from upper-left).
 */
export type ChartGlossDirection = 'vertical' | 'diagonal';

/**
 * Sheen strength. Maps 1:1 to the peak `stop-opacity` of the
 * bright stop — see `INTENSITY_PEAK` below.
 */
export type ChartGlossIntensity = 'subtle' | 'default' | 'bright';

interface ChartGlossProps {
    /**
     * Unique gradient id. Consumers reference it via
     * `fill={`url(#${id})`}` on the overlay shape. Convention:
     * `${chartId}-gloss` (or `${chartId}-gloss-${seriesIndex}`
     * when a chart needs per-series gloss ids).
     */
    id: string;
    /** Light direction. Defaults to `'vertical'`. */
    direction?: ChartGlossDirection;
    /** Sheen strength. Defaults to `'default'`. */
    intensity?: ChartGlossIntensity;
}

// ─── Intensity → peak opacity ────────────────────────────────────────

/**
 * The peak `stop-opacity` for each intensity step. The gloss ramp
 * always ENDS at fully transparent; only the bright stop's alpha
 * varies. Three discrete steps — not a freeform number — so the
 * gloss vocabulary stays as tight as the rest of the chart
 * platform.
 */
const INTENSITY_PEAK: Record<ChartGlossIntensity, number> = {
    subtle: 0.18,
    default: 0.32,
    bright: 0.48,
};

// ─── Direction → gradient vector ─────────────────────────────────────

function directionVector(direction: ChartGlossDirection): {
    x1: string;
    y1: string;
    x2: string;
    y2: string;
} {
    if (direction === 'diagonal') {
        return { x1: '0%', y1: '0%', x2: '100%', y2: '100%' };
    }
    // vertical — light from above.
    return { x1: '0%', y1: '0%', x2: '0%', y2: '100%' };
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * Renders a `<linearGradient>` def. MUST be mounted inside an
 * `<svg>`'s `<defs>` block.
 *
 * The ramp is a 3-stop white fade:
 *   0%   — white @ <peak>            (the catch-light band)
 *   45%  — white @ <peak> × 0.15     (quick falloff — glass
 *          highlights are NARROW, not a even wash)
 *   100% — white @ 0                 (fully transparent — the
 *          colour layer below shows through untouched)
 *
 * The 45% knee is what makes it read as a HIGHLIGHT rather than a
 * "the whole shape got lighter" wash — a real specular highlight
 * concentrates near the lit edge and falls off fast.
 */
export function ChartGloss({
    id,
    direction = 'vertical',
    intensity = 'default',
}: ChartGlossProps): ReactElement {
    const peak = INTENSITY_PEAK[intensity];
    const { x1, y1, x2, y2 } = directionVector(direction);

    return (
        <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
            <stop offset="0%" stopColor="#ffffff" stopOpacity={peak} />
            <stop
                offset="45%"
                stopColor="#ffffff"
                stopOpacity={peak * 0.15}
            />
            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </linearGradient>
    );
}

/**
 * Canonical gloss id builder — mirrors `chartGradientId` from
 * chart-gradient.tsx. Use this so every chart spells its gloss
 * def ids the same way.
 *
 *   chartGlossId('risk-donut')        → 'risk-donut-gloss'
 *   chartGlossId('risk-donut', 3)     → 'risk-donut-gloss-3'
 */
export function chartGlossId(chartId: string, seriesIndex?: number): string {
    return seriesIndex === undefined
        ? `${chartId}-gloss`
        : `${chartId}-gloss-${seriesIndex}`;
}
