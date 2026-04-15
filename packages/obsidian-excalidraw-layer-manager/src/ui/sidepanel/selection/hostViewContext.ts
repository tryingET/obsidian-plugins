export interface SidepanelHostViewContextHost {
  readonly targetView?: unknown | null
  readonly setView?: (view?: unknown, reveal?: boolean) => unknown
}

export interface SidepanelHostViewContextDescription {
  readonly hasTargetView: boolean
  readonly targetViewLoaded: boolean | null
  readonly targetViewUsable: boolean
  readonly hasSetView: boolean
}

const getCurrentHostTargetView = (host: SidepanelHostViewContextHost): unknown => {
  return host.targetView ?? null
}

const isUsableTargetView = (value: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return false
  }

  const record = value as Record<string, unknown>
  if ("_loaded" in record) {
    return record["_loaded"] === true
  }

  return true
}

export const describeHostViewContext = (
  host: SidepanelHostViewContextHost,
): SidepanelHostViewContextDescription => {
  const targetView = getCurrentHostTargetView(host)
  const targetViewLoaded =
    targetView &&
    typeof targetView === "object" &&
    "_loaded" in (targetView as Record<string, unknown>)
      ? (targetView as Record<string, unknown>)["_loaded"] === true
      : null

  return {
    hasTargetView: targetView !== null,
    targetViewLoaded,
    targetViewUsable: isUsableTargetView(targetView),
    hasSetView: typeof host.setView === "function",
  }
}

export const ensureHostViewContext = (host: SidepanelHostViewContextHost): boolean => {
  if (isUsableTargetView(getCurrentHostTargetView(host))) {
    return true
  }

  const setView = host.setView
  if (!setView) {
    return true
  }

  const strategies: readonly {
    readonly viewArg: unknown
    readonly reveal: boolean
  }[] = [
    { viewArg: "active", reveal: false },
    { viewArg: undefined, reveal: false },
    { viewArg: "first", reveal: false },
    { viewArg: "active", reveal: true },
    { viewArg: "first", reveal: true },
  ]

  for (const strategy of strategies) {
    try {
      const resolved = setView(strategy.viewArg, strategy.reveal)
      if (isUsableTargetView(resolved) || isUsableTargetView(getCurrentHostTargetView(host))) {
        return true
      }
    } catch {
      // keep trying fallback strategies
    }
  }

  return isUsableTargetView(getCurrentHostTargetView(host))
}
