interface PendingCreationHost {
  readonly plugin?: object
  readonly app?: object
  readonly activeScript?: string
}

interface CreationGroup {
  readonly pending: Set<symbol>
  readonly orphans: Map<object, () => void>
}

type CreationRegistry = Map<string | object, CreationGroup>

const registryKey = Symbol.for("excalidraw-layer-manager.pending-sidepanel-creations.v1")

// Native createTab reuses by script identity. Its getHostEA() can still point
// at the construction-time EA, so it cannot arbitrate pending invocations.
// The public plugin/app object is shared across those invocations and windows.
export const createSidepanelPendingCreationLease = (host: PendingCreationHost) => {
  const scope = host.plugin ?? host.app ?? globalThis
  const key = host.activeScript || host
  const token = Symbol("pending-sidepanel-invocation")
  let disposed = false

  const readRegistry = (): CreationRegistry | undefined =>
    Reflect.get(scope, registryKey) as CreationRegistry | undefined

  const group = (): CreationGroup => {
    let registry = readRegistry()
    if (!registry) {
      registry = new Map()
      Object.defineProperty(scope, registryKey, { value: registry, configurable: true })
    }
    let entry = registry.get(key)
    if (!entry) {
      entry = { pending: new Set(), orphans: new Map() }
      registry.set(key, entry)
    }
    return entry
  }

  const flush = (): void => {
    const registry = readRegistry()
    const entry = registry?.get(key)
    if (!registry || !entry) return
    // Cleanup can recursively settle/delete this entry and install a successor
    // under the same key. Never continue or delete through a detached entry.
    const ownsEntry = (): boolean => readRegistry() === registry && registry.get(key) === entry
    while (ownsEntry() && entry.pending.size === 0 && entry.orphans.size > 0) {
      const first = entry.orphans.entries().next().value
      if (!first) break
      const [tab, cleanup] = first
      entry.orphans.delete(tab)
      cleanup()
    }
    if (ownsEntry() && entry.pending.size === 0 && entry.orphans.size === 0) {
      registry.delete(key)
      if (registry.size === 0 && readRegistry() === registry) {
        Reflect.deleteProperty(scope, registryKey)
      }
    }
  }

  const settle = (): void => {
    readRegistry()?.get(key)?.pending.delete(token)
    flush()
  }

  return {
    begin: (): void => {
      if (!disposed) group().pending.add(token)
    },
    settle,
    deferOrphan: (tab: object, cleanup: () => void): void => {
      const entry = group()
      if (!entry.orphans.has(tab)) entry.orphans.set(tab, cleanup)
      flush()
    },
    dispose: (): void => {
      disposed = true
      settle()
    },
  }
}
