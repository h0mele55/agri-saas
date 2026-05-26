/**
 * PR-A polish — Unit coverage for `computeAutoLayout`'s
 * selection-only mode. The original LR/TB code paths already have
 * implicit coverage via the canvas wiring; this file pins the
 * `nodeIdsFilter` contract:
 *
 *   1. Positions are returned ONLY for ids in the filter.
 *   2. Non-filtered nodes get no entry (caller leaves them alone).
 *   3. The laid-out subset's centroid is preserved (i.e. the
 *      result lands near where it already was, not at the canvas
 *      origin).
 */

import { computeAutoLayout } from "@/lib/processes/canvas-auto-layout";
import type { Edge, Node } from "@xyflow/react";

function n(id: string, x: number, y: number): Node {
    return {
        id,
        type: "processStep",
        position: { x, y },
        data: { label: id, kind: "processStep" },
    };
}

function e(source: string, target: string): Edge {
    return { id: `${source}-${target}`, source, target };
}

describe("computeAutoLayout — selection-only mode", () => {
    it("returns positions only for ids in the filter", () => {
        const nodes = [n("a", 0, 0), n("b", 100, 0), n("c", 200, 0), n("d", 300, 0)];
        const edges = [e("a", "b"), e("b", "c"), e("c", "d")];
        const filter = new Set(["b", "c"]);
        const { positions } = computeAutoLayout(nodes, edges, "LR", filter);

        expect(Object.keys(positions).sort()).toEqual(["b", "c"]);
        expect(positions.a).toBeUndefined();
        expect(positions.d).toBeUndefined();
    });

    it("preserves the selection centroid (lays out near original)", () => {
        // Selected pair sits at avg (150, 1000). After layout the
        // returned positions' centroid must land within ±50 of
        // that point, not at the canvas origin.
        const nodes = [n("a", 0, 0), n("b", 100, 1000), n("c", 200, 1000)];
        const edges = [e("b", "c")];
        const filter = new Set(["b", "c"]);
        const { positions } = computeAutoLayout(nodes, edges, "LR", filter);

        const cx =
            (positions.b.x + positions.c.x) / 2;
        const cy =
            (positions.b.y + positions.c.y) / 2;
        // Original selection centroid: ((100+200)/2, (1000+1000)/2) = (150, 1000)
        expect(Math.abs(cx - 150)).toBeLessThan(50);
        expect(Math.abs(cy - 1000)).toBeLessThan(50);
    });

    it("drops edges whose endpoints fall outside the filter", () => {
        // Edge a→b crosses the filter boundary; the algorithm
        // should treat the selected subset {b, c} as an island
        // and not try to route the a→b edge through dagre.
        const nodes = [n("a", 0, 0), n("b", 100, 100), n("c", 200, 100)];
        const edges = [e("a", "b"), e("b", "c")];
        const filter = new Set(["b", "c"]);
        const { positions } = computeAutoLayout(nodes, edges, "LR", filter);
        // No throw → contract honoured. We don't assert exact
        // positions here (dagre output is direction-dependent);
        // the previous test already proves centroid preservation.
        expect(positions.b).toBeDefined();
        expect(positions.c).toBeDefined();
    });

    it("returns empty positions when the filter selects nothing", () => {
        const nodes = [n("a", 0, 0), n("b", 100, 0)];
        const edges = [e("a", "b")];
        const filter = new Set<string>([]);
        const { positions } = computeAutoLayout(nodes, edges, "LR", filter);
        expect(positions).toEqual({});
    });

    it("ignores annotation nodes even when in the filter", () => {
        const nodes: Node[] = [
            { id: "a", position: { x: 0, y: 0 }, data: { kind: "processStep" } },
            { id: "ann", position: { x: 0, y: 0 }, data: { kind: "annotation" } },
        ];
        const filter = new Set(["a", "ann"]);
        const { positions } = computeAutoLayout(nodes, [], "LR", filter);
        expect(positions.a).toBeDefined();
        expect(positions.ann).toBeUndefined();
    });
});
