import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ScriptSettings } from "../src/adapter/excalidraw-types.js"
import type { LayerNode } from "../src/model/tree.js"
import { createExcalidrawSidepanelRenderer } from "../src/ui/excalidrawSidepanelRenderer.js"

import {
  FakeDocument,
  SIDEPANEL_MOUNT_MODE_CASES,
  findRowTreeRoot,
  flattenElements,
  flushAsync,
  getContentRoot,
  makeSidepanelTab,
  makeSidepanelTabForMountMode,
} from "./sidepanelTestHarness.js"
import type { SidepanelMountMode, SidepanelTabHarness } from "./sidepanelTestHarness.js"

const makeElementNode = (elementId: string, label = elementId): LayerNode => ({
  id: `el:${elementId}`,
  type: "element",
  elementIds: [elementId],
  primaryElementId: elementId,
  children: [],
  canExpand: false,
  isExpanded: true,
  groupId: null,
  frameId: null,
  label,
})

const expectMountedOutputForMode = (
  sidepanelTab: SidepanelTabHarness,
  mountMode: SidepanelMountMode,
): void => {
  if (mountMode === "setContentOnly") {
    expect(sidepanelTab.setContent).toHaveBeenCalled()
  } else {
    expect(sidepanelTab.setContent).not.toHaveBeenCalled()
  }

  expect(sidepanelTab.contentEl.children.length).toBeGreaterThan(0)
}

const expectMountedStatusState = (sidepanelTab: SidepanelTabHarness, fragments: string[]): void => {
  const contentRoot = getContentRoot(sidepanelTab.contentEl)
  expect(findRowTreeRoot(contentRoot)).toBeUndefined()

  const textFragments = flattenElements(contentRoot).map((element) => element.textContent ?? "")
  expect(textFragments).toEqual(expect.arrayContaining(fragments))
}

const makeSetCloseCallbackSidepanelTab = (document: FakeDocument) => {
  const contentEl = document.createElement("div")
  const setTitle = vi.fn()
  const open = vi.fn()
  const close = vi.fn()
  let closeCallback: (() => void) | null = null

  const tab = {
    contentEl: contentEl as unknown as HTMLElement,
    setTitle,
    setCloseCallback: vi.fn((callback: () => void) => {
      closeCallback = callback
    }),
    open,
    close,
    getHostEA: () => null,
  }

  return {
    tab,
    contentEl,
    setTitle,
    open,
    close,
    triggerClose: () => {
      closeCallback?.()
    },
  }
}

const makeViewChangeAwareSidepanelTab = (document: FakeDocument) => {
  const harness = makeSidepanelTab(document, null)
  const tab = harness.tab as typeof harness.tab & {
    onViewChange?: (targetView?: unknown | null) => void
  }

  return {
    ...harness,
    tab,
  }
}

const makeHostViewBinding = (viewPath: string, frontmatter: Record<string, unknown> = {}) => {
  const app = {
    metadataCache: {
      getFileCache: (file: unknown) => {
        if (
          !file ||
          typeof file !== "object" ||
          typeof (file as { path?: unknown }).path !== "string"
        ) {
          return null
        }

        return {
          frontmatter,
        }
      },
    },
  }

  return {
    app,
    targetView: {
      _loaded: true,
      file: {
        path: viewPath,
      },
      app,
    },
  }
}

