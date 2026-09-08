import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { createLayerManagerRuntime } from "../src/main.js"
import {
  dispatchKeydown,
  FakeDocument,
  type FakeDomElement,
  FakeDomEvent,
  findButtonByTitle,
  findFirstInput,
  flushAsync,
  getContentRoot,
  makeSidepanelTab,
} from "./sidepanelTestHarness.js"

type SelectionInput = FakeDomElement & {
  selectionStart: number | null
  selectionEnd: number | null
  selectionDirection: "forward" | "backward" | "none" | null
  setSelectionRange: (start: number, end: number, direction?: string) => void
}

// Model browser input selection without changing unrelated fake-DOM behavior.
const addSelectionSupport = (document: FakeDocument): void => {
  const create = document.createElement.bind(document)
  document.createElement = (tag) => {
    const element = create(tag)
    if (tag === "input") {
      const input = element as SelectionInput
      input.selectionStart = 0
      input.selectionEnd = 0
      input.selectionDirection = "none"
      input.setSelectionRange = (start, end, direction = "none") => {
        input.selectionStart = start
        input.selectionEnd = end
        input.selectionDirection = direction as SelectionInput["selectionDirection"]
      }
    }
    return element
  }
}

const makeFixture = (document: FakeDocument, type: "rectangle" | "frame") => {
  const elements: RawExcalidrawElement[] = [
    { id: "A", type, name: "Original", groupIds: [], customData: { foreign: "keep" } },
  ]
  const tab = makeSidepanelTab(document, null)
  const updateScene = vi.fn(({ elements: next }: { elements: RawExcalidrawElement[] }) => {
    elements.splice(0, elements.length, ...next)
  })
  let api = { updateScene }
  const view = { id: "view", _loaded: true, file: { path: "drawing.md" } }
  const ea: EaLike = {
    targetView: view,
    getViewElements: () => elements,
    getViewSelectedElements: () => [],
    getExcalidrawAPI: () => api,
    createSidepanelTab: () => tab.tab,
  }
  tab.tab.getHostEA = () => ea
  const runtime = createLayerManagerRuntime(ea)
  const input = () => findFirstInput(getContentRoot(tab.contentEl)) as SelectionInput | null
  const begin = async () => {
    const button = findButtonByTitle(getContentRoot(tab.contentEl), "Rename layer")
    expect(button).not.toBeNull()
    button?.click()
    await flushAsync()
    const editor = input()
    if (!editor) throw new Error("Expected rename editor")
    editor.focus()
    editor.value = "Draft across refresh"
    editor.dispatchEvent(new FakeDomEvent("input"))
    editor.setSelectionRange(3, 11, "backward")
    return editor
  }
  return {
    ea,
    runtime,
    elements,
    updateScene,
    input,
    begin,
    tab,
    replaceApi: () => {
      api = { updateScene }
    },
    label: () =>
      type === "frame"
        ? elements[0]?.name
        : (elements[0]?.customData?.["lmx"] as { label?: string } | undefined)?.label,
  }
}

