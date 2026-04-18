import { describe, expect, it, vi } from "vitest"

import { SidepanelHostContextCoordinator } from "../src/ui/sidepanel/selection/hostContextCoordinator.js"
import type { SidepanelHostContextCoordinatorHost } from "../src/ui/sidepanel/selection/hostContextCoordinator.js"

interface ViewFixture {
  readonly key: string
  readonly filePath: string
  readonly workspaceFilePath?: string | null
  readonly viewId: string
  readonly leafId: string
  readonly viewType: string
  readonly frontmatter: Record<string, unknown>
  readonly api: unknown
  readonly bindTargetView?: boolean
}

interface HostHarness {
  readonly host: SidepanelHostContextCoordinatorHost & { targetView: unknown | null }
  readonly setView: ReturnType<typeof vi.fn>
  readonly getExcalidrawAPI: ReturnType<typeof vi.fn>
  setActiveView: (key: string) => void
  setTargetView: (key: string | null, loaded?: boolean) => unknown | null
}

const makeViewFixture = (
  key: string,
  overrides: Partial<Omit<ViewFixture, "key" | "api" | "frontmatter">> & {
    readonly frontmatter?: Record<string, unknown>
    readonly api?: unknown
  } = {},
): ViewFixture => {
  return {
    key,
    filePath: overrides.filePath ?? key,
    viewId: overrides.viewId ?? key,
    leafId: overrides.leafId ?? overrides.viewId ?? key,
    viewType: overrides.viewType ?? "excalidraw",
    frontmatter: overrides.frontmatter ?? { "excalidraw-plugin": "parsed" },
    api: overrides.api ?? { name: `api:${key}` },
    ...(overrides.bindTargetView === undefined
      ? {}
      : {
          bindTargetView: overrides.bindTargetView,
        }),
  }
}

const makeHostHarness = (
  fixtures: readonly ViewFixture[],
  initialActiveViewKey: string,
  initialTargetViewKey: string | null = initialActiveViewKey,
): HostHarness => {
  const fixtureByKey = new Map(fixtures.map((fixture) => [fixture.key, fixture]))
  const frontmatterByPath = new Map<string, Record<string, unknown>>()

  for (const fixture of fixtures) {
    if (!frontmatterByPath.has(fixture.filePath)) {
      frontmatterByPath.set(fixture.filePath, fixture.frontmatter)
    }
  }

  let activeViewKey = initialActiveViewKey
  let targetView: unknown | null = null

  const app = {
    metadataCache: {
      getFileCache: (file: unknown) => {
        const path =
          file && typeof file === "object" && typeof (file as { path?: unknown }).path === "string"
            ? ((file as { path: string }).path as string)
            : null

        return path
          ? {
              frontmatter: frontmatterByPath.get(path) ?? {},
            }
          : null
      },
    },
    workspace: {
      getActiveFile: () => {
        const fixture = fixtureByKey.get(activeViewKey)
        if (!fixture) {
          return null
        }

        const workspaceFilePath =
          fixture.workspaceFilePath === undefined ? fixture.filePath : fixture.workspaceFilePath

        return workspaceFilePath === null
          ? null
          : {
              path: workspaceFilePath,
            }
      },
      get activeLeaf() {
        const fixture = fixtureByKey.get(activeViewKey)
        if (!fixture) {
          return null
        }

        return {
          id: fixture.leafId,
          view: {
            file: {
              path: fixture.filePath,
            },
            getViewType: () => fixture.viewType,
          },
        }
      },
    },
  }

  const buildTargetView = (key: string, loaded = true): unknown | null => {
    const fixture = fixtureByKey.get(key)
    if (!fixture || fixture.bindTargetView === false) {
      return null
    }

    return {
      id: fixture.viewId,
      _loaded: loaded,
      file: {
        path: fixture.filePath,
      },
      leaf: {
        id: fixture.leafId,
      },
      app,
      excalidrawAPI: fixture.api,
    }
  }

  const setView = vi.fn(() => {
    targetView = buildTargetView(activeViewKey)
    return targetView
  })

  const getExcalidrawAPI = vi.fn(() => {
    const fixture = fixtureByKey.get(activeViewKey)
    return fixture?.api ?? null
  })

  const host = {
    app,
    obsidian: {
      app,
    },
    setView,
    getExcalidrawAPI,
    get targetView() {
      return targetView
    },
    set targetView(nextTargetView: unknown | null) {
      targetView = nextTargetView
    },
  } as SidepanelHostContextCoordinatorHost & { targetView: unknown | null }

  const setActiveView = (key: string): void => {
    if (!fixtureByKey.has(key)) {
      throw new Error(`Unknown view fixture: ${key}`)
    }

    activeViewKey = key
  }

  const setTargetView = (key: string | null, loaded = true): unknown | null => {
    targetView = key ? buildTargetView(key, loaded) : null
    return targetView
  }

  setTargetView(initialTargetViewKey)

  return {
    host,
    setView,
    getExcalidrawAPI,
    setActiveView,
    setTargetView,
  }
}

