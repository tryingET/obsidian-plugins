import type { LayerNode } from "../model/tree.js"
import {
  ConsoleRenderer,
  type LayerManagerRenderer,
  type LayerManagerUiActions,
  type RenderViewModel,
} from "./renderer.js"
import { SidepanelSelectionActionController } from "./sidepanel/actions/selectionActionController.js"
import {
  type DragDropBranchContext,
  type DragDropDestination,
  type NodeDropTarget,
  SidepanelDragDropController,
} from "./sidepanel/dragdrop/dragDropController.js"
import { SidepanelFocusOwnershipCoordinator } from "./sidepanel/focus/focusOwnershipCoordinator.js"
import {
  type KeyboardShortcutContext,
  type ResolvedSelection,
  SidepanelKeyboardShortcutController,
} from "./sidepanel/keyboard/keyboardShortcutController.js"
import {
  type SidepanelMountHostLike,
  SidepanelMountManager,
  type SidepanelMountTabLike,
} from "./sidepanel/mount/sidepanelMountManager.js"
import { SidepanelPromptInteractionService } from "./sidepanel/prompt/promptInteractionService.js"
import { makePresetKey, makePresetLabel } from "./sidepanel/quickmove/presetHelpers.js"
import {
  type LastQuickMoveDestination,
  SidepanelQuickMovePersistenceService,
} from "./sidepanel/quickmove/quickMovePersistenceService.js"
import { SidepanelInlineRenameController } from "./sidepanel/rename/inlineRenameController.js"
import { renderSidepanelQuickMove } from "./sidepanel/render/quickMoveRenderer.js"
import { bindSidepanelRowInteractions } from "./sidepanel/render/rowInteractionBinder.js"
import {
  type SidepanelFilterMatchKind,
  buildSidepanelRowFilterResult,
  resolveSidepanelRowVisualState,
} from "./sidepanel/render/rowModel.js"
import {
  type SidepanelInlineRenameRenderState,
  renderSidepanelRow,
} from "./sidepanel/render/rowRenderer.js"
import { renderSidepanelRowTree } from "./sidepanel/render/rowTreeRenderer.js"
import { renderSidepanelToolbar } from "./sidepanel/render/toolbarRenderer.js"
import { SidepanelHostSelectionBridge } from "./sidepanel/selection/hostSelectionBridge.js"
import { ensureHostViewContext } from "./sidepanel/selection/hostViewContext.js"
import {
  collectVisibleNodeContext,
  resolveSelectedNodes,
} from "./sidepanel/selection/nodeContext.js"
import { haveSameIdsInSameOrder } from "./sidepanel/selection/selectionIds.js"
import { reconcileSelectedElementIds } from "./sidepanel/selection/selectionReconciler.js"
import {
  type ScriptSettingsLike,
  SidepanelSettingsWriteQueue,
} from "./sidepanel/settings/settingsWriteQueue.js"

type SidepanelTabLike = SidepanelMountTabLike

interface ObsidianLike {
  Notice?: new (message: string, timeout?: number) => unknown
  getIcon?: (iconName: string) => HTMLElement | null
}

interface SelectedElementLike {
  readonly id: string
}

export interface ExcalidrawSidepanelHost extends SidepanelMountHostLike {
  persistSidepanelTab?: () => SidepanelTabLike | null
  getViewSelectedElements?: () => readonly SelectedElementLike[]
  setView?: (view?: unknown, reveal?: boolean) => unknown
  targetView?: unknown | null
  selectElementsInView?: (ids: string[]) => void
  getExcalidrawAPI?: () => unknown
  getScriptSettings?: () => ScriptSettingsLike
  setScriptSettings?: (settings: ScriptSettingsLike) => Promise<void> | void
  obsidian?: ObsidianLike
}

const SIDEPANEL_TITLE = "Layer Manager"
const INDENT_STEP_PX = 12
const QUICK_PRESET_INLINE_MAX = 4
const QUICK_PRESET_TOTAL_MAX = 24
const ALL_DESTINATION_TOTAL_MAX = 64
const LAST_MOVE_LABEL_MAX = 26
const KEYBOARD_PROMPT_SUPPRESSION_MS = 160
const FOCUSOUT_SUPPRESSION_WINDOW_MS = 420
const KEYBOARD_STICKY_CAPTURE_MS = 1400
const ROW_MIN_HEIGHT_PX = 22
const ROW_FONT_SIZE_PX = 11
const ICON_SIZE_PX = 14
const ICON_BUTTON_SIZE_PX = 18
const TOOLBAR_FONT_SIZE_PX = 11
const SIDEPANEL_LIFECYCLE_DEBUG_FLAG = "LMX_DEBUG_SIDEPANEL_LIFECYCLE"
const SIDEPANEL_INTERACTION_DEBUG_FLAG = "LMX_DEBUG_SIDEPANEL_INTERACTION"

const ROW_STYLE_CONFIG = {
  indentStepPx: INDENT_STEP_PX,
  rowMinHeightPx: ROW_MIN_HEIGHT_PX,
  rowFontSizePx: ROW_FONT_SIZE_PX,
  iconButtonSizePx: ICON_BUTTON_SIZE_PX,
  iconSizePx: ICON_SIZE_PX,
} as const

const hasDom = (): boolean => {
  return typeof document !== "undefined"
}

const intersectsSelectedIds = (node: LayerNode, selectedIds: ReadonlySet<string>): boolean => {
  for (const elementId of node.elementIds) {
    if (selectedIds.has(elementId)) {
      return true
    }
  }

  return false
}

const runUiAction = (
  action: () => Promise<unknown>,
  onError: (message: string) => void,
  fallbackMessage: string,
): void => {
  void action().catch((error: unknown) => {
    if (error instanceof Error) {
      onError(`${fallbackMessage}: ${error.message}`)
      return
    }

    onError(fallbackMessage)
  })
}

