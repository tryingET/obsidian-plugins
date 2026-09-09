// Executed ONLY through native-host's fresh PID/profile/vault/nonce/script guard.
// Function dependencies are injected explicitly from native-fixture.js, never product code.
export async function prepareNativeCase(
  config,
  makeDescriptors,
  expectedRows,
  sceneProjection,
  settleUntilStable,
  expectedFrontOrder,
) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const wait = async (predicate, label) => {
    const deadline = performance.now() + 60000
    while (!predicate()) {
      if (performance.now() > deadline) throw Error(`settlement timeout: ${label}`)
      await sleep(16)
    }
  }
  await wait(() => app.plugins?.plugins?.["obsidian-excalidraw-plugin"], "plugin")
  const p = app.plugins.plugins["obsidian-excalidraw-plugin"]
  const leaf = app.workspace.getLeaf(false)
  await leaf.setViewState({ type: "excalidraw", state: { file: "testing.md" }, active: true })
  await wait(() => leaf.view.excalidrawAPI, "canvas")
  const api = leaf.view.excalidrawAPI
  const ea = p.ea
  ea.reset()
  ea.setView(leaf.view, false)
  const templateId = ea.addRect(0, 0, 20, 15)
  const template = structuredClone(ea.getElement(templateId))
  ea.clear()
  const descriptors = makeDescriptors(config.size, config.shape, config.seed)
  const elements = descriptors.map((e, i) => ({
    ...structuredClone(template),
    ...structuredClone(e),
    seed: config.seed + i,
    version: 1,
    versionNonce: config.seed + i,
    updated: 1,
    index: null,
  }))
  api.updateScene({
    elements,
    appState: {
      selectedElementIds: {},
      selectedGroupIds: {},
      zoom: { value: 1 },
      scrollX: 0,
      scrollY: 0,
    },
    captureUpdate: "NEVER",
  })
  await wait(() => api.getSceneElements().length === config.size, "fixture count")
  const canonical = (value) => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
    if (value && typeof value === "object")
      return `{${Object.keys(value)
        .sort()
        .filter((k) => value[k] !== undefined)
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",")}}`
    return JSON.stringify(value)
  }
  const digest = (value) =>
    require("crypto").createHash("sha256").update(canonical(value)).digest("hex")
  const equal = (actual, expected, label) => {
    if (digest(actual) !== digest(expected)) throw Error(`${label}: exact semantic mismatch`)
  }
  const actual = api.getSceneElements()
  equal(
    actual.map((e) => Object.fromEntries(Object.keys(descriptors[0]).map((k) => [k, e[k]]))),
    descriptors,
    "fixture independent descriptors",
  )
  const root = () => document.querySelector("#lmx-sidepanel-content-root")
  const rowElements = () => [...(root()?.querySelectorAll('[role="treeitem"]') ?? [])]
  const rows = () =>
    rowElements().map((r) => ({
      id: decodeURIComponent(r.id.replace(/^lmx-row-\d+-/, "").replaceAll("_", "%")),
      level: Number(r.getAttribute("aria-level")),
      expanded: r.hasAttribute("aria-expanded") ? r.getAttribute("aria-expanded") === "true" : null,
    }))
  const runtime = () => globalThis.excalidrawLayerManagerRuntime
  const rowProof = () => {
    const projected = rows()
    return rowElements().map((r, i) => ({
      ...projected[i],
      label: r
        .getAttribute("aria-label")
        .replace(/^\[[^\]]+\] /, "")
        .split(" · ")[0],
    }))
  }
  const selectedRows = () =>
    rowElements()
      .filter((r) => r.getAttribute("aria-selected") === "true")
      .map((r) => decodeURIComponent(r.id.replace(/^lmx-row-\d+-/, "").replaceAll("_", "%")))
      .sort()
  const selected = () =>
    Object.keys(api.getAppState().selectedElementIds)
      .filter((id) => api.getAppState().selectedElementIds[id])
      .sort()
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
  const open = async () => {
    await p.scriptEngine.executeScriptFile(
      leaf.view,
      app.vault.getAbstractFileByPath("Excalidraw/Scripts/LayerManager.md"),
      "LayerManager",
    )
    await wait(() => runtime() && root(), "manager")
  }
  const close = async () => {
    const rt = runtime()
    const tab = p.ea.checkForActiveSidepanelTabForScript("LayerManager")
    if (!tab) throw Error("owned native manager tab missing")
    tab.close()
    await wait(() => rt.isDisposed() && !runtime() && !root(), "native tab disposal")
  }
  const frame = () => new Promise((r) => requestAnimationFrame((t) => r(t)))
  await frame()
  await frame()
  const fixture = {
    config,
    descriptorsHash: digest(descriptors),
    nativeInitialHash: digest(sceneProjection(api.getSceneElements())),
    count: actual.length,
    pluginVersion: p.manifest.version,
  }
  require("fs").writeFileSync(
    config.output + "/fixture.json",
    JSON.stringify({
      ...fixture,
      template,
      ...(config.retainFullFixture === false ? {} : { descriptors }),
    }),
  )
  globalThis.__AK5583 = {
    config,
    p,
    leaf,
    api,
    ea,
    wait,
    equal,
    digest,
    dto,
    expectedRows,
    sceneProjection,
    settleUntilStable,
    expectedFrontOrder,
    rows,
    rowProof,
    selectedRows,
    rowElements,
    runtime,
    selected,
    open,
    close,
    frame,
    expanded: [],
    initialElements: structuredClone(api.getSceneElements()),
    fixture,
    samples: [],
    effect: "settled",
  }
  return fixture
}
