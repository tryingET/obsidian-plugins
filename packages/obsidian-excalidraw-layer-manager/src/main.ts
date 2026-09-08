import type { EaLike, ObsidianAppLike } from "./adapter/excalidraw-types.js"
import { type ApplyPatchOutcome, readSnapshot } from "./adapter/excalidrawAdapter.js"
import { buildLayerTree } from "./domain/treeBuilder.js"
import { buildSceneIndexes } from "./model/indexes.js"
import type { ScenePatch } from "./model/patch.js"
import type { SceneSnapshot } from "./model/snapshot.js"
import {
  createLayerManagerCommandFacade,
  type LayerManagerCommandFacade,
} from "./runtime/commandFacade.js"
import type { CommandPlanner, ExecuteIntentOutcome } from "./runtime/intentExecution.js"
import { createRuntimeLifecycleActor } from "./runtime/runtimeLifecycleMachine.js"
import { LayerManagerController } from "./ui/controller.js"
import { createExcalidrawSidepanelRenderer } from "./ui/excalidrawSidepanelRenderer.js"
import { ConsoleRenderer, type LayerManagerRenderer } from "./ui/renderer.js"
import {
  clearKeyEventTrace,
  installKeyEventFlightRecorderGlobals,
} from "./ui/sidepanel/keyboard/layerManagerKeyboardEventFlightRecorder.js"
import {
  createSidepanelHostContextCoordinator,
  type SidepanelHostPrimarySignal,
} from "./ui/sidepanel/selection/hostContextCoordinator.js"
import {
  clearHostContextFlightRecorder,
  installHostContextFlightRecorderGlobals,
  isLifecycleDebugEnabled,
  traceHostContextLifecycleEvent,
} from "./ui/sidepanel/selection/hostContextFlightRecorder.js"
import {
  describeHostViewContext,
  recoverHostViewFromReplacedLeaf,
  type SidepanelReleasedViewContext,
} from "./ui/sidepanel/selection/hostViewContext.js"

export type { ApplyPatchOutcome } from "./adapter/excalidrawAdapter.js"
export type { CommandPlanner, ExecuteIntentOutcome } from "./runtime/intentExecution.js"

const readSelectedIdsFromAppState = (appState: unknown): ReadonlySet<string> | null => {
  if (!appState || typeof appState !== "object") {
    return null
  }

  const selectedElementIdsCandidate = (appState as Record<string, unknown>)["selectedElementIds"]

  if (!selectedElementIdsCandidate) {
    return null
  }

  if (Array.isArray(selectedElementIdsCandidate)) {
    return new Set(
      selectedElementIdsCandidate.filter((entry): entry is string => typeof entry === "string"),
    )
  }

  if (selectedElementIdsCandidate instanceof Set) {
    return new Set(
      [...selectedElementIdsCandidate].filter(
        (entry): entry is string => typeof entry === "string",
      ),
    )
  }

  if (typeof selectedElementIdsCandidate !== "object") {
    return null
  }

  const selectedById = selectedElementIdsCandidate as Record<string, unknown>
  const ids = Object.keys(selectedById).filter((id) => selectedById[id] === true)
  return new Set(ids)
}

const toSceneChangeUnsubscribe = (value: unknown): (() => void) | null => {
  return typeof value === "function" ? (value as () => void) : null
}

const WORKSPACE_ACTIVE_FILE_POLL_MS = 350
const READINESS_BACKOFF_MS = 2000

const toAppCandidate = (candidate: unknown): ObsidianAppLike | null => {
  return candidate && typeof candidate === "object" ? (candidate as ObsidianAppLike) : null
}

const hasWorkspaceSurface = (candidate: ObsidianAppLike | null): boolean => {
  return !!candidate?.workspace && typeof candidate.workspace === "object"
}

const resolveRuntimeApp = (ea: EaLike): ObsidianAppLike | null => {
  const targetViewApp = toAppCandidate(
    ea.targetView && typeof ea.targetView === "object"
      ? (ea.targetView as Record<string, unknown>)["app"]
      : null,
  )

  const canonicalCandidates = [
    ea.app,
    ea.obsidian?.app,
    (globalThis as Record<string, unknown>)["app"],
    (globalThis as { window?: { app?: unknown } }).window?.app,
    (globalThis as { obsidian?: { app?: unknown } }).obsidian?.app,
  ].map(toAppCandidate)

  for (const candidate of canonicalCandidates) {
    if (hasWorkspaceSurface(candidate)) {
      return candidate
    }
  }

  if (hasWorkspaceSurface(targetViewApp)) {
    return targetViewApp
  }

  for (const candidate of canonicalCandidates) {
    if (candidate) {
      return candidate
    }
  }

  return targetViewApp
}

