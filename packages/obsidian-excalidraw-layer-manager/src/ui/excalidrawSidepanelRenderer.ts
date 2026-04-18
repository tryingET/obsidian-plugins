import type { ObsidianAppLike, SidepanelLeafLike } from "../adapter/excalidraw-types.js"
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
  type DragDropHint,
  type NodeDropTarget,
  SidepanelDragDropController,
} from "./sidepanel/dragdrop/dragDropController.js"
import { SidepanelFocusOwnershipCoordinator } from "./sidepanel/focus/focusOwnershipCoordinator.js"
import {
  type KeyboardShortcutContext,
  type RowSelectionGesture,
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
} from "./sidepanel/quickmove/quickMovePersistenceService.js"
import { createRememberedDestinationReconcileActor } from "./sidepanel/quickmove/rememberedDestinationReconcileMachine.js"
import { SidepanelInlineRenameController } from "./sidepanel/rename/inlineRenameController.js"
import { renderSidepanelQuickMove } from "./sidepanel/render/quickMoveRenderer.js"
import { bindSidepanelRowInteractions } from "./sidepanel/render/rowInteractionBinder.js"
import {
  type SidepanelFilterMatchKind,
  type SidepanelRowVisualState,
  buildSidepanelVisibleRowTreeResult,
  resolveSidepanelRowVisualState,
} from "./sidepanel/render/rowModel.js"
import {
  type SidepanelInlineRenameRenderState,
  type SidepanelRowDropHintKind,
  renderSidepanelRow,
} from "./sidepanel/render/rowRenderer.js"
import { renderSidepanelRowTree } from "./sidepanel/render/rowTreeRenderer.js"
import { renderSidepanelToolbar } from "./sidepanel/render/toolbarRenderer.js"
import { traceHostContextLifecycleEvent } from "./sidepanel/selection/hostContextFlightRecorder.js"
import { SidepanelHostSelectionBridge } from "./sidepanel/selection/hostSelectionBridge.js"
import {
  type SidepanelHostViewContextDescription,
  describeHostViewContext,
  ensureHostViewContext,
} from "./sidepanel/selection/hostViewContext.js"
import { collectVisibleNodeContext } from "./sidepanel/selection/nodeContext.js"
import { resolveRowClickSelection } from "./sidepanel/selection/rowClickSelection.js"
import {
  type SidepanelSceneBinding,
  resolveSceneBindingFromHost,
} from "./sidepanel/selection/sceneBinding.js"
import { haveSameIds, haveSameIdsInSameOrder } from "./sidepanel/selection/selectionIds.js"
import { reconcileSelectedElementIds } from "./sidepanel/selection/selectionReconciler.js"
import {
  type ResolvedSelection,
  type SidepanelSelectionOverrideState,
  type SidepanelSelectionResolution,
  makeSidepanelSelectionNodeRef,
  resolveCurrentSidepanelSelectionNodes,
  resolveSidepanelSelection,
} from "./sidepanel/selection/selectionResolution.js"
import { resolveStructuralSelectionIssue } from "./sidepanel/selection/structuralMoveSelection.js"
import {
  type ScriptSettingsLike,
  SidepanelSettingsWriteQueue,
} from "./sidepanel/settings/settingsWriteQueue.js"

type SidepanelTabViewChangeHandler = (targetView?: unknown | null) => void

type SidepanelTabLike = SidepanelMountTabLike & {
  onViewChange?: SidepanelTabViewChangeHandler | undefined
}

interface ObsidianLike {
  Notice?: new (message: string, timeout?: number) => unknown
  getIcon?: (iconName: string) => HTMLElement | null
  app?: ObsidianAppLike
}

interface RenderedRowPreviewState {
  readonly row: HTMLDivElement
  readonly node: LayerNode
  readonly branchContext: DragDropBranchContext
  readonly siblingIndex: number
  readonly selected: boolean
  readonly filterMatchKind: SidepanelFilterMatchKind
  readonly nodeVisualState: SidepanelRowVisualState
  dropHintAssistiveLabel: HTMLSpanElement | null
}

interface SelectedElementLike {
  readonly id: string
}

