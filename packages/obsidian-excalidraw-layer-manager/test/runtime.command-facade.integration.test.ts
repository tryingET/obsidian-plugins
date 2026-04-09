import { describe, expect, it, vi } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { createLayerManagerRuntime } from "../src/main.js"
import type { LayerManagerUiActions, RenderViewModel } from "../src/ui/renderer.js"

interface InstrumentedEa {
  readonly ea: EaLike
  readonly elements: RawExcalidrawElement[]
  readonly copyForEditing: ReturnType<typeof vi.fn>
  readonly addToView: ReturnType<typeof vi.fn>
  readonly updateScene: ReturnType<typeof vi.fn>
}

interface MakeInstrumentedEaOptions {
  readonly resolveEditableElements?: boolean
  readonly withUpdateSceneCapability?: boolean
}

const cloneElement = (element: RawExcalidrawElement): RawExcalidrawElement => {
  return {
    ...element,
    groupIds: [...(element.groupIds ?? [])],
    customData: { ...(element.customData ?? {}) },
  }
}

const makeInstrumentedEa = (
  initialElements: readonly RawExcalidrawElement[],
  options: MakeInstrumentedEaOptions = {},
): InstrumentedEa => {
  const elements = initialElements.map(cloneElement)
  const selectedIds = new Set<string>()

  const copyForEditing = vi.fn()
  const addToView = vi.fn(async () => {})
  const updateScene = vi.fn((scene: { elements: RawExcalidrawElement[] }) => {
    elements.splice(0, elements.length, ...scene.elements)
  })

  const resolveEditableElements = options.resolveEditableElements ?? true
  const withUpdateSceneCapability = options.withUpdateSceneCapability !== false

  return {
    ea: {
      getViewElements: () => elements,
      getViewSelectedElements: () => elements.filter((element) => selectedIds.has(element.id)),
      getScriptSettings: () => ({}),
      copyViewElementsToEAforEditing: copyForEditing,
      getElement: resolveEditableElements
        ? (id: string) => elements.find((element) => element.id === id)
        : () => undefined,
      addElementsToView: addToView,
      getExcalidrawAPI: () => (withUpdateSceneCapability ? { updateScene } : {}),
      selectElementsInView: (ids: string[]) => {
        selectedIds.clear()
        for (const id of ids) {
          if (elements.some((element) => element.id === id)) {
            selectedIds.add(id)
          }
        }
      },
    },
    elements,
    copyForEditing,
    addToView,
    updateScene,
  }
}

const getLastModel = (render: ReturnType<typeof vi.fn>): RenderViewModel => {
  const lastCall = render.mock.calls.at(-1)
  const lastModel = lastCall?.[0] as RenderViewModel | undefined

  if (!lastModel) {
    throw new Error("Expected renderer to have at least one render call.")
  }

  return lastModel
}

const getUiActions = (render: ReturnType<typeof vi.fn>): LayerManagerUiActions => {
  const model = getLastModel(render)

  if (!model.actions) {
    throw new Error("Expected render model to expose UI actions.")
  }

  return model.actions
}

