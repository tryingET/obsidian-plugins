import { describe, expect, it, vi } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { planRenameNode } from "../src/commands/renameNode.js"
import { planReorder } from "../src/commands/reorderNode.js"
import { planReparentNode } from "../src/commands/reparentNode.js"
import { createLayerManagerRuntime } from "../src/main.js"
import type { LayerNode } from "../src/model/tree.js"
import type { RenderViewModel } from "../src/ui/renderer.js"

interface StatefulEa {
  readonly ea: EaLike
  readonly elements: RawExcalidrawElement[]
}

const makeStatefulEa = (
  initialElements: readonly RawExcalidrawElement[],
  initialSelection: readonly string[] = [],
): StatefulEa => {
  const elements: RawExcalidrawElement[] = initialElements.map((element) => ({
    ...element,
    groupIds: [...(element.groupIds ?? [])],
    customData: { ...(element.customData ?? {}) },
  }))

  const selectedIds = new Set(initialSelection)

  const ea: EaLike = {
    getViewElements: () => elements,
    getViewSelectedElements: () => elements.filter((element) => selectedIds.has(element.id)),
    getScriptSettings: () => ({}),
    copyViewElementsToEAforEditing: () => {},
    getElement: (id: string) => elements.find((element) => element.id === id),
    addElementsToView: async () => {},
    getExcalidrawAPI: () => ({
      updateScene: (scene) => {
        elements.splice(0, elements.length, ...scene.elements)
      },
    }),
    selectElementsInView: (ids: string[]) => {
      selectedIds.clear()
      for (const id of ids) {
        if (elements.some((element) => element.id === id)) {
          selectedIds.add(id)
        }
      }
    },
  }

  return {
    ea,
    elements,
  }
}

const findNodeById = (nodes: readonly LayerNode[], nodeId: string): LayerNode | undefined => {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node
    }

    const nested = findNodeById(node.children, nodeId)
    if (nested) {
      return nested
    }
  }

  return undefined
}

const getLastModel = (render: ReturnType<typeof vi.fn>): RenderViewModel => {
  const lastCall = render.mock.calls.at(-1)
  const lastModel = lastCall?.[0] as RenderViewModel | undefined

  if (!lastModel) {
    throw new Error("Expected renderer to have at least one render call.")
  }

  return lastModel
}

const flattenNodeIds = (nodes: readonly LayerNode[]): readonly string[] => {
  const ids: string[] = []

  const walk = (currentNodes: readonly LayerNode[]): void => {
    for (const node of currentNodes) {
      ids.push(node.id)
      if (node.children.length > 0) {
        walk(node.children)
      }
    }
  }

  walk(nodes)
  return ids
}

describe("runtime expanded + selection stability", () => {
  it("MOE-04 — expanded state survives refresh with stable node IDs", () => {
    const runtime = makeStatefulEa([
      { id: "A", type: "rectangle", groupIds: ["G"] },
      { id: "B", type: "rectangle", groupIds: ["G"] },
    ])

    const render = vi.fn()
    const app = createLayerManagerRuntime(runtime.ea, { render })

    app.toggleExpanded("group:G")
    const expandedBefore = findNodeById(getLastModel(render).tree, "group:G")

    expect(expandedBefore?.isExpanded).toBe(true)
    expect(expandedBefore?.children.length).toBeGreaterThan(0)

    app.refresh()
    const expandedAfter = findNodeById(getLastModel(render).tree, "group:G")

    expect(expandedAfter?.id).toBe("group:G")
    expect(expandedAfter?.isExpanded).toBe(true)
    expect(expandedAfter?.children.length).toBeGreaterThan(0)
  })

  it("MOE-07 — stable node IDs remain stable across rename refresh", async () => {
    const runtime = makeStatefulEa([
      { id: "A", type: "rectangle", groupIds: ["G"], name: "old" },
      { id: "B", type: "rectangle", groupIds: ["G"] },
    ])

    const render = vi.fn()
    const app = createLayerManagerRuntime(runtime.ea, { render })

    app.toggleExpanded("group:G")
    const idsBeforeRename = flattenNodeIds(getLastModel(render).tree)

    const renameOutcome = await app.executeIntent((context) =>
      planRenameNode(context, {
        elementId: "A",
        nextName: "new name",
      }),
    )

    expect(renameOutcome.status).toBe("applied")

    const latestModel = getLastModel(render)
    const idsAfterRename = flattenNodeIds(latestModel.tree)
    const renamedNode = findNodeById(latestModel.tree, "el:A")

    expect(idsAfterRename).toEqual(idsBeforeRename)
    expect(renamedNode?.label).toBe("new name")
  })

  it("MOE-05 — selection stays coherent after reorder and reparent", async () => {
    const runtime = makeStatefulEa(
      [
        { id: "A", type: "rectangle", frameId: "F" },
        { id: "B", type: "rectangle", frameId: "F" },
        { id: "C", type: "rectangle", frameId: "F" },
      ],
      ["A", "C"],
    )

    const app = createLayerManagerRuntime(runtime.ea, {
      render: vi.fn(),
    })

    const reorderOutcome = await app.executeIntent((context) =>
      planReorder(context, {
        orderedElementIds: ["C", "A"],
      }),
    )

    expect(reorderOutcome.status).toBe("applied")
    expect([...app.getSnapshot().selectedIds].sort()).toEqual(["A", "C"])

    const reparentOutcome = await app.executeIntent((context) =>
      planReparentNode(context, {
        elementIds: ["A"],
        sourceGroupId: null,
        targetParentPath: ["G"],
        targetFrameId: "F",
      }),
    )

    expect(reparentOutcome.status).toBe("applied")
    expect([...app.getSnapshot().selectedIds].sort()).toEqual(["A", "C"])
  })

  it("MOE-06 — rename/reparent does not collapse unrelated expanded branches", async () => {
    const runtime = makeStatefulEa([
      { id: "A", type: "rectangle", groupIds: ["G1"] },
      { id: "B", type: "rectangle", groupIds: ["G1"] },
      { id: "C", type: "rectangle", groupIds: ["G2"] },
      { id: "D", type: "rectangle", groupIds: ["G2"] },
    ])

    const render = vi.fn()
    const app = createLayerManagerRuntime(runtime.ea, { render })

    app.toggleExpanded("group:G1")
    app.toggleExpanded("group:G2")

    const beforeRenameG2 = findNodeById(getLastModel(render).tree, "group:G2")
    expect(beforeRenameG2?.isExpanded).toBe(true)

    const renameOutcome = await app.executeIntent((context) =>
      planRenameNode(context, {
        elementId: "A",
        nextName: "A renamed",
      }),
    )

    expect(renameOutcome.status).toBe("applied")
    const afterRenameG2 = findNodeById(getLastModel(render).tree, "group:G2")
    expect(afterRenameG2?.isExpanded).toBe(true)

    const reparentOutcome = await app.executeIntent((context) =>
      planReparentNode(context, {
        elementIds: ["A"],
        sourceGroupId: null,
        targetParentPath: ["G1", "inner"],
        targetFrameId: null,
      }),
    )

    expect(reparentOutcome.status).toBe("applied")

    const afterReparentG1 = findNodeById(getLastModel(render).tree, "group:G1")
    const afterReparentG2 = findNodeById(getLastModel(render).tree, "group:G2")

    expect(afterReparentG1?.isExpanded).toBe(true)
    expect(afterReparentG2?.isExpanded).toBe(true)
  })
})
