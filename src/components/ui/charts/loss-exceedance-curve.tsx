'use client';

/**
 * B10 — Loss Exceedance Curve (LEC) primitive.
 *
 * A standard quantitative-risk visualisation answering "for what
 * fraction of risks is the annualised loss expectancy ≥ X?". Each
 * point is rendered as a step on a curve plotting threshold (x) vs
 * exceedance fraction (y). The curve falls from (small loss, 1.0)
 * — every risk exceeds a tiny threshold — to (largest loss, 1/N)
 * — only the worst-case risk exceeds the largest loss.
 *
 * Inputs: pre-sorted descending by threshold, paired with the
 * cumulative exceedance fraction. The analytics usecase emits
 * exactly this shape (`LossExceedancePoint[]`).
 *
 * Shape vocabulary borrowed from the R16 LineChart primitive:
 *
 *   • visx `scaleLinear` for both axes;
 *   • visx `LinePath` with `curveStepAfter` interpolation so the
 *     curve reads as discrete loss buckets, not a smoothed trend;
 *   • visx `Area` painting the under-curve fill;
 *   • visx `AxisLeft` + `AxisBottom` with the token-backed tick
 *     formatters from `layout.ts`;
 *   • brand-purple stroke colour via the `--chart-series-1` token
 *     consumers can re-theme without touching the primitive.
 *
 * Light by design — no hover crosshair, no animation, no
 * multi-curve overlay. Those layers can be added later if a real
 * Monte-Carlo simulator surfaces multiple percentile curves.
 */
import { useMemo } from 'react';
import { ParentSize } from '@visx/responsive';
import { Group } from '@visx/group';
import { LinePath, Area } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { scaleLinear } from '@visx/scale';
import { curveStepAfter } from '@visx/curve';

export interface LossExceedancePoint {
    /** Loss threshold (currency, same unit as the source ALE). */
    threshold: number;
    /** Number of risks with ALE ≥ threshold (descriptive only). */
    exceedanceCount: number;
    /** Fraction of quantified risks ≥ threshold (0..1). */
    exceedanceFraction: number;
}

export interface LossExceedanceCurveProps {
    data: ReadonlyArray<LossExceedancePoint>;
    /** Optional explicit height. Defaults to 240px. */
    height?: number;
    /** Accessible label for the chart container. */
    ariaLabel?: string;
    /** Outer wrapper className. */
    className?: string;
    /** data-testid forwarded to the outer wrapper. */
    testId?: string;
    /** Optional currency-prefix formatter for axis ticks. */
    formatThreshold?: (value: number) => string;
}

const DEFAULT_HEIGHT = 240;
const MARGIN = { top: 16, right: 24, bottom: 32, left: 56 };

function defaultFormatThreshold(v: number): string {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
    return `$${Math.round(v)}`;
}

interface InnerProps extends LossExceedanceCurveProps {
    width: number;
    height: number;
}

function LossExceedanceInner({
    data,
    width,
    height,
    ariaLabel,
    formatThreshold = defaultFormatThreshold,
    testId,
    className,
}: InnerProps) {
    // The usecase emits the points in DESCENDING threshold order
    // (rank 1 = largest loss). For an LEC chart we want ASCENDING
    // x, so flip the order locally without mutating props.
    const ordered = useMemo(
        () => [...data].sort((a, b) => a.threshold - b.threshold),
        [data],
    );

    const xMax = Math.max(0, width - MARGIN.left - MARGIN.right);
    const yMax = Math.max(0, height - MARGIN.top - MARGIN.bottom);

    const maxThreshold = ordered.length
        ? Math.max(...ordered.map((p) => p.threshold))
        : 1;

    const xScale = useMemo(
        () =>
            scaleLinear<number>({
                range: [0, xMax],
                domain: [0, maxThreshold],
                nice: true,
            }),
        [xMax, maxThreshold],
    );

    const yScale = useMemo(
        () =>
            scaleLinear<number>({
                range: [yMax, 0],
                domain: [0, 1],
                nice: false,
            }),
        [yMax],
    );

    if (ordered.length === 0 || width === 0 || height === 0) {
        return null;
    }

    return (
        <svg
            width={width}
            height={height}
            role="img"
            aria-label={ariaLabel ?? 'Loss exceedance curve'}
            data-testid={testId ?? 'loss-exceedance-curve'}
            className={className}
        >
            <Group left={MARGIN.left} top={MARGIN.top}>
                {/* Under-curve area fill — same series-1 hue as the
                    line, but at low opacity so the curve reads as
                    a band, not a flat block. */}
                <Area<LossExceedancePoint>
                    data={ordered}
                    x={(d) => xScale(d.threshold) ?? 0}
                    y0={() => yMax}
                    y1={(d) => yScale(d.exceedanceFraction) ?? 0}
                    curve={curveStepAfter}
                    fill="var(--chart-series-1, #7c3aed)"
                    fillOpacity={0.12}
                />
                <LinePath<LossExceedancePoint>
                    data={ordered}
                    x={(d) => xScale(d.threshold) ?? 0}
                    y={(d) => yScale(d.exceedanceFraction) ?? 0}
                    curve={curveStepAfter}
                    stroke="var(--chart-series-1, #7c3aed)"
                    strokeWidth={2}
                    strokeOpacity={0.95}
                />
                <AxisBottom
                    top={yMax}
                    scale={xScale}
                    numTicks={5}
                    tickFormat={(v) => formatThreshold(Number(v))}
                    tickStroke="var(--content-subtle, #94a3b8)"
                    stroke="var(--content-subtle, #94a3b8)"
                    tickLabelProps={() => ({
                        fill: 'var(--content-muted, #64748b)',
                        fontSize: 10,
                        textAnchor: 'middle',
                    })}
                />
                <AxisLeft
                    scale={yScale}
                    numTicks={4}
                    tickFormat={(v) => `${Math.round(Number(v) * 100)}%`}
                    tickStroke="var(--content-subtle, #94a3b8)"
                    stroke="var(--content-subtle, #94a3b8)"
                    tickLabelProps={() => ({
                        fill: 'var(--content-muted, #64748b)',
                        fontSize: 10,
                        textAnchor: 'end',
                        dx: -4,
                        dy: 3,
                    })}
                />
            </Group>
        </svg>
    );
}

export function LossExceedanceCurve(props: LossExceedanceCurveProps) {
    const explicitHeight = props.height ?? DEFAULT_HEIGHT;
    return (
        <div
            data-testid={`${props.testId ?? 'loss-exceedance-curve'}-wrapper`}
            className={props.className}
            style={{ width: '100%', height: explicitHeight }}
        >
            <ParentSize>
                {({ width }) => (
                    <LossExceedanceInner
                        {...props}
                        width={width}
                        height={explicitHeight}
                    />
                )}
            </ParentSize>
        </div>
    );
}
