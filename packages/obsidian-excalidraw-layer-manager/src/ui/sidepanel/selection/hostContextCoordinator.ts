import {
  type SidepanelHostContextShellState,
  type SidepanelHostViewContextHost,
  type SidepanelHostViewObservation,
  bindHostViewToActiveWorkspaceView,
  getCurrentHostTargetView,
  isUsableTargetView,
  observeHostViewContext,
  resolveHostViewContextKeyFromObservation,
  resolveHostViewContextShellStateFromObservation,
  resolveLiveExcalidrawApiFromTargetView,
  resolveTargetViewIdentity,
  shouldRebindHostViewToActiveWorkspaceView,
} from "./hostViewContext.js"

export type SidepanelHostPrimarySignal =
  | "initial"
  | "manual"
  | "leaf-change"
  | "sidepanel-view-change"
  | "poll"

export interface SidepanelHostContextSnapshot {
  readonly bindingKey: string
  readonly state: SidepanelHostContextShellState
  readonly activeFilePath: string | null
  readonly activeLeafIdentity: string | null
  readonly activeViewType: string | null
  readonly targetViewIdentity: string | null
  readonly targetViewFilePath: string | null
  readonly targetViewUsable: boolean
  readonly hasExplicitTargetViewProperty: boolean
  readonly hostEligible: boolean
  readonly shouldAttemptRebind: boolean
  readonly canOwnKeyboardRouting: boolean
  readonly sceneApi: unknown | null
  readonly currentTargetView: unknown | null
  readonly hasCachedTargetView: boolean
  readonly cachedTargetViewIdentity: string | null
  readonly signal: SidepanelHostPrimarySignal
}

export interface SidepanelHostContextReconcileResult {
  readonly snapshot: SidepanelHostContextSnapshot
  readonly changed: boolean
  readonly rebound: boolean
}

export interface SidepanelHostContextCoordinatorHost extends SidepanelHostViewContextHost {
  readonly getExcalidrawAPI?: () => unknown
}

export interface SidepanelHostContextCoordinatorOptions {
  readonly autoRebindSignals?: readonly SidepanelHostPrimarySignal[]
}

const DEFAULT_AUTO_REBIND_SIGNALS = new Set<SidepanelHostPrimarySignal>([
  "manual",
  "leaf-change",
  "sidepanel-view-change",
  "poll",
])

const resolveSceneApi = (
  host: SidepanelHostContextCoordinatorHost,
  observation: SidepanelHostViewObservation,
): unknown | null => {
  if (observation.hasExplicitTargetViewProperty) {
    return resolveLiveExcalidrawApiFromTargetView(observation.targetView) ?? null
  }

  try {
    return host.getExcalidrawAPI?.() ?? null
  } catch {
    return null
  }
}

const createSnapshot = (input: {
  readonly host: SidepanelHostContextCoordinatorHost
  readonly observation: SidepanelHostViewObservation
  readonly cachedTargetView: unknown | null
  readonly signal: SidepanelHostPrimarySignal
  readonly shouldAttemptRebind: boolean
}): SidepanelHostContextSnapshot => {
  const { description } = input.observation

  return {
    bindingKey: resolveHostViewContextKeyFromObservation(input.observation),
    state: resolveHostViewContextShellStateFromObservation(input.observation),
    activeFilePath: description.activeFilePath,
    activeLeafIdentity: description.activeWorkspaceLeafIdentity,
    activeViewType: description.activeWorkspaceViewType,
    targetViewIdentity: description.targetViewIdentity,
    targetViewFilePath: description.targetViewFilePath,
    targetViewUsable: description.targetViewUsable,
    hasExplicitTargetViewProperty: input.observation.hasExplicitTargetViewProperty,
    hostEligible: description.hostEligible,
    shouldAttemptRebind: input.shouldAttemptRebind,
    canOwnKeyboardRouting: description.hostEligible,
    sceneApi: resolveSceneApi(input.host, input.observation),
    currentTargetView: input.observation.targetView,
    hasCachedTargetView: input.cachedTargetView !== null,
    cachedTargetViewIdentity: resolveTargetViewIdentity(input.cachedTargetView),
    signal: input.signal,
  }
}