export interface LayerManagerRuntime {
  refresh: () => void
  apply: (patch: ScenePatch) => Promise<ApplyPatchOutcome>
  executeIntent: (planner: CommandPlanner) => Promise<ExecuteIntentOutcome>
  getSnapshot: () => SceneSnapshot
  toggleExpanded: (nodeId: string) => void
  beginInteraction: () => void
  endInteraction: () => void
  withInteraction: <T>(operation: () => Promise<T> | T) => Promise<T>
  isInteractionActive: () => boolean
  dispose: () => void
  isDisposed: () => boolean
  commands: LayerManagerCommandFacade
}

export const createLayerManagerRuntime = (
  ea: EaLike,
  providedRenderer?: LayerManagerRenderer,
): LayerManagerRuntime => {
  const runtimeApp = resolveRuntimeApp(ea)
  const hostContextCoordinator = createSidepanelHostContextCoordinator(ea)
  let hostContextSnapshot = hostContextCoordinator.getSnapshot()
  let snapshot = readSnapshot(ea)
  let renderLatestSnapshot: () => void = () => {}
  let disposed = false
  let initialized = false
  let lifecycleFailure: { readonly error: unknown } | null = null
  let readinessTimer: ReturnType<typeof setTimeout> | null = null
  let readinessAttempts = 0
  let hostFocusReleased = false
  let releasedContext: SidepanelReleasedViewContext | null = null
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null
  let recoveryAttempts = 0
  let hostAuthorityEpoch = 0
  let sceneSubscriptionGeneration = 0
  let runtime: LayerManagerRuntime | null = null
  const renderer: LayerManagerRenderer =
    providedRenderer ??
    createExcalidrawSidepanelRenderer(ea, {
      requestRefresh: () => refresh(),
      requestDispose: () => dispose(),
      onFocus: (view) => {
        if (disposed) return
        const bindingChanged = hostContextSnapshot.currentTargetView !== view
        clearPendingReadiness()
        clearPendingRecovery()
        if (view === null && !hostFocusReleased) {
          const previousView = hostContextSnapshot.currentTargetView as { leaf?: unknown } | null
          releasedContext = {
            view: previousView,
            leaf: previousView?.leaf,
            workspace: runtimeApp?.workspace,
            filePath: hostContextSnapshot.targetViewFilePath,
          }
        }
        if (view !== null) releasedContext = null
        hostFocusReleased = view === null
        if (bindingChanged || hostFocusReleased) {
          hostAuthorityEpoch += 1
          selectedIdsHintFromOnChange = null
          clearSceneChangeSubscription()
        }
        reconcileHostContext("manual")
        if (hostFocusReleased) recoverReleasedView()
      },
    }) ??
    new ConsoleRenderer()
  let sceneChangeUnsubscribe: (() => void) | null = null
  let subscribedSceneChangeApi: unknown = null
  let activeSceneBindingKey = hostContextSnapshot.sceneBinding.sceneKey
  let subscribedSceneBindingKey: string | null = null
  let lifecycleActor: ReturnType<typeof createRuntimeLifecycleActor> | null = null
  let workspaceRefreshRefs: unknown[] = []
  let workspaceRefreshScheduled = false
  let workspaceActiveFilePoll: ReturnType<typeof setInterval> | null = null

  const sendLifecycleEvent = (
    event:
      | { readonly type: "BEGIN_INTERACTION" }
      | { readonly type: "END_INTERACTION" }
      | { readonly type: "REFRESH_REQUEST" }
      | { readonly type: "SCENE_CHANGE_NOTICED" }
      | {
          readonly type: "APPLY_REQUEST"
          readonly patch: ScenePatch
          readonly canExecute: () => boolean
          readonly resolve: (outcome: ApplyPatchOutcome) => void
          readonly reject: (error: unknown) => void
        }
      | {
          readonly type: "EXECUTE_INTENT_REQUEST"
          readonly planner: CommandPlanner
          readonly canExecute: () => boolean
          readonly resolve: (outcome: ExecuteIntentOutcome) => void
          readonly reject: (error: unknown) => void
        }
      | { readonly type: "DISPOSE" },
  ): void => {
    if (disposed || !lifecycleActor) {
      return
    }

    lifecycleActor.send(event)
  }

  const isInteractionActive = (): boolean => {
    if (disposed || !lifecycleActor) {
      return false
    }

    return lifecycleActor.getSnapshot().context.interactionDepth > 0
  }

  const isInteractionLifecycleSettled = (): boolean => {
    if (!lifecycleActor) {
      return true
    }

    const lifecycleSnapshot = lifecycleActor.getSnapshot()

    if (lifecycleSnapshot.matches({ active: { lifecycle: "interacting" } })) {
      return false
    }

    if (lifecycleSnapshot.matches({ active: { lifecycle: "refreshing" } })) {
      return false
    }

    return (
      lifecycleSnapshot.context.interactionDepth === 0 &&
      !lifecycleSnapshot.context.pendingRefreshWhileInteractive &&
      !lifecycleSnapshot.context.refreshRequested
    )
  }

  const waitForInteractionIdle = async (): Promise<void> => {
    if (disposed || !lifecycleActor || isInteractionLifecycleSettled()) {
      return
    }

    await new Promise<void>((resolve) => {
      const actor = lifecycleActor
      if (!actor) {
        resolve()
        return
      }

      let resolved = false
      const subscription = actor.subscribe(() => {
        if (resolved || !isInteractionLifecycleSettled()) {
          return
        }

        resolved = true
        subscription.unsubscribe()
        resolve()
      })

      if (!resolved && isInteractionLifecycleSettled()) {
        resolved = true
        subscription.unsubscribe()
        resolve()
      }
    })
  }

  const beginInteraction = (): void => {
    sendLifecycleEvent({ type: "BEGIN_INTERACTION" })
  }

  const endInteraction = (): void => {
    sendLifecycleEvent({ type: "END_INTERACTION" })
  }

  const withInteraction = async <T>(operation: () => Promise<T> | T): Promise<T> => {
    beginInteraction()

    try {
      return await operation()
    } finally {
      endInteraction()
    }
  }

  const controller = new LayerManagerController(
    {
      // Store subscription renders synchronously. Do not mount host UI until
      // every callback dependency and the runtime disposal handle exists.
      render: (model) => {
        if (!initialized || disposed) return
        try {
          renderer.render(model)
        } catch (error) {
          lifecycleFailure = { error }
          throw error
        }
      },
      notify: (message) => renderer.notify?.(message),
    },
    undefined,
    {
      waitForIdle: waitForInteractionIdle,
      beginInteraction,
      endInteraction,
    },
    () => {
      refresh()
    },
  )

  let selectedIdsHintFromOnChange: ReadonlySet<string> | null = null

  const reconcileHostContext = (
    signal: SidepanelHostPrimarySignal,
  ): ReturnType<typeof hostContextCoordinator.reconcile> => {
    const previousBindingKey = activeSceneBindingKey
    const result = hostFocusReleased
      ? hostContextCoordinator.reconcile("initial")
      : signal === "leaf-change"
        ? hostContextCoordinator.handleWorkspaceLeafChange()
        : signal === "poll"
          ? hostContextCoordinator.handlePollingFallback()
          : hostContextCoordinator.reconcile(signal)

    if (
      previousBindingKey !== result.snapshot.sceneBinding.sceneKey ||
      hostContextSnapshot.currentTargetView !== result.snapshot.currentTargetView ||
      (hostContextSnapshot.hasExplicitTargetViewProperty &&
        hostContextSnapshot.sceneApi !== result.snapshot.sceneApi)
    ) {
      hostAuthorityEpoch += 1
      clearPendingReadiness()
      clearSceneChangeSubscription()
    }
    hostContextSnapshot = result.snapshot
    activeSceneBindingKey = result.snapshot.sceneBinding.sceneKey

    if (result.changed || previousBindingKey !== result.snapshot.bindingKey) {
      selectedIdsHintFromOnChange = null
    }

    return result
  }

  const renderSnapshot = (nextSnapshot: SceneSnapshot): void => {
    const elementIds = new Set(nextSnapshot.elements.map((element) => element.id))

    const resolvedSelectedIds =
      hostContextSnapshot.state !== "live"
        ? new Set<string>()
        : selectedIdsHintFromOnChange
          ? new Set([...selectedIdsHintFromOnChange].filter((id) => elementIds.has(id)))
          : nextSnapshot.selectedIds

    snapshot = {
      ...nextSnapshot,
      selectedIds: resolvedSelectedIds,
    }

    const indexes = buildSceneIndexes(nextSnapshot)
    const tree = buildLayerTree(
      {
        elements: nextSnapshot.elements,
        expandedNodeIds: controller.getExpandedNodeIds(),
        groupFreedraw: nextSnapshot.settings.groupFreedraw,
      },
      indexes,
    )

    const elementStateById = new Map(
      nextSnapshot.elements.map(
        (element) =>
          [
            element.id,
            {
              opacity: element.opacity,
              locked: element.locked,
            },
          ] as const,
      ),
    )

    controller.setTree(tree, nextSnapshot.version, resolvedSelectedIds, elementStateById)
  }

  const clearSceneChangeSubscription = (): void => {
    // Invalidate before cleanup: unsubscribe may itself flush a saved callback.
    sceneSubscriptionGeneration += 1
    try {
      sceneChangeUnsubscribe?.()
    } catch {
      // no-op: best-effort cleanup only
    }

    sceneChangeUnsubscribe = null
    subscribedSceneChangeApi = null
    subscribedSceneBindingKey = null
  }

  const clearPendingReadiness = (): void => {
    if (readinessTimer !== null) clearTimeout(readinessTimer)
    readinessTimer = null
    readinessAttempts = 0
  }

  const clearPendingRecovery = (): void => {
    if (recoveryTimer !== null) clearTimeout(recoveryTimer)
    recoveryTimer = null
    recoveryAttempts = 0
  }

  const recoverReleasedView = (): void => {
    if (disposed || !hostFocusReleased || !releasedContext) return
    let relevant = false
    try {
      const leaf = releasedContext.leaf as { view?: { file?: { path?: string } } } | null
      const workspace = releasedContext.workspace as
        | { activeLeaf?: unknown; getMostRecentLeaf?: () => unknown }
        | undefined
      const replacementPath = leaf?.view?.file?.path
      relevant =
        !!leaf &&
        (workspace?.activeLeaf === leaf || workspace?.getMostRecentLeaf?.() === leaf) &&
        (!releasedContext.filePath ||
          !replacementPath ||
          replacementPath === releasedContext.filePath)
    } catch {
      // A detached/destroyed host leaf is not authority to keep polling it.
    }
    if (!relevant) {
      clearPendingRecovery()
      releasedContext = null
      return
    }
    const result = recoverHostViewFromReplacedLeaf(ea, releasedContext)
    // Keep one cancellable timer for this same drawing. After the bounded fast
    // phase, readiness no longer depends on an accidental later workspace event.
    if (result !== "recovered") {
      if (recoveryTimer === null) {
        const delay = recoveryAttempts < 20 ? WORKSPACE_ACTIVE_FILE_POLL_MS : READINESS_BACKOFF_MS
        recoveryAttempts = Math.min(recoveryAttempts + 1, 20)
        recoveryTimer = setTimeout(() => {
          recoveryTimer = null
          recoverReleasedView()
        }, delay)
      }
      return
    }
    clearPendingRecovery()
    if (result === "recovered") {
      hostFocusReleased = false
      releasedContext = null
      traceHostContextLifecycleEvent("rebind", "same-leaf replacement ready", {})
      reconcileHostContext("manual")
      scheduleHostContextRefresh()
    }
  }

  const clearWorkspaceRefreshSubscriptions = (): void => {
    clearPendingReadiness()
    clearPendingRecovery()
    releasedContext = null
    const workspace = runtimeApp?.workspace

    for (const ref of workspaceRefreshRefs) {
      if (typeof ref === "function") {
        try {
          ref()
        } catch {
          // no-op: best-effort cleanup only
        }
        continue
      }

      try {
        workspace?.offref?.(ref)
      } catch {
        // no-op: best-effort cleanup only
      }
    }

    if (workspaceActiveFilePoll !== null) {
      clearInterval(workspaceActiveFilePoll)
      workspaceActiveFilePoll = null
    }

    workspaceRefreshRefs = []
    workspaceRefreshScheduled = false
  }

  const scheduleHostContextRefresh = (): void => {
    if (disposed || workspaceRefreshScheduled) {
      return
    }

    workspaceRefreshScheduled = true

    Promise.resolve().then(() => {
      workspaceRefreshScheduled = false

      if (disposed) {
        return
      }

      sendLifecycleEvent({ type: "REFRESH_REQUEST" })
    })
  }

  const shouldScheduleHostContextRefresh = (input: {
    readonly previousRefreshKey: string
    readonly result: ReturnType<typeof hostContextCoordinator.reconcile>
  }): boolean => {
    return (
      input.result.changed ||
      input.result.rebound ||
      input.previousRefreshKey !== input.result.snapshot.sceneBinding.refreshKey
    )
  }

  const logHostContextRefreshDecision = (input: {
    readonly source: string
    readonly previousBindingKey: string
    readonly previousRefreshKey: string
    readonly previousState: (typeof hostContextSnapshot)["state"]
    readonly previousShouldAttemptRebind: boolean
    readonly result: ReturnType<typeof hostContextCoordinator.reconcile>
    readonly scheduledRefresh: boolean
  }): void => {
    if (
      !input.result.changed &&
      !input.result.rebound &&
      !input.scheduledRefresh &&
      input.previousBindingKey === input.result.snapshot.bindingKey &&
      input.previousRefreshKey === input.result.snapshot.sceneBinding.refreshKey
    ) {
      return
    }

    traceHostContextLifecycleEvent("signal", "host-context signal reconciled", {
      source: input.source,
      changed: input.result.changed,
      rebound: input.result.rebound,
      scheduledRefresh: input.scheduledRefresh,
      previousBindingKey: input.previousBindingKey,
      nextBindingKey: input.result.snapshot.bindingKey,
      previousRefreshKey: input.previousRefreshKey,
      nextRefreshKey: input.result.snapshot.sceneBinding.refreshKey,
      sceneRefSource: input.result.snapshot.sceneBinding.source,
      previousState: input.previousState,
      nextState: input.result.snapshot.state,
      previousShouldAttemptRebind: input.previousShouldAttemptRebind,
      nextShouldAttemptRebind: input.result.snapshot.shouldAttemptRebind,
      activeFilePath: input.result.snapshot.activeFilePath,
      activeLeafIdentity: input.result.snapshot.activeLeafIdentity,
      activeViewType: input.result.snapshot.activeViewType,
      targetViewIdentity: input.result.snapshot.targetViewIdentity,
      targetViewFilePath: input.result.snapshot.targetViewFilePath,
      targetViewUsable: input.result.snapshot.targetViewUsable,
      cachedTargetViewIdentity: input.result.snapshot.cachedTargetViewIdentity,
    })
  }

  const subscribeToWorkspaceRefresh = (): void => {
    const workspace = runtimeApp?.workspace
    if (!workspace) {
      traceHostContextLifecycleEvent("startup", "workspace refresh infrastructure unavailable", {
        runtimeAppResolved: runtimeApp !== null,
        hasWorkspace: false,
        hasWorkspaceOn: false,
        hasWorkspaceOffref: false,
        pollArmed: false,
        initialState: hostContextSnapshot.state,
        initialBindingKey: hostContextSnapshot.bindingKey,
      })
      return
    }

    if (workspaceRefreshRefs.length === 0) {
      const on = workspace.on

      if (on) {
        for (const eventName of ["file-open", "active-leaf-change", "layout-change"]) {
          try {
            const ref = on.call(workspace, eventName, () => {
              if (disposed) return
              if (hostFocusReleased) {
                if (recoveryTimer === null) recoveryAttempts = 0
                recoverReleasedView()
              }
              const previousBindingKey = activeSceneBindingKey
              const previousRefreshKey = hostContextSnapshot.sceneBinding.refreshKey
              const previousState = hostContextSnapshot.state
              const previousShouldAttemptRebind = hostContextSnapshot.shouldAttemptRebind
              const reconcileResult = reconcileHostContext("leaf-change")
              const scheduledRefresh = shouldScheduleHostContextRefresh({
                previousRefreshKey,
                result: reconcileResult,
              })

              logHostContextRefreshDecision({
                source: `workspace:${eventName}`,
                previousBindingKey,
                previousRefreshKey,
                previousState,
                previousShouldAttemptRebind,
                result: reconcileResult,
                scheduledRefresh,
              })

              if (!scheduledRefresh) {
                return
              }

              scheduleHostContextRefresh()
            })

            if (ref !== undefined) {
              workspaceRefreshRefs.push(ref)
            }
          } catch {
            // keep subscribing to remaining bounded workspace events
          }
        }
      }
    }

    const shouldArmPollingFallback = workspaceRefreshRefs.length === 0

    if (shouldArmPollingFallback && workspaceActiveFilePoll === null) {
      workspaceActiveFilePoll = setInterval(() => {
        const previousBindingKey = activeSceneBindingKey
        const previousRefreshKey = hostContextSnapshot.sceneBinding.refreshKey
        const previousState = hostContextSnapshot.state
        const previousShouldAttemptRebind = hostContextSnapshot.shouldAttemptRebind
        const reconcileResult = reconcileHostContext("poll")
        const scheduledRefresh = shouldScheduleHostContextRefresh({
          previousRefreshKey,
          result: reconcileResult,
        })

        logHostContextRefreshDecision({
          source: "workspace:poll",
          previousBindingKey,
          previousRefreshKey,
          previousState,
          previousShouldAttemptRebind,
          result: reconcileResult,
          scheduledRefresh,
        })

        if (!scheduledRefresh) {
          return
        }

        scheduleHostContextRefresh()
      }, WORKSPACE_ACTIVE_FILE_POLL_MS)
    }

    traceHostContextLifecycleEvent("startup", "workspace refresh infrastructure ready", {
      runtimeAppResolved: true,
      hasWorkspace: true,
      hasWorkspaceOn: typeof workspace.on === "function",
      hasWorkspaceOffref: typeof workspace.offref === "function",
      subscribedEvents: workspaceRefreshRefs.length,
      pollArmed: workspaceActiveFilePoll !== null,
      pollIntervalMs: WORKSPACE_ACTIVE_FILE_POLL_MS,
      initialState: hostContextSnapshot.state,
      initialBindingKey: hostContextSnapshot.bindingKey,
      activeFilePath: hostContextSnapshot.activeFilePath,
      activeLeafIdentity: hostContextSnapshot.activeLeafIdentity,
      activeViewType: hostContextSnapshot.activeViewType,
      targetViewIdentity: hostContextSnapshot.targetViewIdentity,
      targetViewFilePath: hostContextSnapshot.targetViewFilePath,
    })
  }

  const scheduleApiReadinessCheck = (): void => {
    if (disposed || readinessTimer !== null) return
    const expectedView = ea.targetView
    if (!expectedView || typeof expectedView !== "object" || hostFocusReleased) return
    const view = expectedView as { getViewType?: () => string; excalidrawAPI?: unknown }
    if (view.getViewType && view.getViewType() !== "excalidraw") return
    if (!ea.getExcalidrawAPI && !("excalidrawAPI" in view)) return
    const delay = readinessAttempts < 20 ? WORKSPACE_ACTIVE_FILE_POLL_MS : READINESS_BACKOFF_MS
    readinessAttempts = Math.min(readinessAttempts + 1, 20)
    readinessTimer = setTimeout(() => {
      readinessTimer = null
      if (disposed || hostFocusReleased) return
      if (ea.targetView !== expectedView) {
        clearPendingReadiness()
        reconcileHostContext("manual")
        scheduleHostContextRefresh()
        return
      }
      reconcileHostContext("manual")
      if (hostContextSnapshot.sceneApi) {
        readinessAttempts = 0
        scheduleHostContextRefresh()
      } else {
        scheduleApiReadinessCheck()
      }
    }, delay)
  }

  const subscribeToSceneChanges = (): void => {
    if (disposed) return
    const api = hostContextSnapshot.sceneApi

    const currentSceneBindingKey = activeSceneBindingKey
    const sceneBindingChanged = currentSceneBindingKey !== subscribedSceneBindingKey

    if (sceneBindingChanged) {
      selectedIdsHintFromOnChange = null
    }

    if (!api) {
      clearSceneChangeSubscription()
      scheduleApiReadinessCheck()
      return
    }
    if (readinessTimer !== null) clearTimeout(readinessTimer)
    readinessTimer = null
    readinessAttempts = 0

    if (api === subscribedSceneChangeApi && !sceneBindingChanged) {
      return
    }

    clearSceneChangeSubscription()
    subscribedSceneChangeApi = api
    subscribedSceneBindingKey = currentSceneBindingKey

    const onChange = (
      api as {
        readonly onChange?: (
          callback: (elements: readonly unknown[], appState: unknown, files: unknown) => void,
        ) => unknown
      }
    ).onChange

    if (!onChange) {
      return
    }

    const subscriptionGeneration = sceneSubscriptionGeneration
    try {
      const unsubscribeCandidate = onChange.call(api, (_elements, appState) => {
        if (
          disposed ||
          subscriptionGeneration !== sceneSubscriptionGeneration ||
          api !== subscribedSceneChangeApi ||
          currentSceneBindingKey !== subscribedSceneBindingKey
        )
          return
        selectedIdsHintFromOnChange = readSelectedIdsFromAppState(appState)
        sendLifecycleEvent({ type: "SCENE_CHANGE_NOTICED" })
      })
      sceneChangeUnsubscribe = toSceneChangeUnsubscribe(unsubscribeCandidate)
    } catch {
      // no-op: host may expose a partial API without change subscriptions
    }
  }

  renderLatestSnapshot = (): void => {
    if (disposed) {
      return
    }

    reconcileHostContext("manual")
    const nextSnapshot = hostFocusReleased
      ? { ...snapshot, version: snapshot.version + 1, elements: [], selectedIds: new Set<string>() }
      : readSnapshot(ea)
    reconcileHostContext("manual")
    renderSnapshot({
      ...nextSnapshot,
      version: Math.max(nextSnapshot.version, snapshot.version + 1),
    })
    subscribeToSceneChanges()
  }

  lifecycleActor = createRuntimeLifecycleActor({
    ea,
    renderLatestSnapshot,
  })
  const refresh = (): void => {
    sendLifecycleEvent({ type: "REFRESH_REQUEST" })
    if (lifecycleFailure) throw lifecycleFailure.error
  }

  const captureMutationAuthority = (): (() => boolean) => {
    const epoch = hostAuthorityEpoch
    const targetView = ea.targetView
    const view = targetView as
      | {
          excalidrawAPI?: unknown
          leaf?: { view?: unknown }
        }
      | null
      | undefined
    const api = view?.excalidrawAPI
    const leafView = view?.leaf?.view
    return () =>
      !disposed &&
      !hostFocusReleased &&
      epoch === hostAuthorityEpoch &&
      targetView === ea.targetView &&
      api === view?.excalidrawAPI &&
      leafView === view?.leaf?.view
  }

  const apply = async (patch: ScenePatch): Promise<ApplyPatchOutcome> => {
    if (disposed) {
      throw new Error("Layer Manager runtime disposed.")
    }

    if (hostFocusReleased)
      return { status: "capabilityMissing", reason: "No active Excalidraw view." }
    return new Promise<ApplyPatchOutcome>((resolve, reject) => {
      sendLifecycleEvent({
        type: "APPLY_REQUEST",
        patch,
        canExecute: captureMutationAuthority(),
        resolve,
        reject,
      })
    })
  }

  const executeIntent = async (planner: CommandPlanner): Promise<ExecuteIntentOutcome> => {
    if (disposed) {
      throw new Error("Layer Manager runtime disposed.")
    }

    if (hostFocusReleased)
      return { status: "capabilityMissing", reason: "No active Excalidraw view.", attempts: 1 }
    // Canonical write path owner:
    // read snapshot -> build indexes -> plan command -> adapter preflight/apply -> refresh.
    return new Promise<ExecuteIntentOutcome>((resolve, reject) => {
      sendLifecycleEvent({
        type: "EXECUTE_INTENT_REQUEST",
        planner,
        canExecute: captureMutationAuthority(),
        resolve,
        reject,
      })
    })
  }

  const commands = createLayerManagerCommandFacade({
    executeIntent,
    notify: (message) => {
      controller.notify(message)
    },
  })

  const dispose = (): void => {
    if (disposed) {
      return
    }

    disposed = true
    const failedSnapshot = lifecycleActor?.getSnapshot()
    if (failedSnapshot?.status === "error") {
      const error = lifecycleFailure?.error ?? new Error("Layer Manager runtime failed.")
      failedSnapshot.context.activeMutation?.reject(error)
      for (const request of failedSnapshot.context.mutationQueue) request.reject(error)
    }
    lifecycleActor?.send({ type: "DISPOSE" })
    lifecycleActor?.stop()
    lifecycleActor = null
    clearSceneChangeSubscription()
    clearWorkspaceRefreshSubscriptions()
    if (runtimeGlobal.excalidrawLayerManagerRuntime === runtime) {
      Reflect.deleteProperty(runtimeGlobal, "excalidrawLayerManagerRuntime")
    }
    try {
      renderer.dispose?.()
    } finally {
      controller.dispose()
    }
  }

  controller.setCommandFacade(commands)

  const toggleExpanded = (nodeId: string): void => {
    controller.toggleExpanded(nodeId)
  }

  runtime = {
    refresh,
    apply,
    executeIntent,
    getSnapshot: () => snapshot,
    toggleExpanded,
    beginInteraction,
    endInteraction,
    withInteraction,
    isInteractionActive,
    dispose,
    isDisposed: () => disposed,
    commands,
  }
  lifecycleActor.subscribe({
    error: (error) => {
      lifecycleFailure = { error }
      try {
        dispose()
      } catch {
        // Preserve the original actor failure after best-effort teardown.
      }
    },
  })
  initialized = true
  try {
    lifecycleActor.start()
    subscribeToWorkspaceRefresh()
    refresh()
  } catch (error) {
    try {
      dispose()
    } catch {
      // Startup must report the triggering failure, not a cleanup exception.
    }
    throw error
  }
  return runtime
}

