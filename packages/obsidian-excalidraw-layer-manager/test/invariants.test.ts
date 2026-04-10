import { describe, expect, it } from "vitest"

import { validateNoDescendantCycle, validateReparentInvariants } from "../src/domain/invariants.js"

describe("validateReparentInvariants", () => {
  it("rejects cross-frame moves", () => {
    const result = validateReparentInvariants({
      sourceFrameId: "frame-a",
      targetFrameId: "frame-b",
      sourceGroupId: null,
      targetParentPath: [],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("Cross-frame")
    }
  })

  it("rejects self-nesting cycles", () => {
    const result = validateReparentInvariants({
      sourceFrameId: null,
      targetFrameId: null,
      sourceGroupId: "group-1",
      targetParentPath: ["group-1", "group-2"],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("itself")
    }
  })

  it("rejects duplicate target path segments", () => {
    const result = validateReparentInvariants({
      sourceFrameId: null,
      targetFrameId: null,
      sourceGroupId: null,
      targetParentPath: ["dup", "dup"],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("duplicate")
    }
  })

  it("rejects stale canonical target parent paths", () => {
    const result = validateReparentInvariants({
      sourceFrameId: "frame-1",
      targetFrameId: "frame-1",
      sourceGroupId: null,
      targetParentPath: ["missing"],
      canonicalTargetParentPathKeys: new Set(["null:", "frame-1:"]),
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("stale")
    }
  })

  it("accepts valid same-frame reparent", () => {
    const result = validateReparentInvariants({
      sourceFrameId: "frame-1",
      targetFrameId: "frame-1",
      sourceGroupId: "group-1",
      targetParentPath: ["group-2"],
      canonicalTargetParentPathKeys: new Set(["null:", "frame-1:", "frame-1:group-2"]),
    })

    expect(result.ok).toBe(true)
  })

  it("rejects moving a group into its own descendant (ancestor-descendant cycle)", () => {
    const structuralTree = [
      {
        id: "group:parent",
        type: "group" as const,
        groupId: "parent",
        frameId: null,
        label: "parent",
        elementIds: [],
        primaryElementId: "parent",
        canExpand: true,
        isExpanded: true,
        children: [
          {
            id: "group:child",
            type: "group" as const,
            groupId: "child",
            frameId: null,
            label: "child",
            elementIds: [],
            primaryElementId: "child",
            children: [],
            canExpand: false,
            isExpanded: false,
          },
        ],
      },
    ]

    const result = validateReparentInvariants({
      sourceFrameId: null,
      targetFrameId: null,
      sourceGroupId: "parent",
      targetParentPath: ["child"],
      structuralTree,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("descendant")
    }
  })
})

describe("validateNoDescendantCycle", () => {
  const makeGroupNode = (groupId: string, children: readonly unknown[] = []): unknown => ({
    id: `group:${groupId}`,
    type: "group",
    groupId,
    frameId: null,
    label: groupId,
    elementIds: [],
    primaryElementId: groupId,
    canExpand: children.length > 0,
    isExpanded: false,
    children,
  })

  it("passes when sourceGroupId is null", () => {
    const result = validateNoDescendantCycle(null, ["any"], [])
    expect(result.ok).toBe(true)
  })

  it("passes when targetParentPath is empty", () => {
    const result = validateNoDescendantCycle("group-1", [], [])
    expect(result.ok).toBe(true)
  })

  it("passes when structuralTree is undefined", () => {
    const result = validateNoDescendantCycle("group-1", ["any"], undefined)
    expect(result.ok).toBe(true)
  })

  it("passes when source group is not an ancestor of target path groups", () => {
    const tree = [
      makeGroupNode("unrelated", [makeGroupNode("target-group", [])]),
      makeGroupNode("source", []),
    ]

    const result = validateNoDescendantCycle("source", ["target-group"], tree as never[])
    expect(result.ok).toBe(true)
  })

  it("rejects when source group is direct parent of target path group", () => {
    const tree = [makeGroupNode("parent", [makeGroupNode("child", [])])]

    const result = validateNoDescendantCycle("parent", ["child"], tree as never[])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("descendant")
    }
  })

  it("rejects when source group is grandparent of target path group", () => {
    const tree = [
      makeGroupNode("grandparent", [makeGroupNode("parent", [makeGroupNode("grandchild", [])])]),
    ]

    const result = validateNoDescendantCycle(
      "grandparent",
      ["parent", "grandchild"],
      tree as never[],
    )
    expect(result.ok).toBe(false)
  })
})
