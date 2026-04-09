import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ScriptSettings } from "../src/adapter/excalidraw-types.js"
import type { LayerNode } from "../src/model/tree.js"
import type { ExecuteIntentOutcome } from "../src/runtime/intentExecution.js"
import { createExcalidrawSidepanelRenderer } from "../src/ui/excalidrawSidepanelRenderer.js"
import type { LayerManagerUiActions, RenderViewModel } from "../src/ui/renderer.js"

interface FakeDomEventInit {
  key?: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

class FakeDomEvent {
  readonly type: string
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  target: EventTarget | null = null
  defaultPrevented = false
  propagationStopped = false

  constructor(type: string, init: FakeDomEventInit = {}) {
    this.type = type
    this.key = init.key ?? ""
    this.ctrlKey = init.ctrlKey ?? false
    this.metaKey = init.metaKey ?? false
    this.altKey = init.altKey ?? false
    this.shiftKey = init.shiftKey ?? false
  }

  preventDefault(): void {
    this.defaultPrevented = true
  }

  stopPropagation(): void {
    this.propagationStopped = true
  }
}

class FakeDomElement {
  readonly tagName: string
  readonly ownerDocument: FakeDocument
  readonly style: Record<string, string> = {}

  textContent: string | null = ""
  type = ""
  value = ""
  disabled = false
  title = ""
  tabIndex = 0
  draggable = false
  parentElement: FakeDomElement | null = null

  #children: FakeDomElement[] = []
  #listeners = new Map<string, Set<(event: FakeDomEvent) => void>>()

  constructor(tagName: string, ownerDocument: FakeDocument) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
  }

  get children(): readonly FakeDomElement[] {
    return this.#children
  }

  appendChild(child: FakeDomElement): FakeDomElement {
    child.parentElement = this
    this.#children.push(child)
    return child
  }

  contains(candidate: FakeDomElement | null): boolean {
    if (!candidate) {
      return false
    }

    if (candidate === this) {
      return true
    }

    for (const child of this.#children) {
      if (child.contains(candidate)) {
        return true
      }
    }

    return false
  }

  addEventListener(type: string, listener: (event: FakeDomEvent) => void): void {
    if (!this.#listeners.has(type)) {
      this.#listeners.set(type, new Set())
    }

    this.#listeners.get(type)?.add(listener)
  }

  removeEventListener(type: string, listener: (event: FakeDomEvent) => void): void {
    this.#listeners.get(type)?.delete(listener)
  }

  dispatchEvent(event: FakeDomEvent): boolean {
    if (!event.target) {
      event.target = this as unknown as EventTarget
    }

    const listeners = this.#listeners.get(event.type)
    if (!listeners || listeners.size === 0) {
      return !event.defaultPrevented
    }

    for (const listener of [...listeners]) {
      listener(event)
      if (event.propagationStopped) {
        break
      }
    }

    return !event.defaultPrevented
  }

  click(): void {
    this.dispatchEvent(new FakeDomEvent("click"))
  }

  focus(): void {
    this.ownerDocument.activeElement = this
  }

  set innerHTML(value: string) {
    this.#children = []
    this.textContent = value
  }

  get innerHTML(): string {
    return this.textContent ?? ""
  }
}

class FakeDocument {
  activeElement: FakeDomElement | null = null
  defaultView = {
    HTMLElement: FakeDomElement,
  } as unknown as Window
  #listeners = new Map<string, Set<(event: FakeDomEvent) => void>>()

  createElement(tagName: string): FakeDomElement {
    return new FakeDomElement(tagName, this)
  }

  addEventListener(type: string, listener: (event: FakeDomEvent) => void): void {
    if (!this.#listeners.has(type)) {
      this.#listeners.set(type, new Set())
    }

    this.#listeners.get(type)?.add(listener)
  }

  removeEventListener(type: string, listener: (event: FakeDomEvent) => void): void {
    this.#listeners.get(type)?.delete(listener)
  }