describe("sidepanel host-context coordinator", () => {
  const globalRecord = globalThis as Record<string, unknown>
  it("captures a live initial snapshot and caches the usable targetView", () => {
    const harness = makeHostHarness([makeViewFixture("A.excalidraw")], "A.excalidraw")

    const coordinator = new SidepanelHostContextCoordinator(harness.host)
    const initialSnapshot = coordinator.getSnapshot()

    expect(initialSnapshot.state).toBe("live")
    expect(initialSnapshot.targetViewIdentity).toBe("A.excalidraw")
    expect(initialSnapshot.hasCachedTargetView).toBe(true)
    expect(initialSnapshot.cachedTargetViewIdentity).toBe("A.excalidraw")
    expect(initialSnapshot.sceneApi).toEqual({ name: "api:A.excalidraw" })
    expect(coordinator.getCachedTargetView()).toBe(harness.host.targetView)

    const result = coordinator.reconcile("manual")

    expect(result.changed).toBe(false)
    expect(result.rebound).toBe(false)
    expect(harness.setView).not.toHaveBeenCalled()
  })

  it("rebinds to the active Excalidraw leaf on workspace leaf-change when the host targetView is stale", () => {
    const harness = makeHostHarness(
      [makeViewFixture("A.excalidraw"), makeViewFixture("B.excalidraw")],
      "A.excalidraw",
    )

    const coordinator = new SidepanelHostContextCoordinator(harness.host)

    harness.setActiveView("B.excalidraw")
    const result = coordinator.handleWorkspaceLeafChange()

    expect(result.rebound).toBe(true)
    expect(result.changed).toBe(true)
    expect(harness.setView).toHaveBeenCalledTimes(1)
    expect(result.snapshot.state).toBe("live")
    expect(result.snapshot.targetViewIdentity).toBe("B.excalidraw")
    expect(result.snapshot.cachedTargetViewIdentity).toBe("B.excalidraw")
    expect(result.snapshot.shouldAttemptRebind).toBe(false)
  })

  it("keeps the binding key stable when the sidepanel leaf becomes active but the bound targetView and file stay the same", () => {
    const harness = makeHostHarness(
      [
        makeViewFixture("A.excalidraw", {
          filePath: "A.excalidraw",
          viewId: "A.excalidraw:view",
          leafId: "A.excalidraw:leaf",
        }),
        makeViewFixture("sidepanel", {
          filePath: "A.excalidraw",
          viewId: "sidepanel:view",
          leafId: "sidepanel:leaf",
          viewType: "sidepanel",
        }),
      ],
      "A.excalidraw",
    )

    const coordinator = new SidepanelHostContextCoordinator(harness.host)
    const before = coordinator.getSnapshot()

    harness.setActiveView("sidepanel")
    const result = coordinator.handleWorkspaceLeafChange()

    expect(result.rebound).toBe(false)
    expect(result.changed).toBe(false)
    expect(harness.setView).not.toHaveBeenCalled()
    expect(result.snapshot.bindingKey).toBe(before.bindingKey)
    expect(result.snapshot.targetViewIdentity).toBe(before.targetViewIdentity)
    expect(result.snapshot.activeFilePath).toBe(before.activeFilePath)
    expect(result.snapshot.activeLeafIdentity).toBe("sidepanel:leaf")
    expect(result.snapshot.activeViewType).toBe("sidepanel")
    expect(result.snapshot.state).toBe("live")
  })

  it("preserves the host this-binding when rebind strategies call setView", () => {
    const fixtures = {
      current: makeViewFixture("A.excalidraw"),
      next: makeViewFixture("B.excalidraw"),
    }
    let activeViewKey: "current" | "next" = "current"

    const app = {
      metadataCache: {
        getFileCache: (file: unknown) => {
          const path =
            file &&
            typeof file === "object" &&
            typeof (file as { path?: unknown }).path === "string"
              ? ((file as { path: string }).path as string)
              : null

          if (!path) {
            return null
          }

          return {
            frontmatter: { "excalidraw-plugin": "parsed" },
          }
        },
      },
      workspace: {
        getActiveFile: () => ({
          path: fixtures[activeViewKey].filePath,
        }),
        get activeLeaf() {
          const fixture = fixtures[activeViewKey]
          return {
            id: fixture.leafId,
            view: {
              getViewType: () => fixture.viewType,
            },
          }
        },
      },
    }

    const buildTargetView = (fixture: ViewFixture) => ({
      id: fixture.viewId,
      _loaded: true,
      file: {
        path: fixture.filePath,
      },
      leaf: {
        id: fixture.leafId,
      },
      app,
      excalidrawAPI: fixture.api,
    })

    const host = {
      app,
      obsidian: {
        app,
      },
      targetView: buildTargetView(fixtures.current),
      setView: vi.fn(function (
        this: SidepanelHostContextCoordinatorHost & { targetView: unknown | null },
      ) {
        if (this !== host) {
          throw new Error("detached setView")
        }

        const reboundTargetView = buildTargetView(fixtures[activeViewKey])
        this.targetView = reboundTargetView
        return reboundTargetView
      }),
    } satisfies SidepanelHostContextCoordinatorHost & { targetView: unknown | null }

    const coordinator = new SidepanelHostContextCoordinator(host)

    activeViewKey = "next"
    const result = coordinator.handleWorkspaceLeafChange()

    expect(result.rebound).toBe(true)
    expect(host.setView).toHaveBeenCalledTimes(1)
    expect(result.snapshot.state).toBe("live")
    expect(result.snapshot.targetViewIdentity).toBe(fixtures.next.viewId)
    expect(result.snapshot.cachedTargetViewIdentity).toBe(fixtures.next.viewId)
  })

  it("derives an inactive shell state without attempting rebind when the active leaf is not Excalidraw", () => {
    const harness = makeHostHarness(
      [
        makeViewFixture("A.excalidraw"),
        makeViewFixture("plain.md", {
          filePath: "plain.md",
          viewId: "plain.md:view",
          leafId: "plain.md:leaf",
          viewType: "markdown",
          frontmatter: {},
        }),
      ],
      "A.excalidraw",
    )

    const coordinator = new SidepanelHostContextCoordinator(harness.host)

    harness.setActiveView("plain.md")
    const result = coordinator.handleWorkspaceLeafChange()

    expect(result.rebound).toBe(false)
    expect(harness.setView).not.toHaveBeenCalled()
    expect(result.snapshot.state).toBe("inactive")
    expect(result.snapshot.shouldAttemptRebind).toBe(false)
    expect(result.snapshot.canOwnKeyboardRouting).toBe(false)
  })

  it("derives active-file truth from activeLeaf.view.file when workspace.getActiveFile() returns null", () => {
    const harness = makeHostHarness(
      [
        makeViewFixture("plain.md", {
          filePath: "plain.md",
          workspaceFilePath: null,
          viewId: "plain.md:view",
          leafId: "plain.md:leaf",
          viewType: "markdown",
          frontmatter: {},
          bindTargetView: false,
        }),
      ],
      "plain.md",
      null,
    )

    const coordinator = new SidepanelHostContextCoordinator(harness.host)
    const snapshot = coordinator.getSnapshot()

    expect(snapshot.activeFilePath).toBe("plain.md")
    expect(snapshot.state).toBe("inactive")
    expect(snapshot.shouldAttemptRebind).toBe(false)
    expect(snapshot.sceneBinding.source).toBe("active-leaf")
    expect(snapshot.bindingKey).toContain("plain.md")
  })

  it("keeps the shell unbound while preserving a cached targetView identity when auto-rebind is disabled", () => {
    const harness = makeHostHarness([makeViewFixture("A.excalidraw")], "A.excalidraw")

    const coordinator = new SidepanelHostContextCoordinator(harness.host, {
      autoRebindSignals: [],
    })

    harness.setTargetView(null)
    const result = coordinator.handlePollingFallback()

    expect(result.rebound).toBe(false)
    expect(result.changed).toBe(true)
    expect(result.snapshot.state).toBe("unbound")
    expect(result.snapshot.shouldAttemptRebind).toBe(true)
    expect(result.snapshot.hasCachedTargetView).toBe(true)
    expect(result.snapshot.cachedTargetViewIdentity).toBe("A.excalidraw")
    expect(result.snapshot.targetViewIdentity).toBe(null)
  })

  it("does not attempt rebind when targetView is unavailable and the active leaf is markdown without an active file", () => {
    const app = {
      workspace: {
        getActiveFile: () => null,
        get activeLeaf() {
          return {
            id: "markdown-leaf",
            view: {
              getViewType: () => "markdown",
            },
          }
        },
      },
    }

    const setView = vi.fn(() => null)
    const host = {
      app,
      obsidian: {
        app,
      },
      setView,
      targetView: null,
    } satisfies SidepanelHostContextCoordinatorHost & { targetView: unknown | null }

    const coordinator = new SidepanelHostContextCoordinator(host)
    const result = coordinator.handleWorkspaceLeafChange()

    expect(result.rebound).toBe(false)
    expect(setView).not.toHaveBeenCalled()
    expect(result.snapshot.state).toBe("unbound")
    expect(result.snapshot.shouldAttemptRebind).toBe(false)
  })

  it("still attempts rebind when targetView is unavailable and the active leaf reports excalidraw without an active file", () => {
    const app = {
      workspace: {
        getActiveFile: () => null,
        get activeLeaf() {
          return {
            id: "live-excalidraw-leaf",
            view: {
              getViewType: () => "excalidraw",
            },
          }
        },
      },
    }

    const setView = vi.fn(() => null)
    const host = {
      app,
      obsidian: {
        app,
      },
      setView,
      targetView: null,
    } satisfies SidepanelHostContextCoordinatorHost & { targetView: unknown | null }

    const coordinator = new SidepanelHostContextCoordinator(host)
    const result = coordinator.reconcile("manual")

    expect(result.rebound).toBe(false)
    expect(setView).toHaveBeenCalledTimes(4)
    expect(result.snapshot.state).toBe("unbound")
    expect(result.snapshot.shouldAttemptRebind).toBe(true)
  })

  it("suppresses repeated manual and poll rebind attempts after an unchanged failure", () => {
    const app = {
      workspace: {
        getActiveFile: () => null,
        get activeLeaf() {
          return {
            id: "live-excalidraw-leaf",
            view: {
              getViewType: () => "excalidraw",
            },
          }
        },
      },
    }

    const setView = vi.fn(() => null)
    const host = {
      app,
      obsidian: {
        app,
      },
      setView,
      targetView: null,
    } satisfies SidepanelHostContextCoordinatorHost & { targetView: unknown | null }

    const coordinator = new SidepanelHostContextCoordinator(host)

    const firstResult = coordinator.reconcile("manual")
    const secondResult = coordinator.handlePollingFallback()
    const thirdResult = coordinator.reconcile("manual")

    expect(firstResult.snapshot.shouldAttemptRebind).toBe(true)
    expect(secondResult.snapshot.shouldAttemptRebind).toBe(true)
    expect(thirdResult.snapshot.shouldAttemptRebind).toBe(true)
    expect(setView).toHaveBeenCalledTimes(4)
  })

  it("uses an active-leaf fallback scene binding when targetView truth is unavailable", () => {
    const harness = makeHostHarness(
      [makeViewFixture("A.excalidraw"), makeViewFixture("B.excalidraw")],
      "A.excalidraw",
      null,
    )

    const coordinator = new SidepanelHostContextCoordinator(harness.host, {
      autoRebindSignals: [],
    })
    const before = coordinator.getSnapshot()

    expect(before.sceneBinding.source).toBe("active-leaf")
    expect(before.bindingKey).toContain("A.excalidraw")

    harness.setActiveView("B.excalidraw")
    const result = coordinator.handleWorkspaceLeafChange()

    expect(result.rebound).toBe(false)
    expect(result.changed).toBe(true)
    expect(result.snapshot.state).toBe("unbound")
    expect(result.snapshot.sceneBinding.source).toBe("active-leaf")
    expect(result.snapshot.bindingKey).not.toBe(before.bindingKey)
    expect(result.snapshot.bindingKey).toContain("B.excalidraw")
  })

  it("treats same-file front/back targetView identity switches as real host-context boundary changes", () => {
    const harness = makeHostHarness(
      [
        makeViewFixture("card-front", {
          filePath: "card.excalidraw",
          viewId: "card-front-view",
          leafId: "card-front-leaf",
        }),
        makeViewFixture("card-back", {
          filePath: "card.excalidraw",
          viewId: "card-back-view",
          leafId: "card-back-leaf",
        }),
      ],
      "card-front",
    )

    const coordinator = new SidepanelHostContextCoordinator(harness.host, {
      autoRebindSignals: [],
    })
    const before = coordinator.getSnapshot().bindingKey

    harness.setActiveView("card-back")
    harness.setTargetView("card-back")
    const result = coordinator.handleSidepanelViewChange(harness.host.targetView)

    expect(result.changed).toBe(true)
    expect(result.snapshot.state).toBe("live")
    expect(result.snapshot.targetViewIdentity).toBe("card-back-view")
    expect(result.snapshot.bindingKey).not.toBe(before)
    expect(result.snapshot.cachedTargetViewIdentity).toBe("card-back-view")
  })

  it("logs failed same-file markdown-to-excalidraw rebind attempts under lifecycle debug", () => {
    const debugFlagKey = "LMX_DEBUG_SIDEPANEL_LIFECYCLE"
    const hadDebugFlag = Object.prototype.hasOwnProperty.call(globalRecord, debugFlagKey)
    const previousDebugFlag = globalRecord[debugFlagKey]
    globalRecord[debugFlagKey] = true

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    try {
      const harness = makeHostHarness(
        [
          makeViewFixture("markdown", {
            filePath: "Card.excalidraw",
            viewId: "Card.excalidraw#markdown",
            leafId: "card-leaf",
            viewType: "markdown",
            bindTargetView: false,
          }),
          makeViewFixture("excalidraw", {
            filePath: "Card.excalidraw",
            viewId: "Card.excalidraw#front",
            leafId: "card-leaf",
            viewType: "excalidraw",
          }),
        ],
        "markdown",
        null,
      )

      harness.setView.mockImplementation(() => harness.host.targetView)

      const coordinator = new SidepanelHostContextCoordinator(harness.host)

      harness.setActiveView("excalidraw")
      const result = coordinator.handlePollingFallback()

      expect(result.rebound).toBe(false)
      expect(result.snapshot.state).toBe("unbound")
      expect(logSpy).toHaveBeenCalledWith(
        "[LMX:lifecycle] host context rebind attempt did not confirm a usable targetView",
        expect.objectContaining({
          signal: "poll",
          state: "unbound",
          activeFilePath: "Card.excalidraw",
          activeLeafIdentity: "card-leaf",
          activeViewType: "excalidraw",
          targetViewIdentity: null,
          targetViewFilePath: null,
          targetViewUsable: false,
          shouldAttemptRebind: true,
          cachedTargetViewIdentity: null,
        }),
      )
    } finally {
      if (hadDebugFlag) {
        globalRecord[debugFlagKey] = previousDebugFlag
      } else {
        Reflect.deleteProperty(globalRecord, debugFlagKey)
      }

      logSpy.mockRestore()
    }
  })

  it("uses the legacy getExcalidrawAPI fallback when the host has no explicit targetView property", () => {
    const api = { name: "legacy-api" }
    const app = {
      workspace: {
        getActiveFile: () => ({
          path: "legacy.excalidraw",
        }),
      },
    }

    const host = {
      app,
      getExcalidrawAPI: vi.fn(() => api),
    }

    const coordinator = new SidepanelHostContextCoordinator(host)
    const snapshot = coordinator.getSnapshot()

    expect(snapshot.state).toBe("live")
    expect(snapshot.bindingKey).toBe("target:legacy-host")
    expect(snapshot.sceneApi).toBe(api)
    expect(host.getExcalidrawAPI).toHaveBeenCalledTimes(1)
  })
})
