/**
 * Roadmap-27 PR-B — Processes graph-elements ratchet.
 *
 * PR-B redesigns the node SHAPE language (prompt 3) and the edge
 * CONNECTION language (prompt 4). This ratchet locks the load-bearing
 * pieces:
 *
 *   Nodes:
 *   1. A real diamond — the decision node renders a 45°-rotated
 *      body, not the R25/R26 fake (a small rounded rect).
 *   2. Three discrete size variants (sm / md / lg) on `data.size`.
 *
 *   Edges:
 *   3. A three-variant connection vocabulary — flow (solid),
 *      conditional (dashed), reference (dotted).
 *   4. The variant is settable (cycle affordance) and persists
 *      through the `edgeKind` column.
 *
 *   Persistence:
 *   5. Node size round-trips via `ProcessNode.dataJson`; edge
 *      variant via `ProcessEdge.edgeKind`.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const NODE = read("src/components/processes/ProcessTypedNode.tsx");
const EDGE = read("src/components/processes/ProcessEdge.tsx");
const CANVAS = read("src/components/processes/PersistedProcessCanvas.tsx");
const INSPECTOR = read("src/components/processes/ProcessInspector.tsx");
const TOKENS = read("src/styles/tokens.css");

describe("R27-PR-B — node shape language", () => {
    it("the decision node is a REAL diamond (45°-rotated body)", () => {
        expect(NODE).toMatch(/rotate-45/);
        // The fake-diamond dimension is gone.
        expect(NODE).not.toMatch(/min-w-\[120px\]/);
    });

    it("the diamond body keeps border/ring/shadow on the rotated layer", () => {
        // Rotating the body (not the chassis) is what makes the
        // border + ring + shadow stay diamond-shaped.
        expect(NODE).toMatch(/inset-\[14\.6%\][\s\S]*?rotate-45/);
    });

    it("exposes three discrete size variants", () => {
        expect(NODE).toMatch(/ProcessNodeSize/);
        expect(NODE).toMatch(/PROCESS_NODE_SIZES/);
        expect(NODE).toMatch(/DEFAULT_NODE_SIZE/);
        expect(NODE).toMatch(/RECT_SIZE/);
        expect(NODE).toMatch(/DIAMOND_SIZE/);
        // Each size map carries all three steps.
        for (const step of ["sm:", "md:", "lg:"]) {
            expect(NODE).toMatch(new RegExp(step));
        }
    });

    it("keeps the brand selected ring (R25 selection vocabulary)", () => {
        expect(NODE).toMatch(/ring-2\s+ring-\[color:var\(--brand-default\)\]/);
        expect(NODE).toMatch(/bg-bg-elevated/);
    });
});

describe("R27-PR-B — edge connection language", () => {
    it("defines the three-variant vocabulary", () => {
        expect(EDGE).toMatch(/ProcessEdgeVariant/);
        expect(EDGE).toMatch(/EDGE_VARIANT_ORDER/);
        expect(EDGE).toMatch(/isProcessEdgeVariant/);
        for (const v of ['"flow"', '"conditional"', '"reference"']) {
            expect(EDGE).toMatch(new RegExp(v));
        }
    });

    it("solid / dashed / dotted — one line style per variant", () => {
        // conditional → dashed; reference → dotted (round-capped).
        expect(EDGE).toMatch(/strokeDasharray:\s*["']7 5["']/);
        expect(EDGE).toMatch(/strokeDasharray:\s*["']1 6["']/);
        expect(EDGE).toMatch(/strokeLinecap:\s*["']round["']/);
    });

    it("rest stroke uses --canvas-edge; selected uses --brand-default", () => {
        expect(EDGE).toMatch(/var\(--canvas-edge\)/);
        expect(EDGE).toMatch(/var\(--brand-default\)/);
    });

    it("the variant is settable from a selection affordance", () => {
        expect(EDGE).toMatch(/cycleVariant/);
        expect(EDGE).toMatch(/data-edge-variant-affordance/);
    });

    it("preserves the control-on-edge affordance", () => {
        expect(EDGE).toMatch(/!control && selected/);
        expect(EDGE).toMatch(/Add control/);
        expect(EDGE).toMatch(/data-control-on-edge-badge/);
    });
});

describe("R27-PR-B — persistence", () => {
    it("edge variant round-trips via edgeKind", () => {
        expect(CANVAS).toMatch(/edgeKindOf/);
        // No more hardcoded "flow".
        expect(CANVAS).not.toMatch(/edgeKind:\s*["']flow["']/);
    });

    it("node size round-trips via dataJson", () => {
        expect(CANVAS).toMatch(/nodeDataJson/);
        expect(CANVAS).toMatch(/dataJson:\s*nodeDataJson\(n\)/);
    });

    it("the inspector exposes the size control", () => {
        expect(INSPECTOR).toMatch(/ToggleGroup/);
        expect(INSPECTOR).toMatch(/Node size/);
    });

    it("--canvas-edge has light + dark theme parity", () => {
        const defs = TOKENS.match(/--canvas-edge:/g) ?? [];
        expect(defs.length).toBe(2);
    });
});
