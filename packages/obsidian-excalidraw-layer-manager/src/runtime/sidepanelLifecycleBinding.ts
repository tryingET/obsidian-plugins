import type { EaLike, ExcalidrawSidepanelTabLike } from "../adapter/excalidraw-types.js"

type VoidHandler = () => void
type FocusHandler = (view: unknown | null) => void
type WindowMigrationHandler = (win: Window) => void

interface BoundTabHandlers {
  previousOnOpen: ExcalidrawSidepanelTabLike["onOpen"]
  previousOnFocus: ExcalidrawSidepanelTabLike["onFocus"]
  previousOnClose: ExcalidrawSidepanelTabLike["onClose"]
  previousOnExcalidrawViewClosed: ExcalidrawSidepanelTabLike["onExcalidrawViewClosed"]
  previousOnWindowMigrated: ExcalidrawSidepanelTabLike["onWindowMigrated"]
  onOpen: VoidHandler
  onFocus: FocusHandler
  onClose: VoidHandler
  onExcalidrawViewClosed: VoidHandler
  onWindowMigrated: WindowMigrationHandler
}

interface RuntimeSidepanelLifecycleBindingInput {
  readonly ea: EaLike
  readonly requestRefresh: () => void
  readonly requestDispose: () => void
  readonly scheduleMicrotask?: (callback: () => void) => void
}

export interface RuntimeSidepanelLifecycleBinding {
  readonly sync: () => void
  readonly dispose: () => void
}

const isPromiseLike = <T>(value: unknown): value is PromiseLike<T> => {
  return !!value && typeof value === "object" && "then" in value
}

const scheduleDefaultMicrotask = (callback: () => void): void => {
  void Promise.resolve().then(callback)
}

const invokeOptional = <TArgs extends readonly unknown[]>(
  handler: ((...args: TArgs) => unknown) | undefined,
  ...args: TArgs
): void => {
  handler?.(...args)
}

const bindTargetView = (ea: EaLike, targetView: unknown | null): void => {
  try {
    ea.setView?.call(ea, targetView, false)
  } catch {
    // The direct property fallback below keeps partial hosts usable.
  }

  if (ea.targetView === targetView) {
    return
  }

  try {
    ea.targetView = targetView
  } catch {
    // Best-effort compatibility for hosts that expose a read-only targetView.
  }
}

