import type { ExcalidrawSidepanelTabLike } from "../adapter/excalidraw-types.js"

interface LifecycleHost {
  sidepanelTab?: ExcalidrawSidepanelTabLike | null
  targetView?: unknown | null
  setView?: (view?: unknown, reveal?: boolean) => unknown
}

export interface SidepanelLifecycleCallbacks {
  readonly requestRefresh: () => void
  readonly requestDispose: () => void
  readonly onFocus?: (view: unknown | null) => void
  readonly onWindowMigrated?: (win: Window) => void
}

interface RuntimeSidepanelLifecycleBindingInput extends SidepanelLifecycleCallbacks {
  readonly ea: LifecycleHost
}

interface RuntimeSidepanelLifecycleBinding {
  readonly sync: () => void
  readonly release: () => void
  readonly dispose: () => void
}

const owners = new WeakMap<ExcalidrawSidepanelTabLike, RuntimeSidepanelLifecycleBinding>()

export const hasSidepanelLifecycleOwner = (tab: ExcalidrawSidepanelTabLike): boolean => {
  return owners.has(tab)
}

const bindTargetView = (ea: LifecycleHost, view: unknown | null): void => {
  try {
    ea.setView?.call(ea, view, false)
  } catch {
    // Partial hosts may expose only a writable targetView.
  }
  if (ea.targetView !== view) {
    try {
      ea.targetView = view
    } catch {
      // The runtime still releases scene authority on a null focus notification.
    }
  }
}

export const createRuntimeSidepanelLifecycleBinding = (
  input: RuntimeSidepanelLifecycleBindingInput,
): RuntimeSidepanelLifecycleBinding => {
  let disposed = false
  let boundTab: ExcalidrawSidepanelTabLike | null = null
  let restore: (() => void)[] = []

  const release = (): void => {
    if (boundTab && owners.get(boundTab) === binding) owners.delete(boundTab)
    boundTab = null
    for (const restoreHook of restore) restoreHook()
    restore = []
  }

  const sync = (): void => {
    if (disposed) return
    const tab = input.ea.sidepanelTab ?? null
    if (tab === boundTab) return
    release()
    if (!tab) return
    owners.get(tab)?.release()
    boundTab = tab
    owners.set(tab, binding)
    let closed = false
    const owns = (): boolean =>
      !disposed && !closed && boundTab === tab && owners.get(tab) === binding

    const install = <
      K extends "onOpen" | "onFocus" | "onClose" | "onExcalidrawViewClosed" | "onWindowMigrated",
    >(
      key: K,
      handler: ExcalidrawSidepanelTabLike[K],
    ): void => {
      const descriptor = Object.getOwnPropertyDescriptor(tab, key)
      tab[key] = handler
      restore.push(() => {
        if (tab[key] !== handler) return
        if (descriptor) Object.defineProperty(tab, key, descriptor)
        else Reflect.deleteProperty(tab, key)
      })
    }

    const previousOpen = tab.onOpen
    install("onOpen", () => {
      if (!owns()) return
      try {
        return previousOpen?.call(tab)
      } finally {
        if (owns()) input.requestRefresh()
      }
    })
    const previousFocus = tab.onFocus
    install("onFocus", (view) => {
      if (!owns()) return
      try {
        return previousFocus?.call(tab, view)
      } finally {
        if (owns()) {
          bindTargetView(input.ea, view)
          input.onFocus?.(view)
          input.requestRefresh()
        }
      }
    })
    const previousClose = tab.onClose
    install("onClose", () => {
      if (!owns()) return
      closed = true
      try {
        return previousClose?.call(tab)
      } finally {
        input.requestDispose()
      }
    })
    const previousViewClosed = tab.onExcalidrawViewClosed
    install("onExcalidrawViewClosed", () => {
      if (!owns()) return
      try {
        return previousViewClosed?.call(tab)
      } finally {
        if (owns()) {
          bindTargetView(input.ea, null)
          input.onFocus?.(null)
          input.requestRefresh()
        }
      }
    })
    const previousMigration = tab.onWindowMigrated
    install("onWindowMigrated", (win) => {
      if (!owns()) return
      try {
        return previousMigration?.call(tab, win)
      } finally {
        if (owns()) {
          input.onWindowMigrated?.(win)
          input.requestRefresh()
        }
      }
    })
  }

  const binding: RuntimeSidepanelLifecycleBinding = {
    sync,
    release,
    dispose: () => {
      if (disposed) return
      disposed = true
      release()
    },
  }
  sync()
  return binding
}
