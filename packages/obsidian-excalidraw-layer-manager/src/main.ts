import type { EaLike, ObsidianAppLike } from "./adapter/excalidraw-types.js"
import { readSnapshot } from "./adapter/excalidrawAdapter.js"
import { buildLayerTree } from "./domain/treeBuilder.js"
import { buildSceneIndexes } from "./model/indexes.js"
import type { ScenePatch } from "./model/patch.js"
import type { SceneSnapshot } from "./model/snapshot.js"
import {
  type LayerManagerCommandFacade,
  createLayerManagerCommandFacade,
} from "./runtime/commandFacade.js"
import type { CommandPlanner, ExecuteIntentOutcome } from "./runtime/intentExecution.js"
import { createRuntimeLifecycleActor } from "./runtime/runtimeLifecycleMachine.js"
import { LayerManagerController } from "./ui/controller.js"
import { createExcalidrawSidepanelRenderer } from "./ui/excalidrawSidepanelRenderer.js"
import { ConsoleRenderer, type LayerManagerRenderer } from "./ui/renderer.js"
import {
  type SidepanelHostPrimarySignal,
  createSidepanelHostContextCoordinator,
} from "./ui/sidepanel/selection/hostContextCoordinator.js"
import {
  clearHostContextFlightRecorder,
  installHostContextFlightRecorderGlobals,
  isLifecycleDebugEnabled,
  traceHostContextLifecycleEvent,
} from "./ui/sidepanel/selection/hostContextFlightRecorder.js"
import { describeHostViewContext } from "./ui/sidepanel/selection/hostViewContext.js"

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

const resolveRuntimeApp = (ea: EaLike): ObsidianAppLike | null => {
  const targetViewApp =
    ea.targetView && typeof ea.targetView === "object"
      ? ((ea.targetView as Record<string, unknown>)["app"] ?? null)
      : null

  const candidates = [
    targetViewApp,
    ea.app,
    ea.obsidian?.app,
    (globalThis as Record<string, unknown>)["app"],
    (globalThis as { window?: { app?: unknown } }).window?.app,
    (globalThis as { obsidian?: { app?: unknown } }).obsidian?.app,
  ]

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      return candidate as ObsidianAppLike
    }
  }

  return null
}

export interface LayerManagerRuntime {
  refresh: () => void
  apply: (patch: ScenePatch) => Promise<void>
  executeIntent: (planner: CommandPlanner) => Promise<ExecuteIntentOutcome>
  getSnapshot: () => SceneSnapshot
  toggleExpanded: (nodeId: string) => void
  beginInteraction: () => void
  endInteraction: () => void
  withInteraction: <T>(operation: () => Promise<T> | T) => Promise<T>
  isInteractionActive: () => boolean
  dispose: () => void
  commands: LayerManagerCommandFacade
}

