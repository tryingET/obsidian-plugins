import { createStagingAudit } from "./native-sentinel-audit.js"
import { createMixedFixture } from "./native-sentinel-fixture.js"

export { requiredCheckNames } from "./native-sentinel-audit.js"

// Explicit self-contained browser expression; caller still owns fresh-host authorization.
export function buildNativeSentinelExpression(config) {
  return `(${runNativeSentinels.toString()})(${JSON.stringify(config)}, (${createStagingAudit.toString()}), (${createMixedFixture.toString()}))`
}

// Direct API uses the same helper. Do not serialize this function without the explicit builder.
export async function runNativeSentinels(
  config,
  makeAudit = createStagingAudit,
  makeFixture = createMixedFixture,
) {
  const checks = []
  let append, removeStaging, result
  const mode =
    "native EA/command facade; synthetic DOM undo keys; native save/reopen/tab disposal; NOT a timing baseline or physical-input proof"
  try {
    if (!globalThis.process?.versions?.electron || !globalThis.app?.vault?.adapter)
      throw Error("native Electron Obsidian context required")
    const fs = require("node:fs")
    const vault = fs.realpathSync(app.vault.adapter.basePath)
    if (
      !config?.output ||
      fs.realpathSync(config.output) !== vault.slice(0, vault.lastIndexOf("/"))
    )
      throw Error("sentinel output must be the verified disposable vault parent")
    if (globalThis.excalidrawLayerManagerRuntime) throw Error("sentinels require a closed manager")
    const log = `${config.output}/native-sentinels.jsonl`
    fs.writeFileSync(log, "", { flag: "wx" }) // Exclusive attempt; do not replay/append old runs.
    append = (entry) => fs.appendFileSync(log, `${JSON.stringify(entry)}\n`)
    const record = (name, pass, detail = {}) => {
      const check = { name, pass: !!pass, detail, at: new Date().toISOString() }
      checks.push(check)
      append(check)
      if (!pass) throw Error(name)
    }
    const canonical = (value) => {
      if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
      if (value && typeof value === "object")
        return `{${Object.keys(value)
          .sort()
          .filter((k) => value[k] !== undefined)
          .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
          .join(",")}}`
      return JSON.stringify(value)
    }
    const digest = (value) =>
      require("node:crypto").createHash("sha256").update(canonical(value)).digest("hex")
    const clone = (value) => structuredClone(value)
    const project = (elements) =>
      elements.map((e) => {
        const { version: _v, versionNonce: _n, updated: _u, index: _i, ...semantic } = e
        return semantic
      })
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
    const wait = async (predicate, label) => {
      const deadline = performance.now() + 15000
      while (!predicate()) {
        if (performance.now() > deadline) throw Error(`sentinel synchronization timeout: ${label}`)
        await sleep(25)
      }
    }
    await wait(() => app.plugins?.plugins?.["obsidian-excalidraw-plugin"]?.ea, "pinned plugin")
    const plugin = app.plugins.plugins["obsidian-excalidraw-plugin"]
    record(
      "Given the verified host When native sentinels start Then the pinned plugin is present",
      plugin.manifest.version === "2.27.3",
    )
    const leaf = app.workspace.getLeaf(false)
    await leaf.setViewState({ type: "excalidraw", state: { file: "testing.md" }, active: true })
    await wait(() => leaf.view.excalidrawAPI, "fixture canvas")
    let api = leaf.view.excalidrawAPI
    api.updateScene({
      elements: [],
      appState: { selectedElementIds: {}, selectedGroupIds: {} },
      captureUpdate: "NEVER",
    })
    await wait(() => api.getSceneElements().length === 0, "empty disposable fixture")
    const ea = plugin.ea
    ea.reset()
    ea.setView(leaf.view, false)
    const { ids, authoredFixture } = await makeFixture(ea)
    const { ordinary: A, other: B, frame: F } = ids
    await ea.addElementsToView(false, false, true)
    ea.clear()
    await wait(() => api.getSceneElements().length === 6, "six-element mixed fixture")
    record(
      "Given native EA fixtures When inserted Then exact mixed geometry and foreign metadata survive",
      digest(project(api.getSceneElements())) === digest(project(authoredFixture)),
      { ids, authored: project(authoredFixture), actual: project(api.getSceneElements()) },
    )
    let expected = clone(api.getSceneElements())
    const expectedElement = (id) => expected.find((e) => e.id === id)
    const scene = () => api.getSceneElements()
    const root = () => document.querySelector("#lmx-sidepanel-content-root")
    await plugin.scriptEngine.executeScriptFile(
      leaf.view,
      app.vault.getAbstractFileByPath("Excalidraw/Scripts/LayerManager.md"),
      "LayerManager",
    )
    await wait(() => globalThis.excalidrawLayerManagerRuntime && root(), "one native manager")
    const rt = globalThis.excalidrawLayerManagerRuntime
    record(
      "When opened Then exactly one native manager is live",
      !rt.isDisposed() && document.querySelectorAll("#lmx-sidepanel-content-root").length === 1,
    )
    const dto = (elements) =>
      elements.map((e, zIndex) => ({
        id: e.id,
        type: e.type,
        zIndex,
        groupIds: e.groupIds,
        frameId: e.frameId ?? null,
        containerId: e.containerId ?? null,
        opacity: e.opacity,
        locked: e.locked ?? false,
        isDeleted: e.isDeleted ?? false,
        customData: e.customData ?? {},
        ...(typeof e.name === "string" ? { name: e.name } : {}),
        ...(typeof e.text === "string" ? { text: e.text } : {}),
      }))
    const assertScene = async (name) => {
      await frame()
      await frame()
      const expectedDigest = digest(project(expected))
      try {
        await wait(
          () =>
            digest(project(scene())) === expectedDigest &&
            digest(rt.getSnapshot().elements) === digest(dto(expected)),
          name,
        )
      } catch (error) {
        record(name, false, {
          error: String(error),
          native: project(scene()).slice(0, 12),
          expected: project(expected),
          runtime: rt.getSnapshot().elements.slice(0, 12),
          expectedRuntime: dto(expected),
          nativeCount: scene().length,
          runtimeCount: rt.getSnapshot().elements.length,
          diagnosticLimit: 12,
        })
      }
      record(name, digest(project(scene())) === expectedDigest, {
        actualDigest: digest(project(scene())),
        expectedDigest,
        count: scene().length,
        ids: scene().map((e) => e.id),
      })
    }
    await assertScene(
      "When manager opens Then full mixed native scene and normalized runtime agree",
    )
    const audit = makeAudit(),
      proto = Object.getPrototypeOf(plugin.ea)
    let commandEA, pending, checkStaging
    const apply = async (name, action, targets = [A]) => {
      const observed = await audit.command(proto, targets, action, commandEA, pending)
      commandEA ??= observed.ea
      record(`${name}: exact native staging route`, true, observed.proof)
      record(`${name}: command applied`, observed.outcome?.status === "applied", {
        status: observed.outcome?.status,
      })
      await assertScene(`${name}: exact scene, order, geometry and metadata`)
      if (pending) checkStaging(`${name}: pending staging preserved`)
    }
    expectedElement(A).customData.lmx.label = "Ordinary capture"
    await apply("ordinary capture rename", () =>
      rt.commands.renameNode({ elementId: A, nextName: "Ordinary capture" }),
    )
    const staleA = clone(scene().find((e) => e.id === A))
    // Independent native A edit AFTER A rename, before B rename: old A staging must never replay.
    const freshA = expectedElement(A)
    freshA.x += 17
    freshA.strokeColor = "#d12e34"
    freshA.customData.foreign.externalEpoch = "fresh-A"
    freshA.version = staleA.version + 1
    freshA.versionNonce = staleA.versionNonce + 1
    api.updateScene({ elements: clone(expected), captureUpdate: "IMMEDIATELY" })
    await assertScene(
      "external A edit: exact native geometry/color/metadata and event-driven runtime cache",
    )
    record("external A version advanced", scene().find((e) => e.id === A).version > staleA.version)
    const elementsDict = commandEA.elementsDict,
      imagesDict = commandEA.imagesDict
    const originalElements = digest(elementsDict),
      originalImages = digest(imagesDict)
    const elementSentinel = { ...clone(staleA), id: "ak5583-staged-element", x: 777 }
    const imageSentinel = {
      id: "ak5583-staged-image",
      dataURL: "not-an-image",
      mimeType: "image/svg+xml",
      created: 1,
    }
    if (
      Object.hasOwn(elementsDict, elementSentinel.id) ||
      Object.hasOwn(imagesDict, imageSentinel.id)
    )
      throw Error("absent sentinel identity already occupied")
    const slots = audit.slots([
      { object: elementsDict, key: A, value: staleA },
      { object: elementsDict, key: elementSentinel.id, value: elementSentinel },
      { object: imagesDict, key: imageSentinel.id, value: imageSentinel },
    ])
    removeStaging = () => slots.restore() // Armed BEFORE the first potentially partial insertion.
    slots.install()
    const stagedElements = digest(elementsDict),
      stagedImages = digest(imagesDict)
    pending = {
      elements: elementsDict,
      images: imagesDict,
      check: () =>
        commandEA.elementsDict === elementsDict &&
        commandEA.imagesDict === imagesDict &&
        elementsDict[A] === staleA &&
        elementsDict[elementSentinel.id] === elementSentinel &&
        imagesDict[imageSentinel.id] === imageSentinel &&
        digest(elementsDict) === stagedElements &&
        digest(imagesDict) === stagedImages,
    }
    checkStaging = (name) =>
      record(
        name,
        pending.check() &&
          !scene().some((e) => e.id === elementSentinel.id) &&
          !Object.hasOwn(api.getFiles(), imageSentinel.id),
      )
    const undoExpected = clone(expected),
      versionBefore = scene().find((e) => e.id === B).version
    expectedElement(B).customData.lmx.label = "Other verified after fresh A"
    await apply(
      "B rename after fresh external A with OLD A pending",
      () => rt.commands.renameNode({ elementId: B, nextName: "Other verified after fresh A" }),
      [B],
    )
    record(
      "When B is renamed Then its native version advances and fresh A is not replayed",
      scene().find((e) => e.id === B).version > versionBefore,
      { freshA: project([scene().find((e) => e.id === A)]), staleA: project([staleA]) },
    )
    const redoExpected = clone(expected)
    const canvas = leaf.view.containerEl.querySelector(".excalidraw")
    record(
      "Given synthetic undo keys Then a real focused native canvas exists",
      !!canvas && document.hasFocus() && canvas.ownerDocument === document,
      {
        canvasPresent: !!canvas,
        documentFocused: document.hasFocus(),
        sameDocument: canvas?.ownerDocument === document,
        canvasDocumentFocused: canvas?.ownerDocument.hasFocus(),
      },
    )
    const undoKey = (shift) => {
      canvas.focus()
      for (const type of ["keydown", "keyup"])
        canvas.dispatchEvent(
          new KeyboardEvent(type, {
            key: "z",
            code: "KeyZ",
            ctrlKey: true,
            shiftKey: shift,
            bubbles: true,
            cancelable: true,
          }),
        )
    }
    expected = undoExpected
    undoKey(false)
    await assertScene(
      "When native undo handles synthetic keys Then only the last rename is reverted",
    )
    expected = redoExpected
    undoKey(true)
    await assertScene("When native redo handles synthetic keys Then the exact rename is reapplied")
    checkStaging("When undo/redo completes Then foreign staging is unchanged")
    expectedElement(A).customData.lmx.label = "Ordinary verified"
    await apply("ordinary final rename", () =>
      rt.commands.renameNode({ elementId: A, nextName: "Ordinary verified" }),
    )
    expectedElement(F).name = "Frame verified"
    await apply(
      "frame rename",
      () => rt.commands.renameNode({ elementId: F, nextName: "Frame verified" }),
      [F],
    )
    const originalOpacity = expectedElement(A).opacity
    expectedElement(A).opacity = 0
    expectedElement(A).customData.originalOpacity = originalOpacity
    await apply("hide", () => rt.commands.toggleVisibility({ elementIds: [A] }))
    expectedElement(A).opacity = originalOpacity
    delete expectedElement(A).customData.originalOpacity
    await apply("show", () => rt.commands.toggleVisibility({ elementIds: [A] }))
    expectedElement(A).locked = true
    await apply("lock", () => rt.commands.toggleLock({ elementIds: [A] }))
    expectedElement(A).locked = false
    await apply("unlock", () => rt.commands.toggleLock({ elementIds: [A] }))
    const groupName = "AK5583 sentinel group",
      groupId = "AK5583-sentinel-group"
    for (const id of [A, B]) {
      expectedElement(id).groupIds = [groupId]
      expectedElement(id).customData.lmx.groupLabels = { [groupId]: groupName }
    }
    await apply(
      "create exact group",
      () => rt.commands.createGroup({ elementIds: [A, B], nameSeed: groupName }),
      [A, B],
    )
    const selected = () =>
      Object.keys(api.getAppState().selectedElementIds)
        .filter((id) => api.getAppState().selectedElementIds[id])
        .sort()
    record(
      "When grouping Then exact native/runtime selection identifies both members",
      digest(selected()) === digest([A, B].sort()) &&
        digest([...rt.getSnapshot().selectedIds].sort()) === digest([A, B].sort()),
    )
    const reparent = (targetFrameId) =>
      rt.commands.reparent({
        elementIds: [A, B],
        sourceGroupId: null,
        targetParentPath: [],
        targetFrameId,
      })
    const denied = await audit.command(
      proto,
      [A, B],
      () => reparent(F),
      commandEA,
      pending,
      "Cross-frame moves are not supported.",
    )
    record(
      "Cross-frame move: exact rejection before native copy",
      denied.outcome.status === "plannerError" && denied.proof.copyCalls === 0,
      denied.proof,
    )
    await assertScene("Cross-frame rejection: exact scene and frame membership")
    checkStaging("Cross-frame rejection: pending staging preserved")
    for (const id of [A, B]) expectedElement(id).groupIds = []
    await apply("reparent within root", () => reparent(null), [A, B])
    checkStaging(
      "When all facade mutations finish Then complete actual staging dictionaries are preserved",
    )
    const restoration = removeStaging()
    record(
      "When test staging is removed Then original dictionaries/descriptors are restored exactly",
      restoration.status === "restored" &&
        digest(elementsDict) === originalElements &&
        digest(imagesDict) === originalImages,
      restoration,
    )
    removeStaging = null
    await leaf.view.save()
    const plainPath = "AK5583_sentinel_plain.md",
      secondPath = "AK5583_sentinel_second.md"
    record(
      "Given disposable navigation fixtures Then neither path already exists",
      !app.vault.getAbstractFileByPath(plainPath) && !app.vault.getAbstractFileByPath(secondPath),
    )
    await app.vault.create(plainPath, "# Disposable AK5583 sentinel note\n")
    await app.vault.copy(leaf.view.file, secondPath)
    const beforeView = leaf.view,
      beforeAPI = api,
      beforeVersion = rt.getSnapshot().version
    await leaf.view.openAsMarkdown()
    await wait(
      () => leaf.view.getViewType() === "markdown" && rt.getSnapshot().elements.length === 0,
      "inactive markdown context",
    )
    record(
      "When opening as markdown Then the same live runtime clears its scene",
      globalThis.excalidrawLayerManagerRuntime === rt && !rt.isDisposed(),
    )
    app.workspace.setActiveLeaf(leaf, { focus: true })
    app.commands.executeCommandById("obsidian-excalidraw-plugin:toggle-excalidraw-view")
    await wait(
      () => leaf.view.excalidrawAPI && rt.getSnapshot().elements.length === expected.length,
      "saved native reopen",
    )
    api = leaf.view.excalidrawAPI // Mandatory reacquisition after replacement.
    record(
      "When reopened Then the native view/API are new and the same runtime has advanced",
      leaf.view !== beforeView &&
        api !== beforeAPI &&
        globalThis.excalidrawLayerManagerRuntime === rt &&
        rt.getSnapshot().version > beforeVersion,
    )
    await assertScene(
      "When saved/reopened Then all mixed geometry, order, text/freehand, frame membership and metadata survive",
    )
    const tab = plugin.ea.checkForActiveSidepanelTabForScript("LayerManager")
    record("Given disposal Then the exact native manager tab exists", !!tab)
    tab.close()
    await wait(
      () => rt.isDisposed() && !globalThis.excalidrawLayerManagerRuntime && !root(),
      "native tab disposal",
    )
    const closed = async (name) => {
      await frame()
      await frame()
      await sleep(250)
      record(
        name,
        rt.isDisposed() &&
          !globalThis.excalidrawLayerManagerRuntime &&
          document.querySelectorAll("#lmx-sidepanel-content-root").length === 0,
      )
    }
    await closed("When the native tab closes Then the runtime and roots stay disposed")
    for (const [file, type] of [
      [plainPath, "markdown"],
      [secondPath, "excalidraw"],
      ["testing.md", "excalidraw"],
    ]) {
      await leaf.setViewState({ type, state: { file }, active: true })
      await wait(
        () => leaf.view.getViewType() === type && (type === "markdown" || leaf.view.excalidrawAPI),
        "post-disposal navigation",
      )
      await closed(`When navigating to ${file} Then the disposed manager does not resurrect`)
    }
    result = {
      status: "passed",
      native: true,
      checks,
      ids,
      pluginVersion: plugin.manifest.version,
      mode,
      claimLimit:
        "Finite six-element sentinel sequence; no performance/matrix/physical-input or indefinite lifecycle guarantee.",
    }
  } catch (error) {
    result = {
      status: "failed",
      checks,
      error: String(error),
      mode,
      effect:
        "indeterminate if a native action was dispatched; parent must reconcile owned host shutdown, never replay this attempt",
    }
    result.audit = error?.audit ?? null
    append?.({
      status: "failed",
      error: String(error),
      audit: result.audit,
      at: new Date().toISOString(),
    })
  } finally {
    // Only restore test-owned instrumentation/staging, never replay a native command on failure.
    if (removeStaging) {
      const cleanup = removeStaging()
      if (cleanup.status !== "restored") {
        result = {
          ...result,
          status: "failed",
          error: "unresolved sentinel staging cleanup",
          cleanup,
        }
        append?.({ status: "failed", cleanup })
      }
    }
  }
  return result
}
