;(async () => {
  const p = app.plugins.plugins["obsidian-excalidraw-plugin"]
  const leaf = app.workspace
    .getLeavesOfType("excalidraw")
    .find((l) => l.view.file?.path === "testing.md")
  globalThis.excalidrawLayerManagerRuntime?.dispose()
  const ea = p.ea
  ea.reset()
  ea.setView(leaf.view, false)
  const ordinary = ea.addRect(1600, 1000, 100, 80)
  const frame = ea.addFrame(1600, 1200, 240, 200, "AK5575 frame original")
  ea.getElement(ordinary).customData = {
    lmx: { label: "AK5575 rectangle original" },
    foreign5575: "keep",
  }
  await ea.addElementsToView(false, false, true)
  ea.clear()
  await p.scriptEngine.executeScriptFile(
    leaf.view,
    app.vault.getAbstractFileByPath("Excalidraw/Scripts/LayerManager.md"),
    "LayerManager",
  )
  await new Promise((r) => setTimeout(r, 300))
  globalThis.__ak5575Fixture = { ordinary, frame }
  return {
    fixture: globalThis.__ak5575Fixture,
    title: document.title,
    version: p.manifest.version,
    buttons: [...document.querySelectorAll("#lmx-sidepanel-content-root button")]
      .filter((b) => b.title.includes("Rename"))
      .map((b) => ({ title: b.title, row: b.parentElement.outerHTML.slice(0, 2500) }))
      .slice(-3),
  }
})()