export const createLayerManagerRuntime = (
  ea: EaLike,
  renderer: LayerManagerRenderer = createExcalidrawSidepanelRenderer(ea) ?? new ConsoleRenderer(),
): LayerManagerRuntime => {
  const hostContextCoordinator = createSidepanelHostContextCoordinator(ea)
  let hostContextSnapshot = hostContextCoordinator.getSnapshot()
  let snapshot = readSnapshot(ea)
  let renderLatestSnapshot: () => void = () => {}
  let disposed = false
  let sceneChangeUnsubscribe: (() => void) | null = null
  let subscribedSceneChangeApi: unknown = null
  let activeViewContextKey = hostContextSnapshot.bindingKey
  let subscribedViewContextKey: string | null = null
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
          readonly resolve: () => void
          readonly reject: (error: unknown) => void
        }
      | {
          readonly type: "EXECUTE_INTENT_REQUEST"
          readonly planner: CommandPlanner
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
    renderer,
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
    const previousBindingKey = activeViewContextKey
    const result =
      signal === "leaf-change"
        ? hostContextCoordinator.handleWorkspaceLeafChange()
        : signal === "poll"
          ? hostContextCoordinator.handlePollingFallback()
          : hostContextCoordinator.reconcile(signal)

    hostContextSnapshot = result.snapshot
    activeViewContextKey = result.snapshot.bindingKey

    if (result.changed || previousBindingKey !== result.snapshot.bindingKey) {
      selectedIdsHintFromOnChange = null
    }

    return result
  }

  const renderSnapshot = (nextSnapshot: SceneSnapshot): void => {
    const elementIds = new Set(nextSnapshot.elements.map((element) => element.id))

    const resolvedSelectedIds = selectedIdsHintFromOnChange
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
    try {
      sceneChangeUnsubscribe?.()
    } catch {
      // no-op: best-effort cleanup only
    }

    sceneChangeUnsubscribe = null
    subscribedSceneChangeApi = null
    subscribedViewContextKey = null
  }

  const clearWorkspaceRefreshSubscriptions = (): void => {
    const workspace = resolveRuntimeApp(ea)?.workspace

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
    readonly previousBindingKey: string
    readonly previousState: (typeof hostContextSnapshot)["state"]
    readonly previousShouldAttemptRebind: boolean
    readonly result: ReturnType<typeof hostContextCoordinator.reconcile>
  }): boolean => {
    return (
      input.result.rebound ||
      input.previousBindingKey !== input.result.snapshot.bindingKey ||
      input.previousState !== input.result.snapshot.state ||
      input.previousShouldAttemptRebind !== input.result.snapshot.shouldAttemptRebind
    )
  }

  const logHostContextRefreshDecision = (input: {
    readonly source: string
    readonly previousBindingKey: string
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
      input.previousState === input.result.snapshot.state &&
      input.previousShouldAttemptRebind === input.result.snapshot.shouldAttemptRebind
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
    const runtimeApp = resolveRuntimeApp(ea)
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
        for (const eventName of ["file-open", "active-leaf-change"]) {
          try {
            const ref = on.call(workspace, eventName, () => {
              const previousBindingKey = activeViewContextKey
              const previousState = hostContextSnapshot.state
              const previousShouldAttemptRebind = hostContextSnapshot.shouldAttemptRebind
              const reconcileResult = reconcileHostContext("leaf-change")
              const scheduledRefresh = shouldScheduleHostContextRefresh({
                previousBindingKey,
                previousState,
                previousShouldAttemptRebind,
                result: reconcileResult,
              })

              logHostContextRefreshDecision({
                source: `workspace:${eventName}`,
                previousBindingKey,
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

    if (workspaceActiveFilePoll === null) {
      workspaceActiveFilePoll = setInterval(() => {
        const previousBindingKey = activeViewContextKey
        const previousState = hostContextSnapshot.state
        const previousShouldAttemptRebind = hostContextSnapshot.shouldAttemptRebind
        const reconcileResult = reconcileHostContext("poll")
        const scheduledRefresh = shouldScheduleHostContextRefresh({
          previousBindingKey,
          previousState,
          previousShouldAttemptRebind,
          result: reconcileResult,
        })

        logHostContextRefreshDecision({
          source: "workspace:poll",
          previousBindingKey,
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

  const subscribeToSceneChanges = (): void => {
    const api = hostContextSnapshot.sceneApi

    const currentViewContextKey = activeViewContextKey
    const viewContextChanged = currentViewContextKey !== subscribedViewContextKey

    if (viewContextChanged) {
      selectedIdsHintFromOnChange = null
    }

    if (!api) {
      clearSceneChangeSubscription()
      return
    }

    if (api === subscribedSceneChangeApi && !viewContextChanged) {
      return
    }

    clearSceneChangeSubscription()
    subscribedSceneChangeApi = api
    subscribedViewContextKey = currentViewContextKey

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

    try {
      const unsubscribeCandidate = onChange((_elements, appState) => {
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
    const nextSnapshot = readSnapshot(ea)
    reconcileHostContext("manual")
    renderSnapshot(nextSnapshot)
    subscribeToSceneChanges()
  }

  lifecycleActor = createRuntimeLifecycleActor({
    ea,
    renderLatestSnapshot,
  })
  lifecycleActor.start()

  const refresh = (): void => {
    sendLifecycleEvent({ type: "REFRESH_REQUEST" })
  }

  const apply = async (patch: ScenePatch): Promise<void> => {
    if (disposed) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      sendLifecycleEvent({
        type: "APPLY_REQUEST",
        patch,
        resolve,
        reject,
      })
    })
  }

  const executeIntent = async (planner: CommandPlanner): Promise<ExecuteIntentOutcome> => {
    if (disposed) {
      throw new Error("Layer Manager runtime disposed.")
    }

    // Canonical write path owner:
    // read snapshot -> build indexes -> plan command -> adapter preflight/apply -> refresh.
    return new Promise<ExecuteIntentOutcome>((resolve, reject) => {
      sendLifecycleEvent({
        type: "EXECUTE_INTENT_REQUEST",
        planner,
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

    sendLifecycleEvent({ type: "DISPOSE" })
    lifecycleActor?.stop()
    lifecycleActor = null
    disposed = true
    clearSceneChangeSubscription()
    clearWorkspaceRefreshSubscriptions()
    renderer.dispose?.()
    controller.dispose()
  }

  controller.setCommandFacade(commands)

  const toggleExpanded = (nodeId: string): void => {
    controller.toggleExpanded(nodeId)
  }

  subscribeToWorkspaceRefresh()
  refresh()

  return {
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
    commands,
  }
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
  clearHostContextFlightRecorder()
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
  runtimeGlobal.excalidrawLayerManagerRuntime = createLayerManagerRuntime(scriptEa)
} else {
  installHostContextFlightRecorderGlobals()
  clearHostContextFlightRecorder()
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
