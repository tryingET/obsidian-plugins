// Executed ONLY through native-host's fresh PID/profile/vault/nonce/script guard.
export { prepareNativeCase } from "./native-preparation.js"

export async function runNativeOperation(operation, index) {
  const b = globalThis.__AK5583
  if (!b || b.effect !== "settled")
    throw Error("fixture unavailable or previous effects indeterminate")
  const { api, runtime, digest, equal, dto, sceneProjection, expectedRows } = b
  const beforeRuntimeSelection = runtime()
    ? [...runtime().getSnapshot().selectedIds].sort()
    : b.selected()
  const rt = runtime(),
    beforeVersion = rt?.getSnapshot().version ?? null
  const beforeScene = structuredClone(api.getSceneElements())
  let expectedScene = structuredClone(beforeScene)
  const beforeRows = b.rowProof(),
    beforeSelection = b.selected(),
    expanded = [...b.expanded]
  const target = expectedScene.at(-1),
    targetId = target.id
  const beforeSelectedRows = b.selectedRows()
  let expectedSelectedRows = [...beforeSelectedRows]
  let expectedSelection = [...beforeSelection],
    expectManager = !!rt,
    inputPath,
    action
  // Use fresh state per operation; expected deltas are authored independently of the command result.
  if (operation === "open") {
    if (rt) throw Error("open precondition")
    expectManager = true
    expanded.length = 0
    inputPath = "native Excalidraw executeScriptFile"
    action = () => b.open()
  } else if (operation === "close") {
    if (!rt) throw Error("close precondition")
    expectManager = false
    expectedSelectedRows = []
    inputPath = "native sidepanel tab.close"
    action = () => b.close()
  } else if (operation === "select") {
    if (!rt) throw Error("selection precondition")
    const first = expectedRows(expectedScene, expanded)[0]
    expectedSelectedRows = [first.id]
    expectedSelection = first.id.startsWith("el:")
      ? [first.id.slice(3)]
      : expectedScene
          .filter((e) => e.groupIds.includes(first.id.slice(6).split("/").at(-1)))
          .map((e) => e.id)
          .sort()
    inputPath = "synthetic HTMLElement.click handled by native manager UI (not physical input)"
    action = () => b.rowElements()[0].click()
  } else if (operation === "expand" || operation === "collapse") {
    if (!rt) throw Error("expansion precondition")
    const first = expectedRows(expectedScene, expanded).find(
      (r) => r.expanded === (operation === "collapse"),
    )
    if (!first) throw Error(`operation not applicable: ${operation}`)
    if (operation === "expand") expanded.push(first.id)
    else expanded.splice(expanded.indexOf(first.id), 1)
    inputPath = "synthetic native manager expand-control click (not physical input)"
    action = () => {
      const row = b
        .rowElements()
        .find(
          (r) =>
            decodeURIComponent(r.id.replace(/^lmx-row-\d+-/, "").replaceAll("_", "%")) === first.id,
        )
      row.querySelector('[aria-label^="Expand row "], [aria-label^="Collapse row "]').click()
    }
  } else if (operation === "rename") {
    target.customData.lmx.label = `Renamed ${index}`
    inputPath = "native manager command facade renameNode"
    action = () =>
      rt.commands.renameNode({ elementId: targetId, nextName: target.customData.lmx.label })
  } else if (operation === "external" || operation === "external-closed") {
    if (operation === "external-closed" && rt) throw Error("closed-manager precondition")
    target.customData.lmx.label = `External ${index}`
    target.x += 1
    target.version += 1
    target.versionNonce += 1
    inputPath = "native Excalidraw API updateScene; no forced manager refresh"
    action = () =>
      api.updateScene({ elements: structuredClone(expectedScene), captureUpdate: "IMMEDIATELY" })
  } else if (operation === "reorder") {
    const first = expectedScene[0]
    expectedScene = b.expectedFrontOrder(expectedScene, first.id)
    inputPath = "native manager command facade reorder front"
    action = () => rt.commands.reorder({ orderedElementIds: [first.id], mode: "front" })
  } else throw Error("unfrozen operation")
  const expectedVisible = expectManager ? expectedRows(expectedScene, expanded) : []
  const stagingEA = rt
    ? b.p.ea.checkForActiveSidepanelTabForScript("LayerManager").getHostEA()
    : b.ea
  const stagingBefore = digest(stagingEA.elementsDict)
  const longTasks = [],
    frames = [],
    raf = { id: 0, active: true }
  const watchFrame = (t) => {
    frames.push(t)
    if (raf.active) raf.id = requestAnimationFrame(watchFrame)
  }
  raf.id = requestAnimationFrame(watchFrame)
  const supported = PerformanceObserver.supportedEntryTypes.includes("longtask")
  const observer = supported
    ? new PerformanceObserver((list) =>
        longTasks.push(
          ...list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration })),
        ),
      )
    : null
  observer?.observe({ entryTypes: ["longtask"] })
  const memoryBefore = performance.memory
    ? {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit,
      }
    : null
  await b.frame() // Preregistered v2: phase-align input after a native rAF opportunity.
  const start = performance.now()
  b.effect = "indeterminate"
  let raw,
    lostFocus = false
  const onBlur = () => {
    lostFocus = true
  }
  try {
    if (!document.hasFocus() || document.visibilityState !== "visible")
      throw Error("native focused visible input required")
    window.addEventListener("blur", onBlur)
    const pending = action(),
      inputSync = performance.now() - start
    const outcome = await pending,
      promiseComplete = performance.now() - start
    if (outcome?.status && outcome.status !== "applied")
      throw Error(`command outcome ${outcome.status}`)
    const expectedTail = expectedScene.at(-1)
    const stable = await b.settleUntilStable(
      {
        now: () => performance.now() - start,
        identity: () => runtime()?.getSnapshot().version ?? null,
        frame: b.frame,
        ready: () => {
          if (expectManager !== !!runtime() || b.rowElements().length !== expectedVisible.length)
            return false
          if (Object.keys(api.getAppState().selectedElementIds).length !== expectedSelection.length)
            return false
          const live = api.getSceneElements(),
            tail = live.at(-1)
          if (
            live.length !== expectedScene.length ||
            live[0]?.id !== expectedScene[0].id ||
            tail?.id !== expectedTail.id ||
            tail.x !== expectedTail.x ||
            tail.customData?.lmx?.label !== expectedTail.customData.lmx.label
          )
            return false
          if (expectManager) {
            const snapshot = runtime().getSnapshot()
            if (
              snapshot.elements.length !== expectedScene.length ||
              snapshot.elements.at(-1)?.customData?.lmx?.label !== expectedTail.customData.lmx.label
            )
              return false
          }
          return true
        },
      },
      b.config.mutant ? 1500 : 60000,
    )
    const settlement = stable.settlement,
      stableVersion = stable.identity,
      renderOpportunities = stable.opportunities
    const end = performance.now(),
      renderOpportunity = end - start
    if (lostFocus || !document.hasFocus() || document.visibilityState !== "visible")
      throw Error("native focus/visibility changed during measurement")
    // Deliberate diagnostic fault, excluded from baseline mode by the controller.
    if (b.config.mutant === "dropped-row") b.rowElements().at(-1)?.remove()
    // Exact independent checks after the timed interval, plus no pending runtime revision drift.
    const byId = new Map(expectedScene.map((e) => [e.id, e]))
    const expectedRowProof = expectedVisible.map((r) => ({
      ...r,
      label: r.id.startsWith("el:")
        ? byId.get(r.id.slice(3)).customData.lmx.label
        : r.id.slice(6).split("/").at(-1),
    }))
    const checks = [
      {
        id: "scene-exact",
        actual: digest(sceneProjection(api.getSceneElements())),
        expected: digest(sceneProjection(expectedScene)),
      },
      { id: "rows-exact", actual: digest(b.rowProof()), expected: digest(expectedRowProof) },
      {
        id: "selection-exact",
        actual: digest({
          canvas: b.selected(),
          rows: b.selectedRows(),
          runtime: runtime() ? [...runtime().getSnapshot().selectedIds].sort() : expectedSelection,
        }),
        expected: digest({
          canvas: expectedSelection,
          runtime: expectedSelection,
          rows: expectedSelectedRows,
        }),
      },
      {
        id: "runtime-fresh",
        actual: digest(runtime() ? dto(runtime().getSnapshot().elements) : null),
        expected: digest(expectManager ? dto(expectedScene) : null),
      },
      { id: "staging-preserved", actual: digest(stagingEA.elementsDict), expected: stagingBefore },
    ]
    if (b.config.mutant === "check-bypass") checks.length = 0
    for (const check of checks) equal(check.actual, check.expected, check.id)
    equal(
      runtime()?.getSnapshot().version ?? null,
      stableVersion,
      "stable runtime identity across render opportunities",
    )
    if (expectManager && rt && runtime() !== rt) throw Error("runtime unexpectedly replaced")
    b.expanded = expanded
    longTasks.push(
      ...(observer?.takeRecords() ?? []).map((e) => ({ start: e.startTime, duration: e.duration })),
    )
    raw = {
      status: "passed",
      native: true,
      operation,
      index,
      inputPath,
      checks,
      inputPhase: "post-requestAnimationFrame",
      focus: {
        input: true,
        completion: true,
        blurObserved: lostFocus,
        visibility: document.visibilityState,
      },
      timerQuantumMs: b.config.timerQuantumMs,
      counts: {
        scene: expectedScene.length,
        rows: expectedVisible.length,
        selected: expectedSelection.length,
      },
      timing: { inputSync, promiseComplete, settlement, renderOpportunity, renderOpportunities },
      beforeVersion,
      settlementAttempts: stable.attempts,
      afterVersion: stableVersion,
      longTasks: supported ? longTasks.filter((e) => e.start >= start && e.start < end) : null,
      frameGaps: frames.slice(1).map((t, i) => t - frames[i]),
      memory: {
        before: memoryBefore,
        after: performance.memory
          ? {
              used: performance.memory.usedJSHeapSize,
              total: performance.memory.totalJSHeapSize,
              limit: performance.memory.jsHeapSizeLimit,
            }
          : null,
        label: "sampled Chromium performance.memory; not peak, allocation, leak or process RSS",
      },
      settlementLabel:
        "includes native state/cardinality polling; full independent checks follow timing; two stable rAF opportunities, NOT display presentation",
      beforeHashes: {
        scene: digest(sceneProjection(beforeScene)),
        rows: digest(beforeRows),
        selection: digest({
          canvas: beforeSelection,
          runtime: beforeRuntimeSelection,
          rows: beforeSelectedRows,
        }),
      },
    }
    b.effect = "settled"
    b.samples.push(raw)
    return raw
  } catch (error) {
    raw = {
      status: "failed",
      native: true,
      operation,
      index,
      error: String(error),
      elapsed: performance.now() - start,
      effect: b.effect,
      counts: {
        beforeScene: beforeScene.length,
        actualScene: api.getSceneElements().length,
        actualRows: b.rowElements().length,
      },
      actualHead: api
        .getSceneElements()
        .slice(0, 12)
        .map((e) => e.id),
      expectedHead: expectedScene.slice(0, 12).map((e) => e.id),
      tails: {
        actual: api.getSceneElements().at(-1)?.customData?.lmx?.label,
        runtime: runtime()?.getSnapshot().elements.at(-1)?.customData?.lmx?.label,
        expected: expectedScene.at(-1)?.customData?.lmx?.label,
      },
      longTasks: supported
        ? [
            ...longTasks,
            ...(observer?.takeRecords() ?? []).map((e) => ({
              start: e.startTime,
              duration: e.duration,
            })),
          ]
        : null,
      frameGaps: frames.slice(1).map((t, i) => t - frames[i]),
      memoryBefore,
    }
    b.samples.push(raw)
    return raw
  } finally {
    window.removeEventListener("blur", onBlur)
    raf.active = false
    cancelAnimationFrame(raf.id)
    observer?.disconnect()
    if (raw)
      require("fs").appendFileSync(
        b.config.output + "/raw-samples.jsonl",
        JSON.stringify(raw) + "\n",
      )
  }
}
