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
  SidepanelKeyboardShortcutController,
} from "./sidepanel/keyboard/keyboardShortcutController.js"
import {
  type SidepanelMountHostLike,
  SidepanelMountManager,
  type SidepanelMountTabLike,
} from "./sidepanel/mount/sidepanelMountManager.js"
import { SidepanelPromptInteractionService } from "./sidepanel/prompt/promptInteractionService.js"
import {
  buildSidepanelQuickMoveDestinationProjection,
  projectQuickMoveDestination,
  projectQuickMoveDestinations,
  resolveProjectedQuickMovePreset,
} from "./sidepanel/quickmove/destinationProjection.js"
import { makePresetKey, makePresetOptionLabel } from "./sidepanel/quickmove/presetHelpers.js"
import {
  type LastQuickMoveDestination,
  SidepanelQuickMovePersistenceService,
  areEquivalentDestinationLists,
  areEquivalentDestinations,
} from "./sidepanel/quickmove/quickMovePersistenceService.js"
import { SidepanelInlineRenameController } from "./sidepanel/rename/inlineRenameController.js"
import { renderSidepanelQuickMove } from "./sidepanel/render/quickMoveRenderer.js"
import { bindSidepanelRowInteractions } from "./sidepanel/render/rowInteractionBinder.js"
import {
  type SidepanelFilterMatchKind,
  buildSidepanelVisibleRowTreeResult,
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
import { collectVisibleNodeContext } from "./sidepanel/selection/nodeContext.js"
import { resolveRowClickSelection } from "./sidepanel/selection/rowClickSelection.js"
import { haveSameIds, haveSameIdsInSameOrder } from "./sidepanel/selection/selectionIds.js"
import { reconcileSelectedElementIds } from "./sidepanel/selection/selectionReconciler.js"
import {
  type ResolvedSelection,
  type SidepanelSelectionOverrideState,
  type SidepanelSelectionResolution,
  makeSidepanelSelectionNodeRef,
  resolveSidepanelSelection,
} from "./sidepanel/selection/selectionResolution.js"
import { resolveStructuralSelectionIssue } from "./sidepanel/selection/structuralMoveSelection.js"
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
const ROW_MIN_HEIGHT_PX = 20
const ROW_FONT_SIZE_PX = 11
const ICON_SIZE_PX = 13
const ICON_BUTTON_SIZE_PX = 16
const TOOLBAR_FONT_SIZE_PX = 11
const SIDEPANEL_LIFECYCLE_DEBUG_FLAG = "LMX_DEBUG_SIDEPANEL_LIFECYCLE"
const SIDEPANEL_INTERACTION_DEBUG_FLAG = "LMX_DEBUG_SIDEPANEL_INTERACTION"

let nextSidepanelRendererInstanceId = 0

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

const pluralize = (count: number, singular: string, plural = `${singular}s`): string => {
  return count === 1 ? singular : plural
}

const formatRowScopeSummary = (
  rowFilter: ReturnType<typeof buildSidepanelVisibleRowTreeResult>,
  selectedElementCount: number,
): string => {
  if (!rowFilter.active) {
    return `Visible rows: ${rowFilter.renderedRowCount} of ${rowFilter.searchableRowCount} searchable · Selected elements: ${selectedElementCount}`
  }

  const reviewScopeParts = [
    `${rowFilter.matchingRowCount} ${pluralize(rowFilter.matchingRowCount, "match")}`,
  ]

  if (rowFilter.contextRowCount > 0) {
    reviewScopeParts.push(
      `${rowFilter.contextRowCount} ${pluralize(rowFilter.contextRowCount, "context row")}`,
    )
  }

  return `Review scope: ${reviewScopeParts.join(" + ")} · ${rowFilter.renderedRowCount} shown of ${rowFilter.searchableRowCount} searchable · Selected elements: ${selectedElementCount}`
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
  #rowTreeRoot: HTMLDivElement | null = null
  #latestModel: RenderViewModel | null = null
  #focusedNodeId: string | null = null
  #keyboardContext: KeyboardShortcutContext | null = null
  #didPersistTab = false
  #keyboardSuppressedUntilMs = 0
  #ownerDocumentWithKeyCapture: Document | null = null
  #selectionOverrideState: SidepanelSelectionOverrideState | null = null
  #selectionAnchorNodeId: string | null = null
  #latestSelectionResolution: SidepanelSelectionResolution | null = null
  #lastSnapshotSelectionIds: readonly string[] = []
  #rowFilterQuery = ""
  #shouldAutofocusRowFilterInput = false
  #cachedRowFilterResult: {
    readonly structuralTree: readonly LayerNode[]
    readonly query: string
    readonly result: ReturnType<typeof buildSidepanelVisibleRowTreeResult>
  } | null = null
  #cachedQuickMoveDestinationProjection: {
    readonly tree: readonly LayerNode[]
    readonly projection: ReturnType<typeof buildSidepanelQuickMoveDestinationProjection>
  } | null = null
  #rememberedDestinationReconcileInFlight = false
  #rememberedDestinationReconcileEpoch = 0
  #rememberedDestinationReconcileDirtyEpoch = 0
  readonly #rowDomIdPrefix = `lmx-row-${++nextSidepanelRendererInstanceId}`

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
        void this.setLastQuickMoveDestination(destination)
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
      getLatestStructuralTree: () => {
        return this.#latestModel?.tree ?? null
      },
      getActiveStructuralMoveSelection: (draggedNodeId) => {
        const selection = this.#latestSelectionResolution?.selection
        if (!selection?.structuralMove || resolveStructuralSelectionIssue(selection)) {
          return null
        }

        return selection.structuralMove.nodeIds.includes(draggedNodeId)
          ? selection.structuralMove
          : null
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
      setSelectionOverrideWithNodes: (elementIds, nodes) => {
        this.setSelectionOverrideFromNodes(elementIds, nodes)
      },
      ensureHostViewContext: () => ensureHostViewContext(this.#host),
      ...(this.#host.selectElementsInView
        ? { selectElementsInView: this.#host.selectElementsInView }
        : {}),
      moveSelectionToRoot: (actions, selection, targetFrameId) =>
        this.#selectionActionController.moveSelectionToRoot(actions, selection, targetFrameId),
      setLastQuickMoveDestinationToRoot: (targetFrameId) => {
        void this.setLastQuickMoveDestination({
          kind: "root",
          targetFrameId,
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
    const activeElementBeforeRender = ownerDocument.activeElement
    const previousRowTreeRoot = this.#rowTreeRoot
    const shouldRestoreRowTreeFocus = !!(
      activeElementBeforeRender &&
      previousRowTreeRoot &&
      (activeElementBeforeRender === previousRowTreeRoot ||
        previousRowTreeRoot.contains(activeElementBeforeRender as HTMLElement))
    )
    this.#quickMovePersistenceService.loadFromSettingsOnce()
    if (shouldRestoreRowTreeFocus) {
      this.requestRowTreeAutofocus()
    }
    contentRoot.innerHTML = ""
    this.#rowTreeRoot = null

    const structuralTree = model.tree
    const selectedElementIds = this.resolveSelectedElementIds(model.selectedIds)
    const selectionResolution = this.resolveSelection(structuralTree, selectedElementIds)
    this.#latestSelectionResolution = selectionResolution
    const resolvedSelection = selectionResolution.selection
    const currentSelectedNodes =
      selectionResolution.explicitSelectedNodes ?? resolvedSelection.nodes
    const selectedNodeIds = new Set(currentSelectedNodes.map((node) => node.id))
    this.reconcileSelectionAnchor(currentSelectedNodes)

    const rowFilter = this.getRowFilterResult(structuralTree)
    const destinationProjection = this.getQuickMoveDestinationProjection(structuralTree)
    this.scheduleRememberedDestinationReconciliation(destinationProjection)
    const visibleRowTree = rowFilter.visibleTree
    const { visibleNodes, parentById } = collectVisibleNodeContext(visibleRowTree)
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
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
        explicitSelectedNodes: selectionResolution.explicitSelectedNodes,
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
    info.textContent = formatRowScopeSummary(rowFilter, selectedElementIds.length)
    contentRoot.appendChild(info)

    const keyboardHint = ownerDocument.createElement("div")
    keyboardHint.style.opacity = "0.65"
    keyboardHint.style.fontSize = "11px"
    keyboardHint.style.marginBottom = "8px"
    keyboardHint.textContent =
      "Shortcuts: ↑/↓ focus · Shift+↑/↓ extend selection · ←/→ collapse/expand · Enter rename · Del delete · F/B reorder · Shift+F/B front/back · G/U structural"
    contentRoot.appendChild(keyboardHint)

    this.renderRowFilterControls(contentRoot, ownerDocument, rowFilter)

    renderSidepanelToolbar({
      container: contentRoot,
      ownerDocument,
      hasActions: !!model.actions,
      selectedElementCount: resolvedSelection.elementIds.length,
      reviewScopeActive: rowFilter.active,
      ungroupLikeIssue: resolveStructuralSelectionIssue(resolvedSelection),
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
      onReorderSelected: async (mode) => {
        if (!model.actions) {
          return
        }

        await this.#selectionActionController.reorderSelected(
          model.actions,
          resolvedSelection,
          mode,
        )
      },
      onUngroupLikeSelection: async () => {
        if (!model.actions) {
          return
        }

        await this.#selectionActionController.ungroupLikeSelection(model.actions, resolvedSelection)
      },
      onTogglePersistLastMoveAcrossRestarts: async (nextPreference) => {
        return await this.#quickMovePersistenceService.setPersistLastMoveAcrossRestarts(
          nextPreference,
        )
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
      selection: resolvedSelection,
      reviewScope: {
        active: rowFilter.active,
        matchingRowCount: rowFilter.matchingRowCount,
        contextRowCount: rowFilter.contextRowCount,
      },
      destinationProjection,
      lastQuickMoveDestination: this.#quickMovePersistenceService.lastQuickMoveDestination,
      recentQuickMoveDestinations: this.#quickMovePersistenceService.recentQuickMoveDestinations,
      quickPresetInlineMax: QUICK_PRESET_INLINE_MAX,
      lastMoveLabelMax: LAST_MOVE_LABEL_MAX,
      createToolbarButton: (nextOwnerDocument, label, action) =>
        this.createToolbarButton(nextOwnerDocument, label, action),
      onMoveSelectionToRoot: async (targetFrameId) => {
        if (!model.actions) {
          return
        }

        await this.#selectionActionController.moveSelectionToRoot(
          model.actions,
          resolvedSelection,
          targetFrameId,
        )
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
    rows.style.gap = "2px"
    rows.tabIndex = 0
    rows.role = "tree"
    rows.ariaLabel = "Layer rows"
    rows.ariaMultiSelectable = "true"
    this.#rowTreeRoot = rows
    contentRoot.appendChild(rows)

    if (visibleRowTree.length === 0) {
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
        visibleRowTree,
        visibleNodes,
        currentSelectedNodes,
        0,
        selectedNodeIds,
        model.actions,
        {
          frameId: null,
          groupPath: [],
        },
        rowFilter.matchKindByNodeId,
      )
    }

    if (this.#focusedNodeId && visibleNodeIds.has(this.#focusedNodeId)) {
      ;(rows as HTMLDivElement & { ariaActivedescendant?: string }).ariaActivedescendant =
        this.resolveRowDomId(this.#focusedNodeId)
    }

    const focusTargetRoot = this.getFocusTargetRoot(contentRoot)
    if (focusTargetRoot) {
      this.autofocusContentRootIfNeeded(focusTargetRoot)
    }
  }

  private renderRowFilterControls(
    container: HTMLElement,
    ownerDocument: Document,
    rowFilter: ReturnType<typeof buildSidepanelVisibleRowTreeResult>,
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
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        this.clearRowFilterAndFocusRows()
        return
      }

      event.stopPropagation()
    })

    controls.appendChild(searchInput)

    if (rowFilter.active) {
      const clearButton = this.createToolbarButton(ownerDocument, "Clear filter", async () => {
        this.updateRowFilterQuery("", true)
      })
      controls.appendChild(clearButton)
    }

    container.appendChild(controls)

    if (rowFilter.active) {
      const reviewScopeHint = ownerDocument.createElement("div")
      reviewScopeHint.style.opacity = "0.65"
      reviewScopeHint.style.fontSize = "11px"
      reviewScopeHint.style.marginBottom = "6px"
      reviewScopeHint.textContent =
        "Review scope only — move and toolbar commands still act on canonical selected rows."
      container.appendChild(reviewScopeHint)
    }

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

  private requestRowTreeAutofocus(): void {
    this.#shouldAutofocusRowFilterInput = false
    this.#focusOwnership.setShouldAutofocusContentRoot(true)
  }

  private clearRowFilterAndFocusRows(): void {
    this.#rowFilterQuery = ""
    this.requestRowTreeAutofocus()
    this.requestRenderFromLatestModel()
    this.focusContentRootBestEffort()
  }

  notify(message: string): void {
    const Notice = this.#host.obsidian?.Notice
    if (Notice) {
      new Notice(message)
      return
    }

    console.log(`[LMX] ${message}`)
  }

  dispose(): void {
    this.clearInteractiveBindings()
    this.#latestModel = null
  }

  private resolveSelectedElementIds(snapshotSelectedIds: ReadonlySet<string>): readonly string[] {
    const snapshotSelection = [...snapshotSelectedIds]
    const selectionOverride = this.#selectionOverrideState?.elementIds ?? null
    const snapshotSelectionChanged = !haveSameIdsInSameOrder(
      snapshotSelection,
      this.#lastSnapshotSelectionIds,
    )

    if (
      snapshotSelectionChanged &&
      selectionOverride &&
      snapshotSelection.length > 0 &&
      !haveSameIds(selectionOverride, snapshotSelection)
    ) {
      this.#hostSelectionBridge.invalidatePendingSelectionMirror()
      this.#selectionOverrideState = null
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
      this.#hostSelectionBridge.invalidatePendingSelectionMirror()
      this.#selectionOverrideState = null
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

  private async setLastQuickMoveDestination(
    destination: LastQuickMoveDestination | null,
  ): Promise<boolean> {
    const persisted =
      await this.#quickMovePersistenceService.setLastQuickMoveDestination(destination)

    if (!persisted) {
      this.notify("Last move destination reverted because persistence failed.")
    }

    return persisted
  }

  private scheduleRememberedDestinationReconciliation(
    destinationProjection: ReturnType<typeof buildSidepanelQuickMoveDestinationProjection>,
  ): void {
    const preview = this.#quickMovePersistenceService.previewReboundRememberedDestinations({
      lastQuickMoveDestination: projectQuickMoveDestination(
        this.#quickMovePersistenceService.lastQuickMoveDestination,
        destinationProjection.destinationByKey,
        destinationProjection.liveFrameIds,
      ),
      recentQuickMoveDestinations: projectQuickMoveDestinations(
        this.#quickMovePersistenceService.recentQuickMoveDestinations,
        destinationProjection.destinationByKey,
        destinationProjection.liveFrameIds,
      ),
    })

    if (
      !preview.changed ||
      this.#quickMovePersistenceService.shouldSuppressRememberedDestinationRebind(preview)
    ) {
      return
    }

    const nextEpoch = this.#rememberedDestinationReconcileEpoch + 1
    this.#rememberedDestinationReconcileEpoch = nextEpoch
    this.#rememberedDestinationReconcileDirtyEpoch = nextEpoch

    if (this.#rememberedDestinationReconcileInFlight) {
      return
    }

    this.#rememberedDestinationReconcileInFlight = true
    queueMicrotask(() => {
      void this.reconcileRememberedDestinations(destinationProjection, nextEpoch)
    })
  }

  private async reconcileRememberedDestinations(
    destinationProjection: ReturnType<typeof buildSidepanelQuickMoveDestinationProjection>,
    reconcileEpoch: number,
  ): Promise<void> {
    let shouldReplay = false

    try {
      const outcome = await this.#quickMovePersistenceService.rebindRememberedDestinations({
        lastQuickMoveDestination: projectQuickMoveDestination(
          this.#quickMovePersistenceService.lastQuickMoveDestination,
          destinationProjection.destinationByKey,
          destinationProjection.liveFrameIds,
        ),
        recentQuickMoveDestinations: projectQuickMoveDestinations(
          this.#quickMovePersistenceService.recentQuickMoveDestinations,
          destinationProjection.destinationByKey,
          destinationProjection.liveFrameIds,
        ),
      })

      if (outcome.status === "reconciled" && !outcome.persisted) {
        this.notify(
          "Remembered last-move destination reverted because reconciliation could not persist.",
        )
      }
    } finally {
      shouldReplay = this.#rememberedDestinationReconcileDirtyEpoch > reconcileEpoch
      this.#rememberedDestinationReconcileInFlight = false
    }

    if (!shouldReplay) {
      return
    }

    const latestModel = this.#latestModel
    if (!latestModel) {
      return
    }

    const latestProjection = this.getQuickMoveDestinationProjection(latestModel.tree)
    const projectedLastDestination = projectQuickMoveDestination(
      this.#quickMovePersistenceService.lastQuickMoveDestination,
      latestProjection.destinationByKey,
      latestProjection.liveFrameIds,
    )
    const projectedRecentDestinations = projectQuickMoveDestinations(
      this.#quickMovePersistenceService.recentQuickMoveDestinations,
      latestProjection.destinationByKey,
      latestProjection.liveFrameIds,
    )

    const replayNeeded =
      !areEquivalentDestinations(
        this.#quickMovePersistenceService.lastQuickMoveDestination,
        projectedLastDestination,
      ) ||
      !areEquivalentDestinationLists(
        this.#quickMovePersistenceService.recentQuickMoveDestinations,
        projectedRecentDestinations,
      )

    if (!replayNeeded) {
      return
    }

    this.scheduleRememberedDestinationReconciliation(latestProjection)
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
    this.#rowTreeRoot = null
    this.#keyboardContext = null
    this.#focusedNodeId = null
    this.#selectionOverrideState = null
    this.#selectionAnchorNodeId = null
    this.#latestSelectionResolution = null
    this.#lastSnapshotSelectionIds = []
    this.#cachedRowFilterResult = null
    this.#cachedQuickMoveDestinationProjection = null
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

  private getRowFilterResult(
    structuralTree: readonly LayerNode[],
  ): ReturnType<typeof buildSidepanelVisibleRowTreeResult> {
    const cached = this.#cachedRowFilterResult
    if (
      cached &&
      cached.structuralTree === structuralTree &&
      cached.query === this.#rowFilterQuery
    ) {
      return cached.result
    }

    const result = buildSidepanelVisibleRowTreeResult(structuralTree, this.#rowFilterQuery)
    this.#cachedRowFilterResult = {
      structuralTree,
      query: this.#rowFilterQuery,
      result,
    }
    return result
  }

  private getQuickMoveDestinationProjection(
    tree: readonly LayerNode[],
  ): ReturnType<typeof buildSidepanelQuickMoveDestinationProjection> {
    const cached = this.#cachedQuickMoveDestinationProjection
    if (cached && cached.tree === tree) {
      return cached.projection
    }

    const projection = buildSidepanelQuickMoveDestinationProjection(
      tree,
      QUICK_PRESET_TOTAL_MAX,
      ALL_DESTINATION_TOTAL_MAX,
    )
    this.#cachedQuickMoveDestinationProjection = {
      tree,
      projection,
    }
    return projection
  }

  private resolveSelection(
    tree: readonly LayerNode[],
    selectedElementIds: readonly string[],
  ): SidepanelSelectionResolution {
    return resolveSidepanelSelection({
      tree,
      selectedElementIds,
      selectionOverride: this.#selectionOverrideState,
    })
  }

  private setSelectionOverrideState(
    selectionOverride: SidepanelSelectionOverrideState | null,
  ): void {
    if (!selectionOverride) {
      this.#hostSelectionBridge.invalidatePendingSelectionMirror()
    }

    this.#selectionOverrideState = selectionOverride

    if (!selectionOverride) {
      this.debugInteraction("selection override cleared")
      return
    }

    this.debugInteraction("selection override updated", {
      size: selectionOverride.elementIds.length,
      nodeRefCount: selectionOverride.nodeRefs?.length ?? 0,
    })
  }

  private setSelectionOverride(elementIds: readonly string[] | null): void {
    if (!elementIds || elementIds.length === 0) {
      this.setSelectionOverrideState(null)
      return
    }

    this.setSelectionOverrideState({
      elementIds: [...elementIds],
      nodeRefs: null,
    })
  }

  private setSelectionOverrideFromNodes(
    elementIds: readonly string[],
    nodes: readonly LayerNode[],
  ): void {
    if (elementIds.length === 0 || nodes.length === 0) {
      this.setSelectionOverride(elementIds)
      return
    }

    const nodeRefs = nodes.map((node) => makeSidepanelSelectionNodeRef(node))
    this.setSelectionOverrideState({
      elementIds: [...elementIds],
      nodeRefs,
    })
  }

  private reconcileSelectionAnchor(selectedNodes: readonly LayerNode[]): void {
    if (selectedNodes.length === 0) {
      this.#selectionAnchorNodeId = null
      return
    }

    if (
      this.#selectionAnchorNodeId &&
      selectedNodes.some((node) => node.id === this.#selectionAnchorNodeId)
    ) {
      return
    }

    if (this.#focusedNodeId && selectedNodes.some((node) => node.id === this.#focusedNodeId)) {
      this.#selectionAnchorNodeId = this.#focusedNodeId
      return
    }

    this.#selectionAnchorNodeId = selectedNodes.length === 1 ? (selectedNodes[0]?.id ?? null) : null
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
      selection: this.resolveSelection(latestModel.tree, resolvedElementIds).selection,
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

  private getFocusTargetRoot(
    contentRoot: HTMLElement | null = this.#contentRoot,
  ): HTMLElement | null {
    if (this.#rowTreeRoot && contentRoot && contentRoot.contains(this.#rowTreeRoot)) {
      return this.#rowTreeRoot
    }

    return contentRoot
  }

  private resolveRowDomId(nodeId: string): string {
    const safeNodeId = encodeURIComponent(nodeId).replace(/%/g, "_")
    return `${this.#rowDomIdPrefix}-${safeNodeId}`
  }

  private focusContentRootImmediate(): void {
    this.#focusOwnership.focusContentRootImmediate(this.getFocusTargetRoot())
  }

  private cancelDeferredFocusRestore(): void {
    this.#focusOwnership.cancelDeferredFocusRestore()
  }

  private focusContentRootBestEffort(): void {
    this.#focusOwnership.focusContentRootBestEffort({
      contentRoot: this.getFocusTargetRoot(),
      isContentRootCurrent: (contentRoot) => this.getFocusTargetRoot() === contentRoot,
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
    siblingIndex: number,
  ): NodeDropTarget {
    return this.#dragDropController.resolveDropTargetForNode(node, branchContext, siblingIndex)
  }

  private describeDropHint(
    targetNodeId: string,
    node: LayerNode,
    dropTarget: NodeDropTarget,
  ): string {
    const preview = this.#dragDropController.previewDropIntent(targetNodeId, dropTarget)
    if (preview?.kind === "reorder") {
      return preview.placement === "before" ? "reorder before row" : "reorder after row"
    }

    if (node.type === "group") {
      return "drop into group"
    }

    if (node.type === "frame") {
      return "drop into frame"
    }

    if (dropTarget.targetParentPath.length > 0) {
      return "drop into parent group"
    }

    if (dropTarget.targetFrameId) {
      return "drop to frame root"
    }

    return "drop to root"
  }

  private applyDragDropDestination(destination: DragDropDestination): void {
    if (destination.kind === "root") {
      void this.setLastQuickMoveDestination({
        kind: "root",
        targetFrameId: destination.targetFrameId,
      })
      return
    }

    const latestStructuralTree = this.#latestModel?.tree ?? []
    const destinationProjection = this.getQuickMoveDestinationProjection(latestStructuralTree)
    const projectedPreset = resolveProjectedQuickMovePreset(
      destination.targetParentPath,
      destination.targetFrameId,
      destinationProjection.destinationByKey,
    )

    void this.setLastQuickMoveDestination({
      kind: "preset",
      preset: projectedPreset ?? {
        key: makePresetKey(destination.targetParentPath, destination.targetFrameId),
        label: makePresetOptionLabel(destination.targetParentPath),
        targetParentPath: [...destination.targetParentPath],
        targetFrameId: destination.targetFrameId,
      },
    })
  }

  private async runDragDropMove(
    actions: LayerManagerUiActions,
    targetNodeId: string,
    dropTarget: NodeDropTarget,
  ): Promise<void> {
    const outcome = await this.#dragDropController.runDragDropMove(
      actions,
      targetNodeId,
      dropTarget,
    )
    if (outcome.status !== "applied") {
      return
    }

    if (outcome.effect.kind === "reparent") {
      this.applyDragDropDestination(outcome.effect.destination)
    }
  }

  private async handleRowDrop(
    actions: LayerManagerUiActions,
    targetNodeId: string,
    dropTarget: NodeDropTarget,
  ): Promise<void> {
    try {
      await this.runDragDropMove(actions, targetNodeId, dropTarget)
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.notify(`Drag and drop move failed: ${error.message}`)
      } else {
        this.notify("Drag and drop move failed")
      }
    } finally {
      this.#dragDropController.resetDragState()
      this.requestRowTreeAutofocus()
      this.focusContentRootBestEffort()
    }
  }

  private renderNodes(
    container: HTMLElement,
    nodes: readonly LayerNode[],
    visibleNodes: readonly LayerNode[],
    currentSelectedNodes: readonly LayerNode[],
    depth: number,
    selectedNodeIds: ReadonlySet<string>,
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
      visitNode: ({
        node,
        depth: nodeDepth,
        branchContext: nodeBranchContext,
        siblingIndex,
        nodeFrameId,
      }) => {
        const nodeDropTarget = this.resolveDropTargetForNode(node, nodeBranchContext, siblingIndex)

        const currentInlineRenameState = this.#inlineRenameController.state
        const inlineRenameState: SidepanelInlineRenameRenderState | null =
          currentInlineRenameState?.nodeId === node.id ? currentInlineRenameState : null

        const nodeVisualState = resolveSidepanelRowVisualState(
          node,
          this.#latestModel?.elementStateById,
        )
        const { row, renameInputForAutofocus } = renderSidepanelRow({
          ownerDocument,
          rowDomId: this.resolveRowDomId(node.id),
          node,
          depth: nodeDepth,
          selected: selectedNodeIds.has(node.id),
          focused: this.#focusedNodeId === node.id,
          dropHinted: this.#dragDropController.dropHintNodeId === node.id,
          dropHintLabel:
            this.#dragDropController.dropHintNodeId === node.id
              ? this.describeDropHint(node.id, node, nodeDropTarget)
              : null,
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
            onRowClick: (event) => {
              const previousFocusedNodeId = this.#focusedNodeId
              this.activateKeyboardCapture()
              this.#focusedNodeId = node.id

              const nextSelection = resolveRowClickSelection({
                clickedNode: node,
                visibleNodes,
                currentSelectedNodes,
                currentAnchorNodeId: this.#selectionAnchorNodeId,
                fallbackAnchorNodeId: previousFocusedNodeId,
                modifiers: {
                  shiftKey: event.shiftKey,
                  toggleKey: event.ctrlKey || event.metaKey,
                },
              })

              this.#selectionAnchorNodeId = nextSelection.anchorNodeId
              if (nextSelection.selectedNodes.length > 0) {
                this.setSelectionOverrideFromNodes(
                  nextSelection.selectedElementIds,
                  nextSelection.selectedNodes,
                )
              } else {
                this.setSelectionOverride(null)
              }

              // Architecture seam note:
              // This bridge mirrors UI selection intent to the host selection model.
              // It must never mutate scene element fields directly.
              this.#hostSelectionBridge.mirrorSelectionToHost(nextSelection.selectedElementIds)

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
                rowScope: nodeBranchContext,
                siblingIndex,
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
              // Architecture seam note:
              // Drag/drop emits reorder-or-reparent intent through UI actions only.
              // The actual mutation path remains command facade -> executeIntent -> adapter.
              void this.handleRowDrop(actions, node.id, nodeDropTarget)
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
    button.style.borderRadius = "4px"
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