type RuntimeGlobal = typeof globalThis & {
  excalidrawLayerManagerRuntime?: LayerManagerRuntime
}

declare const ea: EaLike | undefined

const runtimeGlobal = globalThis as RuntimeGlobal

const resolveScriptEa = (): EaLike | undefined => {
  if (typeof ea !== "undefined" && ea) {
    return ea
  }

  const globalEa = (globalThis as { readonly ea?: EaLike }).ea
  if (globalEa) {
    return globalEa
  }

  return undefined
}

const scriptEa = resolveScriptEa()
if (scriptEa) {
  const Notice = scriptEa.obsidian?.Notice
  installHostContextFlightRecorderGlobals({ Notice })
  installKeyEventFlightRecorderGlobals()
  clearHostContextFlightRecorder()
  clearKeyEventTrace()
  traceHostContextLifecycleEvent("startup", "LayerManager script executed", {
    runtimeAppResolved: resolveRuntimeApp(scriptEa) !== null,
    ...describeHostViewContext(scriptEa),
  })

  if (isLifecycleDebugEnabled()) {
    if (Notice) {
      new Notice("[LMX] LayerManager script executed.", 2200)
    }

    console.log("[LMX] LayerManager script executed.")
    console.log("[LMX] EA pre-runtime context", {
      ...describeHostViewContext(scriptEa),
    })
  }

  runtimeGlobal.excalidrawLayerManagerRuntime?.dispose?.()
  const candidate = createLayerManagerRuntime(scriptEa)
  // A synchronous host open/focus callback can terminally close startup.
  if (!candidate.isDisposed()) runtimeGlobal.excalidrawLayerManagerRuntime = candidate
} else {
  installHostContextFlightRecorderGlobals()
  installKeyEventFlightRecorderGlobals()
  clearHostContextFlightRecorder()
  clearKeyEventTrace()
  traceHostContextLifecycleEvent(
    "startup",
    "No active Excalidraw context (ea missing). Open an Excalidraw drawing and rerun LayerManager.",
    {
      hasScriptEa: false,
      runtimeAppResolved: false,
    },
  )

  if (isLifecycleDebugEnabled()) {
    console.log(
      "[LMX] No active Excalidraw context (ea missing). Open an Excalidraw drawing and rerun LayerManager.",
    )
  }
}
