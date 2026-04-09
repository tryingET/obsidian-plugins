import { describe, expect, it } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import {
  resolveFocusedNodeStructuralMove,
  resolveSelectionStructuralMove,
  resolveStructuralSelectionIssue,
} from "../src/ui/sidepanel/selection/structuralMoveSelection.js"

const makeFrameResolution = (frameId: string | null) => ({
  ok: true as const,
  frameId,
})

const makeElementNode = (id: string, frameId: string | null = null): LayerNode => ({
  id,
  type: "element",
  elementIds: [id],
  primaryElementId: id,
  children: [],
  canExpand: false,
  isExpanded: false,
  groupId: null,
  frameId,
  label: id,
})

const makeGroupNode = (groupId: string, frameId: string | null = null): LayerNode => ({
  id: `group:${groupId}`,
  type: "group",
  elementIds: ["A", "B"],
  primaryElementId: "A",
  children: [],
  canExpand: true,
  isExpanded: true,
  groupId,
  frameId,
  label: groupId,
})

describe("sidepanel structural move selection helpers", () => {
  it("preserves sourceGroupId for a single selected group row", () => {
    const selection = {
      elementIds: ["A", "B"],
      nodes: [makeGroupNode("G", "Frame-A")],
      frameResolution: makeFrameResolution("Frame-A"),
    }

    expect(resolveSelectionStructuralMove(selection)).toEqual({
      nodeIds: ["group:G"],
      sourceGroupId: "G",
    })
  })

  it("fails closed for mixed group-plus-leaf structural selections", () => {
    const selection = {
      elementIds: ["A", "B"],
      nodes: [makeGroupNode("G"), makeElementNode("el:B")],
      frameResolution: makeFrameResolution(null),
    }

    expect(resolveSelectionStructuralMove(selection)).toBeNull()
    expect(resolveStructuralSelectionIssue(selection)).toBe(
      "Selection includes mixed or multiple group rows.",
    )
  })

  it("resolves focused group rows as structural moves and improves empty-selection messaging", () => {
    expect(resolveFocusedNodeStructuralMove(makeGroupNode("G", "Frame-A"))).toEqual({
      nodeIds: ["group:G"],
      sourceGroupId: "G",
    })

    expect(
      resolveStructuralSelectionIssue({
        elementIds: [],
        nodes: [],
        frameResolution: makeFrameResolution(null),
      }),
    ).toBe("Select rows or elements first.")
  })
})