export const createRuntimeSidepanelLifecycleBinding = (
  input: RuntimeSidepanelLifecycleBindingInput,
): RuntimeSidepanelLifecycleBinding => {
  const { ea, requestRefresh, requestDispose } = input
  const scheduleMicrotask = input.scheduleMicrotask ?? scheduleDefaultMicrotask

  let disposed = false
  let boundTab: ExcalidrawSidepanelTabLike | null = null
  let boundHandlers: BoundTabHandlers | null = null
  let syncScheduled = false

  const hadOwnCreateSidepanelTab = Object.prototype.hasOwnProperty.call(ea, "createSidepanelTab")
  const originalCreateSidepanelTab = ea.createSidepanelTab

  const releaseBoundTab = (): void => {
    const tab = boundTab
    const handlers = boundHandlers
    if (!tab || !handlers) {
      boundTab = null
      boundHandlers = null
      return
    }

    if (tab.onOpen === handlers.onOpen) {
      tab.onOpen = handlers.previousOnOpen
    }
    if (tab.onFocus === handlers.onFocus) {
      tab.onFocus = handlers.previousOnFocus
    }
    if (tab.onClose === handlers.onClose) {
      tab.onClose = handlers.previousOnClose
    }
    if (tab.onExcalidrawViewClosed === handlers.onExcalidrawViewClosed) {
      tab.onExcalidrawViewClosed = handlers.previousOnExcalidrawViewClosed
    }
    if (tab.onWindowMigrated === handlers.onWindowMigrated) {
      tab.onWindowMigrated = handlers.previousOnWindowMigrated
    }

    boundTab = null
    boundHandlers = null
  }

  const bindTab = (tab: ExcalidrawSidepanelTabLike): void => {
    releaseBoundTab()

    const handlers: BoundTabHandlers = {
      previousOnOpen: tab.onOpen,
      previousOnFocus: tab.onFocus,
      previousOnClose: tab.onClose,
      previousOnExcalidrawViewClosed: tab.onExcalidrawViewClosed,
      previousOnWindowMigrated: tab.onWindowMigrated,
      onOpen: () => {},
      onFocus: () => {},
      onClose: () => {},
      onExcalidrawViewClosed: () => {},
      onWindowMigrated: () => {},
    }

    const ownsRuntimeBinding = (): boolean => {
      return !disposed && boundTab === tab && boundHandlers === handlers
    }

    handlers.onOpen = () => {
      try {
        invokeOptional(handlers.previousOnOpen)
      } finally {
        if (ownsRuntimeBinding()) {
          requestRefresh()
        }
      }
    }

    handlers.onFocus = (view) => {
      try {
        invokeOptional(handlers.previousOnFocus, view)
      } finally {
        if (ownsRuntimeBinding()) {
          bindTargetView(ea, view)
          requestRefresh()
        }
      }
    }

    handlers.onClose = () => {
      try {
        invokeOptional(handlers.previousOnClose)
      } finally {
        if (ownsRuntimeBinding()) {
          requestDispose()
        }
      }
    }

    handlers.onExcalidrawViewClosed = () => {
      if (!ownsRuntimeBinding()) {
        return
      }

      bindTargetView(ea, null)
      requestRefresh()
    }

    handlers.onWindowMigrated = (win) => {
      try {
        invokeOptional(handlers.previousOnWindowMigrated, win)
      } finally {
        if (ownsRuntimeBinding()) {
          requestRefresh()
        }
      }
    }

    tab.onOpen = handlers.onOpen
    tab.onFocus = handlers.onFocus
    tab.onClose = handlers.onClose
    tab.onExcalidrawViewClosed = handlers.onExcalidrawViewClosed
    tab.onWindowMigrated = handlers.onWindowMigrated

    boundTab = tab
    boundHandlers = handlers
  }

  const refreshSameTabBindings = (tab: ExcalidrawSidepanelTabLike): void => {
    const handlers = boundHandlers
    if (!handlers) {
      bindTab(tab)
      return
    }

    if (tab.onOpen !== handlers.onOpen) {
      handlers.previousOnOpen = tab.onOpen
      tab.onOpen = handlers.onOpen
    }
    if (tab.onFocus !== handlers.onFocus) {
      handlers.previousOnFocus = tab.onFocus
      tab.onFocus = handlers.onFocus
    }
    if (tab.onClose !== handlers.onClose) {
      handlers.previousOnClose = tab.onClose
      tab.onClose = handlers.onClose
    }
    if (tab.onExcalidrawViewClosed !== handlers.onExcalidrawViewClosed) {
      handlers.previousOnExcalidrawViewClosed = tab.onExcalidrawViewClosed
      tab.onExcalidrawViewClosed = handlers.onExcalidrawViewClosed
    }
    if (tab.onWindowMigrated !== handlers.onWindowMigrated) {
      handlers.previousOnWindowMigrated = tab.onWindowMigrated
      tab.onWindowMigrated = handlers.onWindowMigrated
    }
  }

  const sync = (): void => {
    if (disposed) {
      return
    }

    const tab = ea.sidepanelTab ?? null
    if (!tab) {
      releaseBoundTab()
      return
    }

    if (boundTab === tab) {
      refreshSameTabBindings(tab)
      return
    }

    bindTab(tab)
  }

  const scheduleSync = (): void => {
    if (disposed || syncScheduled) {
      return
    }

    syncScheduled = true
    scheduleMicrotask(() => {
      syncScheduled = false
      sync()
    })
  }

  const closeResolvedTabAfterDispose = (tab: ExcalidrawSidepanelTabLike | null): void => {
    if (!tab) {
      return
    }

    try {
      tab.close?.()
    } catch {
      // Best-effort orphan prevention for a host-created tab.
    }

    if (ea.sidepanelTab === tab) {
      ea.sidepanelTab = null
    }
  }

  let wrappedCreateSidepanelTab: EaLike["createSidepanelTab"] = undefined

  if (originalCreateSidepanelTab) {
    wrappedCreateSidepanelTab = function (
      this: EaLike,
      title: string,
      persist?: boolean,
      reveal?: boolean,
    ) {
      const result = originalCreateSidepanelTab.call(this, title, persist, reveal)

      if (isPromiseLike<ExcalidrawSidepanelTabLike | null>(result)) {
        void Promise.resolve(result).then(
          (tab) => {
            if (disposed) {
              closeResolvedTabAfterDispose(tab)
              return
            }
            scheduleSync()
          },
          () => {
            // The host owns creation failure reporting.
          },
        )
      } else if (result) {
        scheduleSync()
      }

      return result
    }

    ea.createSidepanelTab = wrappedCreateSidepanelTab
  }

  sync()

  return {
    sync,
    dispose: () => {
      if (disposed) {
        return
      }

      disposed = true
      syncScheduled = false
      releaseBoundTab()

      if (wrappedCreateSidepanelTab && ea.createSidepanelTab === wrappedCreateSidepanelTab) {
        if (hadOwnCreateSidepanelTab && originalCreateSidepanelTab) {
          ea.createSidepanelTab = originalCreateSidepanelTab
        } else {
          Reflect.deleteProperty(ea, "createSidepanelTab")
        }
      }
    },
  }
}