describe("inline rename ownership across refresh", () => {
  let document: FakeDocument
  const runtimes: Array<ReturnType<typeof createLayerManagerRuntime>> = []
  beforeEach(() => {
    document = new FakeDocument()
    addSelectionSupport(document)
    vi.stubGlobal("document", document)
  })
  afterEach(() => {
    for (const runtime of runtimes.splice(0)) runtime.dispose()
    vi.unstubAllGlobals()
  })
  const fixture = (type: "rectangle" | "frame") => {
    const result = makeFixture(document, type)
    runtimes.push(result.runtime)
    return result
  }

  it.each(["rectangle", "frame"] as const)(
    "preserves focused %s draft/caret and ignores detached input events",
    async (type) => {
      const f = fixture(type)
      const oldInput = await f.begin()
      f.runtime.refresh()
      await flushAsync()
      const nextInput = f.input()
      expect(nextInput).not.toBe(oldInput)
      expect(nextInput?.value).toBe("Draft across refresh")
      expect(document.activeElement).toBe(nextInput)
      expect([
        nextInput?.selectionStart,
        nextInput?.selectionEnd,
        nextInput?.selectionDirection,
      ]).toEqual([3, 11, "backward"])
      oldInput.value = "Stale input"
      oldInput.dispatchEvent(new FakeDomEvent("input"))
      oldInput.dispatchEvent(new FakeDomEvent("blur"))
      dispatchKeydown(oldInput, "Escape")
      dispatchKeydown(oldInput, "Enter")
      await flushAsync()
      expect(f.updateScene).not.toHaveBeenCalled()
      expect(f.input()?.value).toBe("Draft across refresh")
      if (!nextInput) throw new Error("Expected current editor")
      dispatchKeydown(nextInput, "Enter")
      nextInput.dispatchEvent(new FakeDomEvent("blur"))
      await flushAsync()
      expect(f.updateScene).toHaveBeenCalledTimes(1)
      expect(f.label()).toBe("Draft across refresh")
    },
  )

  it.each(["rectangle", "frame"] as const)(
    "ignores detached %s blur independently of focus restoration",
    async (type) => {
      const f = fixture(type)
      const oldInput = await f.begin()
      f.runtime.refresh()
      await flushAsync()
      oldInput.dispatchEvent(new FakeDomEvent("blur"))
      await flushAsync()
      expect(f.updateScene).not.toHaveBeenCalled()
      expect(f.input()?.value).toBe("Draft across refresh")
    },
  )

  it.each(["rectangle", "frame"] as const)(
    "commits current %s blur once and cancels Escape after refresh",
    async (type) => {
      const f = fixture(type)
      await f.begin()
      f.runtime.refresh()
      await flushAsync()
      const editor = f.input()
      if (!editor) throw new Error("Expected current editor")
      editor.dispatchEvent(new FakeDomEvent("blur"))
      editor.dispatchEvent(new FakeDomEvent("blur"))
      await flushAsync(20)
      expect(f.updateScene).toHaveBeenCalledTimes(1)
      expect(f.label()).toBe("Draft across refresh")
      await f.begin()
      f.runtime.refresh()
      await flushAsync()
      const cancelled = f.input()
      if (!cancelled) throw new Error("Expected editor before cancel")
      dispatchKeydown(cancelled, "Escape")
      cancelled.dispatchEvent(new FakeDomEvent("blur"))
      await flushAsync()
      expect(f.updateScene).toHaveBeenCalledTimes(1)
    },
  )

  it.each(["view", "api"] as const)(
    "rejects old input events after %s replacement before any refresh",
    async (boundary) => {
      const f = fixture("rectangle")
      const oldInput = await f.begin()
      if (boundary === "view") f.ea.targetView = { ...(f.ea.targetView as object) }
      else f.replaceApi()
      oldInput.dispatchEvent(new FakeDomEvent("blur"))
      dispatchKeydown(oldInput, "Enter")
      await flushAsync()
      expect(f.updateScene).not.toHaveBeenCalled()
    },
  )

  it("invalidates callbacks before synchronous teardown blur and captures live DOM draft", async () => {
    const f = fixture("rectangle")
    const oldInput = await f.begin()
    oldInput.value = "DOM draft before input event"
    const root = getContentRoot(f.tab.contentEl)
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(root), "innerHTML")
    if (!descriptor?.set) throw new Error("Expected fake innerHTML setter")
    const set = descriptor.set
    Object.defineProperty(root, "innerHTML", {
      configurable: true,
      set(value: string) {
        oldInput.dispatchEvent(new FakeDomEvent("blur"))
        set.call(this, value)
      },
    })
    f.runtime.refresh()
    await flushAsync()
    expect(f.updateScene).not.toHaveBeenCalled()
    expect(f.input()?.value).toBe("DOM draft before input event")
    expect(document.activeElement).toBe(f.input())
  })

  it("keeps an unchanged duplicate-begin editor authorized", async () => {
    const f = fixture("rectangle")
    const editor = await f.begin()
    editor.value = "Original"
    editor.dispatchEvent(new FakeDomEvent("input"))
    findButtonByTitle(getContentRoot(f.tab.contentEl), "Rename layer")?.click()
    await flushAsync()
    const current = f.input()
    if (!current) throw new Error("Expected editor after duplicate begin")
    current.value = "After duplicate begin"
    current.dispatchEvent(new FakeDomEvent("input"))
    dispatchKeydown(current, "Enter")
    await flushAsync(20)
    expect(f.updateScene).toHaveBeenCalledTimes(1)
    expect(f.label()).toBe("After duplicate begin")
  })

  it("does not steal external focus during refresh", async () => {
    const f = fixture("rectangle")
    await f.begin()
    const outside = document.createElement("button")
    outside.focus()
    f.runtime.refresh()
    await flushAsync()
    expect(document.activeElement).toBe(outside)
    expect(f.input()?.value).toBe("Draft across refresh")
  })

  it.each(["view", "api", "deleted", "disposed"] as const)(
    "clears stale rename authority on %s boundary",
    async (boundary) => {
      const f = fixture("rectangle")
      const oldInput = await f.begin()
      if (boundary === "view") f.ea.targetView = { ...(f.ea.targetView as object) }
      if (boundary === "api") f.replaceApi()
      if (boundary === "deleted") f.elements.splice(0)
      if (boundary === "disposed") f.runtime.dispose()
      else f.runtime.refresh()
      await flushAsync()
      oldInput.dispatchEvent(new FakeDomEvent("blur"))
      dispatchKeydown(oldInput, "Enter")
      await flushAsync()
      expect(f.updateScene).not.toHaveBeenCalled()
      if (boundary !== "disposed") expect(f.input()?.value).not.toBe("Draft across refresh")
    },
  )
})
