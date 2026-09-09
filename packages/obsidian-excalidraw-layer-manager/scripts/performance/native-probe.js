export default async function nativeProbe() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const until = Date.now() + 10000
  while (!app.plugins?.plugins?.["obsidian-excalidraw-plugin"] && Date.now() < until)
    await sleep(100)
  const p = app.plugins?.plugins?.["obsidian-excalidraw-plugin"]
  if (!p)
    return {
      failed: "Excalidraw not loaded",
      plugins: Object.keys(app.plugins.plugins),
      manifest: app.plugins.manifests["obsidian-excalidraw-plugin"],
      enabled: [...(app.plugins.enabledPlugins ?? [])],
      body: document.body.innerText.slice(0, 3000),
      methods: Object.getOwnPropertyNames(Object.getPrototypeOf(app.plugins)),
      loadResult: await app.plugins
        .loadPlugin("obsidian-excalidraw-plugin")
        .then(() => "loaded")
        .catch((error) => String(error)),
    }
  const file = app.vault.getAbstractFileByPath("testing.md")
  const leaf = app.workspace.getLeaf(false)
  await leaf.openFile(file, { state: { type: "excalidraw" } })
  await leaf.setViewState({ type: "excalidraw", state: { file: "testing.md" }, active: true })
  while (!leaf.view.excalidrawAPI && Date.now() < until) await sleep(100)
  if (!leaf.view.excalidrawAPI) throw Error("Native canvas unavailable")
  await p.scriptEngine.executeScriptFile(
    leaf.view,
    app.vault.getAbstractFileByPath("Excalidraw/Scripts/LayerManager.md"),
    "LayerManager",
  )
  while (!globalThis.excalidrawLayerManagerRuntime && Date.now() < until) await sleep(100)
  const rt = globalThis.excalidrawLayerManagerRuntime
  if (!rt) throw Error("manager unavailable")
  return {
    native: true,
    canvas: leaf.view.excalidrawAPI.getSceneElements().length,
    runtime: rt.getSnapshot().elements.length,
    rows: [...document.querySelectorAll('[role="treeitem"]')].map((r) => ({
      id: r.id,
      text: r.textContent,
      level: r.getAttribute("aria-level"),
      expanded: r.getAttribute("aria-expanded"),
    })),
    focus: document.hasFocus(),
    manifest: p.manifest,
    snapshotKeys: Object.keys(rt.getSnapshot()),
  }
}