const isTextInputTarget = (target: EventTarget | null): boolean => {
  if (!target || typeof target !== "object" || !("tagName" in target)) {
    return false
  }

  const rawTagName = (target as { readonly tagName?: unknown }).tagName
  if (typeof rawTagName !== "string") {
    return false
  }

  const tagName = rawTagName.toLowerCase()
  return tagName === "input" || tagName === "textarea" || tagName === "select"
}

class ExcalidrawSidepanelRenderer implements LayerManagerRenderer {
  readonly #host: ExcalidrawSidepanelHost
  readonly #fallbackRenderer: LayerManagerRenderer = new ConsoleRenderer()

  readonly #mountManager: SidepanelMountManager
  readonly #keyboardController: SidepanelKeyboardShortcutController
  readonly #inlineRenameController: SidepanelInlineRenameController
  readonly #dragDropController: SidepanelDragDropController
  readonly #settingsWriteQueue: SidepanelSettingsWriteQueue
  readonly #quickMovePersistenceService: SidepanelQuickMovePersistenceService
  readonly #promptInteractionService: SidepanelPromptInteractionService
  readonly #selectionActionController: SidepanelSelectionActionController
  readonly #hostSelectionBridge: SidepanelHostSelectionBridge
  readonly #focusOwnership = new SidepanelFocusOwnershipCoordinator({
    focusOutSuppressionWindowMs: FOCUSOUT_SUPPRESSION_WINDOW_MS,
    keyboardStickyCaptureMs: KEYBOARD_STICKY_CAPTURE_MS,
  })
  #contentRoot: HTMLElement | null = null
  #latestModel: RenderViewModel | null = null
  #focusedNodeId: string | null = null
  #keyboardContext: KeyboardShortcutContext | null = null
  #didPersistTab = false
  #keyboardSuppressedUntilMs = 0
  #ownerDocumentWithKeyCapture: Document | null = null
  #selectionOverrideElementIds: readonly string[] | null = null
  #lastSnapshotSelectionIds: readonly string[] = []
  #rowFilterQuery = ""
  #shouldAutofocusRowFilterInput = false

  readonly #contentKeydownHandler = (event: KeyboardEvent): void => {
    this.#focusOwnership.activateKeyboardCapture()
    this.#keyboardController.handleContentKeydown(event)
  }

  readonly #documentKeydownHandler = (event: KeyboardEvent): void => {
    if (!this.#focusOwnership.isKeyboardRoutingActive()) {
      return
    }

    const contentRoot = this.#contentRoot
    if (!contentRoot) {
      return
    }

    const eventTarget = event.target
    const hasNodeType =
      !!eventTarget &&
      typeof eventTarget === "object" &&
      (eventTarget as unknown as { readonly nodeType?: unknown }).nodeType !== undefined

    if (hasNodeType && contentRoot.contains(eventTarget as Node)) {
      return
    }

    if (isTextInputTarget(eventTarget)) {
      return
    }

    this.focusContentRootImmediate()
    this.#focusOwnership.activateKeyboardCapture()

    this.#keyboardController.handleContentKeydown(event)
  }

  readonly #contentFocusOutHandler = (event: FocusEvent): void => {
    if (this.#focusOwnership.isFocusOutSuppressed()) {
      this.debugInteraction("content focusout suppressed")
      return
    }

    this.#focusOwnership.handleContentFocusOut({
      contentRoot: this.#contentRoot,
      relatedTarget: event.relatedTarget,
      isContentRootCurrent: (contentRoot) => this.#contentRoot === contentRoot,
      onConfirmedFocusOut: () => {
        this.#keyboardController.handleContentFocusOut(event, this.#contentRoot)
      },
    })
  }

  readonly #contentFocusInHandler = (): void => {
    this.#focusOwnership.cancelPendingFocusOut()
    this.#focusOwnership.activateKeyboardCapture()
    this.debugInteraction("content focusin", {
      keyboardCaptureActive: this.#focusOwnership.isKeyboardCaptureActive(),
      focusedNodeId: this.#focusedNodeId,
    })
  }

  readonly #contentPointerDownHandler = (): void => {
    this.#focusOwnership.cancelPendingFocusOut()
    this.#focusOwnership.activateKeyboardCapture()
    this.debugInteraction("content pointerdown", {
      keyboardCaptureActive: this.#focusOwnership.isKeyboardCaptureActive(),
      focusedNodeId: this.#focusedNodeId,
    })
  }

  constructor(host: ExcalidrawSidepanelHost) {
    this.#host = host
    this.#settingsWriteQueue = new SidepanelSettingsWriteQueue({
      ...(host.getScriptSettings ? { getScriptSettings: host.getScriptSettings } : {}),
      ...(host.setScriptSettings ? { setScriptSettings: host.setScriptSettings } : {}),
      notify: (message) => {
        this.notify(message)
      },
    })
    this.#quickMovePersistenceService = new SidepanelQuickMovePersistenceService({
      ...(host.getScriptSettings ? { getScriptSettings: host.getScriptSettings } : {}),
      settingsWriteQueue: this.#settingsWriteQueue,
    })

    this.#promptInteractionService = new SidepanelPromptInteractionService({
      getOwnerDocument: () => this.#contentRoot?.ownerDocument ?? null,
      notify: (message) => {
        this.notify(message)
      },
      suppressKeyboardAfterPrompt: () => {
        this.suppressKeyboardAfterPrompt()
      },
      setShouldAutofocusContentRoot: (value) => {
        this.#focusOwnership.setShouldAutofocusContentRoot(value)
      },
      focusContentRoot: () => {
        this.focusContentRootBestEffort()
      },
    })

    this.#selectionActionController = new SidepanelSelectionActionController({
      notify: (message) => {
        this.notify(message)
      },
      promptService: this.#promptInteractionService,
      setLastQuickMoveDestination: (destination) => {
        this.setLastQuickMoveDestination(destination)
      },
    })

    this.#hostSelectionBridge = new SidepanelHostSelectionBridge({
      host,
      suppressContentFocusOut: () => {
        this.suppressContentFocusOut()
      },
    })

    this.#mountManager = new SidepanelMountManager({
      host,
      title: SIDEPANEL_TITLE,
      notify: (message) => {
        this.notify(message)
      },
      debugLifecycle: (message) => {
        this.debugLifecycle(message)
      },
      onTabSwitched: () => {
        this.clearInteractiveBindings()
      },
      onAsyncTabResolved: () => {
        if (this.#latestModel) {
          this.render(this.#latestModel)
        }
      },
      onPersistedTabDetected: () => {
        this.#didPersistTab = true
      },
    })

    this.#inlineRenameController = new SidepanelInlineRenameController({
      notify: (message) => {
        this.notify(message)
      },
      requestRenderFromLatestModel: () => {
        this.requestRenderFromLatestModel()
      },
      setShouldAutofocusContentRoot: (value) => {
        this.#focusOwnership.setShouldAutofocusContentRoot(value)
      },
      focusContentRoot: () => {
        this.focusContentRootImmediate()
      },
      suppressNextContentFocusOut: () => {
        this.suppressContentFocusOut()
      },
      getFocusedNodeId: () => this.#focusedNodeId,
      getKeyboardCaptureActive: () => this.#focusOwnership.isKeyboardCaptureActive(),
      debugInteraction: (message, payload) => {
        this.debugInteraction(message, payload)
      },
    })

    this.#dragDropController = new SidepanelDragDropController({
      notify: (message) => {
        this.notify(message)
      },
      requestRenderFromLatestModel: () => {
        this.requestRenderFromLatestModel()
      },
    })

    this.#keyboardController = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => this.#keyboardContext,
      resolveKeyboardContext: (context) => this.resolveKeyboardContext(context),
      getFocusedNodeId: () => this.#focusedNodeId,
      setFocusedNodeIdSilently: (nodeId) => {
        this.#focusedNodeId = nodeId
      },
      setFocusedNode: (nodeId) => {
        this.setFocusedNode(nodeId)
      },
      getInlineRenameNodeId: () => this.#inlineRenameController.nodeId,
      beginInlineRename: (nodeId, initialValue) => {
        this.beginInlineRenameFromInteraction(nodeId, initialValue)
      },
      commitInlineRename: (actions, nodeId) =>
        this.#inlineRenameController.commitInlineRename(actions, nodeId),
      setSelectionOverride: (elementIds) => {
        this.setSelectionOverride(elementIds)
      },
      ensureHostViewContext: () => ensureHostViewContext(this.#host),
      ...(this.#host.selectElementsInView
        ? { selectElementsInView: this.#host.selectElementsInView }
        : {}),
      moveSelectionToRoot: (actions, selection) =>
        this.#selectionActionController.moveSelectionToRoot(actions, selection),
      setLastQuickMoveDestinationToRoot: () => {
        this.setLastQuickMoveDestination({
          kind: "root",
        })
      },
      isTextInputTarget,
      isKeyboardSuppressed: () => this.isKeyboardSuppressed(),
      releaseKeyboardCapture: () => {
        this.#focusOwnership.releaseKeyboardCapture()
      },
      suppressTransientFocusOut: () => {
        this.suppressContentFocusOut()
      },
      notify: (message) => {
        this.notify(message)
      },
      runUiAction: (action, fallbackMessage) => {
        runUiAction(action, (message) => this.notify(message), fallbackMessage)
      },
      requestRenderFromLatestModel: () => {
        this.requestRenderFromLatestModel()
      },
      debugInteraction: (message, payload) => {
        this.debugInteraction(message, payload)
      },
    })
  }

  render(model: RenderViewModel): void {
    this.#latestModel = model

    const contentRoot = this.ensureContentRoot()
    if (!contentRoot) {
      this.#fallbackRenderer.render(model)
      return
    }

    const ownerDocument = contentRoot.ownerDocument
    this.#quickMovePersistenceService.loadFromSettingsOnce()
    contentRoot.innerHTML = ""

    const selectedElementIds = this.resolveSelectedElementIds(model.selectedIds)
    const selectedIdSet = new Set(selectedElementIds)

    const resolvedSelection: ResolvedSelection = {
      elementIds: selectedElementIds,
      nodes: resolveSelectedNodes(model.tree, selectedElementIds),
    }

    const rowFilter = buildSidepanelRowFilterResult(model.tree, this.#rowFilterQuery)
    const renderTree = rowFilter.tree
    const { visibleNodes, parentById } = collectVisibleNodeContext(renderTree)
    const activeElement = ownerDocument.activeElement
    const hasKeyboardOwnership =
      this.#focusOwnership.shouldAutofocusContentRoot ||
      !!(activeElement && contentRoot.contains(activeElement as HTMLElement))

    if (hasKeyboardOwnership) {
      this.activateKeyboardCapture()
    }

    if (visibleNodes.length === 0) {
      this.#focusedNodeId = null
    } else if (
      this.#focusedNodeId &&
      !visibleNodes.some((node) => node.id === this.#focusedNodeId)
    ) {
      this.#focusedNodeId = hasKeyboardOwnership ? (visibleNodes[0]?.id ?? null) : null
    } else if (!this.#focusedNodeId && hasKeyboardOwnership) {
      this.#focusedNodeId = visibleNodes[0]?.id ?? null
    }

    const activeTagName =
      activeElement && typeof activeElement === "object" && "tagName" in activeElement
        ? `${(activeElement as { readonly tagName?: unknown }).tagName ?? ""}`
        : null

    this.debugInteraction("render ownership", {
      sceneVersion: model.sceneVersion,
      hasKeyboardOwnership,
      keyboardCaptureActive: this.#focusOwnership.isKeyboardCaptureActive(),
      shouldAutofocusContentRoot: this.#focusOwnership.shouldAutofocusContentRoot,
      focusedNodeId: this.#focusedNodeId,
      activeTagName,
      visibleNodeCount: visibleNodes.length,
      selectedElementCount: selectedElementIds.length,
      filterActive: rowFilter.active,
      filterQuery: rowFilter.query,
    })

    if (model.actions) {
      const nodeById = new Map<string, LayerNode>()
      for (const node of visibleNodes) {
        nodeById.set(node.id, node)
      }

      this.#keyboardContext = {
        actions: model.actions,
        selection: resolvedSelection,
        visibleNodes,
        nodeById,
        parentById,
      }
    } else {
      this.#keyboardContext = null
    }

    const header = ownerDocument.createElement("div")
    header.style.fontWeight = "600"
    header.style.marginBottom = "4px"
    header.textContent = `Layer Manager · v${model.sceneVersion}`
    contentRoot.appendChild(header)

    const info = ownerDocument.createElement("div")
    info.style.opacity = "0.75"
    info.style.fontSize = "12px"
    info.style.marginBottom = "4px"
    info.textContent = rowFilter.active
      ? `Filtered rows: ${rowFilter.renderedRowCount} of ${rowFilter.searchableRowCount} searchable · Selected elements: ${selectedElementIds.length}`
      : `Visible rows: ${rowFilter.renderedRowCount} of ${rowFilter.searchableRowCount} searchable · Selected elements: ${selectedElementIds.length}`
    contentRoot.appendChild(info)

    const keyboardHint = ownerDocument.createElement("div")
    keyboardHint.style.opacity = "0.65"
    keyboardHint.style.fontSize = "11px"
    keyboardHint.style.marginBottom = "8px"
    keyboardHint.textContent =
      "Shortcuts: ↑/↓ focus · Shift+↑/↓ extend selection · ←/→ collapse/expand · Enter rename · Del delete · F/G/U structural"
    contentRoot.appendChild(keyboardHint)

    this.renderRowFilterControls(contentRoot, ownerDocument, rowFilter)

    renderSidepanelToolbar({
      container: contentRoot,
      ownerDocument,
      hasActions: !!model.actions,
      selectedElementCount: resolvedSelection.elementIds.length,
      canPersistTab: !!this.#host.persistSidepanelTab,
      didPersistTab: this.#didPersistTab,
      canCloseTab:
        this.#mountManager.mountCapabilities?.canClose ??
        (!!this.#host.closeSidepanelTab || !!this.#host.sidepanelTab?.close),
      canPersistLastMovePreference: this.#quickMovePersistenceService.canPersistSettings,
      persistLastMoveAcrossRestarts:
        this.#quickMovePersistenceService.persistLastMoveAcrossRestarts,
      createToolbarButton: (nextOwnerDocument, label, action) =>
        this.createToolbarButton(nextOwnerDocument, label, action),
      onGroupSelected: async () => {
        if (!model.actions) {
          return
        }

        await this.#selectionActionController.groupSelected(
          model.actions,
          resolvedSelection.elementIds,
        )
      },
      onBringSelectedToFront: async () => {
        if (!model.actions) {
          return
        }

        await this.#selectionActionController.reorderSelected(
          model.actions,
          resolvedSelection.elementIds,
        )
      },
      onUngroupLikeSelection: async () => {
        if (!model.actions) {
          return
        }

        await this.#selectionActionController.ungroupLikeSelection(model.actions, resolvedSelection)
      },
      onTogglePersistLastMoveAcrossRestarts: (nextPreference) => {
        this.#quickMovePersistenceService.setPersistLastMoveAcrossRestarts(nextPreference)
      },
      onNotify: (message) => {
        this.notify(message)
      },
      onPersistTab: () => {
        const persistedTab = this.#host.persistSidepanelTab?.()
        if (!persistedTab) {
          return false
        }

        this.#didPersistTab = true
        this.#mountManager.adoptPersistedTab(persistedTab)
        return true
      },
      onCloseTab: () => {
        if (this.#host.closeSidepanelTab) {
          this.#host.closeSidepanelTab()
        } else {
          this.#host.sidepanelTab?.close?.()
        }

        this.#mountManager.resetAfterClose()
        this.clearInteractiveBindings()
      },
    })

    renderSidepanelQuickMove({
      container: contentRoot,
      ownerDocument,
      hasActions: !!model.actions,
      tree: model.tree,
      selection: resolvedSelection,
      lastQuickMoveDestination: this.#quickMovePersistenceService.lastQuickMoveDestination,
      recentQuickMoveDestinations: this.#quickMovePersistenceService.recentQuickMoveDestinations,
      quickPresetInlineMax: QUICK_PRESET_INLINE_MAX,
      quickPresetTotalMax: QUICK_PRESET_TOTAL_MAX,
      allDestinationTotalMax: ALL_DESTINATION_TOTAL_MAX,
      lastMoveLabelMax: LAST_MOVE_LABEL_MAX,
      createToolbarButton: (nextOwnerDocument, label, action) =>
        this.createToolbarButton(nextOwnerDocument, label, action),
      onMoveSelectionToRoot: async () => {
        if (!model.actions) {
          return
        }

        await this.#selectionActionController.moveSelectionToRoot(model.actions, resolvedSelection)
      },
      onApplyGroupPreset: async (preset) => {
        if (!model.actions) {
          return
        }

        await this.#selectionActionController.applyGroupPreset(
          model.actions,
          resolvedSelection,
          preset,
        )
      },
      onNotify: (message) => {
        this.notify(message)
      },
    })

    const rows = ownerDocument.createElement("div")
    rows.style.display = "flex"
    rows.style.flexDirection = "column"
    rows.style.gap = "4px"
    contentRoot.appendChild(rows)

    if (renderTree.length === 0) {
      const emptyState = ownerDocument.createElement("div")
      emptyState.style.opacity = "0.75"
      emptyState.style.fontSize = "11px"
      emptyState.style.padding = "6px 0"
      emptyState.textContent = rowFilter.active
        ? `No rows match “${this.#rowFilterQuery.trim()}”.`
        : "No layer rows available."
      rows.appendChild(emptyState)
    } else {
      this.renderNodes(
        rows,
        renderTree,
        0,
        selectedIdSet,
        model.actions,
        {
          frameId: null,
          groupPath: [],
        },
        rowFilter.matchKindByNodeId,
      )
    }

    this.autofocusContentRootIfNeeded(contentRoot)
  }

  private renderRowFilterControls(
    container: HTMLElement,
    ownerDocument: Document,
    rowFilter: ReturnType<typeof buildSidepanelRowFilterResult>,
  ): void {
    const controls = ownerDocument.createElement("div")
    controls.style.display = "flex"
    controls.style.alignItems = "center"
    controls.style.gap = "6px"
    controls.style.marginBottom = "6px"

    const searchInput = ownerDocument.createElement("input")
    searchInput.type = "text"
    searchInput.value = this.#rowFilterQuery
    searchInput.placeholder = "Search layer rows"
    searchInput.ariaLabel = "Search layer rows"
    searchInput.spellcheck = false
    searchInput.style.flex = "1"
    searchInput.style.minWidth = "0"
    searchInput.style.fontSize = "12px"
    searchInput.style.padding = "3px 6px"

    searchInput.addEventListener("click", (event) => {
      event.stopPropagation()
    })

    searchInput.addEventListener("input", () => {
      this.updateRowFilterQuery(searchInput.value, true)
    })

    searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      this.updateRowFilterQuery("", true)
    })

    controls.appendChild(searchInput)

    if (rowFilter.active) {
      const clearButton = this.createToolbarButton(ownerDocument, "Clear filter", async () => {
        this.updateRowFilterQuery("", true)
      })
      controls.appendChild(clearButton)
    }

    container.appendChild(controls)

    if (this.#shouldAutofocusRowFilterInput) {
      try {
        searchInput.focus()
      } catch {
        // no-op; best-effort focus restoration for live filtering
      }

      this.#shouldAutofocusRowFilterInput = false
    }
  }

  private updateRowFilterQuery(nextQuery: string, shouldAutofocusInput = false): void {
    this.#rowFilterQuery = nextQuery
    this.#shouldAutofocusRowFilterInput = shouldAutofocusInput
    this.requestRenderFromLatestModel()
  }

  notify(message: string): void {
    const Notice = this.#host.obsidian?.Notice
    if (Notice) {
      new Notice(message)
      return
    }

    console.log(`[LMX] ${message}`)
  }

  private resolveSelectedElementIds(snapshotSelectedIds: ReadonlySet<string>): readonly string[] {
    const snapshotSelection = [...snapshotSelectedIds]
    const selectionOverride = this.#selectionOverrideElementIds
    const snapshotSelectionChanged = !haveSameIdsInSameOrder(
      snapshotSelection,
      this.#lastSnapshotSelectionIds,
    )

    if (
      snapshotSelectionChanged &&
      selectionOverride &&
      snapshotSelection.length > 0 &&
      !haveSameIdsInSameOrder(selectionOverride, snapshotSelection)
    ) {
      this.#selectionOverrideElementIds = null
      this.#lastSnapshotSelectionIds = snapshotSelection

      this.debugInteraction("selection resolution", {
        source: "snapshotSupersedesStaleOverride",
        snapshotSize: snapshotSelection.length,
        overrideSize: selectionOverride.length,
        resolvedSize: snapshotSelection.length,
        clearSelectionOverride: true,
      })

      return snapshotSelection
    }

    const result = reconcileSelectedElementIds({
      snapshotSelection,
      selectionOverride,
      ...(this.#host.getViewSelectedElements
        ? { getViewSelectedElements: this.#host.getViewSelectedElements }
        : {}),
      hasSelectionBridge: !!this.#host.selectElementsInView,
      ensureHostViewContext: () => ensureHostViewContext(this.#host),
    })

    if (result.clearSelectionOverride) {
      this.#selectionOverrideElementIds = null
    }

    if (result.readErrorMessage) {
      this.debugInteraction("selection read failed", {
        errorMessage: result.readErrorMessage,
      })
    }

    this.debugInteraction("selection resolution", {
      source: result.source,
      snapshotSize: snapshotSelection.length,
      overrideSize: selectionOverride?.length ?? 0,
      resolvedSize: result.resolvedSelection.length,
      clearSelectionOverride: result.clearSelectionOverride,
    })

    this.#lastSnapshotSelectionIds = snapshotSelection
    return result.resolvedSelection
  }

  private autofocusContentRootIfNeeded(contentRoot: HTMLElement): void {
    this.#focusOwnership.autofocusContentRootIfNeeded(contentRoot, isTextInputTarget)
  }

  private setLastQuickMoveDestination(destination: LastQuickMoveDestination | null): void {
    this.#quickMovePersistenceService.setLastQuickMoveDestination(destination)
  }

  private isLifecycleDebugEnabled(): boolean {
    const runtime = globalThis as Record<string, unknown>
    return runtime[SIDEPANEL_LIFECYCLE_DEBUG_FLAG] === true
  }

  private debugLifecycle(message: string): void {
    if (!this.isLifecycleDebugEnabled()) {
      return
    }

    console.log(`[LMX:lifecycle] ${message}`)
  }

  private isInteractionDebugEnabled(): boolean {
    const runtime = globalThis as Record<string, unknown>
    return runtime[SIDEPANEL_INTERACTION_DEBUG_FLAG] === true
  }

  private debugInteraction(message: string, payload?: Record<string, unknown>): void {
    if (!this.isInteractionDebugEnabled()) {
      return
    }

    if (payload) {
      console.log(`[LMX:interaction] ${message}`, payload)
      return
    }

    console.log(`[LMX:interaction] ${message}`)
  }

  private attachOwnerDocumentKeyCapture(ownerDocument: Document): void {
    if (this.#ownerDocumentWithKeyCapture === ownerDocument) {
      return
    }

    this.detachOwnerDocumentKeyCapture()

    const addEventListener = (
      ownerDocument as unknown as {
        readonly addEventListener?: (
          type: string,
          listener: EventListenerOrEventListenerObject,
        ) => void
      }
    ).addEventListener

    if (!addEventListener) {
      return
    }

    addEventListener.call(ownerDocument, "keydown", this.#documentKeydownHandler as EventListener)
    this.#ownerDocumentWithKeyCapture = ownerDocument
  }

  private detachOwnerDocumentKeyCapture(): void {
    const ownerDocument = this.#ownerDocumentWithKeyCapture
    if (!ownerDocument) {
      return
    }

    const removeEventListener = (
      ownerDocument as unknown as {
        readonly removeEventListener?: (
          type: string,
          listener: EventListenerOrEventListenerObject,
        ) => void
      }
    ).removeEventListener

    if (removeEventListener) {
      removeEventListener.call(
        ownerDocument,
        "keydown",
        this.#documentKeydownHandler as EventListener,
      )
    }

    this.#ownerDocumentWithKeyCapture = null
  }

  private clearInteractiveBindings(): void {
    this.#contentRoot?.removeEventListener("keydown", this.#contentKeydownHandler)
    this.#contentRoot?.removeEventListener("focusout", this.#contentFocusOutHandler)
    this.#contentRoot?.removeEventListener("focusin", this.#contentFocusInHandler)
    this.#contentRoot?.removeEventListener("pointerdown", this.#contentPointerDownHandler)
    this.detachOwnerDocumentKeyCapture()
    this.#contentRoot = null
    this.#keyboardContext = null
    this.#focusedNodeId = null
    this.#selectionOverrideElementIds = null
    this.#lastSnapshotSelectionIds = []
    this.#focusOwnership.reset()
    this.#inlineRenameController.clear()
    this.#dragDropController.clear()
  }

  private ensureContentRoot(): HTMLElement | null {
    const mountPreparation = this.#mountManager.prepareMount({
      resolveExistingContentRoot: () => this.#contentRoot,
      onSetContentFailure: () => {
        this.notify("Failed to attach Layer Manager content to sidepanel tab.")
      },
    })

    if (mountPreparation.status !== "ready") {
      return null
    }

    const { mountStrategy, ownerDocument } = mountPreparation

    if (!this.#contentRoot || this.#contentRoot.ownerDocument !== ownerDocument) {
      this.#contentRoot?.removeEventListener("keydown", this.#contentKeydownHandler)
      this.#contentRoot?.removeEventListener("focusout", this.#contentFocusOutHandler)
      this.#contentRoot?.removeEventListener("focusin", this.#contentFocusInHandler)
      this.#contentRoot?.removeEventListener("pointerdown", this.#contentPointerDownHandler)
      this.#focusOwnership.cancelPendingFocusOut()

      const nextContentRoot = ownerDocument.createElement("div")
      nextContentRoot.style.display = "flex"
      nextContentRoot.style.flexDirection = "column"
      nextContentRoot.style.gap = "6px"
      nextContentRoot.style.padding = "8px"
      nextContentRoot.tabIndex = 0
      nextContentRoot.addEventListener("keydown", this.#contentKeydownHandler)
      nextContentRoot.addEventListener("focusout", this.#contentFocusOutHandler)
      nextContentRoot.addEventListener("focusin", this.#contentFocusInHandler)
      nextContentRoot.addEventListener("pointerdown", this.#contentPointerDownHandler)

      this.attachOwnerDocumentKeyCapture(ownerDocument)
      this.#contentRoot = nextContentRoot
      this.#focusOwnership.setShouldAutofocusContentRoot(true)
    }

    this.attachOwnerDocumentKeyCapture(ownerDocument)

    const attached = mountStrategy.attach(this.#contentRoot)
    if (!this.#mountManager.finalizeMountAttach(attached)) {
      return null
    }

    return this.#contentRoot
  }

  private requestRenderFromLatestModel(): void {
    if (this.#latestModel) {
      this.render(this.#latestModel)
    }
  }

  private setSelectionOverride(elementIds: readonly string[] | null): void {
    if (!elementIds || elementIds.length === 0) {
      this.#selectionOverrideElementIds = null
      this.debugInteraction("selection override cleared")
      return
    }

    this.#selectionOverrideElementIds = [...elementIds]
    this.debugInteraction("selection override updated", {
      size: this.#selectionOverrideElementIds.length,
    })
  }

  private beginInlineRename(nodeId: string, initialValue: string): void {
    this.cancelDeferredFocusRestore()
    this.#inlineRenameController.beginInlineRename(nodeId, initialValue)
  }

  private beginInlineRenameFromInteraction(nodeId: string, initialValue: string): void {
    this.activateKeyboardCapture()
    this.#focusedNodeId = nodeId
    this.suppressContentFocusOut()
    this.focusContentRootImmediate()
    this.beginInlineRename(nodeId, initialValue)
  }

  private updateInlineRenameDraft(nextDraft: string): void {
    this.#inlineRenameController.updateInlineRenameDraft(nextDraft)
  }

  private cancelInlineRename(): void {
    this.#inlineRenameController.cancelInlineRename()
  }

  private async commitInlineRename(actions: LayerManagerUiActions, nodeId: string): Promise<void> {
    await this.#inlineRenameController.commitInlineRename(actions, nodeId)
  }

  private resolveKeyboardContext(context: KeyboardShortcutContext): KeyboardShortcutContext {
    const latestModel = this.#latestModel
    if (!latestModel) {
      return context
    }

    const resolvedElementIds = this.resolveSelectedElementIds(new Set(context.selection.elementIds))
    if (haveSameIdsInSameOrder(resolvedElementIds, context.selection.elementIds)) {
      return context
    }

    return {
      ...context,
      selection: {
        elementIds: resolvedElementIds,
        nodes: resolveSelectedNodes(latestModel.tree, resolvedElementIds),
      },
    }
  }

  private suppressKeyboardAfterPrompt(): void {
    this.#keyboardSuppressedUntilMs = Date.now() + KEYBOARD_PROMPT_SUPPRESSION_MS
  }

  private isKeyboardSuppressed(): boolean {
    return Date.now() < this.#keyboardSuppressedUntilMs
  }

  private activateKeyboardCapture(): void {
    this.#focusOwnership.activateKeyboardCapture()
  }

  private suppressContentFocusOut(): void {
    this.#focusOwnership.suppressTransientFocusOut()
  }

  private focusContentRootImmediate(): void {
    this.#focusOwnership.focusContentRootImmediate(this.#contentRoot)
  }

  private cancelDeferredFocusRestore(): void {
    this.#focusOwnership.cancelDeferredFocusRestore()
  }

  private focusContentRootBestEffort(): void {
    this.#focusOwnership.focusContentRootBestEffort({
      contentRoot: this.#contentRoot,
      isContentRootCurrent: (contentRoot) => this.#contentRoot === contentRoot,
    })
  }

  private setFocusedNode(nodeId: string | null): void {
    if (nodeId === this.#focusedNodeId) {
      return
    }

    this.#focusedNodeId = nodeId
    this.requestRenderFromLatestModel()
  }

  private resolveNodeFrameId(node: LayerNode, branchContext: DragDropBranchContext): string | null {
    return this.#dragDropController.resolveNodeFrameId(node, branchContext)
  }

  private resolveDropTargetForNode(
    node: LayerNode,
    branchContext: DragDropBranchContext,
  ): NodeDropTarget {
    return this.#dragDropController.resolveDropTargetForNode(node, branchContext)
  }

  private canDropDraggedNode(targetNodeId: string, dropTarget: NodeDropTarget): boolean {
    return this.#dragDropController.canDropDraggedNode(targetNodeId, dropTarget)
  }

  private applyDragDropDestination(destination: DragDropDestination): void {
    if (destination.kind === "root") {
      this.setLastQuickMoveDestination({
        kind: "root",
      })
      return
    }

    this.setLastQuickMoveDestination({
      kind: "preset",
      preset: {
        key: makePresetKey(destination.targetParentPath, destination.targetFrameId),
        label: makePresetLabel(destination.targetParentPath),
        targetParentPath: [...destination.targetParentPath],
        targetFrameId: destination.targetFrameId,
      },
    })
  }

  private async runDragDropReparent(
    actions: LayerManagerUiActions,
    targetNodeId: string,
    dropTarget: NodeDropTarget,
  ): Promise<void> {
    const outcome = await this.#dragDropController.runDragDropReparent(
      actions,
      targetNodeId,
      dropTarget,
    )
    if (outcome.status !== "applied") {
      return
    }

    this.applyDragDropDestination(outcome.destination)
  }

  private renderNodes(
    container: HTMLElement,
    nodes: readonly LayerNode[],
    depth: number,
    selectedIds: ReadonlySet<string>,
    actions: LayerManagerUiActions | undefined,
    branchContext: DragDropBranchContext,
    matchKindByNodeId: ReadonlyMap<string, SidepanelFilterMatchKind>,
  ): void {
    const ownerDocument = container.ownerDocument

    renderSidepanelRowTree({
      nodes,
      depth,
      branchContext,
      resolveNodeFrameId: (node, nodeBranchContext) =>
        this.resolveNodeFrameId(node, nodeBranchContext),
      visitNode: ({ node, depth: nodeDepth, branchContext: nodeBranchContext, nodeFrameId }) => {
        const nodeDropTarget = this.resolveDropTargetForNode(node, nodeBranchContext)

        const currentInlineRenameState = this.#inlineRenameController.state
        const inlineRenameState: SidepanelInlineRenameRenderState | null =
          currentInlineRenameState?.nodeId === node.id ? currentInlineRenameState : null

        const nodeVisualState = resolveSidepanelRowVisualState(
          node,
          this.#latestModel?.elementStateById,
        )
        const { row, renameInputForAutofocus } = renderSidepanelRow({
          ownerDocument,
          node,
          depth: nodeDepth,
          selected: intersectsSelectedIds(node, selectedIds),
          focused: this.#focusedNodeId === node.id,
          dropHinted: this.#dragDropController.dropHintNodeId === node.id,
          actions,
          styleConfig: ROW_STYLE_CONFIG,
          nodeVisualState,
          filterMatchKind: matchKindByNodeId.get(node.id) ?? "none",
          inlineRenameState,
          onToggleExpanded: (targetNodeId) => {
            actions?.toggleExpanded(targetNodeId)
          },
          onInlineRenameDraftChange: (nextDraft) => {
            this.updateInlineRenameDraft(nextDraft)
          },
          onInlineRenameCommit: (targetNodeId) => {
            if (!actions) {
              return
            }

            runUiAction(
              () => this.commitInlineRename(actions, targetNodeId),
              (message) => this.notify(message),
              "Rename failed",
            )
          },
          onInlineRenameCancel: () => {
            this.cancelInlineRename()
          },
          isInlineRenameActiveForNode: (targetNodeId) =>
            this.#inlineRenameController.nodeId === targetNodeId,
          onRenameNodeFromAction: (targetNodeId, initialValue) => {
            this.beginInlineRenameFromInteraction(targetNodeId, initialValue)
          },
          createIconActionButton: (nextOwnerDocument, icon, action) =>
            this.createIconActionButton(nextOwnerDocument, icon, action),
        })

        if (actions) {
          bindSidepanelRowInteractions({
            row,
            draggable: node.type !== "frame",
            onRowClick: () => {
              this.activateKeyboardCapture()
              this.#focusedNodeId = node.id
              this.setSelectionOverride(node.elementIds)

              // Architecture seam note:
              // This bridge mirrors UI selection intent to the host selection model.
              // It must never mutate scene element fields directly.
              this.#hostSelectionBridge.mirrorSelectionToHost(node.elementIds)

              this.focusContentRootBestEffort()
              this.requestRenderFromLatestModel()
            },
            onRowDoubleClick: () => {
              this.beginInlineRenameFromInteraction(node.id, node.label)
            },
            onDragStart: (event) => {
              this.#dragDropController.startRowDrag({
                node,
                nodeFrameId,
                branchGroupPath: nodeBranchContext.groupPath,
                dragEvent: event,
              })
            },
            onDragEnd: () => {
              this.#dragDropController.endRowDrag()
            },
            onDragEnter: (event) => {
              this.#dragDropController.handleDragEnter(node.id, nodeDropTarget, event)
            },
            onDragOver: (event) => {
              this.#dragDropController.handleDragOver(node.id, nodeDropTarget, event)
            },
            onDragLeave: (relatedTarget) => {
              this.#dragDropController.handleDragLeave(
                node.id,
                !!(relatedTarget && row.contains(relatedTarget)),
              )
            },
            onDrop: () => {
              if (!this.canDropDraggedNode(node.id, nodeDropTarget)) {
                this.#dragDropController.resetDragState()
                return
              }

              runUiAction(
                // Architecture seam note:
                // Drag/drop emits a reparent intent through UI actions only.
                // The actual mutation path remains command facade -> executeIntent -> adapter.
                () => this.runDragDropReparent(actions, node.id, nodeDropTarget),
                (message) => this.notify(message),
                "Drag and drop reparent failed",
              )

              this.#dragDropController.resetDragState()

              try {
                this.#contentRoot?.focus()
              } catch {
                // no-op; best-effort focus restoration
              }
            },
          })
        }

        container.appendChild(row)

        if (inlineRenameState?.shouldAutofocusInput && renameInputForAutofocus) {
          try {
            renameInputForAutofocus.focus()
          } catch {
            // no-op; best-effort autofocus
          }

          this.#inlineRenameController.markAutofocusHandled(node.id)
        }
      },
    })
  }

  private createIconNode(ownerDocument: Document, iconName: string, fallbackLabel: string): Node {
    const iconFactory = this.#host.obsidian?.getIcon
    if (iconFactory) {
      try {
        const icon = iconFactory(iconName)
        if (icon) {
          const clone = icon.cloneNode(true)
          const viewHtmlElement = ownerDocument.defaultView?.HTMLElement
          if (viewHtmlElement && clone instanceof viewHtmlElement) {
            clone.style.width = `${ICON_SIZE_PX}px`
            clone.style.height = `${ICON_SIZE_PX}px`
            clone.style.display = "inline-block"
          }

          return clone
        }
      } catch {
        // no-op: fallback to text glyph
      }
    }

    const fallback = ownerDocument.createElement("span")
    fallback.textContent = fallbackLabel
    fallback.style.fontSize = `${ICON_SIZE_PX}px`
    fallback.style.lineHeight = "1"
    return fallback
  }

  private createIconActionButton(
    ownerDocument: Document,
    icon: {
      readonly iconName: string
      readonly fallbackLabel: string
      readonly title?: string
    },
    action: () => Promise<unknown>,
  ): HTMLButtonElement {
    const button = ownerDocument.createElement("button")
    button.type = "button"
    button.style.minWidth = `${ICON_BUTTON_SIZE_PX}px`
    button.style.minHeight = `${ICON_BUTTON_SIZE_PX}px`
    button.style.display = "inline-flex"
    button.style.alignItems = "center"
    button.style.justifyContent = "center"
    button.style.lineHeight = "1"
    button.style.padding = "0"
    button.style.border = "none"
    button.style.background = "transparent"
    button.style.boxShadow = "none"
    button.style.fontSize = `${TOOLBAR_FONT_SIZE_PX}px`
    if (icon.title) {
      button.title = icon.title
      button.ariaLabel = icon.title
    }

    const iconNode = this.createIconNode(ownerDocument, icon.iconName, icon.fallbackLabel)
    button.appendChild(iconNode)

    button.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      runUiAction(action, (message) => this.notify(message), "LayerManager action failed")
    })

    return button
  }

  private createToolbarButton(
    ownerDocument: Document,
    label: string,
    action: () => Promise<unknown>,
  ): HTMLButtonElement {
    const button = ownerDocument.createElement("button")
    button.type = "button"
    button.textContent = label
    button.style.fontSize = `${TOOLBAR_FONT_SIZE_PX}px`
    button.style.padding = "2px 6px"
    button.addEventListener("click", () => {
      runUiAction(action, (message) => this.notify(message), "LayerManager toolbar action failed")
    })

    return button
  }
}

export const createExcalidrawSidepanelRenderer = (
  host: ExcalidrawSidepanelHost,
): LayerManagerRenderer | null => {
  if (!hasDom()) {
    return null
  }

  const canCreateOrReuseTab =
    !!host.createSidepanelTab || !!host.sidepanelTab || !!host.checkForActiveSidepanelTabForScript

  if (!canCreateOrReuseTab) {
    return null
  }

  return new ExcalidrawSidepanelRenderer(host)
}