describe("runtime command facade + controller action seam", () => {
  it("executes a happy-path command through renderer-exposed facade actions", async () => {
    const runtime = makeInstrumentedEa([{ id: "A", type: "rectangle", locked: false }])

    const render = vi.fn()
    const notify = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify,
    })

    const actions = getUiActions(render)
    const outcome = await actions.commands.toggleLock({ elementIds: ["A"] })

    expect(outcome).toEqual({
      status: "applied",
      attempts: 1,
    })
    expect(runtime.elements.find((element) => element.id === "A")?.locked).toBe(true)
    expect(notify).not.toHaveBeenCalled()
  })

  it("wires row-level toggleLock action through the controller seam", async () => {
    const runtime = makeInstrumentedEa([
      { id: "A", type: "rectangle", groupIds: ["G"], locked: false },
      { id: "B", type: "rectangle", groupIds: ["G"], locked: false },
    ])

    const render = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify: vi.fn(),
    })

    const actions = getUiActions(render)
    const outcome = await actions.toggleLockNode("group:G")

    expect(outcome).toEqual({
      status: "applied",
      attempts: 1,
    })
    expect(runtime.elements.find((element) => element.id === "A")?.locked).toBe(true)
    expect(runtime.elements.find((element) => element.id === "B")?.locked).toBe(true)
    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)
    expect(runtime.addToView).toHaveBeenCalledTimes(1)
    expect(runtime.updateScene).not.toHaveBeenCalled()
  })

  it("wires row-level toggleVisibility action through the controller seam", async () => {
    const runtime = makeInstrumentedEa([{ id: "A", type: "rectangle", opacity: 80 }])

    const render = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify: vi.fn(),
    })

    const actions = getUiActions(render)
    const outcome = await actions.toggleVisibilityNode("el:A")

    expect(outcome).toEqual({
      status: "applied",
      attempts: 1,
    })
    expect(runtime.elements.find((element) => element.id === "A")?.opacity).toBe(0)
    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)
    expect(runtime.addToView).toHaveBeenCalledTimes(1)
    expect(runtime.updateScene).not.toHaveBeenCalled()
  })

  it("wires row-level rename action through the controller seam", async () => {
    const runtime = makeInstrumentedEa([
      {
        id: "A",
        type: "rectangle",
        name: "old",
        customData: {
          foreign: true,
        },
      },
    ])

    const render = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify: vi.fn(),
    })

    const actions = getUiActions(render)
    const outcome = await actions.renameNode("el:A", "  New Label  ")

    expect(outcome).toEqual({
      status: "applied",
      attempts: 1,
    })
    expect(runtime.elements.find((element) => element.id === "A")?.name).toBe("New Label")
    expect(runtime.elements.find((element) => element.id === "A")?.customData).toEqual({
      foreign: true,
      lmx: {
        label: "New Label",
      },
    })
    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)
    expect(runtime.addToView).toHaveBeenCalledTimes(1)
    expect(runtime.updateScene).not.toHaveBeenCalled()
  })

  it("routes group rename through metadata instead of mutating representative element names", async () => {
    const runtime = makeInstrumentedEa([
      {
        id: "A",
        type: "rectangle",
        groupIds: ["G"],
        customData: {
          foreign: "A",
        },
      },
      {
        id: "B",
        type: "rectangle",
        groupIds: ["G"],
        name: "Legacy representative",
        customData: {
          lmx: {
            groupLabels: {
              other: "Other group",
            },
          },
        },
      },
    ])

    const render = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify: vi.fn(),
    })

    const actions = getUiActions(render)
    const outcome = await actions.renameNode("group:G", "  Renamed Group  ")

    expect(outcome).toEqual({
      status: "applied",
      attempts: 1,
    })
    expect(runtime.elements.find((element) => element.id === "A")?.name).toBeUndefined()
    expect(runtime.elements.find((element) => element.id === "B")?.name).toBe(
      "Legacy representative",
    )
    expect(runtime.elements.find((element) => element.id === "A")?.customData).toEqual({
      foreign: "A",
      lmx: {
        groupLabels: {
          G: "Renamed Group",
        },
      },
    })
    expect(runtime.elements.find((element) => element.id === "B")?.customData).toEqual({
      lmx: {
        groupLabels: {
          G: "Renamed Group",
          other: "Other group",
        },
      },
    })
    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)
    expect(runtime.addToView).toHaveBeenCalledTimes(1)
    expect(runtime.updateScene).not.toHaveBeenCalled()
  })

  it("wires row-level delete action through the controller seam", async () => {
    const runtime = makeInstrumentedEa([
      { id: "A", type: "rectangle", groupIds: ["G"] },
      { id: "B", type: "rectangle", groupIds: ["G"] },
    ])

    const render = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify: vi.fn(),
    })

    const actions = getUiActions(render)
    const outcome = await actions.deleteNode("group:G")

    expect(outcome).toEqual({
      status: "applied",
      attempts: 1,
    })
    expect(runtime.elements.find((element) => element.id === "A")?.isDeleted).toBe(true)
    expect(runtime.elements.find((element) => element.id === "B")?.isDeleted).toBe(true)
    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)
    expect(runtime.addToView).toHaveBeenCalledTimes(1)
    expect(runtime.updateScene).not.toHaveBeenCalled()
  })

  it("wires structural createGroup action through the controller seam", async () => {
    const runtime = makeInstrumentedEa([
      { id: "A", type: "rectangle", groupIds: [] },
      { id: "B", type: "rectangle", groupIds: [] },
    ])

    const render = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify: vi.fn(),
    })

    const actions = getUiActions(render)
    const outcome = await actions.createGroupFromNodeIds({
      nodeIds: ["el:A", "el:B"],
      nameSeed: "Team 1",
    })

    expect(outcome).toEqual({
      status: "applied",
      attempts: 1,
    })
    expect(runtime.elements.find((element) => element.id === "A")?.groupIds).toContain("Team-1")
    expect(runtime.elements.find((element) => element.id === "B")?.groupIds).toContain("Team-1")
    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)
    expect(runtime.addToView).toHaveBeenCalledTimes(1)
    expect(runtime.updateScene).not.toHaveBeenCalled()
  })

  it("wires structural reorder action through the controller seam", async () => {
    const runtime = makeInstrumentedEa([
      { id: "A", type: "rectangle" },
      { id: "B", type: "rectangle" },
      { id: "C", type: "rectangle" },
    ])

    const render = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify: vi.fn(),
    })

    const actions = getUiActions(render)
    const outcome = await actions.reorderFromNodeIds(["el:C", "el:A"])

    expect(outcome).toEqual({
      status: "applied",
      attempts: 1,
    })
    expect(runtime.elements.map((element) => element.id)).toEqual(["B", "A", "C"])
    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
  })

  it("wires structural reparent action through the controller seam", async () => {
    const runtime = makeInstrumentedEa([
      { id: "A", type: "rectangle", groupIds: [] },
      { id: "B", type: "rectangle", groupIds: [] },
      { id: "Anchor", type: "rectangle", groupIds: ["Outer"] },
    ])

    const render = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify: vi.fn(),
    })

    const actions = getUiActions(render)
    const outcome = await actions.reparentFromNodeIds({
      nodeIds: ["el:A", "el:B"],
      sourceGroupId: null,
      targetParentPath: ["Outer"],
      targetFrameId: null,
    })

    expect(outcome).toEqual({
      status: "applied",
      attempts: 1,
    })
    expect(runtime.elements.find((element) => element.id === "A")?.groupIds).toEqual(["Outer"])
    expect(runtime.elements.find((element) => element.id === "B")?.groupIds).toEqual(["Outer"])
    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)
    expect(runtime.addToView).toHaveBeenCalledTimes(1)
    expect(runtime.updateScene).not.toHaveBeenCalled()
  })

  it("returns plannerError and performs zero writes when structural createGroup has too few targets", async () => {
    const runtime = makeInstrumentedEa([{ id: "A", type: "rectangle", groupIds: [] }])

    const render = vi.fn()
    const notify = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify,
    })

    const actions = getUiActions(render)
    const outcome = await actions.createGroupFromNodeIds({
      nodeIds: ["el:A"],
      nameSeed: "Team",
    })

    expect(outcome.status).toBe("plannerError")
    expect(outcome.attempts).toBe(1)
    if (outcome.status === "plannerError") {
      expect(outcome.error).toContain("at least two")
    }

    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("returns plannerError, notifies, and writes nothing when structural action node id is missing", async () => {
    const runtime = makeInstrumentedEa([{ id: "A", type: "rectangle", locked: false }])

    const render = vi.fn()
    const notify = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify,
    })

    const actions = getUiActions(render)
    const outcome = await actions.reorderFromNodeIds(["el:A", "el:missing"])

    expect(outcome).toEqual({
      status: "plannerError",
      error: "reorder failed: node not found (el:missing).",
      attempts: 1,
    })
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("returns plannerError and writes nothing when structural action receives empty nodeIds", async () => {
    const runtime = makeInstrumentedEa([{ id: "A", type: "rectangle" }])

    const render = vi.fn()
    const notify = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify,
    })

    const actions = getUiActions(render)
    const outcome = await actions.reorderFromNodeIds([])

    expect(outcome).toEqual({
      status: "plannerError",
      error: "reorder failed: no node IDs provided.",
      attempts: 1,
    })
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("surfaces preflight failure through structural action and renderer notification", async () => {
    const runtime = makeInstrumentedEa(
      [
        { id: "A", type: "rectangle", groupIds: [] },
        { id: "B", type: "rectangle", groupIds: [] },
      ],
      {
        resolveEditableElements: false,
        withUpdateSceneCapability: false,
      },
    )

    const render = vi.fn()
    const notify = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify,
    })

    const actions = getUiActions(render)
    const outcome = await actions.createGroupFromNodeIds({
      nodeIds: ["el:A", "el:B"],
      nameSeed: "Team",
    })

    expect(outcome.status).toBe("preflightFailed")
    expect(outcome.attempts).toBe(2)
    if (outcome.status === "preflightFailed") {
      expect(outcome.reason).toContain("scene mismatch")
    }

    expect(runtime.copyForEditing).toHaveBeenCalledTimes(2)
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)

    const notification = notify.mock.calls[0]?.[0]
    expect(notification).toContain("createGroup")
    expect(notification).toContain("preflightFailed")
  })

  it("returns plannerError and performs zero writes when row-level rename has invalid name", async () => {
    const runtime = makeInstrumentedEa([{ id: "A", type: "rectangle", name: "old" }])

    const render = vi.fn()
    const notify = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify,
    })

    const actions = getUiActions(render)
    const outcome = await actions.renameNode("el:A", "   ")

    expect(outcome.status).toBe("plannerError")
    expect(outcome.attempts).toBe(1)
    if (outcome.status === "plannerError") {
      expect(outcome.error).toContain("empty")
    }

    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("returns plannerError, notifies, and writes nothing when row node id is missing", async () => {
    const runtime = makeInstrumentedEa([{ id: "A", type: "rectangle", locked: false }])

    const render = vi.fn()
    const notify = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify,
    })

    const actions = getUiActions(render)
    const outcome = await actions.toggleLockNode("group:missing")

    expect(outcome).toEqual({
      status: "plannerError",
      error: "toggleLock failed: node not found (group:missing).",
      attempts: 1,
    })
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("returns plannerError and performs zero writes when facade command planning fails", async () => {
    const runtime = makeInstrumentedEa([{ id: "A", type: "rectangle", name: "old" }])

    const render = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify: vi.fn(),
    })

    const actions = getUiActions(render)
    const outcome = await actions.commands.renameNode({
      elementId: "A",
      nextName: "   ",
    })

    expect(outcome.status).toBe("plannerError")
    expect(outcome.attempts).toBe(1)
    if (outcome.status === "plannerError") {
      expect(outcome.error).toContain("empty")
    }

    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).not.toHaveBeenCalled()
  })

  it("surfaces preflight failure through row-level action and renderer notification", async () => {
    const runtime = makeInstrumentedEa([{ id: "A", type: "rectangle", opacity: 100 }], {
      resolveEditableElements: false,
      withUpdateSceneCapability: false,
    })

    const render = vi.fn()
    const notify = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify,
    })

    const actions = getUiActions(render)
    const outcome = await actions.toggleVisibilityNode("el:A")

    expect(outcome.status).toBe("preflightFailed")
    expect(outcome.attempts).toBe(2)
    if (outcome.status === "preflightFailed") {
      expect(outcome.reason).toContain("scene mismatch")
    }

    expect(runtime.copyForEditing).toHaveBeenCalledTimes(2)
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)

    const notification = notify.mock.calls[0]?.[0]
    expect(notification).toContain("toggleVisibility")
    expect(notification).toContain("preflightFailed")
  })

  it("surfaces preflight failure through facade outcome and renderer notification", async () => {
    const runtime = makeInstrumentedEa([{ id: "A", type: "rectangle", opacity: 100 }], {
      resolveEditableElements: false,
      withUpdateSceneCapability: false,
    })

    const render = vi.fn()
    const notify = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify,
    })

    const actions = getUiActions(render)
    const outcome = await actions.commands.toggleVisibility({ elementIds: ["A"] })

    expect(outcome.status).toBe("preflightFailed")
    expect(outcome.attempts).toBe(2)
    if (outcome.status === "preflightFailed") {
      expect(outcome.reason).toContain("scene mismatch")
    }

    expect(runtime.copyForEditing).toHaveBeenCalledTimes(2)
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)

    const notification = notify.mock.calls[0]?.[0]
    expect(notification).toContain("toggleVisibility")
    expect(notification).toContain("preflightFailed")
  })

  it("keeps one user intent => one write transaction when invoked through facade", async () => {
    const runtime = makeInstrumentedEa([{ id: "A", type: "rectangle", opacity: 100 }])

    const render = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify: vi.fn(),
    })

    const actions = getUiActions(render)
    const outcome = await actions.commands.toggleVisibility({ elementIds: ["A"] })

    expect(outcome).toEqual({
      status: "applied",
      attempts: 1,
    })
    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)
    expect(runtime.addToView).toHaveBeenCalledTimes(1)
    expect(runtime.updateScene).not.toHaveBeenCalled()
  })
})
