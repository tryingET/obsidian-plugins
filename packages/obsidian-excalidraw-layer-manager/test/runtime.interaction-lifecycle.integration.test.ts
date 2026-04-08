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
  readonly failFirstGetElementIds?: readonly string[]
  readonly withUpdateSceneCapability?: boolean
}

const cloneElement = (element: RawExcalidrawElement): RawExcalidrawElement => ({
  ...element,
  groupIds: [...(element.groupIds ?? [])],
  customData: { ...(element.customData ?? {}) },
})

const makeInstrumentedEa = (
  initialElements: readonly RawExcalidrawElement[],
  options: MakeInstrumentedEaOptions = {},
): InstrumentedEa => {
  const elements = initialElements.map(cloneElement)
  const failFirstGetElementIds = new Set(options.failFirstGetElementIds ?? [])
  const withUpdateSceneCapability = options.withUpdateSceneCapability !== false

  const copyForEditing = vi.fn()
  const addToView = vi.fn(async () => {})
  const updateScene = vi.fn((scene: { elements: RawExcalidrawElement[] }) => {
    elements.splice(0, elements.length, ...scene.elements)
  })

  return {
    ea: {
      getViewElements: () => elements,
      getViewSelectedElements: () => [],
      getScriptSettings: () => ({}),
      copyViewElementsToEAforEditing: copyForEditing,
      getElement: (id: string) => {
        if (failFirstGetElementIds.has(id)) {
          failFirstGetElementIds.delete(id)
          return undefined
        }

        return elements.find((element) => element.id === id)
      },
      addElementsToView: addToView,
      getExcalidrawAPI: () => (withUpdateSceneCapability ? { updateScene } : {}),
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

describe("runtime interaction lifecycle gating", () => {
  it("orders interaction refresh before structural command resolution (happy path)", async () => {
    const runtime = makeInstrumentedEa([
      { id: "A", type: "rectangle" },
      { id: "B", type: "rectangle" },
    ])

    const render = vi.fn()
    const app = createLayerManagerRuntime(runtime.ea, {
      render,
      notify: vi.fn(),
    })

    const actions = getUiActions(render)

    actions.beginInteraction()

    runtime.elements.push({ id: "C", type: "rectangle" })
    app.refresh()

    let resolved = false
    const outcomePromise = actions.reorderFromNodeIds(["el:C", "el:A"]).then((outcome) => {
      resolved = true
      return outcome
    })

    await Promise.resolve()
    expect(resolved).toBe(false)
    expect(runtime.updateScene).not.toHaveBeenCalled()

    actions.endInteraction()

    const outcome = await outcomePromise
    expect(outcome).toEqual({
      status: "applied",
      attempts: 1,
    })
    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
    expect(runtime.elements.map((element) => element.id)).toEqual(["B", "A", "C"])
  })

  it("keeps bounded stale recovery under interaction gate (preflight fail then retry success)", async () => {
    const runtime = makeInstrumentedEa([{ id: "A", type: "rectangle", locked: false }], {
      failFirstGetElementIds: ["A"],
      withUpdateSceneCapability: false,
    })

    const render = vi.fn()
    const notify = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify,
    })

    const actions = getUiActions(render)

    actions.beginInteraction()

    const outcomePromise = actions.toggleLockNode("el:A")

    await Promise.resolve()
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()

    actions.endInteraction()

    const outcome = await outcomePromise
    expect(outcome).toEqual({
      status: "applied",
      attempts: 2,
    })

    expect(runtime.copyForEditing).toHaveBeenCalledTimes(2)
    expect(runtime.addToView).toHaveBeenCalledTimes(1)
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(runtime.elements.find((element) => element.id === "A")?.locked).toBe(true)
    expect(notify).not.toHaveBeenCalled()
  })

  it("keeps planner-error no-write behavior under interaction flow", async () => {
    const runtime = makeInstrumentedEa([{ id: "A", type: "rectangle", groupIds: [] }])

    const render = vi.fn()
    const notify = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify,
    })

    const actions = getUiActions(render)

    actions.beginInteraction()

    const outcomePromise = actions.createGroupFromNodeIds({
      nodeIds: ["el:A"],
      nameSeed: "Team",
    })

    await Promise.resolve()
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).not.toHaveBeenCalled()

    actions.endInteraction()

    const outcome = await outcomePromise
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

  it("keeps one-intent-one-transaction explicit under lifecycle gating", async () => {
    const runtime = makeInstrumentedEa([{ id: "A", type: "rectangle", opacity: 100 }])

    const render = vi.fn()

    createLayerManagerRuntime(runtime.ea, {
      render,
      notify: vi.fn(),
    })

    const actions = getUiActions(render)

    actions.beginInteraction()

    const outcomePromise = actions.toggleVisibilityNode("el:A")

    await Promise.resolve()
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).not.toHaveBeenCalled()

    actions.endInteraction()

    const outcome = await outcomePromise
    expect(outcome).toEqual({
      status: "applied",
      attempts: 1,
    })
    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)
    expect(runtime.addToView).toHaveBeenCalledTimes(1)
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(runtime.elements.find((element) => element.id === "A")?.opacity).toBe(0)
  })
})
