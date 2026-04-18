import { describe, expect, it } from "vitest"

import { planCreateGroup } from "../src/commands/createGroup.js"
import { planDeleteNode } from "../src/commands/deleteNode.js"
import { planRenameNode } from "../src/commands/renameNode.js"
import { planReorder } from "../src/commands/reorderNode.js"
import { planReparentNode } from "../src/commands/reparentNode.js"
import type { ScenePatch } from "../src/model/patch.js"
import { makeCommandContext, makeElement } from "./testFixtures.js"

const patchIdSet = (patch: ScenePatch): Set<string> => {
  return new Set(patch.elementPatches.map((entry) => entry.id))
}

const patchById = (patch: ScenePatch, id: string) => {
  return patch.elementPatches.find((entry) => entry.id === id)
}

describe("commands acceptance matrix", () => {
  it("C01 — reparent assigns reversed canonical target parent path", () => {
    const context = makeCommandContext([
      makeElement({ id: "F", type: "frame" }),
      makeElement({ id: "A", frameId: "F" }),
      makeElement({ id: "B", frameId: "F" }),
      makeElement({ id: "Anchor", frameId: "F", groupIds: ["inner", "outer"] }),
    ])

    const plan = planReparentNode(context, {
      elementIds: ["A", "B"],
      sourceGroupId: null,
      targetParentPath: ["outer", "inner"],
      targetFrameId: "F",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(patchById(plan.value, "A")?.set.groupIds).toEqual(["inner", "outer"])
    expect(patchById(plan.value, "B")?.set.groupIds).toEqual(["inner", "outer"])
    expect(patchById(plan.value, "A")?.set.frameId).toBe("F")
    expect(patchById(plan.value, "B")?.set.frameId).toBe("F")
  })

  it("C02 — reparent preserves relative path inside moved source group", () => {
    const context = makeCommandContext([
      makeElement({ id: "F", type: "frame" }),
      makeElement({ id: "A", frameId: "F", groupIds: ["inner", "G"] }),
      makeElement({ id: "B", frameId: "F", groupIds: ["G"] }),
      makeElement({ id: "Anchor", frameId: "F", groupIds: ["outer"] }),
    ])

    const plan = planReparentNode(context, {
      elementIds: ["A", "B"],
      sourceGroupId: "G",
      targetParentPath: ["outer"],
      targetFrameId: "F",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(patchById(plan.value, "A")?.set.groupIds).toEqual(["inner", "G", "outer"])
    expect(patchById(plan.value, "B")?.set.groupIds).toEqual(["G", "outer"])
  })

  it("C03 — reparent rejects cross-frame moves", () => {
    const context = makeCommandContext([makeElement({ id: "A", frameId: "F1" })])

    const plan = planReparentNode(context, {
      elementIds: ["A"],
      sourceGroupId: null,
      targetParentPath: [],
      targetFrameId: "F2",
    })

    expect(plan.ok).toBe(false)
    if (!plan.ok) {
      expect(plan.error).toContain("Cross-frame")
    }
  })

  it("C04 — reparent rejects mixed source frames", () => {
    const context = makeCommandContext([
      makeElement({ id: "A", frameId: "F1" }),
      makeElement({ id: "B", frameId: "F2" }),
    ])

    const plan = planReparentNode(context, {
      elementIds: ["A", "B"],
      sourceGroupId: null,
      targetParentPath: [],
      targetFrameId: "F1",
    })

    expect(plan.ok).toBe(false)
    if (!plan.ok) {
      expect(plan.error).toContain("multiple source frames")
    }
  })

  it("C04b — reparent rejects frame elements as structural targets", () => {
    const context = makeCommandContext([
      makeElement({ id: "F", type: "frame" }),
      makeElement({ id: "A", frameId: "F" }),
    ])

    const plan = planReparentNode(context, {
      elementIds: ["F", "A"],
      sourceGroupId: null,
      targetParentPath: [],
      targetFrameId: null,
    })

    expect(plan.ok).toBe(false)
    if (!plan.ok) {
      expect(plan.error).toContain("Frame elements")
    }
  })

  it("C05 — reparent rejects self-cycle", () => {
    const context = makeCommandContext([
      makeElement({ id: "A", groupIds: ["child", "G"] }),
      makeElement({ id: "B", groupIds: ["G"] }),
    ])

    const plan = planReparentNode(context, {
      elementIds: ["A", "B"],
      sourceGroupId: "G",
      targetParentPath: ["outer", "G"],
      targetFrameId: null,
    })

    expect(plan.ok).toBe(false)
    if (!plan.ok) {
      expect(plan.error).toContain("itself")
    }
  })

  it("C06 — reparent keeps container and bound text together when both targeted", () => {
    const context = makeCommandContext([
      makeElement({ id: "S", type: "rectangle", frameId: "F" }),
      makeElement({ id: "T", type: "text", frameId: "F", containerId: "S" }),
      makeElement({ id: "Anchor", type: "rectangle", frameId: "F", groupIds: ["G"] }),
    ])

    const plan = planReparentNode(context, {
      elementIds: ["S", "T"],
      sourceGroupId: null,
      targetParentPath: ["G"],
      targetFrameId: "F",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(patchIdSet(plan.value)).toEqual(new Set(["S", "T"]))
    expect(patchById(plan.value, "S")?.set.groupIds).toEqual(["G"])
    expect(patchById(plan.value, "T")?.set.groupIds).toEqual(["G"])
  })

  it("C07 — reparent normalization auto-expands bound text closure", () => {
    const context = makeCommandContext([
      makeElement({ id: "S", type: "rectangle", frameId: "F" }),
      makeElement({ id: "T", type: "text", frameId: "F", containerId: "S" }),
      makeElement({ id: "Anchor", type: "rectangle", frameId: "F", groupIds: ["G"] }),
    ])

    const plan = planReparentNode(context, {
      elementIds: ["S"],
      sourceGroupId: null,
      targetParentPath: ["G"],
      targetFrameId: "F",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(patchIdSet(plan.value)).toEqual(new Set(["S", "T"]))
  })

  it("C08 — reparent rejects when sourceGroupId is missing from some targets", () => {
    const context = makeCommandContext([
      makeElement({ id: "A", groupIds: ["inner", "G"] }),
      makeElement({ id: "B", groupIds: ["other"] }),
      makeElement({ id: "Anchor", groupIds: ["outer"] }),
    ])

    const plan = planReparentNode(context, {
      elementIds: ["A", "B"],
      sourceGroupId: "G",
      targetParentPath: ["outer"],
      targetFrameId: null,
    })

    expect(plan.ok).toBe(false)
    if (!plan.ok) {
      expect(plan.error).toContain("sourceGroupId")
    }
  })

  it("C08b — reparent emits an empty patch for an already-root selection", () => {
    const context = makeCommandContext([
      makeElement({ id: "A", groupIds: [] }),
      makeElement({ id: "B", groupIds: [] }),
    ])

    const plan = planReparentNode(context, {
      elementIds: ["A"],
      sourceGroupId: null,
      targetParentPath: [],
      targetFrameId: null,
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.elementPatches).toEqual([])
  })

  it("C08c — reparent rejects stale target parent paths instead of inventing new ancestry", () => {
    const context = makeCommandContext([
      makeElement({ id: "A", frameId: "F" }),
      makeElement({ id: "F", type: "frame" }),
    ])

    const plan = planReparentNode(context, {
      elementIds: ["A"],
      sourceGroupId: null,
      targetParentPath: ["missing"],
      targetFrameId: "F",
    })

    expect(plan.ok).toBe(false)
    if (!plan.ok) {
      expect(plan.error).toContain("stale")
    }
  })

  it("C08d — reparent rejects duplicate target path segments instead of normalizing intent", () => {
    const context = makeCommandContext([makeElement({ id: "A" })])

    const plan = planReparentNode(context, {
      elementIds: ["A"],
      sourceGroupId: null,
      targetParentPath: ["dup", "dup"],
      targetFrameId: null,
    })

    expect(plan.ok).toBe(false)
    if (!plan.ok) {
      expect(plan.error).toContain("duplicate")
    }
  })

  it("C09 — reorder moves selection to front while preserving current scene-relative order", () => {
    const context = makeCommandContext([
      makeElement({ id: "A" }),
      makeElement({ id: "B" }),
      makeElement({ id: "C" }),
      makeElement({ id: "D" }),
    ])

    const plan = planReorder(context, {
      orderedElementIds: ["C", "A"],
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.reorder?.orderedElementIds).toEqual(["B", "D", "A", "C"])
    expect(plan.value.elementPatches).toEqual([])
  })

  it("C10 — reorder drops unknown IDs and de-dupes while preserving scene-relative order", () => {
    const context = makeCommandContext([
      makeElement({ id: "A" }),
      makeElement({ id: "B" }),
      makeElement({ id: "C" }),
    ])

    const plan = planReorder(context, {
      orderedElementIds: ["C", "C", "X", "A"],
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.reorder?.orderedElementIds).toEqual(["B", "A", "C"])
  })

  it("C11 — reorder errors when no valid IDs remain", () => {
    const context = makeCommandContext([makeElement({ id: "A" }), makeElement({ id: "B" })])

    const plan = planReorder(context, {
      orderedElementIds: ["X", "Y"],
    })

    expect(plan.ok).toBe(false)
    if (!plan.ok) {
      expect(plan.error).toContain("No valid")
    }
  })

  it("C12 — reorder preserves stable scene order in mixed frame/group scenes", () => {
    const context = makeCommandContext([
      makeElement({ id: "F1", type: "frame" }),
      makeElement({ id: "F2", type: "frame" }),
      makeElement({ id: "A", frameId: "F1", groupIds: ["G"] }),
      makeElement({ id: "B", frameId: "F2", groupIds: ["G"] }),
      makeElement({ id: "C" }),
    ])

    const plan = planReorder(context, {
      orderedElementIds: ["B", "A"],
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.reorder?.orderedElementIds).toEqual(["F1", "F2", "C", "A", "B"])
  })

  it("C13 — reorder normalization keeps bound-text closures and returns no-op patch when already frontmost", () => {
    const context = makeCommandContext([
      makeElement({ id: "S", type: "rectangle" }),
      makeElement({ id: "T", type: "text", containerId: "S" }),
      makeElement({ id: "A" }),
    ])

    const plan = planReorder(context, {
      orderedElementIds: ["A", "S"],
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.reorder).toBeUndefined()
    expect(plan.value.elementPatches).toEqual([])
  })

  it("C13b — reorder backward steps a block one sibling slot", () => {
    const context = makeCommandContext([
      makeElement({ id: "A" }),
      makeElement({ id: "B" }),
      makeElement({ id: "C" }),
      makeElement({ id: "D" }),
    ])

    const plan = planReorder(context, {
      orderedElementIds: ["C"],
      mode: "backward",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.reorder?.orderedElementIds).toEqual(["A", "C", "B", "D"])
  })

  it("C13c — reorder forward preserves group block internals", () => {
    const context = makeCommandContext([
      makeElement({ id: "A", groupIds: ["G"] }),
      makeElement({ id: "B", groupIds: ["G"] }),
      makeElement({ id: "C" }),
    ])

    const plan = planReorder(context, {
      orderedElementIds: ["A", "B"],
      mode: "forward",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.reorder?.orderedElementIds).toEqual(["C", "A", "B"])
  })

  it("C13d — reorder partial grouped selection stays scoped to sibling leaves", () => {
    const context = makeCommandContext([
      makeElement({ id: "A", groupIds: ["G"] }),
      makeElement({ id: "B", groupIds: ["G"] }),
      makeElement({ id: "C" }),
    ])

    const plan = planReorder(context, {
      orderedElementIds: ["A"],
      mode: "forward",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.reorder?.orderedElementIds).toEqual(["B", "A", "C"])
  })

  it("C13e — relative reorder inserts the dragged row before the target sibling slot", () => {
    const context = makeCommandContext([
      makeElement({ id: "A" }),
      makeElement({ id: "B" }),
      makeElement({ id: "C" }),
      makeElement({ id: "D" }),
    ])

    const plan = planReorder(context, {
      orderedElementIds: ["A"],
      anchorNodeId: "el:B",
      placement: "before",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.reorder?.orderedElementIds).toEqual(["B", "A", "C", "D"])
  })

  it("C13f — relative reorder inserts the dragged row after the target sibling slot", () => {
    const context = makeCommandContext([
      makeElement({ id: "A" }),
      makeElement({ id: "B" }),
      makeElement({ id: "C" }),
      makeElement({ id: "D" }),
    ])

    const plan = planReorder(context, {
      orderedElementIds: ["D"],
      anchorNodeId: "el:B",
      placement: "after",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.reorder?.orderedElementIds).toEqual(["A", "D", "B", "C"])
  })

  it("C13g — relative reorder rejects anchors outside the dragged row scope", () => {
    const context = makeCommandContext([
      makeElement({ id: "A", groupIds: ["G"] }),
      makeElement({ id: "B", groupIds: ["G"] }),
      makeElement({ id: "C" }),
    ])

    const plan = planReorder(context, {
      orderedElementIds: ["A"],
      anchorNodeId: "el:C",
      placement: "before",
    })

    expect(plan.ok).toBe(false)
    if (!plan.ok) {
      expect(plan.error).toContain("share one canonical parent scope")
    }
  })

  it("C13h — reorder rejects unknown runtime modes", () => {
    const context = makeCommandContext([makeElement({ id: "A" }), makeElement({ id: "B" })])

    const plan = planReorder(context, {
      orderedElementIds: ["A"],
      mode: "sideways" as never,
    })

    expect(plan.ok).toBe(false)
    if (!plan.ok) {
      expect(plan.error).toContain("Unknown reorder mode")
    }
  })

  it("C14 — element rename trims, mirrors label metadata, and preserves unrelated customData", () => {
    const context = makeCommandContext([
      makeElement({
        id: "A",
        name: "old",
        customData: {
          foreign: true,
          lmx: {
            groupLabels: {
              G: "Existing Group",
            },
            persisted: "keep",
          },
        },
      }),
    ])

    const plan = planRenameNode(context, {
      elementId: "A",
      nextName: "  New name  ",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.elementPatches).toEqual([
      {
        id: "A",
        set: {
          customData: {
            foreign: true,
            lmx: {
              groupLabels: {
                G: "Existing Group",
              },
              label: "New name",
              persisted: "keep",
            },
          },
          name: "New name",
        },
      },
    ])
  })

  it("C14b — group rename writes metadata across members without clobbering other keys", () => {
    const context = makeCommandContext([
      makeElement({
        id: "A",
        groupIds: ["G"],
        customData: {
          foreign: "A",
        },
      }),
      makeElement({
        id: "B",
        groupIds: ["G"],
        customData: {
          lmx: {
            groupLabels: {
              other: "Other group",
            },
            persisted: true,
          },
        },
      }),
      makeElement({ id: "C", groupIds: ["other"] }),
    ])

    const plan = planRenameNode(context, {
      groupId: "G",
      nextName: "  Renamed group  ",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.elementPatches).toEqual([
      {
        id: "A",
        set: {
          customData: {
            foreign: "A",
            lmx: {
              groupLabels: {
                G: "Renamed group",
              },
            },
          },
        },
      },
      {
        id: "B",
        set: {
          customData: {
            lmx: {
              groupLabels: {
                G: "Renamed group",
                other: "Other group",
              },
              persisted: true,
            },
          },
        },
      },
    ])
  })

  it("C15 — rename rejects empty normalized name", () => {
    const context = makeCommandContext([makeElement({ id: "A" })])

    const plan = planRenameNode(context, {
      elementId: "A",
      nextName: "   ",
    })

    expect(plan.ok).toBe(false)
    if (!plan.ok) {
      expect(plan.error).toContain("empty")
    }
  })

  it("C16 — delete marks requested container and bound text deleted", () => {
    const context = makeCommandContext([
      makeElement({ id: "S", type: "rectangle" }),
      makeElement({ id: "T", type: "text", containerId: "S" }),
      makeElement({ id: "A" }),
    ])

    const plan = planDeleteNode(context, { elementIds: ["S", "T"] })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(patchIdSet(plan.value)).toEqual(new Set(["S", "T"]))
    expect(plan.value.elementPatches.every((entry) => entry.set.isDeleted === true)).toBe(true)
  })

  it("C17 — delete normalization includes bound text for targeted container", () => {
    const context = makeCommandContext([
      makeElement({ id: "S", type: "rectangle" }),
      makeElement({ id: "T", type: "text", containerId: "S" }),
    ])

    const plan = planDeleteNode(context, { elementIds: ["S"] })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(patchIdSet(plan.value)).toEqual(new Set(["S", "T"]))
    expect(plan.value.elementPatches.every((entry) => entry.set.isDeleted === true)).toBe(true)
  })

  it("C18 — delete uses stable de-dupe and drops unknown IDs", () => {
    const context = makeCommandContext([makeElement({ id: "A" }), makeElement({ id: "B" })])

    const plan = planDeleteNode(context, {
      elementIds: ["A", "A", "missing", "B"],
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.elementPatches.map((entry) => entry.id)).toEqual(["A", "B"])
  })

  it("C19 — createGroup appends one normalized group id to all targets", () => {
    const context = makeCommandContext([
      makeElement({ id: "A", groupIds: [] }),
      makeElement({ id: "B", groupIds: ["legacy"] }),
    ])

    const plan = planCreateGroup(context, {
      elementIds: ["A", "B"],
      nameSeed: "Team 1",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.groupId).toBe("Team-1")
    expect(patchById(plan.value.patch, "A")?.set.groupIds).toEqual(["Team-1"])
    expect(patchById(plan.value.patch, "B")?.set.groupIds).toEqual(["legacy", "Team-1"])
    expect(patchById(plan.value.patch, "A")?.set.customData).toEqual({
      lmx: {
        groupLabels: {
          "Team-1": "Team 1",
        },
      },
    })
    expect(patchById(plan.value.patch, "B")?.set.customData).toEqual({
      lmx: {
        groupLabels: {
          "Team-1": "Team 1",
        },
      },
    })
    expect(plan.value.patch.selectIds).toEqual(["A", "B"])
  })

  it("C19b — createGroup normalizes path separators out of the generated group id", () => {
    const context = makeCommandContext([
      makeElement({ id: "A", groupIds: [] }),
      makeElement({ id: "B", groupIds: [] }),
    ])

    const plan = planCreateGroup(context, {
      elementIds: ["A", "B"],
      nameSeed: "Team / 1",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.groupId).toBe("Team-1")
    expect(patchById(plan.value.patch, "A")?.set.customData).toEqual({
      lmx: {
        groupLabels: {
          "Team-1": "Team / 1",
        },
      },
    })
  })

  it("C19c — createGroup falls back to Group when the seed normalizes to blank", () => {
    const context = makeCommandContext([
      makeElement({ id: "A", groupIds: [] }),
      makeElement({ id: "B", groupIds: [] }),
    ])

    const plan = planCreateGroup(context, {
      elementIds: ["A", "B"],
      nameSeed: "  /  ",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.groupId).toBe("Group")
    expect(patchById(plan.value.patch, "A")?.set.customData).toEqual({
      lmx: {
        groupLabels: {
          Group: "/",
        },
      },
    })
  })

  it("C19d — createGroup also falls back to Group when the label seed is only whitespace", () => {
    const context = makeCommandContext([
      makeElement({ id: "A", groupIds: [] }),
      makeElement({ id: "B", groupIds: [] }),
    ])

    const plan = planCreateGroup(context, {
      elementIds: ["A", "B"],
      nameSeed: "     ",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.groupId).toBe("Group")
    expect(patchById(plan.value.patch, "A")?.set.customData).toEqual({
      lmx: {
        groupLabels: {
          Group: "Group",
        },
      },
    })
  })

  it("C20 — createGroup picks deterministic next free Group suffix", () => {
    const context = makeCommandContext([
      makeElement({ id: "A" }),
      makeElement({ id: "B" }),
      makeElement({ id: "G1", groupIds: ["Group"] }),
      makeElement({ id: "G2", groupIds: ["Group-2"] }),
    ])

    const plan = planCreateGroup(context, {
      elementIds: ["A", "B"],
      nameSeed: "Group",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.groupId).toBe("Group-3")
  })

  it("C21 — createGroup rejects mixed-frame targets", () => {
    const context = makeCommandContext([
      makeElement({ id: "A", frameId: "F1" }),
      makeElement({ id: "B", frameId: "F2" }),
    ])

    const plan = planCreateGroup(context, {
      elementIds: ["A", "B"],
      nameSeed: "Cross",
    })

    expect(plan.ok).toBe(false)
    if (plan.ok) {
      return
    }

    expect(plan.error).toContain("multiple frames")
  })

  it("C22 — createGroup normalization includes bound text closure", () => {
    const context = makeCommandContext([
      makeElement({ id: "S", type: "rectangle" }),
      makeElement({ id: "T", type: "text", containerId: "S" }),
      makeElement({ id: "A" }),
    ])

    const plan = planCreateGroup(context, {
      elementIds: ["S", "A"],
      nameSeed: "Group",
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.groupId).toBe("Group")
    expect(plan.value.patch.selectIds).toEqual(["S", "T", "A"])
    expect(patchIdSet(plan.value.patch)).toEqual(new Set(["S", "T", "A"]))

    for (const entry of plan.value.patch.elementPatches) {
      expect(entry.set.groupIds?.includes(plan.value.groupId)).toBe(true)
    }
  })
})