const haveEquivalentSnapshots = (
  left: SidepanelHostContextSnapshot | null,
  right: SidepanelHostContextSnapshot,
): boolean => {
  if (!left) {
    return false
  }

  return (
    left.bindingKey === right.bindingKey &&
    left.state === right.state &&
    left.targetViewIdentity === right.targetViewIdentity &&
    left.targetViewUsable === right.targetViewUsable &&
    left.hostEligible === right.hostEligible &&
    left.shouldAttemptRebind === right.shouldAttemptRebind &&
    left.canOwnKeyboardRouting === right.canOwnKeyboardRouting &&
    left.hasCachedTargetView === right.hasCachedTargetView &&
    left.cachedTargetViewIdentity === right.cachedTargetViewIdentity
  )
}

export class SidepanelHostContextCoordinator {
  readonly #host: SidepanelHostContextCoordinatorHost
  readonly #autoRebindSignals: ReadonlySet<SidepanelHostPrimarySignal>
  #cachedTargetView: unknown | null = null
  #snapshot: SidepanelHostContextSnapshot | null = null

  constructor(
    host: SidepanelHostContextCoordinatorHost,
    options: SidepanelHostContextCoordinatorOptions = {},
  ) {
    this.#host = host
    this.#autoRebindSignals = new Set(options.autoRebindSignals ?? DEFAULT_AUTO_REBIND_SIGNALS)

    this.#snapshot = this.#reconcile("initial", false).snapshot
  }

  getSnapshot(): SidepanelHostContextSnapshot {
    return this.#snapshot ?? this.#reconcile("initial", false).snapshot
  }

  getCachedTargetView(): unknown | null {
    return this.#cachedTargetView
  }

  primeCachedTargetView(targetView: unknown | null): void {
    this.rememberUsableTargetView(targetView)
  }

  reconcile(signal: SidepanelHostPrimarySignal = "manual"): SidepanelHostContextReconcileResult {
    return this.#reconcile(signal, this.#autoRebindSignals.has(signal))
  }

  handleWorkspaceLeafChange(): SidepanelHostContextReconcileResult {
    return this.reconcile("leaf-change")
  }

  handleSidepanelViewChange(targetView: unknown | null = getCurrentHostTargetView(this.#host)) {
    this.rememberUsableTargetView(targetView)
    return this.reconcile("sidepanel-view-change")
  }

  handlePollingFallback(): SidepanelHostContextReconcileResult {
    return this.reconcile("poll")
  }

  private rememberUsableTargetView(targetView: unknown | null): void {
    if (!isUsableTargetView(targetView)) {
      return
    }

    this.#cachedTargetView = targetView
  }

  #reconcile(
    signal: SidepanelHostPrimarySignal,
    attemptRebind: boolean,
  ): SidepanelHostContextReconcileResult {
    let observation = observeHostViewContext(this.#host)
    this.rememberUsableTargetView(observation.targetView)

    let rebound = false
    let shouldAttemptRebind = shouldRebindHostViewToActiveWorkspaceView(this.#host)

    if (attemptRebind && shouldAttemptRebind) {
      const rebindResult = bindHostViewToActiveWorkspaceView(this.#host)
      rebound = rebindResult.rebound
      observation = observeHostViewContext(this.#host)
      this.rememberUsableTargetView(observation.targetView)
      shouldAttemptRebind = shouldRebindHostViewToActiveWorkspaceView(this.#host)
    }

    const snapshot = createSnapshot({
      host: this.#host,
      observation,
      cachedTargetView: this.#cachedTargetView,
      signal,
      shouldAttemptRebind,
    })
    const changed = !haveEquivalentSnapshots(this.#snapshot, snapshot)

    this.#snapshot = snapshot

    return {
      snapshot,
      changed,
      rebound,
    }
  }
}

export const createSidepanelHostContextCoordinator = (
  host: SidepanelHostContextCoordinatorHost,
  options?: SidepanelHostContextCoordinatorOptions,
): SidepanelHostContextCoordinator => {
  return new SidepanelHostContextCoordinator(host, options)
}
