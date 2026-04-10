import { describe, expect, it } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import { resolveRowClickSelection } from "../src/ui/sidepanel/selection/rowClickSelection.js"

const makeNode = (
  id: string,
  elementIds: readonly string[] = [id.replace(/^el:/, "")],
  children: readonly LayerNode[] = [],
): LayerNode => ({
  id,
  type: id.startsWith("group:") ? "group" : "element",
  elementIds,
  primaryElementId: elementIds[0] ?? id,
  children,
  canExpand: children.length > 0,
  isExpanded: children.length > 0,
  groupId: id.startsWith("group:") ? id.slice("group:".length) : null,
  frameId: null,
  label: id,
})

describe("sidepanel row-click selection contract", () => {
  it("replaces selection and sets the clicked row as anchor on plain click", () => {
    const a = makeNode("el:A")
    const b = makeNode("el:B")

    const result = resolveRowClickSelection({
      clickedNode: b,
      visibleNodes: [a, b],
      currentSelectedNodes: [a],
      currentAnchorNodeId: a.id,
      modifiers: {
        shiftKey: false,
        toggleKey: false,
      },
    })

    expect(result.selectedNodes).toEqual([b])
    expect(result.selectedElementIds).toEqual(["B"])
    expect(result.anchorNodeId).toBe(b.id)
  })

  it("toggles the clicked row into the explicit row selection on modifier click", () => {
    const a = makeNode("el:A")
    const b = makeNode("el:B")

    const result = resolveRowClickSelection({
      clickedNode: b,
      visibleNodes: [a, b],
      currentSelectedNodes: [a],
      currentAnchorNodeId: a.id,
      modifiers: {
        shiftKey: false,
        toggleKey: true,
      },
    })

    expect(result.selectedNodes).toEqual([a, b])
    expect(result.selectedElementIds).toEqual(["A", "B"])
    expect(result.anchorNodeId).toBe(b.id)
  })

  it("toggles the clicked row out of selection and clears the anchor when nothing remains selected", () => {
    const a = makeNode("el:A")

    const result = resolveRowClickSelection({
      clickedNode: a,
      visibleNodes: [a],
      currentSelectedNodes: [a],
      currentAnchorNodeId: a.id,
      modifiers: {
        shiftKey: false,
        toggleKey: true,
      },
    })

    expect(result.selectedNodes).toEqual([])
    expect(result.selectedElementIds).toEqual([])
    expect(result.anchorNodeId).toBeNull()
  })

  it("selects the contiguous visible row range from the current anchor on shift-click", () => {
    const a = makeNode("el:A")
    const b = makeNode("el:B")
    const c = makeNode("el:C")
    const d = makeNode("el:D")

    const result = resolveRowClickSelection({
      clickedNode: d,
      visibleNodes: [a, b, c, d],
      currentSelectedNodes: [b],
      currentAnchorNodeId: b.id,
      modifiers: {
        shiftKey: true,
        toggleKey: false,
      },
    })

    expect(result.selectedNodes).toEqual([b, c, d])
    expect(result.selectedElementIds).toEqual(["B", "C", "D"])
    expect(result.anchorNodeId).toBe(b.id)
  })

  it("falls back to the clicked row when the stored anchor is not visible in the current projection", () => {
    const hiddenAnchor = makeNode("el:hidden")
    const b = makeNode("el:B")
    const c = makeNode("el:C")

    const result = resolveRowClickSelection({
      clickedNode: c,
      visibleNodes: [b, c],
      currentSelectedNodes: [hiddenAnchor],
      currentAnchorNodeId: hiddenAnchor.id,
      modifiers: {
        shiftKey: true,
        toggleKey: false,
      },
    })

    expect(result.selectedNodes).toEqual([c])
    expect(result.selectedElementIds).toEqual(["C"])
    expect(result.anchorNodeId).toBe(c.id)
  })

  it("preserves explicit row selection while de-duping overlapping element ids across a visible range", () => {
    const group = makeNode("group:G", ["A", "B"])
    const a = makeNode("el:A", ["A"])
    const b = makeNode("el:B", ["B"])

    const result = resolveRowClickSelection({
      clickedNode: b,
      visibleNodes: [group, a, b],
      currentSelectedNodes: [group],
      currentAnchorNodeId: group.id,
      modifiers: {
        shiftKey: true,
        toggleKey: false,
      },
    })

    expect(result.selectedNodes).toEqual([group, a, b])
    expect(result.selectedElementIds).toEqual(["A", "B"])
    expect(result.anchorNodeId).toBe(group.id)
  })
})