  dispatchEvent(event: FakeDomEvent): boolean {
    if (!event.target) {
      event.target = this as unknown as EventTarget
    }

    const listeners = this.#listeners.get(event.type)
    if (!listeners || listeners.size === 0) {
      return !event.defaultPrevented
    }

    for (const listener of [...listeners]) {
      listener(event)
      if (event.propagationStopped) {
        break
      }
    }

    return !event.defaultPrevented
  }
}

interface SidepanelTabHarness {
  readonly tab: {
    contentEl?: HTMLElement
    setTitle: ReturnType<typeof vi.fn>
    open: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    getHostEA: () => unknown
  }
  readonly contentEl: FakeDomElement
}

const makeSidepanelTab = (document: FakeDocument, hostEA: unknown): SidepanelTabHarness => {
  const contentEl = document.createElement("div")
  const setTitle = vi.fn()
  const open = vi.fn()
  const close = vi.fn()

  const tab: SidepanelTabHarness["tab"] = {
    contentEl: contentEl as unknown as HTMLElement,
    setTitle,
    open,
    close,
    getHostEA: () => hostEA,
  }

  return {
    tab,
    contentEl,
  }
}

const makeAppliedOutcome = (): ExecuteIntentOutcome => ({
  status: "applied",
  attempts: 1,
})

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

const makeGroupNode = (
  groupId: string,
  children: readonly LayerNode[],
  isExpanded = true,
  label = groupId,
): LayerNode => ({
  id: `group:${groupId}`,
  type: "group",
  elementIds: children.flatMap((child) => child.elementIds),
  primaryElementId: children[0]?.primaryElementId ?? `group-primary:${groupId}`,
  children,
  canExpand: true,
  isExpanded,
  groupId,
  frameId: null,
  label,
})

const makeUiActions = (
  overrides: Partial<LayerManagerUiActions> = {},
): {
  readonly actions: LayerManagerUiActions
  readonly commandSpies: LayerManagerUiActions["commands"]
} => {
  const commandSpies = {
    toggleVisibility: vi.fn(async () => makeAppliedOutcome()),
    toggleLock: vi.fn(async () => makeAppliedOutcome()),
    renameNode: vi.fn(async () => makeAppliedOutcome()),
    deleteNode: vi.fn(async () => makeAppliedOutcome()),
    createGroup: vi.fn(async () => makeAppliedOutcome()),
    reorder: vi.fn(async () => makeAppliedOutcome()),
    reparent: vi.fn(async () => makeAppliedOutcome()),
  } satisfies LayerManagerUiActions["commands"]

  const actions: LayerManagerUiActions = {
    beginInteraction: vi.fn(),
    endInteraction: vi.fn(),
    toggleExpanded: vi.fn(),
    toggleVisibilityNode: vi.fn(async () => makeAppliedOutcome()),
    toggleLockNode: vi.fn(async () => makeAppliedOutcome()),
    renameNode: vi.fn(async () => makeAppliedOutcome()),
    deleteNode: vi.fn(async () => makeAppliedOutcome()),
    createGroupFromNodeIds: vi.fn(async () => makeAppliedOutcome()),
    reorderFromNodeIds: vi.fn(async () => makeAppliedOutcome()),
    reparentFromNodeIds: vi.fn(async () => makeAppliedOutcome()),
    commands: commandSpies,
    ...overrides,
  }

  return {
    actions,
    commandSpies,
  }
}

const flattenElements = (root: FakeDomElement): FakeDomElement[] => {
  const all: FakeDomElement[] = []

  const walk = (element: FakeDomElement): void => {
    all.push(element)

    for (const child of element.children) {
      walk(child)
    }
  }

  walk(root)
  return all
}

const findButtonWithPrefix = (root: FakeDomElement, prefix: string): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find(
    (element) =>
      element.tagName === "BUTTON" &&
      typeof element.textContent === "string" &&
      element.textContent.startsWith(prefix),
  )
}

const findButtonByExactText = (root: FakeDomElement, label: string): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find((element) => element.tagName === "BUTTON" && element.textContent === label)
}