describe("sidepanel mount-focused integration", () => {
  const globalRecord = globalThis as Record<string, unknown>

  let hadDocumentProperty = false
  let previousDocumentValue: unknown
  let fakeDocument: FakeDocument

  beforeEach(() => {
    hadDocumentProperty = Object.prototype.hasOwnProperty.call(globalRecord, "document")
    previousDocumentValue = globalRecord["document"]

    fakeDocument = new FakeDocument()
    globalRecord["document"] = fakeDocument as unknown as Document
  })

  afterEach(() => {
    if (hadDocumentProperty) {
      globalRecord["document"] = previousDocumentValue
      return
    }

    Reflect.deleteProperty(globalRecord, "document")
  })

  it("returns null when the active note metadata is not Excalidraw-capable", () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const host = {
      sidepanelTab: sidepanelTab.tab,
      createSidepanelTab: () => sidepanelTab.tab,
      getScriptSettings: () => ({}),
      ...makeHostViewBinding("plain.md", {}),
    }

    const renderer = createExcalidrawSidepanelRenderer(host)

    expect(renderer).toBeNull()
  })

  it("does not rescue host eligibility through first-view fallback when the active note is plain markdown", () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const app = {
      metadataCache: {
        getFileCache: (file: unknown) => {
          const path =
            file &&
            typeof file === "object" &&
            typeof (file as { path?: unknown }).path === "string"
              ? ((file as { path: string }).path as string)
              : null

          if (path === "plain.md") {
            return {
              frontmatter: {},
            }
          }

          if (path === "eligible.excalidraw") {
            return {
              frontmatter: {
                "excalidraw-plugin": "parsed",
              },
            }
          }

          return null
        },
      },
      workspace: {
        getActiveFile: () => ({
          path: "plain.md",
        }),
      },
    }

    const host: {
      sidepanelTab: typeof sidepanelTab.tab
      targetView: unknown | null
      app: typeof app
      setView: ReturnType<typeof vi.fn>
      createSidepanelTab: () => typeof sidepanelTab.tab
      getScriptSettings: () => ScriptSettings
    } = {
      sidepanelTab: sidepanelTab.tab,
      targetView: null,
      app,
      setView: vi.fn((viewArg?: unknown) => {
        if (viewArg === "first") {
          host.targetView = {
            _loaded: true,
            file: {
              path: "eligible.excalidraw",
            },
            app,
          }
        }

        return host.targetView
      }),
      createSidepanelTab: () => sidepanelTab.tab,
      getScriptSettings: () => ({}),
    }

    const renderer = createExcalidrawSidepanelRenderer(host)

    expect(renderer).toBeNull()
    expect(host.setView).not.toHaveBeenCalledWith("first", false)
    expect(host.setView).not.toHaveBeenCalledWith("first", true)
  })

  it("lifecycle debug channel tags hostIneligible and keeps a truthful inactive shell on render-time transition", async () => {
    const debugFlagKey = "LMX_DEBUG_SIDEPANEL_LIFECYCLE"
    const hadDebugFlag = Object.prototype.hasOwnProperty.call(globalRecord, debugFlagKey)
    const previousDebugFlag = globalRecord[debugFlagKey]
    globalRecord[debugFlagKey] = true

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    try {
      for (const mountCase of SIDEPANEL_MOUNT_MODE_CASES) {
        const sidepanelTab = makeSidepanelTabForMountMode(fakeDocument, null, mountCase.mountMode)
        const eligibleBinding = makeHostViewBinding("eligible.excalidraw", {
          "excalidraw-plugin": "parsed",
        })
        const host = {
          sidepanelTab: sidepanelTab.tab,
          createSidepanelTab: () => sidepanelTab.tab,
          getScriptSettings: () => ({}),
          ...eligibleBinding,
        }

        const renderer = createExcalidrawSidepanelRenderer(host)
        if (!renderer) {
          throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
        }

        renderer.render({
          tree: [makeElementNode("A")],
          selectedIds: new Set(),
          sceneVersion: 1,
        })

        expect(sidepanelTab.contentEl.children.length).toBeGreaterThan(0)

        const ineligibleBinding = makeHostViewBinding("plain.md", {})
        host.targetView = ineligibleBinding.targetView
        host.app = ineligibleBinding.app

        renderer.render({
          tree: [makeElementNode("A")],
          selectedIds: new Set(),
          sceneVersion: 2,
        })

        await flushAsync()

        expect(sidepanelTab.close).not.toHaveBeenCalled()
        expect(sidepanelTab.contentEl.children.length).toBeGreaterThan(0)
        expectMountedStatusState(sidepanelTab, [
          "Layer Manager inactive",
          "Bound host view is not Excalidraw.",
          "Focus an Excalidraw view to resume live Layer Manager interaction.",
        ])
      }

      expect(logSpy).toHaveBeenCalledWith(
        "[LMX:lifecycle] rendering inactive sidepanel state",
        expect.objectContaining({
          title: "Layer Manager inactive",
          detail: "Bound host view is not Excalidraw.",
        }),
      )
    } finally {
      if (hadDebugFlag) {
        globalRecord[debugFlagKey] = previousDebugFlag
      } else {
        Reflect.deleteProperty(globalRecord, debugFlagKey)
      }

      logSpy.mockRestore()
    }
  })

  it("detaches the whole sidepanel leaf when the host Excalidraw view closes and remounts on next render", () => {
    const firstTab = makeSidepanelTab(fakeDocument, null)
    const secondTab = makeSidepanelTab(fakeDocument, null)
    const detachLeaf = vi.fn()
    const createSidepanelTab = vi.fn(() => secondTab.tab)
    const eligibleBinding = makeHostViewBinding("eligible.excalidraw", {
      "excalidraw-plugin": "parsed",
    })

    const host: {
      sidepanelTab: typeof firstTab.tab | typeof secondTab.tab | null
      createSidepanelTab: () => typeof secondTab.tab
      getSidepanelLeaf: () => { detach: ReturnType<typeof vi.fn> }
      getScriptSettings: () => ScriptSettings
      targetView: typeof eligibleBinding.targetView
      app: typeof eligibleBinding.app
    } = {
      sidepanelTab: firstTab.tab,
      createSidepanelTab,
      getSidepanelLeaf: () => ({
        detach: detachLeaf,
      }),
      getScriptSettings: () => ({}),
      ...eligibleBinding,
    }

    const renderer = createExcalidrawSidepanelRenderer(host)
    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A")],
      selectedIds: new Set(),
      sceneVersion: 1,
    })

    expect(firstTab.contentEl.children.length).toBeGreaterThan(0)

    const firstSidepanelTab = firstTab.tab as typeof firstTab.tab & {
      onExcalidrawViewClosed?: () => void
    }
    firstSidepanelTab.onExcalidrawViewClosed?.()

    expect(detachLeaf).toHaveBeenCalledTimes(1)
    expect(host.sidepanelTab).toBeNull()
    expect(firstTab.contentEl.children).toHaveLength(0)

    renderer.render({
      tree: [makeElementNode("B")],
      selectedIds: new Set(),
      sceneVersion: 2,
    })

    expect(createSidepanelTab).toHaveBeenCalledTimes(1)
    expect(host.sidepanelTab).toBe(secondTab.tab)
    expect(secondTab.contentEl.children.length).toBeGreaterThan(0)
  })

  it("uses setCloseCallback host lifecycle wiring and remounts after callback-triggered close", () => {
    const firstTab = makeSetCloseCallbackSidepanelTab(fakeDocument)
    const secondTab = makeSidepanelTab(fakeDocument, null)
    const detachLeaf = vi.fn()
    const createSidepanelTab = vi.fn(() => secondTab.tab)
    const eligibleBinding = makeHostViewBinding("eligible.excalidraw", {
      "excalidraw-plugin": "parsed",
    })

    const host: {
      sidepanelTab: typeof firstTab.tab | typeof secondTab.tab | null
      createSidepanelTab: () => typeof secondTab.tab
      getSidepanelLeaf: () => { detach: ReturnType<typeof vi.fn> }
      getScriptSettings: () => ScriptSettings
      targetView: typeof eligibleBinding.targetView
      app: typeof eligibleBinding.app
    } = {
      sidepanelTab: firstTab.tab,
      createSidepanelTab,
      getSidepanelLeaf: () => ({
        detach: detachLeaf,
      }),
      getScriptSettings: () => ({}),
      ...eligibleBinding,
    }

    const renderer = createExcalidrawSidepanelRenderer(host)
    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A")],
      selectedIds: new Set(),
      sceneVersion: 1,
    })

    expect(firstTab.tab.setCloseCallback).toHaveBeenCalledTimes(1)
    expect(firstTab.contentEl.children.length).toBeGreaterThan(0)

    firstTab.triggerClose()

    expect(detachLeaf).toHaveBeenCalledTimes(1)
    expect(host.sidepanelTab).toBeNull()
    expect(firstTab.contentEl.children).toHaveLength(0)

    renderer.render({
      tree: [makeElementNode("B")],
      selectedIds: new Set(),
      sceneVersion: 2,
    })

    expect(createSidepanelTab).toHaveBeenCalledTimes(1)
    expect(host.sidepanelTab).toBe(secondTab.tab)
    expect(secondTab.contentEl.children.length).toBeGreaterThan(0)
  })

  it("clears host close lifecycle wiring from superseded tabs", () => {
    const firstTab = makeSetCloseCallbackSidepanelTab(fakeDocument)
    const secondTab = makeSetCloseCallbackSidepanelTab(fakeDocument)
    const detachLeaf = vi.fn()
    const eligibleBinding = makeHostViewBinding("eligible.excalidraw", {
      "excalidraw-plugin": "parsed",
    })

    const host: {
      sidepanelTab: typeof firstTab.tab | typeof secondTab.tab | null
      getSidepanelLeaf: () => { detach: ReturnType<typeof vi.fn> }
      getScriptSettings: () => ScriptSettings
      targetView: typeof eligibleBinding.targetView
      app: typeof eligibleBinding.app
    } = {
      sidepanelTab: firstTab.tab,
      getSidepanelLeaf: () => ({
        detach: detachLeaf,
      }),
      getScriptSettings: () => ({}),
      ...eligibleBinding,
    }

    const renderer = createExcalidrawSidepanelRenderer(host)
    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A")],
      selectedIds: new Set(),
      sceneVersion: 1,
    })

    expect(firstTab.tab.setCloseCallback).toHaveBeenCalledTimes(1)

    host.sidepanelTab = secondTab.tab
    renderer.render({
      tree: [makeElementNode("B")],
      selectedIds: new Set(),
      sceneVersion: 2,
    })

    expect(secondTab.tab.setCloseCallback).toHaveBeenCalledTimes(1)
    expect(secondTab.contentEl.children.length).toBeGreaterThan(0)

    firstTab.triggerClose()

    expect(detachLeaf).not.toHaveBeenCalled()
    expect(host.sidepanelTab).toBe(secondTab.tab)
    expect(secondTab.contentEl.children.length).toBeGreaterThan(0)
  })

  it("keeps the sidepanel mounted as unbound when targetView becomes unusable without a host close callback", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const detachLeaf = vi.fn()
    const eligibleBinding = makeHostViewBinding("eligible.excalidraw", {
      "excalidraw-plugin": "parsed",
    })

    const host: {
      sidepanelTab: typeof sidepanelTab.tab | null
      createSidepanelTab: () => typeof sidepanelTab.tab
      getSidepanelLeaf: () => { detach: ReturnType<typeof vi.fn> }
      getScriptSettings: () => ScriptSettings
      targetView: typeof eligibleBinding.targetView | null
      app: typeof eligibleBinding.app
    } = {
      sidepanelTab: sidepanelTab.tab,
      createSidepanelTab: () => sidepanelTab.tab,
      getSidepanelLeaf: () => ({
        detach: detachLeaf,
      }),
      getScriptSettings: () => ({}),
      ...eligibleBinding,
    }

    const renderer = createExcalidrawSidepanelRenderer(host)
    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A")],
      selectedIds: new Set(),
      sceneVersion: 1,
    })

    expect(sidepanelTab.contentEl.children.length).toBeGreaterThan(0)

    host.targetView = null
    renderer.render({
      tree: [makeElementNode("A")],
      selectedIds: new Set(),
      sceneVersion: 2,
    })
    await flushAsync()

    expect(detachLeaf).not.toHaveBeenCalled()
    expect(sidepanelTab.close).not.toHaveBeenCalled()
    expect(host.sidepanelTab).toBe(sidepanelTab.tab)
    expectMountedStatusState(sidepanelTab, [
      "Layer Manager unbound",
      "No active Excalidraw view is currently bound.",
      "Focus an Excalidraw view to resume live Layer Manager interaction.",
    ])
  })

  it("renders the persistent shell as unbound after targetView loss instead of retrying local recovery", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const detachLeaf = vi.fn()
    const eligibleBinding = makeHostViewBinding("eligible.excalidraw", {
      "excalidraw-plugin": "parsed",
    })

    const host: {
      sidepanelTab: typeof sidepanelTab.tab | null
      createSidepanelTab: () => typeof sidepanelTab.tab
      getSidepanelLeaf: () => { detach: ReturnType<typeof vi.fn> }
      getScriptSettings: () => ScriptSettings
      targetView: typeof eligibleBinding.targetView | null
      app: typeof eligibleBinding.app
      setView: ReturnType<typeof vi.fn>
    } = {
      sidepanelTab: sidepanelTab.tab,
      createSidepanelTab: () => sidepanelTab.tab,
      getSidepanelLeaf: () => ({
        detach: detachLeaf,
      }),
      getScriptSettings: () => ({}),
      setView: vi.fn(() => {
        host.targetView = eligibleBinding.targetView
        host.app = eligibleBinding.app
        return host.targetView
      }),
      ...eligibleBinding,
    }

    const renderer = createExcalidrawSidepanelRenderer(host)
    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A")],
      selectedIds: new Set(),
      sceneVersion: 1,
    })

    host.targetView = null
    renderer.render({
      tree: [makeElementNode("A")],
      selectedIds: new Set(),
      sceneVersion: 2,
    })
    await flushAsync()

    expect(host.setView).not.toHaveBeenCalled()
    expect(detachLeaf).not.toHaveBeenCalled()
    expect(sidepanelTab.close).not.toHaveBeenCalled()
    expectMountedStatusState(sidepanelTab, [
      "Layer Manager unbound",
      "No active Excalidraw view is currently bound.",
      "Focus an Excalidraw view to resume live Layer Manager interaction.",
    ])
  })

  it("rebinds the persistent shell through sidepanel onViewChange without closing the tab", async () => {
    const sidepanelTab = makeViewChangeAwareSidepanelTab(fakeDocument)
    const eligibleBinding = makeHostViewBinding("eligible.excalidraw", {
      "excalidraw-plugin": "parsed",
    })

    const host: {
      sidepanelTab: typeof sidepanelTab.tab
      createSidepanelTab: () => typeof sidepanelTab.tab
      getScriptSettings: () => ScriptSettings
      targetView: typeof eligibleBinding.targetView | null
      app: typeof eligibleBinding.app
    } = {
      sidepanelTab: sidepanelTab.tab,
      createSidepanelTab: () => sidepanelTab.tab,
      getScriptSettings: () => ({}),
      ...eligibleBinding,
    }

    const renderer = createExcalidrawSidepanelRenderer(host)
    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A")],
      selectedIds: new Set(),
      sceneVersion: 1,
    })

    expect(typeof sidepanelTab.tab.onViewChange).toBe("function")
    expect(findRowTreeRoot(getContentRoot(sidepanelTab.contentEl))).toBeDefined()

    host.targetView = null
    renderer.render({
      tree: [makeElementNode("A")],
      selectedIds: new Set(),
      sceneVersion: 2,
    })

    expectMountedStatusState(sidepanelTab, [
      "Layer Manager unbound",
      "No active Excalidraw view is currently bound.",
      "Focus an Excalidraw view to resume live Layer Manager interaction.",
    ])

    sidepanelTab.tab.onViewChange?.(eligibleBinding.targetView)
    await flushAsync()

    expect(host.targetView).toBe(eligibleBinding.targetView)
    expect(sidepanelTab.close).not.toHaveBeenCalled()
    expect(findRowTreeRoot(getContentRoot(sidepanelTab.contentEl))).toBeDefined()

    const textFragments = flattenElements(getContentRoot(sidepanelTab.contentEl)).map(
      (element) => element.textContent ?? "",
    )
    expect(textFragments).not.toEqual(expect.arrayContaining(["Layer Manager unbound"]))
  })

  it("reclaims row-tree focus for sidepanel-driven onViewChange rebinds even when focus was outside", async () => {
    const sidepanelTab = makeViewChangeAwareSidepanelTab(fakeDocument)
    const eligibleBinding = makeHostViewBinding("eligible.excalidraw", {
      "excalidraw-plugin": "parsed",
    })

    const host: {
      sidepanelTab: typeof sidepanelTab.tab
      createSidepanelTab: () => typeof sidepanelTab.tab
      getScriptSettings: () => ScriptSettings
      targetView: typeof eligibleBinding.targetView | null
      app: typeof eligibleBinding.app
    } = {
      sidepanelTab: sidepanelTab.tab,
      createSidepanelTab: () => sidepanelTab.tab,
      getScriptSettings: () => ({}),
      ...eligibleBinding,
    }

    const renderer = createExcalidrawSidepanelRenderer(host)
    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A")],
      selectedIds: new Set(),
      sceneVersion: 1,
    })

    host.targetView = null
    renderer.render({
      tree: [makeElementNode("A")],
      selectedIds: new Set(),
      sceneVersion: 2,
    })
    await flushAsync()

    const outsideTarget = fakeDocument.createElement("button")
    fakeDocument.activeElement = outsideTarget

    sidepanelTab.tab.onViewChange?.(eligibleBinding.targetView)
    await flushAsync()

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    const rowTreeRoot = findRowTreeRoot(contentRoot)

    expect(host.targetView).toBe(eligibleBinding.targetView)
    expect(rowTreeRoot).toBeDefined()
    expect(fakeDocument.activeElement).toBe(rowTreeRoot)
    expect(sidepanelTab.close).not.toHaveBeenCalled()
  })

  it("remounts into an explicit unbound shell instead of reinstating a cached targetView heuristically", () => {
    const firstTab = makeSidepanelTab(fakeDocument, null)
    const secondTab = makeSidepanelTab(fakeDocument, null)
    const eligibleBinding = makeHostViewBinding("eligible.excalidraw", {
      "excalidraw-plugin": "parsed",
    })

    const createSidepanelTab = vi.fn(() => secondTab.tab)
    const host: {
      sidepanelTab: typeof firstTab.tab | typeof secondTab.tab | null
      createSidepanelTab: () => typeof secondTab.tab
      getScriptSettings: () => ScriptSettings
      targetView: typeof eligibleBinding.targetView | null
      app: typeof eligibleBinding.app
      setView: ReturnType<typeof vi.fn>
    } = {
      sidepanelTab: firstTab.tab,
      createSidepanelTab,
      getScriptSettings: () => ({}),
      setView: vi.fn((viewArg?: unknown) => {
        if (viewArg === eligibleBinding.targetView) {
          host.targetView = eligibleBinding.targetView
          return host.targetView
        }

        return null
      }),
      ...eligibleBinding,
    }

    const renderer = createExcalidrawSidepanelRenderer(host)
    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A")],
      selectedIds: new Set(),
      sceneVersion: 1,
    })

    host.sidepanelTab = null
    host.targetView = null

    renderer.render({
      tree: [makeElementNode("A")],
      selectedIds: new Set(),
      sceneVersion: 2,
    })

    expect(createSidepanelTab).toHaveBeenCalledTimes(1)
    expect(host.setView).not.toHaveBeenCalled()
    expect(host.targetView).toBeNull()
    expectMountedStatusState(secondTab, [
      "Layer Manager unbound",
      "No active Excalidraw view is currently bound.",
      "Focus an Excalidraw view to resume live Layer Manager interaction.",
    ])
  })

  for (const mountCase of SIDEPANEL_MOUNT_MODE_CASES) {
    it(`mount mode parity (${mountCase.label}): attaches through expected host path`, () => {
      const sidepanelTab = makeSidepanelTabForMountMode(fakeDocument, null, mountCase.mountMode)
      const host: {
        sidepanelTab: typeof sidepanelTab.tab | null
        createSidepanelTab: () => typeof sidepanelTab.tab
        getScriptSettings: () => ScriptSettings
      } = {
        sidepanelTab: null,
        createSidepanelTab: () => sidepanelTab.tab,
        getScriptSettings: () => ({}),
      }

      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
      })

      expect(host.sidepanelTab).toBe(sidepanelTab.tab)
      expect(sidepanelTab.setTitle).toHaveBeenCalledWith("Layer Manager")
      expect(sidepanelTab.open).toHaveBeenCalledTimes(1)
      expectMountedOutputForMode(sidepanelTab, mountCase.mountMode)
    })

    it(`mount mode parity (${mountCase.label}): reuses active tab when host reference is stale`, () => {
      const staleTab = {
        setTitle: vi.fn(),
        open: vi.fn(),
        close: vi.fn(),
        getHostEA: () => null,
      }

      const activeTab = makeSidepanelTabForMountMode(
        fakeDocument,
        { previousHost: true },
        mountCase.mountMode,
      )
      const createSidepanelTab = vi.fn(() => activeTab.tab)

      const host = {
        sidepanelTab: staleTab,
        checkForActiveSidepanelTabForScript: vi.fn(() => activeTab.tab),
        createSidepanelTab,
        activeScript: "LayerManager",
        getScriptSettings: () => ({}),
      }

      const renderer = createExcalidrawSidepanelRenderer(host)
      expect(renderer).not.toBeNull()

      renderer?.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
      })

      expect(host.checkForActiveSidepanelTabForScript).toHaveBeenCalledTimes(1)
      expect(createSidepanelTab).not.toHaveBeenCalled()
      expect(host.sidepanelTab).toBe(activeTab.tab)
      expect(activeTab.setTitle).toHaveBeenCalledWith("Layer Manager")
      expect(activeTab.open).toHaveBeenCalledTimes(1)
      expectMountedOutputForMode(activeTab, mountCase.mountMode)
    })

    it(`mount mode parity (${mountCase.label}): async create attaches once promise resolves`, async () => {
      const asyncTab = makeSidepanelTabForMountMode(fakeDocument, null, mountCase.mountMode)

      const host: {
        sidepanelTab: typeof asyncTab.tab | null
        createSidepanelTab: () => Promise<typeof asyncTab.tab>
        getScriptSettings: () => ScriptSettings
      } = {
        sidepanelTab: null,
        createSidepanelTab: () => Promise.resolve(asyncTab.tab),
        getScriptSettings: () => ({}),
      }

      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
      })

      expect(host.sidepanelTab).toBeNull()

      await flushAsync()

      expect(host.sidepanelTab).toBe(asyncTab.tab)
      expect(asyncTab.setTitle).toHaveBeenCalledWith("Layer Manager")
      expect(asyncTab.open).toHaveBeenCalledTimes(1)
      expectMountedOutputForMode(asyncTab, mountCase.mountMode)
    })

    it(`mount mode parity (${mountCase.label}): clears mounted output on renderer dispose`, () => {
      const sidepanelTab = makeSidepanelTabForMountMode(fakeDocument, null, mountCase.mountMode)
      const host: {
        sidepanelTab: typeof sidepanelTab.tab | null
        createSidepanelTab: () => typeof sidepanelTab.tab
        getScriptSettings: () => ScriptSettings
      } = {
        sidepanelTab: null,
        createSidepanelTab: () => sidepanelTab.tab,
        getScriptSettings: () => ({}),
      }

      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
      })

      expect(sidepanelTab.contentEl.children.length).toBeGreaterThan(0)

      renderer.dispose?.()

      expect(sidepanelTab.contentEl.children).toHaveLength(0)
    })

    it(`mount mode parity (${mountCase.label}): prunes stale LayerManager roots without deleting host-owned siblings`, () => {
      const sidepanelTab = makeSidepanelTabForMountMode(fakeDocument, null, mountCase.mountMode)
      const preservedSibling = fakeDocument.createElement("div")
      preservedSibling.textContent = "keep me"
      const staleLayerManagerRoot = fakeDocument.createElement("div")
      staleLayerManagerRoot.id = "lmx-sidepanel-content-root"
      staleLayerManagerRoot.tabIndex = 0
      staleLayerManagerRoot.style["display"] = "flex"
      staleLayerManagerRoot.style["flexDirection"] = "column"
      staleLayerManagerRoot.style["gap"] = "6px"
      staleLayerManagerRoot.style["padding"] = "8px"
      sidepanelTab.contentEl.appendChild(preservedSibling)
      sidepanelTab.contentEl.appendChild(staleLayerManagerRoot)

      const host: {
        sidepanelTab: typeof sidepanelTab.tab | null
        createSidepanelTab: () => typeof sidepanelTab.tab
        getScriptSettings: () => ScriptSettings
      } = {
        sidepanelTab: sidepanelTab.tab,
        createSidepanelTab: () => sidepanelTab.tab,
        getScriptSettings: () => ({}),
      }

      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
      })

      if (mountCase.mountMode === "contentEl") {
        expect(sidepanelTab.contentEl.contains(preservedSibling)).toBe(true)
        expect(sidepanelTab.contentEl.contains(staleLayerManagerRoot)).toBe(false)
        expect(sidepanelTab.contentEl.children).toHaveLength(2)
        return
      }

      expect(sidepanelTab.contentEl.contains(preservedSibling)).toBe(false)
      expect(sidepanelTab.contentEl.contains(staleLayerManagerRoot)).toBe(false)
      expect(sidepanelTab.contentEl.children).toHaveLength(1)
    })

    it(`mount mode parity (${mountCase.label}): async create failure then recovery`, async () => {
      const recoveredTab = makeSidepanelTabForMountMode(fakeDocument, null, mountCase.mountMode)
      const createSidepanelTab = vi
        .fn<() => Promise<typeof recoveredTab.tab>>()
        .mockImplementationOnce(async () => {
          throw new Error("tab create failed")
        })
        .mockImplementationOnce(() => Promise.resolve(recoveredTab.tab))

      const host: {
        sidepanelTab: typeof recoveredTab.tab | null
        createSidepanelTab: () => Promise<typeof recoveredTab.tab>
        getScriptSettings: () => ScriptSettings
      } = {
        sidepanelTab: null,
        createSidepanelTab,
        getScriptSettings: () => ({}),
      }

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      try {
        const renderer = createExcalidrawSidepanelRenderer(host)
        if (!renderer) {
          throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
        }

        renderer.render({
          tree: [makeElementNode("A")],
          selectedIds: new Set(),
          sceneVersion: 1,
        })

        await flushAsync()

        expect(host.sidepanelTab).toBeNull()
        expect(logSpy).toHaveBeenCalledWith("[LMX] Failed to create Layer Manager sidepanel tab.")

        renderer.render({
          tree: [makeElementNode("A")],
          selectedIds: new Set(),
          sceneVersion: 2,
        })

        await flushAsync()

        expect(createSidepanelTab).toHaveBeenCalledTimes(2)
        expect(host.sidepanelTab).toBe(recoveredTab.tab)
        expectMountedOutputForMode(recoveredTab, mountCase.mountMode)
      } finally {
        logSpy.mockRestore()
      }
    })
  }

  it("lifecycle debug channel tags mount failure reasons deterministically", async () => {
    const debugFlagKey = "LMX_DEBUG_SIDEPANEL_LIFECYCLE"
    const hadDebugFlag = Object.prototype.hasOwnProperty.call(globalRecord, debugFlagKey)
    const previousDebugFlag = globalRecord[debugFlagKey]
    globalRecord[debugFlagKey] = true

    const setContent = vi.fn(() => {
      throw new Error("setContent failed")
    })

    const host = {
      sidepanelTab: {
        setTitle: vi.fn(),
        open: vi.fn(),
        close: vi.fn(),
        getHostEA: () => null,
        setContent,
      },
      getScriptSettings: () => ({}),
    }

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    try {
      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
      })

      await flushAsync()

      expect(setContent).toHaveBeenCalledTimes(1)
      expect(logSpy).toHaveBeenCalledWith(
        "[LMX:lifecycle] mount failed with reason=setContentFailed",
      )
    } finally {
      if (hadDebugFlag) {
        globalRecord[debugFlagKey] = previousDebugFlag
      } else {
        Reflect.deleteProperty(globalRecord, debugFlagKey)
      }

      logSpy.mockRestore()
    }
  })

  it("lifecycle debug channel tags tabUnrenderable deterministically", async () => {
    const debugFlagKey = "LMX_DEBUG_SIDEPANEL_LIFECYCLE"
    const hadDebugFlag = Object.prototype.hasOwnProperty.call(globalRecord, debugFlagKey)
    const previousDebugFlag = globalRecord[debugFlagKey]
    globalRecord[debugFlagKey] = true

    const staleHostTab = {
      setTitle: vi.fn(),
      open: vi.fn(),
      close: vi.fn(),
      getHostEA: () => null,
    }

    const host = {
      sidepanelTab: staleHostTab,
      getScriptSettings: () => ({}),
    }

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    try {
      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
      })

      await flushAsync()

      expect(host.sidepanelTab).toBeNull()
      expect(logSpy).toHaveBeenCalledWith(
        "[LMX:lifecycle] mount failed with reason=tabUnrenderable",
      )
    } finally {
      if (hadDebugFlag) {
        globalRecord[debugFlagKey] = previousDebugFlag
      } else {
        Reflect.deleteProperty(globalRecord, debugFlagKey)
      }

      logSpy.mockRestore()
    }
  })

  it("lifecycle debug channel tags tabUnavailable deterministically", async () => {
    const debugFlagKey = "LMX_DEBUG_SIDEPANEL_LIFECYCLE"
    const hadDebugFlag = Object.prototype.hasOwnProperty.call(globalRecord, debugFlagKey)
    const previousDebugFlag = globalRecord[debugFlagKey]
    globalRecord[debugFlagKey] = true

    const createSidepanelTab = vi.fn(() => undefined)

    const host = {
      sidepanelTab: null,
      createSidepanelTab,
      getScriptSettings: () => ({}),
    }

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    try {
      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
      })

      await flushAsync()

      expect(createSidepanelTab).toHaveBeenCalledTimes(1)
      expect(logSpy).toHaveBeenCalledWith("[LMX:lifecycle] mount failed with reason=tabUnavailable")
    } finally {
      if (hadDebugFlag) {
        globalRecord[debugFlagKey] = previousDebugFlag
      } else {
        Reflect.deleteProperty(globalRecord, debugFlagKey)
      }

      logSpy.mockRestore()
    }
  })

  it("lifecycle debug channel tags ownerDocumentUnavailable deterministically", async () => {
    const debugFlagKey = "LMX_DEBUG_SIDEPANEL_LIFECYCLE"
    const hadDebugFlag = Object.prototype.hasOwnProperty.call(globalRecord, debugFlagKey)
    const previousDebugFlag = globalRecord[debugFlagKey]
    globalRecord[debugFlagKey] = true

    const hadDocumentPropertyInTest = Object.prototype.hasOwnProperty.call(globalRecord, "document")
    const previousDocumentInTest = globalRecord["document"]

    const sidepanelTab = makeSidepanelTab(fakeDocument, null, false, true)

    const host = {
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    }

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    try {
      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      Reflect.deleteProperty(globalRecord, "document")

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
      })

      await flushAsync()

      expect(sidepanelTab.setContent).not.toHaveBeenCalled()
      expect(logSpy).toHaveBeenCalledWith(
        "[LMX:lifecycle] mount failed with reason=ownerDocumentUnavailable",
      )
    } finally {
      if (hadDocumentPropertyInTest) {
        globalRecord["document"] = previousDocumentInTest
      } else {
        Reflect.deleteProperty(globalRecord, "document")
      }

      if (hadDebugFlag) {
        globalRecord[debugFlagKey] = previousDebugFlag
      } else {
        Reflect.deleteProperty(globalRecord, debugFlagKey)
      }

      logSpy.mockRestore()
    }
  })
})
