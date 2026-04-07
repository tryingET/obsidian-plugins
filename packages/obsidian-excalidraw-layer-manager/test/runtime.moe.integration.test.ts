import { describe, expect, it, vi } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { createLayerManagerRuntime } from "../src/main.js"
import { err, ok } from "../src/model/result.js"

interface InstrumentedEa {
  readonly ea: EaLike
  readonly elements: RawExcalidrawElement[]
  readonly getViewElements: ReturnType<typeof vi.fn>
  readonly copyForEditing: ReturnType<typeof vi.fn>
  readonly addToView: ReturnType<typeof vi.fn>
  readonly updateScene: ReturnType<typeof vi.fn>
  readonly selectInView: ReturnType<typeof vi.fn>
}

const cloneElement = (element: RawExcalidrawElement): RawExcalidrawElement => {
  return {
    ...element,
    groupIds: [...(element.groupIds ?? [])],
    customData: { ...(element.customData ?? {}) },
  }
}

const makeInstrumentedEa = (initialElements: readonly RawExcalidrawElement[]): InstrumentedEa => {
  const elements: RawExcalidrawElement[] = initialElements.map(cloneElement)

  const getViewElements = vi.fn(() => elements)
  const copyForEditing = vi.fn()
  const addToView = vi.fn(async () => {})
  const updateScene = vi.fn((scene: { elements: RawExcalidrawElement[] }) => {
    elements.splice(0, elements.length, ...scene.elements)
  })
  const selectInView = vi.fn()

  return {
    ea: {
      getViewElements,
      getViewSelectedElements: () => [],
      getScriptSettings: () => ({}),
      copyViewElementsToEAforEditing: copyForEditing,
      getElement: (id: string) => elements.find((element) => element.id === id),
      addElementsToView: addToView,
      getExcalidrawAPI: () => ({ updateScene }),
      selectElementsInView: selectInView,
    },
    elements,
    getViewElements,
    copyForEditing,
    addToView,
    updateScene,
    selectInView,
  }
}

interface InterleavingEa {
  readonly ea: EaLike
  readonly elements: RawExcalidrawElement[]
  readonly releaseFirstCommit: () => void
}

const makeInterleavingEa = (initialElements: readonly RawExcalidrawElement[]): InterleavingEa => {
  const elements: RawExcalidrawElement[] = initialElements.map(cloneElement)

  let editableById = new Map<string, RawExcalidrawElement>()
  let addCallCount = 0
  let releaseFirstCommit = () => {}
  const firstCommitGate = new Promise<void>((resolve) => {
    releaseFirstCommit = resolve
  })

  const ea: EaLike = {
    getViewElements: () => elements,
    getViewSelectedElements: () => [],
    getScriptSettings: () => ({}),
    copyViewElementsToEAforEditing: () => {
      editableById = new Map(elements.map((element) => [element.id, cloneElement(element)]))
    },
    getElement: (id: string) => editableById.get(id),
    addElementsToView: async () => {
      addCallCount += 1

      if (addCallCount === 1) {
        await firstCommitGate
      }

      for (let index = 0; index < elements.length; index += 1) {
        const current = elements[index]
        if (!current) {
          continue
        }

        const staged = editableById.get(current.id)
        if (!staged) {
          continue
        }

        elements[index] = staged
      }

      editableById = new Map()
    },
    getExcalidrawAPI: () => ({
      updateScene: (scene) => {
        elements.splice(0, elements.length, ...scene.elements)
      },
    }),
  }

  return {
    ea,
    elements,
    releaseFirstCommit,
  }
}