export interface ExcalidrawSidepanelHost extends SidepanelMountHostLike {
  sidepanelTab?: SidepanelTabLike | null
  createSidepanelTab?: (
    title: string,
    persist?: boolean,
    reveal?: boolean,
  ) => SidepanelTabLike | Promise<SidepanelTabLike | null> | undefined
  persistSidepanelTab?: () => SidepanelTabLike | null
  getSidepanelLeaf?: () => SidepanelLeafLike | null
  getViewSelectedElements?: () => readonly SelectedElementLike[]
  setView?: (view?: unknown, reveal?: boolean) => unknown
  targetView?: unknown | null
  app?: ObsidianAppLike
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
const REVIEW_CURSOR_COMFORT_MIN_MARGIN_ROWS = 2
const REVIEW_CURSOR_COMFORT_VIEWPORT_RATIO = 0.18
const REVIEW_CURSOR_COMFORT_MAX_VIEWPORT_RATIO = 0.3
const ROW_FONT_SIZE_PX = 11
const ICON_SIZE_PX = 13
const ICON_BUTTON_SIZE_PX = 16
const TOOLBAR_FONT_SIZE_PX = 11
const SIDEPANEL_INTERACTION_DEBUG_FLAG = "LMX_DEBUG_SIDEPANEL_INTERACTION"
const SIDEPANEL_VIEW_CHANGE_UNSET = Symbol("sidepanel-view-change-unset")
/**
 * On-panel summary of the keyboard-first tree selection model so the row surface
 * advertises row intent before command fallback behavior.
 */
const SIDEPANEL_KEYBOARD_HINT_TEXT = [
  "Shortcuts: ↑/↓ focus rows",
  "Shift+↑/↓ extend row selection",
  "Home/End bounds",
  "PgUp/PgDn page",
  "Shift+PgUp/PgDn extend page",
  "T select row",
  "Alt+T toggle row",
  "Shift+T add range to selection",
  "←/→ collapse/expand",
  "Enter rename",
  "Del delete",
  "F/B reorder",
  "Shift+F/B front/back",
  "G/U structural",
].join(" · ")

const resolveRowSelectionDebugSemantics = (
  source: RowSelectionGesture["source"],
): {
  readonly selectionOrigin: "keyboard" | "mouse"
  readonly selectionSemantics: "replace" | "toggle" | "range" | "extend"
} => {
  switch (source) {
    case "keyboardToggle":
      return {
        selectionOrigin: "keyboard",
        selectionSemantics: "replace",
      }
    case "keyboardModifierToggle":
      return {
        selectionOrigin: "keyboard",
        selectionSemantics: "toggle",
      }
    case "keyboardRange":
      return {
        selectionOrigin: "keyboard",
        selectionSemantics: "range",
      }
    case "keyboardExtend":
      return {
        selectionOrigin: "keyboard",
        selectionSemantics: "extend",
      }
    case "mouseClick":
      return {
        selectionOrigin: "mouse",
        selectionSemantics: "replace",
      }
    case "mouseToggle":
      return {
        selectionOrigin: "mouse",
        selectionSemantics: "toggle",
      }
    case "mouseRange":
      return {
        selectionOrigin: "mouse",
        selectionSemantics: "range",
      }
  }
}

let nextSidepanelRendererInstanceId = 0

const ROW_STYLE_CONFIG = {
  indentStepPx: INDENT_STEP_PX,
  rowMinHeightPx: ROW_MIN_HEIGHT_PX,
  rowFontSizePx: ROW_FONT_SIZE_PX,
  iconButtonSizePx: ICON_BUTTON_SIZE_PX,
  iconSizePx: ICON_SIZE_PX,
} as const

const cloneDragDropHint = (hint: DragDropHint | null): DragDropHint | null => {
  if (!hint) {
    return null
  }

  return hint.kind === "reorder"
    ? {
        kind: "reorder",
        nodeId: hint.nodeId,
        placement: hint.placement,
      }
    : {
        kind: "reparent",
        nodeId: hint.nodeId,
      }
}

const haveSameDragDropHint = (left: DragDropHint | null, right: DragDropHint | null): boolean => {
  if (!left || !right) {
    return left === right
  }

  if (left.nodeId !== right.nodeId || left.kind !== right.kind) {
    return false
  }

  if (left.kind === "reorder" && right.kind === "reorder") {
    return left.placement === right.placement
  }

  return true
}

const resolveSidepanelRowDropHintKind = (
  hint: DragDropHint | null,
): SidepanelRowDropHintKind | null => {
  if (!hint) {
    return null
  }

  if (hint.kind === "reorder") {
    return hint.placement === "before" ? "reorderBefore" : "reorderAfter"
  }

  return "reparent"
}

const resolveRowPreviewBoxShadow = (
  state: SidepanelRowVisualState,
  dropHintKind: SidepanelRowDropHintKind | null,
): string => {
  const shadows: string[] = []

  if (state.visibility === "hidden") {
    shadows.push("inset 3px 0 0 0 var(--text-faint, rgba(120,120,120,0.55))")
  } else if (state.visibility === "mixed") {
    shadows.push("inset 3px 0 0 0 var(--background-modifier-border-hover, rgba(120,120,120,0.45))")
  }

  if (state.lock === "locked") {
    shadows.push("inset -3px 0 0 0 var(--text-muted, rgba(120,120,120,0.6))")
  } else if (state.lock === "mixed") {
    shadows.push("inset -3px 0 0 0 var(--background-secondary-alt, rgba(120,120,120,0.45))")
  }

  if (dropHintKind === "reparent") {
    shadows.push("inset 0 0 0 2px var(--interactive-accent, rgba(120,120,120,0.68))")
  }

  if (dropHintKind === "reorderBefore") {
    shadows.push("inset 0 3px 0 0 var(--interactive-accent, rgba(120,120,120,0.92))")
  }

  if (dropHintKind === "reorderAfter") {
    shadows.push("inset 0 -3px 0 0 var(--interactive-accent, rgba(120,120,120,0.92))")
  }

  return shadows.join(", ")
}

const applyRenderedRowPreviewShellState = (
  row: HTMLDivElement,
  input: {
    readonly nodeVisualState: SidepanelRowVisualState
    readonly filterMatchKind: SidepanelFilterMatchKind
    readonly selected: boolean
    readonly dropHintKind: SidepanelRowDropHintKind | null
  },
): void => {
  row.style.boxShadow = resolveRowPreviewBoxShadow(input.nodeVisualState, input.dropHintKind)
  row.style.background = ""
  row.style.borderColor = ""

  if (input.filterMatchKind === "self") {
    row.style.background = "var(--background-modifier-hover, rgba(120,120,120,0.12))"
    row.style.borderColor = "var(--background-modifier-border, rgba(120,120,120,0.16))"
  }

  if (input.selected) {
    row.style.background = "var(--interactive-accent-hover, rgba(120,120,120,0.2))"
    row.style.borderColor = "var(--interactive-accent, rgba(120,120,120,0.32))"
  }

  if (input.dropHintKind === "reparent" && !input.selected) {
    row.style.background = "var(--interactive-accent-hover, rgba(120,120,120,0.16))"
    row.style.borderColor = "var(--interactive-accent, rgba(120,120,120,0.68))"
  }
}

const styleDropHintAssistiveLabel = (label: HTMLSpanElement): void => {
  label.style.position = "absolute"
  label.style.width = "1px"
  label.style.height = "1px"
  label.style.padding = "0"
  label.style.margin = "-1px"
  label.style.overflow = "hidden"
  label.style.clip = "rect(0 0 0 0)"
  label.style.clipPath = "inset(50%)"
  label.style.whiteSpace = "nowrap"
  label.style.border = "0"
}

const isDropHintAssistiveLabel = (element: Element): element is HTMLSpanElement => {
  return (
    element.tagName === "SPAN" &&
    (element as HTMLSpanElement).style.position === "absolute" &&
    (element as HTMLSpanElement).style.clipPath === "inset(50%)"
  )
}

const findRenderedRowDropHintAssistiveLabel = (row: HTMLDivElement): HTMLSpanElement | null => {
  return Array.from(row.children).find(isDropHintAssistiveLabel) ?? null
}

const hasDom = (): boolean => {
  return typeof document !== "undefined"
}

const readNumericDimension = (value: unknown): number => {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

const resolveElementViewportHeight = (element: HTMLElement): number => {
  const clientHeight = readNumericDimension(
    (element as unknown as { readonly clientHeight?: unknown }).clientHeight,
  )
  if (clientHeight > 0) {
    return clientHeight
  }

  const rect = element.getBoundingClientRect?.()
  return rect && Number.isFinite(rect.height) ? rect.height : 0
}

const resolveElementScrollHeight = (element: HTMLElement): number => {
  const scrollHeight = readNumericDimension(
    (element as unknown as { readonly scrollHeight?: unknown }).scrollHeight,
  )
  if (scrollHeight > 0) {
    return scrollHeight
  }

  return resolveElementViewportHeight(element)
}

const resolveElementScrollTop = (element: HTMLElement): number => {
  return readNumericDimension((element as unknown as { readonly scrollTop?: unknown }).scrollTop)
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
  if (!target || typeof target !== "object") {
    return false
  }

  if ((target as { readonly isContentEditable?: unknown }).isContentEditable === true) {
    return true
  }

  if (!("tagName" in target)) {
    return false
  }

  const rawTagName = (target as { readonly tagName?: unknown }).tagName
  if (typeof rawTagName !== "string") {
    return false
  }

  const tagName = rawTagName.toLowerCase()
  return tagName === "input" || tagName === "textarea" || tagName === "select"
}

const isSpaceLikeKey = (key: string): boolean => {
  return key === " " || key === "Space" || key === "Spacebar"
}

const normalizeKeyboardKey = (key: string): string => {
  return key.length === 1 ? key.toLowerCase() : key
}

const isKeyTShortcut = (event: KeyboardEvent): boolean => {
  return normalizeKeyboardKey(event.key) === "t" || event.code === "KeyT"
}

const isDocumentReroutableModifierSpaceShortcut = (event: KeyboardEvent): boolean => {
  return (event.ctrlKey || event.metaKey) && !event.altKey && isSpaceLikeKey(event.key)
}

const isDocumentReroutableTSelectionShortcut = (event: KeyboardEvent): boolean => {
  if (!isKeyTShortcut(event) || event.ctrlKey || event.metaKey) {
    return false
  }

  return event.shiftKey || event.altKey
}

const shouldClaimDocumentSpaceLikeEvent = (event: KeyboardEvent): boolean => {
  if (event.altKey || !isSpaceLikeKey(event.key)) {
    return false
  }

  return (!event.ctrlKey && !event.metaKey) || isDocumentReroutableModifierSpaceShortcut(event)
}

const isDocumentRoutingContinuationKey = (event: KeyboardEvent): boolean => {
  if (
    isDocumentReroutableModifierSpaceShortcut(event) ||
    isDocumentReroutableTSelectionShortcut(event)
  ) {
    return true
  }

  if (event.ctrlKey || event.metaKey || event.altKey) {
    return false
  }

  switch (event.key) {
    case "ArrowDown":
    case "ArrowUp":
    case "ArrowLeft":
    case "ArrowRight":
    case "Home":
    case "End":
    case "PageDown":
    case "PageUp":
    case "Enter":
    case "Delete":
    case "Backspace":
      return true
    default:
      return false
  }
}

const claimHandledKeyboardEvent = (event: KeyboardEvent): void => {
  event.preventDefault()
  event.stopPropagation?.()
  ;(event as KeyboardEvent & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
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
  readonly #rememberedDestinationReconcileActor: ReturnType<
    typeof createRememberedDestinationReconcileActor
  >
  readonly #promptInteractionService: SidepanelPromptInteractionService
  readonly #selectionActionController: SidepanelSelectionActionController
  readonly #hostSelectionBridge: SidepanelHostSelectionBridge
  readonly #focusOwnership = new SidepanelFocusOwnershipCoordinator({
    focusOutSuppressionWindowMs: FOCUSOUT_SUPPRESSION_WINDOW_MS,
    keyboardStickyCaptureMs: KEYBOARD_STICKY_CAPTURE_MS,
  })
  #contentRoot: HTMLElement | null = null
  #rowTreeRoot: HTMLDivElement | null = null
  #renderedRowPreviewStateByNodeId = new Map<string, RenderedRowPreviewState>()
  #lastRenderedDragDropHint: DragDropHint | null = null
  #latestModel: RenderViewModel | null = null
  #focusedNodeId: string | null = null
  #keyboardContext: KeyboardShortcutContext | null = null
  #lastHandledContentKeydownEvent: KeyboardEvent | null = null
  #didPersistTab = false
  #viewChangeBoundTab: SidepanelTabLike | null = null
  #previousTabViewChangeHandler: SidepanelTabViewChangeHandler | undefined
  #keyboardSuppressedUntilMs = 0
  #ownerDocumentWithKeyCapture: Document | null = null
  #selectionOverrideState: SidepanelSelectionOverrideState | null = null
  #selectionAnchorNodeId: string | null = null
  #latestSelectionResolution: SidepanelSelectionResolution | null = null
  #lastSnapshotSelectionIds: readonly string[] = []
  #pendingFocusedRowRevealNodeId: string | null = null
  #lastRenderedSceneBinding: SidepanelSceneBinding | null = null
  #preserveSidepanelFocusForCurrentHostViewChange = false
  #handlingHostViewClose = false
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
  readonly #rowDomIdPrefix = `lmx-row-${++nextSidepanelRendererInstanceId}`

  readonly #boundSidepanelViewChangeHandler = (...args: [unknown?]): void => {
    const nextTargetView =
      args.length === 0 ? SIDEPANEL_VIEW_CHANGE_UNSET : ((args[0] ?? null) as unknown | null)

    this.handleSidepanelViewChange(nextTargetView)
  }

