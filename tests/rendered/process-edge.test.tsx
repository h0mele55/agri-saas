/**
 * R27-PR-B — ProcessEdge rendered tests.
 *
 * One render per connection variant — asserts the line signature
 * (solid / dashed / dotted) the structural ratchet can't see in the
 * computed SVG path style.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ProcessEdge } from '@/components/processes/ProcessEdge';

function renderEdge(variant: string, selected = false) {
    return render(
        <ReactFlowProvider>
            <svg>
                <ProcessEdge
                    {...({
                        id: 'e1',
                        source: 'a',
                        target: 'b',
                        sourceX: 0,
                        sourceY: 0,
                        targetX: 120,
                        targetY: 80,
                        sourcePosition: 'right',
                        targetPosition: 'left',
                        selected,
                        data: { variant },
                    } as any)}
                />
            </svg>
        </ReactFlowProvider>,
    );
}

function edgePathStyle(container: HTMLElement): string {
    const path = container.querySelector('.react-flow__edge-path');
    expect(path).not.toBeNull();
    return path!.getAttribute('style') ?? '';
}

describe('ProcessEdge — connection variants', () => {
    it('flow renders a SOLID stroke (no dash) on the canvas-edge token', () => {
        const { container } = renderEdge('flow');
        const style = edgePathStyle(container);
        expect(style).not.toMatch(/dasharray/);
        expect(style).toMatch(/var\(--canvas-edge\)/);
    });

    it('conditional renders a DASHED stroke', () => {
        const { container } = renderEdge('conditional');
        expect(edgePathStyle(container)).toMatch(/stroke-dasharray:\s*7 5/);
    });

    it('reference renders a DOTTED, round-capped stroke', () => {
        const { container } = renderEdge('reference');
        const style = edgePathStyle(container);
        expect(style).toMatch(/stroke-dasharray:\s*1 6/);
        expect(style).toMatch(/stroke-linecap:\s*round/);
    });

    it('an unknown / missing variant falls back to flow (solid)', () => {
        const { container } = renderEdge('not-a-variant');
        expect(edgePathStyle(container)).not.toMatch(/dasharray/);
    });

    it('a selected edge lifts to the brand stroke but keeps its dash', () => {
        const { container } = renderEdge('conditional', true);
        const style = edgePathStyle(container);
        expect(style).toMatch(/var\(--brand-default\)/);
        expect(style).toMatch(/stroke-dasharray:\s*7 5/);
    });
});