describe("runtime multi-order effects", () => {
  it("MOE-01 — one successful user intent applies exactly one write transaction", async () => {
    const runtime = makeInstrumentedEa([
      { id: "A", type: "rectangle", locked: false },
      { id: "B", type: "rectangle", locked: false },
    ])

    const app = createLayerManagerRuntime(runtime.ea, {
      render: vi.fn(),
    })

    let plannerCalls = 0
    const outcome = await app.executeIntent(() => {
      plannerCalls += 1

      return ok({
        elementPatches: [
          {
            id: "A",
            set: {
              locked: true,
            },
          },
        ],
      })
    })

    expect(outcome).toEqual({
      status: "applied",
      attempts: 1,
    })
    expect(plannerCalls).toBe(1)
    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)
    expect(runtime.addToView).toHaveBeenCalledTimes(1)
    expect(runtime.updateScene).not.toHaveBeenCalled()
  })

  it("MOE-02 — no hidden follow-up writes for same successful intent", async () => {
    const runtime = makeInstrumentedEa([
      { id: "A", type: "rectangle" },
      { id: "B", type: "rectangle" },
    ])

    const app = createLayerManagerRuntime(runtime.ea, {
      render: vi.fn(),
    })

    const outcome = await app.executeIntent(() =>
      ok({
        elementPatches: [],
        reorder: {
          orderedElementIds: ["B", "A"],
        },
      }),
    )

    expect(outcome).toEqual({
      status: "applied",
      attempts: 1,
    })
    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.elements.map((element) => element.id)).toEqual(["B", "A"])
  })

  it("MOE-03 — planner err path performs zero writes", async () => {
    const runtime = makeInstrumentedEa([
      { id: "A", type: "rectangle" },
      { id: "B", type: "rectangle" },
    ])

    const app = createLayerManagerRuntime(runtime.ea, {
      render: vi.fn(),
    })

    const outcome = await app.executeIntent(() => err("Invalid intent"))

    expect(outcome).toEqual({
      status: "plannerError",
      error: "Invalid intent",
      attempts: 1,
    })
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).not.toHaveBeenCalled()
  })

  it("MOE-11 — planner receives a fresh snapshot captured right before planning", async () => {
    const runtime = makeInstrumentedEa([{ id: "A", type: "rectangle" }])

    const app = createLayerManagerRuntime(runtime.ea, {
      render: vi.fn(),
    })

    runtime.elements.push({ id: "B", type: "ellipse" })

    let seenIds: readonly string[] = []
    const outcome = await app.executeIntent((context) => {
      seenIds = context.snapshot.elements.map((element) => element.id)
      return err("stop")
    })

    expect(outcome.status).toBe("plannerError")
    expect(seenIds).toEqual(["A", "B"])
    expect(runtime.getViewElements).toHaveBeenCalled()
  })

  it("MOE-12 — stale first patch is not reused after refresh+replan", async () => {
    const runtime = makeInstrumentedEa([
      { id: "A", type: "rectangle", locked: false },
      { id: "B", type: "rectangle", locked: false },
    ])

    const app = createLayerManagerRuntime(runtime.ea, {
      render: vi.fn(),
    })

    let plannerCalls = 0
    const outcome = await app.executeIntent(() => {
      plannerCalls += 1

      if (plannerCalls === 1) {
        return ok({
          elementPatches: [
            {
              id: "missing",
              set: {
                locked: true,
              },
            },
          ],
        })
      }

      return ok({
        elementPatches: [
          {
            id: "B",
            set: {
              locked: true,
            },
          },
        ],
      })
    })

    expect(outcome).toEqual({
      status: "applied",
      attempts: 2,
    })
    expect(plannerCalls).toBe(2)
    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)
    expect(runtime.addToView).toHaveBeenCalledTimes(1)
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(runtime.elements.find((element) => element.id === "A")?.locked).toBe(false)
    expect(runtime.elements.find((element) => element.id === "B")?.locked).toBe(true)
  })

  it("MOE-13 — concurrent intents are serialized to avoid interleaved stale writes", async () => {
    const runtime = makeInterleavingEa([
      { id: "A", type: "rectangle", locked: false },
      { id: "B", type: "rectangle", locked: false },
    ])

    const app = createLayerManagerRuntime(runtime.ea, {
      render: vi.fn(),
    })

    let secondPlannerSawLockedA = false

    const firstIntent = app.executeIntent(() =>
      ok({
        elementPatches: [
          {
            id: "A",
            set: {
              locked: true,
            },
          },
        ],
      }),
    )

    const secondIntent = app.executeIntent((context) => {
      secondPlannerSawLockedA = context.indexes.byId.get("A")?.locked === true

      return ok({
        elementPatches: [
          {
            id: "B",
            set: {
              locked: secondPlannerSawLockedA,
            },
          },
        ],
      })
    })

    runtime.releaseFirstCommit()

    const [firstOutcome, secondOutcome] = await Promise.all([firstIntent, secondIntent])

    expect(firstOutcome.status).toBe("applied")
    expect(secondOutcome.status).toBe("applied")
    expect(secondPlannerSawLockedA).toBe(true)
    expect(runtime.elements.find((element) => element.id === "A")?.locked).toBe(true)
    expect(runtime.elements.find((element) => element.id === "B")?.locked).toBe(true)
  })
})
