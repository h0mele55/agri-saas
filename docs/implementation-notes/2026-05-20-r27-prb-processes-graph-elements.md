# 2026-05-20 — Roadmap-27 PR-B — Processes graph elements

**Commit:** `<pending> feat(processes): R27-PR-B — node shapes + edge language`

Bundles Roadmap-27 prompts 3 (process-shape language) and 4 (edge
language). Both reshape the graph's primitives; one PR.

## Design

### Node shapes (prompt 3)

**Real diamond.** R25/R26 shipped a fake decision "diamond" — a
small rounded rect. The decision node now renders a genuine diamond:
a 45°-rotated square *body* layer inside a square chassis. Rotating
the body (not the chassis) is the key — border, selected ring and
elevation shadow all rotate WITH it and stay diamond-shaped, while
the label sits in a separate upright layer. xyflow handles position
on the square chassis → they land on the diamond's left/right
vertices.

**Size variants.** A `data.size` of `sm | md | lg` (default `md`)
scales the footprint — `RECT_SIZE` / `NOTE_SIZE` / `DIAMOND_SIZE`
geometry maps plus matching icon + label-text steps. Three discrete
sizes, not a free-form resize handle (which invites ragged,
mis-aligned maps). The inspector carries a size `ToggleGroup`.

**Shape vocabulary held at three.** rect / diamond / note remains
the curated ceiling (see `processes-canvas-semantics.md`) — accent +
icon do the remaining per-kind work. The PR-3 win is making the
diamond *real* and improving rect proportions, not adding shapes.

### Edge language (prompt 4)

A three-variant connection vocabulary on `edge.data.variant` — one
line style per meaning:

| Variant | Line | Meaning |
|---|---|---|
| `flow` | solid | normal sequential process flow (default) |
| `conditional` | dashed (`7 5`) | optional / branch path |
| `reference` | dotted (`1 6`, round cap) | informational dependency — not sequence |

`strokeFor(variant, selected, isPreview)` resolves the SVG style:
the variant owns solid/dashed/dotted; state owns colour + weight. A
selected edge keeps its dash signature (only colour + weight lift)
so a highlighted conditional edge still reads as conditional. Rest
stroke moved onto the dedicated `--canvas-edge` token.

The variant is cycled from a selection affordance
(`flow → conditional → reference`), grouped with the existing
"Add control" button into one midpoint cluster. A scoped CSS rule
gives every edge a quiet `brightness()` hover lift.

### Persistence

Both new properties round-trip with **no schema migration**:
- Edge variant → the existing `ProcessEdge.edgeKind` column.
- Node size → the forward-compatible `ProcessNode.dataJson` slot.

`edgeKindOf()` / `nodeDataJson()` serialise on every save path
(save, rename, duplicate); load rehydrates both.

## Files

| File | Change |
|---|---|
| `processes/ProcessEdge.tsx` | three-variant language, `strokeFor`, variant-cycle affordance |
| `processes/ProcessTypedNode.tsx` | real diamond, size variants, geometry maps |
| `processes/ProcessInspector.tsx` | size `ToggleGroup` |
| `processes/PersistedProcessCanvas.tsx` | variant + size persistence (save × 3 + load) |
| `src/styles/tokens.css` | `--canvas-edge` token (both themes) |
| `src/app/globals.css` | scoped process-edge hover |

## Decisions

- **Diamond via a rotated body layer, not `clip-path`.** `clip-path`
  clips the border, breaks `box-shadow`, and clips the selected
  ring. A 45°-rotated square keeps all three intact — the only thing
  that must stay upright is the text, which gets its own layer.
- **Three edge variants, no more.** Solid / dashed / dotted is the
  whole readable vocabulary; a fourth line style would need a fourth
  visually-distinct dash and the canvas stops being scannable.
- **Variant on `edgeKind`, size on `dataJson`.** Both columns
  already exist and round-trip — persistence is pure frontend
  wiring, no migration.
- **Discrete sizes, not free resize.** Three steps keep maps
  aligned and tidy; a drag-resize handle is a different (rejected)
  product posture for a lightweight architecture tool.