  readonly #contentKeydownHandler = (event: KeyboardEvent): void => {
    this.#lastHandledContentKeydownEvent = event
    this.#focusOwnership.activateKeyboardCapture()
    this.#keyboardController.handleContentKeydown(event)
  }

  readonly #documentKeydownHandler = (event: KeyboardEvent): void => {
    if (event === this.#lastHandledContentKeydownEvent) {
      this.#lastHandledContentKeydownEvent = null
      return
    }

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

    if (isTextInputTarget(eventTarget) || !isDocumentRoutingContinuationKey(event)) {
      this.#focusOwnership.confirmOutsideFocusOut()
      return
    }

    this.focusContentRootImmediate()
    this.#focusOwnership.activateKeyboardCapture()

    this.#keyboardController.handleContentKeydown(event)
  }

  readonly #documentKeypressHandler = (event: KeyboardEvent): void => {
    if (!this.#focusOwnership.isKeyboardRoutingActive()) {
      return
    }

    if (isTextInputTarget(event.target) || !shouldClaimDocumentSpaceLikeEvent(event)) {
      return
    }

    claimHandledKeyboardEvent(event)
  }

  readonly #documentKeyupHandler = (event: KeyboardEvent): void => {
    if (!this.#focusOwnership.isKeyboardRoutingActive()) {
      return
    }

    if (isTextInputTarget(event.target) || !shouldClaimDocumentSpaceLikeEvent(event)) {
      return
    }

    claimHandledKeyboardEvent(event)
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
    this.#rememberedDestinationReconcileActor = createRememberedDestinationReconcileActor({
      service: this.#quickMovePersistenceService,
      notify: (message) => {
        this.notify(message)
      },
    })
    this.#rememberedDestinationReconcileActor.start()

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
      resolveCurrentSceneBinding: () => resolveSceneBindingFromHost(this.#host),
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
      onHostViewClosed: () => {
        this.handleHostExcalidrawViewClosed()
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
        this.requestDragDropPreviewRender()
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
      setSelectionAnchorNodeId: (nodeId) => {
        this.#selectionAnchorNodeId = nodeId
      },
      applyResolvedRowSelection: (input) => {
        this.applyResolvedRowSelectionGesture(input)
      },
      mirrorSelectionToHost: (elementIds) => {
        this.#hostSelectionBridge.mirrorSelectionToHost(
          elementIds,
          this.#lastRenderedSceneBinding ?? undefined,
        )
      },
      getPageNavigationStep: () => this.resolveKeyboardPageNavigationStep(),
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
      confirmOutsideFocusOut: () => {
        this.#focusOwnership.confirmOutsideFocusOut()
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
      requestRowTreeAutofocus: () => {
        this.requestRowTreeAutofocus()
      },
      debugInteraction: (message, payload) => {
        this.debugInteraction(message, payload)
      },
    })

    this.#lastRenderedSceneBinding = resolveSceneBindingFromHost(this.#host)
    this.syncFocusOwnershipHostAuthority(this.#lastRenderedSceneBinding)
  }

  render(model: RenderViewModel): void {
    this.#latestModel = model

    const sceneBinding = resolveSceneBindingFromHost(this.#host)
    const hostViewContext = describeHostViewContext(this.#host)
    this.syncFocusOwnershipHostAuthority(sceneBinding)
    this.reconcileHostViewContextBeforeRender(sceneBinding)
    this.#lastRenderedSceneBinding = sceneBinding

    if (sceneBinding.state !== "live") {
      this.renderInactiveHostState(hostViewContext, model)
      return
    }

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
    this.clearRenderedRowPreviewState()

    const structuralTree = model.tree
    const selectedElementIds = this.resolveSelectedElementIds(model.selectedIds)
    const selectionResolution = this.resolveSelection(structuralTree, selectedElementIds)
    this.#latestSelectionResolution = selectionResolution
    const resolvedSelection = selectionResolution.selection
    const currentSelectedNodes = resolveCurrentSidepanelSelectionNodes(selectionResolution)
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

    const focusedNodeIdBeforeVisibleReconcile = this.#focusedNodeId

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

    if (
      hasKeyboardOwnership &&
      this.#focusedNodeId &&
      this.#focusedNodeId !== focusedNodeIdBeforeVisibleReconcile
    ) {
      this.requestFocusedRowReveal(this.#focusedNodeId)
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
        anchorNodeId: this.#selectionAnchorNodeId,
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
    keyboardHint.textContent = SIDEPANEL_KEYBOARD_HINT_TEXT
    contentRoot.appendChild(keyboardHint)

    this.renderRowFilterControls(contentRoot, ownerDocument, rowFilter)

    const toolbar = renderSidepanelToolbar({
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

        await this.#selectionActionController.groupSelected(model.actions, resolvedSelection)
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

    if (!model.actions) {
      toolbar.style.background = ""
    }

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

    this.#lastRenderedDragDropHint = cloneDragDropHint(this.#dragDropController.dropHint)
    this.revealFocusedRowWithinComfortBandIfNeeded()
    this.scheduleDeferredFocusedRowReveal(contentRoot)
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
    this.#settingsWriteQueue.dispose()
    this.#rememberedDestinationReconcileActor.stop()
    this.#promptInteractionService.dispose()
    this.#inlineRenameController.dispose()
    this.#mountManager.dispose()
    this.#focusOwnership.dispose()
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
      !this.#hostSelectionBridge.hasPendingSelectionMirror() &&
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
        ...this.buildHostViewDebugPayload(),
      })

      return snapshotSelection
    }

    const result = reconcileSelectedElementIds({
      snapshotSelection,
      selectionOverride,
      ...(this.#host.getViewSelectedElements
        ? {
            getViewSelectedElements: () => {
              return this.#host.getViewSelectedElements?.() ?? []
            },
          }
        : {}),
      hasSelectionBridge: !!this.#host.selectElementsInView,
      hasPendingSelectionMirror: this.#hostSelectionBridge.hasPendingSelectionMirror(),
      ensureHostViewContext: () => ensureHostViewContext(this.#host),
    })

    if (result.clearSelectionOverride) {
      this.#hostSelectionBridge.invalidatePendingSelectionMirror()
      this.#selectionOverrideState = null
    }

    if (result.readErrorMessage) {
      this.debugInteraction("selection read failed", {
        errorMessage: result.readErrorMessage,
        ...this.buildHostViewDebugPayload(),
      })
    }

    this.debugInteraction("selection resolution", {
      source: result.source,
      snapshotSize: snapshotSelection.length,
      overrideSize: selectionOverride?.length ?? 0,
      resolvedSize: result.resolvedSelection.length,
      clearSelectionOverride: result.clearSelectionOverride,
      ...this.buildHostViewDebugPayload(),
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

  private buildRememberedDestinationCandidate(
    destinationProjection: ReturnType<typeof buildSidepanelQuickMoveDestinationProjection>,
  ): {
    readonly lastQuickMoveDestination: LastQuickMoveDestination | null
    readonly recentQuickMoveDestinations: readonly LastQuickMoveDestination[]
  } {
    return {
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
    }
  }

  private scheduleRememberedDestinationReconciliation(
    destinationProjection: ReturnType<typeof buildSidepanelQuickMoveDestinationProjection>,
  ): void {
    this.#rememberedDestinationReconcileActor.send({
      type: "PROJECTION_UPDATED",
      candidate: this.buildRememberedDestinationCandidate(destinationProjection),
    })
  }

  private debugLifecycle(message: string, payload?: Record<string, unknown>): void {
    traceHostContextLifecycleEvent("renderer", message, payload)
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
          options?: boolean | AddEventListenerOptions,
        ) => void
      }
    ).addEventListener

    if (!addEventListener) {
      return
    }

    addEventListener.call(ownerDocument, "keydown", this.#documentKeydownHandler as EventListener, {
      capture: true,
    })
    addEventListener.call(
      ownerDocument,
      "keypress",
      this.#documentKeypressHandler as EventListener,
      {
        capture: true,
      },
    )
    addEventListener.call(ownerDocument, "keyup", this.#documentKeyupHandler as EventListener, {
      capture: true,
    })
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
          options?: boolean | EventListenerOptions,
        ) => void
      }
    ).removeEventListener

    if (removeEventListener) {
      removeEventListener.call(
        ownerDocument,
        "keydown",
        this.#documentKeydownHandler as EventListener,
        {
          capture: true,
        },
      )
      removeEventListener.call(
        ownerDocument,
        "keypress",
        this.#documentKeypressHandler as EventListener,
        {
          capture: true,
        },
      )
      removeEventListener.call(
        ownerDocument,
        "keyup",
        this.#documentKeyupHandler as EventListener,
        {
          capture: true,
        },
      )
    }

    this.#ownerDocumentWithKeyCapture = null
  }

  private clearRenderedRowPreviewState(): void {
    this.#renderedRowPreviewStateByNodeId.clear()
    this.#lastRenderedDragDropHint = null
  }

  private hasExplicitTargetViewProperty(): boolean {
    return Object.prototype.hasOwnProperty.call(this.#host, "targetView")
  }

  private assignHostTargetView(targetView: unknown | null): void {
    if (!this.hasExplicitTargetViewProperty()) {
      return
    }

    try {
      this.#host.targetView = targetView
    } catch {
      // best-effort host sync only
    }
  }

  private bindSidepanelViewChangeToCurrentTab(): void {
    const sidepanelTab = this.#host.sidepanelTab
    if (!sidepanelTab) {
      this.releaseSidepanelViewChangeBinding()
      return
    }

    if (this.#viewChangeBoundTab === sidepanelTab) {
      return
    }

    this.releaseSidepanelViewChangeBinding()
    const previousViewChangeHandler = sidepanelTab.onViewChange
    this.#previousTabViewChangeHandler = previousViewChangeHandler
    sidepanelTab.onViewChange = (...args: [unknown?]) => {
      previousViewChangeHandler?.(...args)
      this.#boundSidepanelViewChangeHandler(...args)
    }
    this.#viewChangeBoundTab = sidepanelTab
    const hostViewContext = describeHostViewContext(this.#host)
    this.debugLifecycle("bound sidepanel onViewChange bridge", {
      activeFilePath: hostViewContext.activeFilePath,
      activeLeafIdentity: hostViewContext.activeWorkspaceLeafIdentity,
      activeViewType: hostViewContext.activeWorkspaceViewType,
      targetViewIdentity: hostViewContext.targetViewIdentity,
      targetViewFilePath: hostViewContext.targetViewFilePath,
    })
  }

  private releaseSidepanelViewChangeBinding(): void {
    const sidepanelTab = this.#viewChangeBoundTab
    if (!sidepanelTab) {
      return
    }

    const hostViewContext = describeHostViewContext(this.#host)
    this.debugLifecycle("released sidepanel onViewChange bridge", {
      activeFilePath: hostViewContext.activeFilePath,
      activeLeafIdentity: hostViewContext.activeWorkspaceLeafIdentity,
      activeViewType: hostViewContext.activeWorkspaceViewType,
      targetViewIdentity: hostViewContext.targetViewIdentity,
      targetViewFilePath: hostViewContext.targetViewFilePath,
    })

    sidepanelTab.onViewChange = this.#previousTabViewChangeHandler
    this.#viewChangeBoundTab = null
    this.#previousTabViewChangeHandler = undefined
  }

  private handleSidepanelViewChange(
    nextTargetView: unknown | null | typeof SIDEPANEL_VIEW_CHANGE_UNSET,
  ): void {
    if (nextTargetView !== SIDEPANEL_VIEW_CHANGE_UNSET) {
      this.assignHostTargetView(nextTargetView)
    }

    const sceneBinding = resolveSceneBindingFromHost(this.#host)
    const hostViewContext = describeHostViewContext(this.#host)
    const preserveSidepanelFocus =
      sceneBinding.state === "live" && !sceneBinding.shouldAttemptRebind
    this.debugLifecycle("sidepanel onViewChange received", {
      sceneBindingSource: sceneBinding.source,
      sceneBindingState: sceneBinding.state,
      sceneBindingRefreshKey: sceneBinding.refreshKey,
      sceneBindingShouldAttemptRebind: sceneBinding.shouldAttemptRebind,
      preserveSidepanelFocus,
      activeFilePath: hostViewContext.activeFilePath,
      activeLeafIdentity: hostViewContext.activeWorkspaceLeafIdentity,
      activeViewType: hostViewContext.activeWorkspaceViewType,
      targetViewIdentity: hostViewContext.targetViewIdentity,
      targetViewFilePath: hostViewContext.targetViewFilePath,
      hostEligible: hostViewContext.hostEligible,
    })
    this.syncFocusOwnershipHostAuthority(sceneBinding)
    this.runWithCurrentHostViewChangeFocusPreservation(preserveSidepanelFocus, () => {
      this.requestRenderFromLatestModel()
    })
  }

  private clearInteractiveBindings(): void {
    this.#contentRoot?.removeEventListener("keydown", this.#contentKeydownHandler)
    this.#contentRoot?.removeEventListener("focusout", this.#contentFocusOutHandler)
    this.#contentRoot?.removeEventListener("focusin", this.#contentFocusInHandler)
    this.#contentRoot?.removeEventListener("pointerdown", this.#contentPointerDownHandler)
    this.releaseSidepanelViewChangeBinding()
    this.detachOwnerDocumentKeyCapture()
    this.#contentRoot = null
    this.#rowTreeRoot = null
    this.clearRenderedRowPreviewState()
    this.#keyboardContext = null
    this.#focusedNodeId = null
    this.#selectionOverrideState = null
    this.#selectionAnchorNodeId = null
    this.#latestSelectionResolution = null
    this.#lastSnapshotSelectionIds = []
    this.#lastHandledContentKeydownEvent = null
    this.#pendingFocusedRowRevealNodeId = null
    this.#cachedRowFilterResult = null
    this.#cachedQuickMoveDestinationProjection = null
    this.#focusOwnership.reset()
    this.#inlineRenameController.clear()
    this.#dragDropController.clear()
  }

  private clearMountedOutput(): void {
    const sidepanelTab = this.#host.sidepanelTab
    const attachedRootParent = this.#contentRoot?.parentElement as HTMLElement | null

    if (attachedRootParent) {
      attachedRootParent.innerHTML = ""
      return
    }

    if (sidepanelTab?.contentEl) {
      sidepanelTab.contentEl.innerHTML = ""
      return
    }

    sidepanelTab?.setContent?.("")
  }

  private closeSidepanelPresentation(): void {
    const sidepanelLeaf = this.#host.getSidepanelLeaf?.()
    if (sidepanelLeaf?.detach) {
      try {
        sidepanelLeaf.detach()
        return
      } catch {
        // fall back to tab-level close below
      }
    }

    if (this.#host.closeSidepanelTab) {
      try {
        this.#host.closeSidepanelTab()
        return
      } catch {
        // best-effort close only
      }
    }

    try {
      this.#host.sidepanelTab?.close?.()
    } catch {
      // best-effort close only
    }
  }

  private handleHostExcalidrawViewClosed(): void {
    if (this.#handlingHostViewClose) {
      return
    }

    this.#handlingHostViewClose = true

    try {
      const hostViewContext = describeHostViewContext(this.#host)
      this.debugLifecycle("host excalidraw view closed", {
        activeFilePath: hostViewContext.activeFilePath,
        activeLeafIdentity: hostViewContext.activeWorkspaceLeafIdentity,
        activeViewType: hostViewContext.activeWorkspaceViewType,
        targetViewIdentity: hostViewContext.targetViewIdentity,
        targetViewFilePath: hostViewContext.targetViewFilePath,
      })
      this.clearMountedOutput()
      this.#mountManager.releaseLifecycleBinding()
      this.closeSidepanelPresentation()
      this.#mountManager.resetAfterClose()
      this.clearInteractiveBindings()
    } finally {
      this.#handlingHostViewClose = false
    }
  }

  private syncFocusOwnershipHostAuthority(
    sceneBinding: SidepanelSceneBinding = resolveSceneBindingFromHost(this.#host),
  ): void {
    this.#focusOwnership.setHostDocumentAuthority(
      sceneBinding.state === "live" && !sceneBinding.shouldAttemptRebind,
    )
  }

  private resolveInactiveHostPresentation(hostViewContext: SidepanelHostViewContextDescription): {
    readonly title: string
    readonly detail: string
    readonly hint: string
  } {
    if (hostViewContext.activeWorkspaceDefinitelyInactive) {
      return {
        title: "Layer Manager inactive",
        detail: "Active leaf is not Excalidraw.",
        hint: "Focus an Excalidraw view to resume live Layer Manager interaction.",
      }
    }

    if (
      hostViewContext.activeFileMetadataAvailable &&
      hostViewContext.activeFileExcalidrawCapable === false
    ) {
      return {
        title: "Layer Manager inactive",
        detail: "Active leaf is not Excalidraw.",
        hint: "Focus an Excalidraw view to resume live Layer Manager interaction.",
      }
    }

    if (
      hostViewContext.targetViewMetadataAvailable &&
      hostViewContext.targetViewExcalidrawCapable === false
    ) {
      return {
        title: "Layer Manager inactive",
        detail: "Bound host view is not Excalidraw.",
        hint: "Focus an Excalidraw view to resume live Layer Manager interaction.",
      }
    }

    return {
      title: "Layer Manager unbound",
      detail: "No active Excalidraw view is currently bound.",
      hint: "Focus an Excalidraw view to resume live Layer Manager interaction.",
    }
  }

  private renderInactiveHostState(
    hostViewContext: SidepanelHostViewContextDescription,
    model: RenderViewModel,
  ): void {
    const presentation = this.resolveInactiveHostPresentation(hostViewContext)
    this.debugLifecycle("rendering inactive sidepanel state", {
      title: presentation.title,
      detail: presentation.detail,
      activeFilePath: hostViewContext.activeFilePath,
      activeLeafIdentity: hostViewContext.activeWorkspaceLeafIdentity,
      activeViewType: hostViewContext.activeWorkspaceViewType,
      targetViewIdentity: hostViewContext.targetViewIdentity,
      targetViewFilePath: hostViewContext.targetViewFilePath,
      hostEligible: hostViewContext.hostEligible,
    })
    this.resetForInactiveHostState()

    const contentRoot = this.ensureContentRoot()
    if (!contentRoot) {
      this.#fallbackRenderer.render({
        ...model,
        tree: [],
        selectedIds: new Set<string>(),
      })
      return
    }

    const ownerDocument = contentRoot.ownerDocument
    contentRoot.innerHTML = ""
    this.#rowTreeRoot = null

    const statusCard = ownerDocument.createElement("div")
    statusCard.style.display = "flex"
    statusCard.style.flexDirection = "column"
    statusCard.style.gap = "6px"
    statusCard.style.padding = "10px"
    statusCard.style.border = "1px solid rgba(127, 127, 127, 0.35)"
    statusCard.style.borderRadius = "8px"
    statusCard.style.background = "rgba(127, 127, 127, 0.08)"

    const title = ownerDocument.createElement("div")
    title.textContent = presentation.title
    title.style.fontSize = "12px"
    title.style.fontWeight = "600"

    const detail = ownerDocument.createElement("div")
    detail.textContent = presentation.detail
    detail.style.fontSize = "11px"
    detail.style.lineHeight = "1.4"

    const hint = ownerDocument.createElement("div")
    hint.textContent = presentation.hint
    hint.style.fontSize = "11px"
    hint.style.lineHeight = "1.4"
    hint.style.opacity = "0.85"

    statusCard.appendChild(title)
    statusCard.appendChild(detail)
    statusCard.appendChild(hint)
    contentRoot.appendChild(statusCard)
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

    this.bindSidepanelViewChangeToCurrentTab()
    return this.#contentRoot
  }

  private requestRenderFromLatestModel(): void {
    if (this.#latestModel) {
      this.render(this.#latestModel)
    }
  }

  private requestDragDropPreviewRender(): void {
    if (this.refreshRenderedDragDropPreview()) {
      return
    }

    this.requestRenderFromLatestModel()
  }

  private refreshRenderedDragDropPreview(): boolean {
    const rowTreeRoot = this.#rowTreeRoot
    if (!rowTreeRoot) {
      return false
    }

    const nextHint = cloneDragDropHint(this.#dragDropController.dropHint)
    if (haveSameDragDropHint(this.#lastRenderedDragDropHint, nextHint)) {
      return true
    }

    if (nextHint && !this.#renderedRowPreviewStateByNodeId.has(nextHint.nodeId)) {
      return false
    }

    const affectedNodeIds = new Set<string>()
    if (this.#lastRenderedDragDropHint) {
      affectedNodeIds.add(this.#lastRenderedDragDropHint.nodeId)
    }
    if (nextHint) {
      affectedNodeIds.add(nextHint.nodeId)
    }

    for (const nodeId of affectedNodeIds) {
      const renderedRow = this.#renderedRowPreviewStateByNodeId.get(nodeId)
      if (!renderedRow) {
        continue
      }

      if (!rowTreeRoot.contains(renderedRow.row)) {
        return false
      }

      this.updateRenderedRowPreview(renderedRow, nextHint?.nodeId === nodeId ? nextHint : null)
    }

    this.#lastRenderedDragDropHint = nextHint
    return true
  }

  private updateRenderedRowPreview(
    renderedRow: RenderedRowPreviewState,
    activeDropHint: DragDropHint | null,
  ): void {
    const dropHintKind = resolveSidepanelRowDropHintKind(activeDropHint)

    applyRenderedRowPreviewShellState(renderedRow.row, {
      nodeVisualState: renderedRow.nodeVisualState,
      filterMatchKind: renderedRow.filterMatchKind,
      selected: renderedRow.selected,
      dropHintKind,
    })

    if (!activeDropHint || !dropHintKind) {
      if (renderedRow.dropHintAssistiveLabel) {
        renderedRow.dropHintAssistiveLabel.textContent = ""
        renderedRow.dropHintAssistiveLabel.style.display = "none"
      }
      return
    }

    const assistiveLabel =
      renderedRow.dropHintAssistiveLabel ??
      findRenderedRowDropHintAssistiveLabel(renderedRow.row) ??
      this.createDropHintAssistiveLabel(renderedRow.row)

    assistiveLabel.textContent = this.describeDropHint(
      activeDropHint,
      renderedRow.node,
      this.resolveDropTargetForNode(
        renderedRow.node,
        renderedRow.branchContext,
        renderedRow.siblingIndex,
      ),
    )
    assistiveLabel.style.display = ""
    renderedRow.dropHintAssistiveLabel = assistiveLabel
  }

  private createDropHintAssistiveLabel(row: HTMLDivElement): HTMLSpanElement {
    const assistiveLabel = row.ownerDocument.createElement("span")
    styleDropHintAssistiveLabel(assistiveLabel)
    row.appendChild(assistiveLabel)
    return assistiveLabel
  }

  private resetForViewContextBoundary(): void {
    this.#hostSelectionBridge.invalidatePendingSelectionMirror()
    this.cancelDeferredFocusRestore()
    this.#keyboardContext = null
    this.#focusedNodeId = null
    this.#selectionOverrideState = null
    this.#selectionAnchorNodeId = null
    this.#latestSelectionResolution = null
    this.#lastSnapshotSelectionIds = []
    this.#pendingFocusedRowRevealNodeId = null
    this.#rowFilterQuery = ""
    this.#shouldAutofocusRowFilterInput = false
    this.#cachedRowFilterResult = null
    this.#cachedQuickMoveDestinationProjection = null
    this.#lastHandledContentKeydownEvent = null
    this.#keyboardSuppressedUntilMs = 0
    this.clearRenderedRowPreviewState()
    this.#inlineRenameController.clear()
    this.#dragDropController.clear()
    this.#focusOwnership.reset()
  }

  private shouldPreserveSidepanelFocusAcrossHostViewContextChange(): boolean {
    if (this.#preserveSidepanelFocusForCurrentHostViewChange) {
      return true
    }

    const contentRoot = this.#contentRoot
    if (!contentRoot) {
      return false
    }

    const activeElement = contentRoot.ownerDocument.activeElement
    return !!(activeElement && contentRoot.contains(activeElement as HTMLElement))
  }

  private runWithCurrentHostViewChangeFocusPreservation<T>(
    preserveSidepanelFocus: boolean,
    action: () => T,
  ): T {
    const previous = this.#preserveSidepanelFocusForCurrentHostViewChange
    this.#preserveSidepanelFocusForCurrentHostViewChange = preserveSidepanelFocus

    try {
      return action()
    } finally {
      this.#preserveSidepanelFocusForCurrentHostViewChange = previous
    }
  }

  private resetForHostViewContextChange(preserveSidepanelFocus: boolean): void {
    this.resetForViewContextBoundary()

    if (preserveSidepanelFocus) {
      this.requestRowTreeAutofocus()
      return
    }

    this.#focusOwnership.setShouldAutofocusContentRoot(false)
  }

  private resetForInactiveHostState(): void {
    this.resetForViewContextBoundary()
  }

  private reconcileHostViewContextBeforeRender(sceneBinding: SidepanelSceneBinding): void {
    if (this.#lastRenderedSceneBinding === null) {
      return
    }

    if (this.#lastRenderedSceneBinding.refreshKey === sceneBinding.refreshKey) {
      return
    }

    const preserveSidepanelFocus = this.shouldPreserveSidepanelFocusAcrossHostViewContextChange()
    this.resetForHostViewContextChange(preserveSidepanelFocus)

    this.debugInteraction("host view context changed", {
      previousSceneBindingRefreshKey: this.#lastRenderedSceneBinding.refreshKey,
      nextSceneBindingRefreshKey: sceneBinding.refreshKey,
      previousSceneBindingSource: this.#lastRenderedSceneBinding.source,
      nextSceneBindingSource: sceneBinding.source,
      previousSceneBindingState: this.#lastRenderedSceneBinding.state,
      nextSceneBindingState: sceneBinding.state,
      preserveSidepanelFocus,
      ...this.buildHostViewDebugPayload(),
    })
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
    if (!elementIds) {
      this.setSelectionOverrideState(null)
      return
    }

    this.setSelectionOverrideState({
      elementIds: [...elementIds],
      nodeRefs: elementIds.length === 0 ? [] : null,
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

  private buildHostViewDebugPayload(): Record<string, unknown> {
    return {
      ...describeHostViewContext(this.#host),
    }
  }

  private applyResolvedRowSelectionGesture(input: RowSelectionGesture): void {
    this.#selectionAnchorNodeId = input.anchorNodeId

    if (input.selectedNodes.length > 0) {
      this.setSelectionOverrideFromNodes(input.selectedElementIds, input.selectedNodes)
    } else {
      this.setSelectionOverride([])
    }

    this.debugInteraction("row selection gesture", {
      source: input.source,
      ...resolveRowSelectionDebugSemantics(input.source),
      selectedNodeIds: input.selectedNodes.map((node) => node.id),
      selectedElementIds: [...input.selectedElementIds],
      anchorNodeId: input.anchorNodeId,
      focusedNodeId: this.#focusedNodeId,
      ...this.buildHostViewDebugPayload(),
    })

    this.#hostSelectionBridge.mirrorSelectionToHost(
      input.selectedElementIds,
      this.#lastRenderedSceneBinding ?? undefined,
    )
  }

  private reconcileSelectionAnchor(selectedNodes: readonly LayerNode[]): void {
    if (selectedNodes.length === 0) {
      this.#selectionAnchorNodeId = null
      return
    }

    if (this.#selectionOverrideState && this.#selectionAnchorNodeId) {
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
    const selectionResolution = this.resolveSelection(latestModel.tree, resolvedElementIds)
    const explicitSelectedNodeIds = (selectionResolution.explicitSelectedNodes ?? []).map(
      (node) => node.id,
    )
    const contextExplicitNodeIds = (context.explicitSelectedNodes ?? []).map((node) => node.id)

    if (
      haveSameIdsInSameOrder(resolvedElementIds, context.selection.elementIds) &&
      haveSameIds(explicitSelectedNodeIds, contextExplicitNodeIds) &&
      context.anchorNodeId === this.#selectionAnchorNodeId
    ) {
      return context
    }

    return {
      ...context,
      selection: selectionResolution.selection,
      explicitSelectedNodes: selectionResolution.explicitSelectedNodes,
      anchorNodeId: this.#selectionAnchorNodeId,
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

  private requestFocusedRowReveal(nodeId: string | null): void {
    this.#pendingFocusedRowRevealNodeId = nodeId
  }

  private scheduleDeferredFocusedRowReveal(contentRoot: HTMLElement): void {
    const focusedNodeId = this.#focusedNodeId
    if (!focusedNodeId) {
      return
    }

    this.requestFocusedRowReveal(focusedNodeId)

    Promise.resolve().then(() => {
      if (this.#contentRoot !== contentRoot || this.#focusedNodeId !== focusedNodeId) {
        return
      }

      this.revealFocusedRowWithinComfortBandIfNeeded()
    })
  }

  private resolveKeyboardPageNavigationStep(): number {
    const focusTargetRoot = this.getFocusTargetRoot()
    if (!focusTargetRoot) {
      return 1
    }

    const scrollContainer =
      this.resolveReviewCursorScrollContainer(focusTargetRoot) ?? focusTargetRoot
    const viewportHeight = resolveElementViewportHeight(scrollContainer)
    if (viewportHeight <= 0) {
      return 1
    }

    return Math.max(1, Math.floor(viewportHeight / ROW_MIN_HEIGHT_PX) - 1)
  }

  private revealFocusedRowWithinComfortBandIfNeeded(): void {
    const pendingNodeId = this.#pendingFocusedRowRevealNodeId
    if (!pendingNodeId || !this.#focusedNodeId || pendingNodeId !== this.#focusedNodeId) {
      return
    }

    this.#pendingFocusedRowRevealNodeId = null

    const rowElement = this.findElementById(
      this.#contentRoot,
      this.resolveRowDomId(this.#focusedNodeId),
    )
    if (!rowElement) {
      return
    }

    const scrollContainer = this.resolveReviewCursorScrollContainer(rowElement)
    if (!scrollContainer) {
      rowElement.scrollIntoView?.({
        block: "nearest",
      })
      return
    }

    const viewportHeight = resolveElementViewportHeight(scrollContainer)
    if (viewportHeight <= 0) {
      rowElement.scrollIntoView?.({
        block: "nearest",
      })
      return
    }

    const rowRect = rowElement.getBoundingClientRect?.()
    const containerRect = scrollContainer.getBoundingClientRect?.()
    if (!rowRect || !containerRect) {
      return
    }

    const comfortInset = this.resolveReviewCursorComfortInset(viewportHeight)
    const comfortTop = containerRect.top + comfortInset
    const comfortBottom = containerRect.bottom - comfortInset
    const currentScrollTop = resolveElementScrollTop(scrollContainer)
    let nextScrollTop = currentScrollTop

    if (rowRect.top < comfortTop) {
      nextScrollTop -= comfortTop - rowRect.top
    } else if (rowRect.bottom > comfortBottom) {
      nextScrollTop += rowRect.bottom - comfortBottom
    }

    const maxScrollTop = Math.max(0, resolveElementScrollHeight(scrollContainer) - viewportHeight)
    const clampedScrollTop = Math.max(0, Math.min(maxScrollTop, nextScrollTop))

    if (Math.abs(clampedScrollTop - currentScrollTop) < 1) {
      return
    }
    ;(scrollContainer as unknown as { scrollTop: number }).scrollTop = clampedScrollTop
  }

  private resolveReviewCursorComfortInset(viewportHeight: number): number {
    const desiredInset = Math.max(
      ROW_MIN_HEIGHT_PX * REVIEW_CURSOR_COMFORT_MIN_MARGIN_ROWS,
      Math.floor(viewportHeight * REVIEW_CURSOR_COMFORT_VIEWPORT_RATIO),
    )
    const maxInset = Math.floor(viewportHeight * REVIEW_CURSOR_COMFORT_MAX_VIEWPORT_RATIO)

    return Math.max(0, Math.min(desiredInset, maxInset))
  }

  private resolveReviewCursorScrollContainer(start: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = start

    while (current) {
      const viewportHeight = resolveElementViewportHeight(current)
      const scrollHeight = resolveElementScrollHeight(current)
      if (viewportHeight > 0 && scrollHeight > viewportHeight + 1) {
        return current
      }

      current = current.parentElement
    }

    return null
  }

  private findElementById(root: HTMLElement | null, targetId: string): HTMLElement | null {
    if (!root) {
      return null
    }

    if ((root as HTMLElement & { id?: string }).id === targetId) {
      return root
    }

    const childElements = Array.from(root.children ?? []) as HTMLElement[]
    for (const child of childElements) {
      const match = this.findElementById(child, targetId)
      if (match) {
        return match
      }
    }

    return null
  }

  private setFocusedNode(nodeId: string | null): void {
    if (nodeId === this.#focusedNodeId) {
      return
    }

    this.#focusedNodeId = nodeId
    this.requestFocusedRowReveal(nodeId)
    this.requestRowTreeAutofocus()
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
    preview: DragDropHint,
    node: LayerNode,
    dropTarget: NodeDropTarget,
  ): string {
    if (preview.kind === "reorder") {
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
        const activeDropHint =
          this.#dragDropController.dropHint?.nodeId === node.id
            ? this.#dragDropController.dropHint
            : null

        const currentInlineRenameState = this.#inlineRenameController.state
        const inlineRenameState: SidepanelInlineRenameRenderState | null =
          currentInlineRenameState?.nodeId === node.id ? currentInlineRenameState : null
        const selected = selectedNodeIds.has(node.id)
        const focused = this.#focusedNodeId === node.id
        const filterMatchKind = matchKindByNodeId.get(node.id) ?? "none"
        const nodeVisualState = resolveSidepanelRowVisualState(
          node,
          this.#latestModel?.elementStateById,
        )
        const dropHintKind = resolveSidepanelRowDropHintKind(activeDropHint)
        const { row, renameInputForAutofocus } = renderSidepanelRow({
          ownerDocument,
          rowDomId: this.resolveRowDomId(node.id),
          node,
          depth: nodeDepth,
          selected,
          focused,
          dropHintKind,
          dropHintLabel: activeDropHint
            ? this.describeDropHint(activeDropHint, node, nodeDropTarget)
            : null,
          actions,
          styleConfig: ROW_STYLE_CONFIG,
          nodeVisualState,
          filterMatchKind,
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

        this.#renderedRowPreviewStateByNodeId.set(node.id, {
          row,
          node,
          branchContext: nodeBranchContext,
          siblingIndex,
          selected,
          filterMatchKind,
          nodeVisualState,
          dropHintAssistiveLabel: findRenderedRowDropHintAssistiveLabel(row),
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

              this.applyResolvedRowSelectionGesture({
                source: event.shiftKey
                  ? "mouseRange"
                  : event.ctrlKey || event.metaKey
                    ? "mouseToggle"
                    : "mouseClick",
                ...nextSelection,
              })

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
    button.style.lineHeight = "1.2"
    button.style.minHeight = "20px"
    button.style.padding = "2px 7px"
    button.style.borderRadius = "5px"
    button.style.border = "1px solid var(--background-modifier-border, rgba(120,120,120,0.18))"
    button.style.background = "var(--background-primary-alt, rgba(120,120,120,0.04))"
    button.style.boxShadow = "none"
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

  const hostViewContext = describeHostViewContext(host)

  if (
    (hostViewContext.activeFileMetadataAvailable &&
      hostViewContext.activeFileExcalidrawCapable === false) ||
    (hostViewContext.targetViewMetadataAvailable &&
      hostViewContext.targetViewExcalidrawCapable === false)
  ) {
    return null
  }

  return new ExcalidrawSidepanelRenderer(host)
}