const findInteractiveRowByLabel = (
  root: FakeDomElement,
  labelPrefix: string,
): FakeDomElement | undefined => {
  const elements = flattenElements(root)

  const label = elements.find(
    (element) =>
      element.tagName === "SPAN" &&
      typeof element.textContent === "string" &&
      element.textContent.startsWith(labelPrefix),
  )

  if (!label) {
    return undefined
  }

  const parent = label.parentElement
  if (!parent) {
    return undefined
  }

  if (parent.tagName !== "DIV" || parent.style["cursor"] !== "pointer") {
    return undefined
  }

  return parent
}

const findFirstSelect = (root: FakeDomElement): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find((element) => element.tagName === "SELECT")
}

const getContentRoot = (contentEl: FakeDomElement): FakeDomElement => {
  const root = contentEl.children[0]
  if (!root) {
    throw new Error("Expected sidepanel content root to exist.")
  }

  return root
}

const dispatchKeydown = (receiver: FakeDomElement, key: string): void => {
  receiver.dispatchEvent(
    new FakeDomEvent("keydown", {
      key,
    }),
  )
}

const flushAsync = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const cloneSettings = (settings: ScriptSettings): ScriptSettings => {
  return structuredClone(settings)
}

describe("sidepanel quick-move + persistence integration", () => {
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

  it("loads persisted last-move destination and persists root move via keyboard", async () => {
    let settings: ScriptSettings = {
      lmx_persist_last_move_destination: {
        value: true,
      },
      lmx_last_move_destination: {
        value: {
          kind: "preset",
          targetParentPath: ["G"],
          targetFrameId: null,
          label: "Inside G",
        },
      },
    }

    const setScriptSettings = vi.fn(async (nextSettings: ScriptSettings) => {
      settings = cloneSettings(nextSettings)
    })

    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions, commandSpies } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => settings,
      setScriptSettings,
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    const model: RenderViewModel = {
      tree: [makeElementNode("A"), makeGroupNode("G", [makeElementNode("B")])],
      selectedIds: new Set(["A"]),
      sceneVersion: 10,
      actions,
    }

    renderer.render(model)

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    const repeatButton = findButtonWithPrefix(contentRoot, "↺ Last:")
    if (!repeatButton) {
      throw new Error("Expected repeat-last-move button to exist.")
    }

    repeatButton.click()
    await flushAsync()

    expect(commandSpies.reparent).toHaveBeenNthCalledWith(1, {
      elementIds: ["A"],
      sourceGroupId: null,
      targetParentPath: ["G"],
      targetFrameId: null,
    })

    dispatchKeydown(contentRoot, "u")
    await flushAsync()

    expect(commandSpies.reparent).toHaveBeenNthCalledWith(2, {
      elementIds: ["A"],
      sourceGroupId: null,
      targetParentPath: [],
      targetFrameId: null,
    })

    expect(setScriptSettings).toHaveBeenCalled()

    const lastSettings = setScriptSettings.mock.calls.at(-1)?.[0] as ScriptSettings | undefined
    expect(lastSettings?.["lmx_persist_last_move_destination"]?.value).toBe(true)

    const destinationPayload = lastSettings?.["lmx_last_move_destination"]?.value as
      | { readonly kind?: string }
      | null
      | undefined

    expect(destinationPayload?.kind).toBe("root")
  })

  it("drops stale persisted last-move destinations from runtime state and persisted settings", async () => {
    let settings: ScriptSettings = {
      lmx_persist_last_move_destination: {
        value: true,
      },
      lmx_last_move_destination: {
        value: {
          kind: "preset",
          targetParentPath: ["missing"],
          targetFrameId: null,
          label: "Inside missing",
        },
      },
    }

    const setScriptSettings = vi.fn(async (nextSettings: ScriptSettings) => {
      settings = cloneSettings(nextSettings)
    })

    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => settings,
      setScriptSettings,
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    const model: RenderViewModel = {
      tree: [makeElementNode("A"), makeGroupNode("G", [makeElementNode("B")])],
      selectedIds: new Set(["A"]),
      sceneVersion: 11,
      actions,
    }

    renderer.render(model)
    await flushAsync()

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    expect(findButtonWithPrefix(contentRoot, "↺ Last:")).toBeUndefined()

    expect(setScriptSettings).toHaveBeenCalledTimes(1)
    const correctedSettings = setScriptSettings.mock.calls[0]?.[0] as ScriptSettings | undefined
    expect(correctedSettings?.["lmx_persist_last_move_destination"]?.value).toBe(true)
    expect(correctedSettings?.["lmx_last_move_destination"]?.value).toBeNull()
    expect(settings["lmx_last_move_destination"]?.value).toBeNull()
  })

  it("keeps quick-move root/dropdown controls and toolbar actions wired", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions, commandSpies } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [
        makeElementNode("A"),
        makeGroupNode("G1", [makeElementNode("B")]),
        makeGroupNode("G2", [makeElementNode("C")]),
        makeGroupNode("G3", [makeElementNode("D")]),
        makeGroupNode("G4", [makeElementNode("E")]),
        makeGroupNode("G5", [makeElementNode("F")]),
      ],
      selectedIds: new Set(["A"]),
      sceneVersion: 12,
      actions,
    })

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    const rootButton = findButtonByExactText(contentRoot, "Root")
    const moveButton = findButtonByExactText(contentRoot, "Move")
    const presetSelect = findFirstSelect(contentRoot)

    if (!rootButton || !moveButton || !presetSelect) {
      throw new Error("Expected quick-move root/dropdown controls to exist.")
    }

    const reorderButton = findButtonByExactText(contentRoot, "Bring to front")
    if (!reorderButton) {
      throw new Error("Expected toolbar reorder button to exist.")
    }

    reorderButton.click()
    await flushAsync()

    expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["el:A"], "front")

    rootButton.click()
    await flushAsync()

    expect(commandSpies.reparent).toHaveBeenCalledWith({
      elementIds: ["A"],
      sourceGroupId: null,
      targetParentPath: [],
      targetFrameId: null,
    })

    const firstPresetOption = presetSelect.children.find(
      (child) => child.tagName === "OPTION" && child.value.length > 0,
    )

    if (!firstPresetOption) {
      throw new Error("Expected at least one selectable quick-move preset option.")
    }

    presetSelect.value = firstPresetOption.value
    presetSelect.dispatchEvent(new FakeDomEvent("change"))
    moveButton.click()
    await flushAsync()

    const reparentMock = vi.mocked(commandSpies.reparent)
    const latestReparentCall = reparentMock.mock.calls.at(-1)?.[0] as
      | {
          readonly elementIds: readonly string[]
          readonly sourceGroupId: string | null
          readonly targetParentPath: readonly string[]
          readonly targetFrameId: string | null
        }
      | undefined

    expect(latestReparentCall?.elementIds).toEqual(["A"])
    expect(latestReparentCall?.sourceGroupId).toBeNull()
    expect(latestReparentCall?.targetParentPath.length ?? 0).toBeGreaterThan(0)
    expect(latestReparentCall?.targetFrameId).toBeNull()
  })

  it("keeps rapid settings toggles consistent while async writes are inflight", async () => {
    let settings: ScriptSettings = {
      lmx_persist_last_move_destination: {
        value: false,
      },
      lmx_last_move_destination: {
        value: null,
      },
    }

    const pendingWriteResolvers: Array<() => void> = []

    const setScriptSettings = vi.fn((nextSettings: ScriptSettings) => {
      return new Promise<void>((resolve) => {
        pendingWriteResolvers.push(() => {
          settings = cloneSettings(nextSettings)
          resolve()
        })
      })
    })

    const sidepanelTab = makeSidepanelTab(fakeDocument, null)

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => settings,
      setScriptSettings,
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A")],
      selectedIds: new Set(),
      sceneVersion: 4,
    })

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    const rememberButton = findButtonByExactText(contentRoot, "Remember last move: off")
    if (!rememberButton) {
      throw new Error("Expected remember-last-move toggle button to exist.")
    }

    rememberButton.click()
    expect(rememberButton.disabled).toBe(true)
    expect(rememberButton.textContent).toBe("Remember last move: off")

    rememberButton.click()
    expect(setScriptSettings).toHaveBeenCalledTimes(1)

    while (pendingWriteResolvers.length > 0) {
      const resolveNext = pendingWriteResolvers.shift()
      resolveNext?.()
      await flushAsync()
    }

    await flushAsync()

    expect(setScriptSettings).toHaveBeenCalledTimes(1)
    expect(rememberButton.disabled).toBe(false)
    expect(rememberButton.textContent).toBe("Remember last move: on")

    const lastWrittenSettings = setScriptSettings.mock.calls.at(-1)?.[0] as
      | ScriptSettings
      | undefined
    expect(lastWrittenSettings?.["lmx_persist_last_move_destination"]?.value).toBe(true)
    expect(settings["lmx_persist_last_move_destination"]?.value).toBe(true)
  })

  it("keeps remember-last-move toggle honest when async persistence fails", async () => {
    const settings: ScriptSettings = {
      lmx_persist_last_move_destination: {
        value: false,
      },
      lmx_last_move_destination: {
        value: null,
      },
    }

    const notices: string[] = []
    const setScriptSettings = vi.fn(async () => {
      throw new Error("disk full")
    })

    const sidepanelTab = makeSidepanelTab(fakeDocument, null)

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => settings,
      setScriptSettings,
      obsidian: {
        Notice: class {
          constructor(message: string) {
            notices.push(message)
          }
        },
      },
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A")],
      selectedIds: new Set(),
      sceneVersion: 5,
    })

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    const rememberButton = findButtonByExactText(contentRoot, "Remember last move: off")
    if (!rememberButton) {
      throw new Error("Expected remember-last-move toggle button to exist.")
    }

    rememberButton.click()
    expect(rememberButton.disabled).toBe(true)
    expect(rememberButton.textContent).toBe("Remember last move: off")

    await flushAsync()

    expect(rememberButton.disabled).toBe(false)
    expect(rememberButton.textContent).toBe("Remember last move: off")
    expect(setScriptSettings).toHaveBeenCalledTimes(1)
    expect(settings["lmx_persist_last_move_destination"]?.value).toBe(false)
    expect(notices).toContain("Failed to persist last-move preference.")
    expect(notices).toContain("Remember-last-move preference did not persist.")
    expect(notices).not.toContain("Last move destination will persist across restarts.")
  })

  it("reverts last-move destination runtime state when persisted destination write fails", async () => {
    let settings: ScriptSettings = {
      lmx_persist_last_move_destination: {
        value: true,
      },
      lmx_last_move_destination: {
        value: {
          kind: "root",
          targetFrameId: null,
        },
      },
    }

    const notices: string[] = []
    const setScriptSettings = vi.fn<(nextSettings: ScriptSettings) => Promise<void>>()
    setScriptSettings.mockResolvedValue(undefined)
    setScriptSettings.mockImplementationOnce((nextSettings: ScriptSettings) => {
      settings = cloneSettings(nextSettings)
      return Promise.resolve()
    })
    setScriptSettings.mockImplementation(async (_nextSettings: ScriptSettings) => {
      throw new Error("disk full")
    })

    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions, commandSpies } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => settings,
      setScriptSettings,
      obsidian: {
        Notice: class {
          constructor(message: string) {
            notices.push(message)
          }
        },
      },
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A"), makeGroupNode("G", [makeElementNode("B")])],
      selectedIds: new Set(["A"]),
      sceneVersion: 6,
      actions,
    })

    await flushAsync()

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    const repeatButtonBefore = findButtonWithPrefix(contentRoot, "↺ Last:")
    if (!repeatButtonBefore) {
      throw new Error("Expected repeat-last-move button to exist.")
    }

    dispatchKeydown(contentRoot, "u")
    await flushAsync()

    expect(commandSpies.reparent).toHaveBeenCalledWith({
      elementIds: ["A"],
      sourceGroupId: null,
      targetParentPath: [],
      targetFrameId: null,
    })

    expect(settings["lmx_last_move_destination"]?.value).toEqual({
      kind: "root",
      targetFrameId: null,
    })

    renderer.render({
      tree: [makeElementNode("A"), makeGroupNode("G", [makeElementNode("B")])],
      selectedIds: new Set(["A"]),
      sceneVersion: 7,
      actions,
    })

    const rerenderedRoot = getContentRoot(sidepanelTab.contentEl)
    const repeatButton = findButtonWithPrefix(rerenderedRoot, "↺ Last:")
    expect(repeatButton?.textContent).toContain("Canvas root")
  })

  it("reverts remembered-destination reconciliation in the UI when persistence fails", async () => {
    const settings: ScriptSettings = {
      lmx_persist_last_move_destination: {
        value: true,
      },
      lmx_last_move_destination: {
        value: {
          kind: "preset",
          targetParentPath: ["G"],
          targetFrameId: null,
          label: "Inside old label",
        },
      },
    }

    const notices: string[] = []
    const setScriptSettings = vi.fn(async () => {
      throw new Error("disk full")
    })

    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => settings,
      setScriptSettings,
      obsidian: {
        Notice: class {
          constructor(message: string) {
            notices.push(message)
          }
        },
      },
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A"), makeGroupNode("G", [makeElementNode("B")])],
      selectedIds: new Set(["A"]),
      sceneVersion: 9,
      actions,
    })

    await flushAsync()
    await flushAsync()

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    const repeatButton = findButtonWithPrefix(contentRoot, "↺ Last:")
    expect(repeatButton?.textContent).toContain("Inside G")
    expect(repeatButton?.textContent).not.toContain("Renamed Group")
    expect(notices).toContain("Failed to persist last move destination.")
    expect(notices).toContain(
      "Remembered last-move destination reverted because reconciliation could not persist.",
    )
  })

  it("replays remembered-destination reconciliation after rerender while a prior reconcile is inflight", async () => {
    let settings: ScriptSettings = {
      lmx_persist_last_move_destination: {
        value: true,
      },
      lmx_last_move_destination: {
        value: {
          kind: "preset",
          targetParentPath: ["G"],
          targetFrameId: null,
          label: "Inside old label",
        },
      },
    }

    const pendingResolvers: Array<() => void> = []
    const setScriptSettings = vi.fn((nextSettings: ScriptSettings) => {
      return new Promise<void>((resolve) => {
        pendingResolvers.push(() => {
          settings = cloneSettings(nextSettings)
          resolve()
        })
      })
    })

    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => settings,
      setScriptSettings,
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A"), makeGroupNode("G", [makeElementNode("B")])],
      selectedIds: new Set(["A"]),
      sceneVersion: 20,
      actions,
    })

    await flushAsync()

    renderer.render({
      tree: [
        makeElementNode("A"),
        makeGroupNode("G", [makeElementNode("B")], true, "Renamed Group"),
      ],
      selectedIds: new Set(["A"]),
      sceneVersion: 21,
      actions,
    })

    await flushAsync()

    expect(settings["lmx_last_move_destination"]?.value).toEqual({
      kind: "preset",
      targetParentPath: ["G"],
      targetFrameId: null,
      label: "Inside old label",
    })

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    const repeatButton = findButtonWithPrefix(contentRoot, "↺ Last:")
    expect(repeatButton?.textContent).toContain("Inside Renamed Gr")

    while (pendingResolvers.length > 0) {
      const resolveNext = pendingResolvers.shift()
      resolveNext?.()
      await flushAsync()
    }
  })

  it("notifies when incompatible row drop is rejected before planner execution", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const notices: string[] = []
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      obsidian: {
        Notice: class {
          constructor(message: string) {
            notices.push(message)
          }
        },
      },
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A"), makeElementNode("B")],
      selectedIds: new Set(),
      sceneVersion: 8,
      actions,
    })

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    const sourceRow = findInteractiveRowByLabel(contentRoot, "[element] A")
    const targetRow = findInteractiveRowByLabel(contentRoot, "[element] B")

    if (!sourceRow || !targetRow) {
      throw new Error("Expected source and target rows.")
    }

    sourceRow.dispatchEvent(new FakeDomEvent("dragstart"))
    targetRow.dispatchEvent(new FakeDomEvent("drop"))
    await flushAsync()

    expect(notices).toContain("Drop target is not compatible for this move.")
    expect(actions.reparentFromNodeIds).not.toHaveBeenCalled()
  })
})
