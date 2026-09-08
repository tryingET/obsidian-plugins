import { describe, expect, it, vi } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { createLayerManagerRuntime } from "../src/main.js"

// Given a legacy commit already in flight, changing authority must prevent all
// adapter follow-up effects. This does not pretend to cancel the host promise.
describe("pending mutation authority", () => {
  it.each(["reorder", "update", "legacy"] as const)(
    "rejects preflight retargeting before any %s mutation reaches a replacement drawing",
    async (mode) => {
      const originalApi = { updateScene: vi.fn() }
      const replacementApi = { updateScene: vi.fn() }
      const original = { _loaded: true, excalidrawAPI: originalApi }
      const replacement = { _loaded: true, excalidrawAPI: replacementApi }
      const element: RawExcalidrawElement = { id: "A", type: "rectangle", isDeleted: false }
      const copy = vi.fn()
      const commit = vi.fn()
      const select = vi.fn()
      const ea: EaLike = {
        targetView: original,
        setView: () => {
          ea.targetView = replacement
          return replacement
        },
        getViewElements: () => [element],
        getViewSelectedElements: () => [],
        getScriptSettings: () => ({}),
        getExcalidrawAPI: () => (ea.targetView === original ? originalApi : replacementApi),
        selectElementsInView: select,
        ...(mode === "legacy"
          ? {
              copyViewElementsToEAforEditing: copy,
              getElement: () => element,
              addElementsToView: commit,
            }
          : {}),
      }
      const runtime = createLayerManagerRuntime(ea, { render: vi.fn() })
      original._loaded = false
      try {
        const outcome = await runtime.apply({
          elementPatches: [{ id: "A", set: { isDeleted: true } }],
          ...(mode === "reorder" ? { reorder: { orderedElementIds: ["A"] } } : {}),
          selectIds: ["A"],
        })
        expect(outcome.status).toBe("capabilityMissing")
        expect(originalApi.updateScene).not.toHaveBeenCalled()
        expect(replacementApi.updateScene).not.toHaveBeenCalled()
        expect(copy).not.toHaveBeenCalled()
        expect(commit).not.toHaveBeenCalled()
        expect(select).not.toHaveBeenCalled()
        expect(element.isDeleted).toBe(false)
      } finally {
        runtime.dispose()
      }
    },
  )

  it("renews authority after legacy staging before editing or committing", async () => {
    const api = { updateScene: vi.fn() }
    const original = { excalidrawAPI: api }
    const editable: RawExcalidrawElement = { id: "A", type: "rectangle", locked: false }
    const commit = vi.fn()
    const ea: EaLike = {
      targetView: original,
      getViewElements: () => [editable],
      getViewSelectedElements: () => [],
      getScriptSettings: () => ({}),
      getExcalidrawAPI: () => api,
      copyViewElementsToEAforEditing: () => {
        ea.targetView = { ...original }
      },
      getElement: () => editable,
      addElementsToView: commit,
    }
    const runtime = createLayerManagerRuntime(ea, { render: vi.fn() })
    try {
      expect(
        (await runtime.apply({ elementPatches: [{ id: "A", set: { locked: true } }] })).status,
      ).toBe("capabilityMissing")
      expect(editable.locked).toBe(false)
      expect(commit).not.toHaveBeenCalled()
      expect(api.updateScene).not.toHaveBeenCalled()
    } finally {
      runtime.dispose()
    }
  })

  it.each(
    (["dispose", "view", "api", "leaf"] as const).flatMap((invalidation) =>
      (["resolve", "reject"] as const).flatMap((settlement) =>
        (["apply", "intent"] as const).map((entrypoint) => ({
          invalidation,
          settlement,
          entrypoint,
        })),
      ),
    ),
  )(
    "blocks follow-up effects: $invalidation / $settlement / $entrypoint",
    async ({ invalidation, settlement, entrypoint }) => {
      const element: RawExcalidrawElement = { id: "A", type: "rectangle" }
      const editable = { ...element }
      const updateScene = vi.fn()
      const selectElementsInView = vi.fn()
      let rejectCommit: (reason: Error) => void = () => {}
      let resolveCommit: () => void = () => {}
      const commit = new Promise<void>((resolve, reject) => {
        resolveCommit = resolve
        rejectCommit = reject
      })
      const api = { updateScene }
      const leaf: { view?: unknown } = {}
      const view = { excalidrawAPI: api, leaf }
      leaf.view = view
      const ea: EaLike = {
        targetView: view,
        getViewElements: () => [element],
        getViewSelectedElements: () => [],
        getScriptSettings: () => ({}),
        getExcalidrawAPI: () => view.excalidrawAPI,
        copyViewElementsToEAforEditing: vi.fn(),
        getElement: () => editable,
        addElementsToView: vi.fn(() => commit),
        selectElementsInView,
      }
      const runtime = createLayerManagerRuntime(ea, { render: vi.fn() })
      const patch = {
        elementPatches: [{ id: "A", set: { locked: true } }],
        selectIds: ["A"],
      }
      const pending = (
        entrypoint === "apply"
          ? runtime.apply(patch)
          : runtime.executeIntent(() => ({ ok: true, value: patch }))
      ).catch((error: unknown) => error)
      expect(ea.addElementsToView).toHaveBeenCalledTimes(1)
      if (invalidation === "dispose") runtime.dispose()
      if (invalidation === "view") ea.targetView = { ...view }
      if (invalidation === "api") view.excalidrawAPI = { updateScene: vi.fn() }
      if (invalidation === "leaf") leaf.view = { ...view }
      if (settlement === "reject") rejectCommit(new Error("delayed host rejection"))
      else resolveCommit()
      const outcome = await pending
      // Disposal rejects the caller immediately; drain the uncancelled actor too.
      for (let index = 0; index < 8; index += 1) await Promise.resolve()
      try {
        expect(updateScene).not.toHaveBeenCalled()
        expect(view.excalidrawAPI.updateScene).not.toHaveBeenCalled()
        expect(selectElementsInView).not.toHaveBeenCalled()
        if (invalidation === "dispose") expect(outcome).toBeInstanceOf(Error)
        else expect(outcome).toMatchObject({ status: "capabilityMissing" })
      } finally {
        runtime.dispose()
      }
    },
  )
})
