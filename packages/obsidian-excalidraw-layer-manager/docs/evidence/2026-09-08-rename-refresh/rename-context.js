;(async () => {
  const p = app.plugins.plugins["obsidian-excalidraw-plugin"]
  const leaf = app.workspace
    .getLeavesOfType("excalidraw")
    .find((l) => l.view.file?.path === "testing.md")
  const f = globalThis.__ak5575Fixture
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const steps = []
  const check = (name, pass, detail) => steps.push({ name, pass: !!pass, detail })
  globalThis.excalidrawLayerManagerRuntime?.dispose()
  await p.scriptEngine.executeScriptFile(
    leaf.view,
    app.vault.getAbstractFileByPath("Excalidraw/Scripts/LayerManager.md"),
    "LayerManager",
  )
  await sleep(200)
  const rt = globalThis.excalidrawLayerManagerRuntime
  const label = () =>
    leaf.view.excalidrawAPI.getSceneElements().find((e) => e.id === f.ordinary).customData?.lmx
      ?.label
  const before = label()
  const row = [...document.querySelectorAll('#lmx-sidepanel-content-root [role="treeitem"]')].find(
    (r) => r.id.endsWith(f.ordinary),
  )
  row.querySelector('[aria-label="Rename layer"]').click()
  await sleep(80)
  const input = document.querySelector('#lmx-sidepanel-content-root [role="treeitem"] input')
  input.focus()
  input.value = "AK5575 navigation must cancel"
  input.dispatchEvent(new Event("input", { bubbles: true }))
  const proto = Object.getPrototypeOf(p.ea),
    add = proto.addElementsToView
  let writes = 0
  proto.addElementsToView = function (...args) {
    writes++
    return add.apply(this, args)
  }
  try {
    const previousView = leaf.view
    await leaf.view.openAsMarkdown()
    await sleep(300)
    check(
      "native markdown transition unbinds without commit",
      leaf.view.getViewType() === "markdown" &&
        rt.getSnapshot().elements.length === 0 &&
        writes === 0,
      { writes },
    )
    input.dispatchEvent(new FocusEvent("blur"))
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    )
    await sleep(100)
    check("old editor inert while inactive", writes === 0)
    app.workspace.setActiveLeaf(leaf, { focus: true })
    app.commands.executeCommandById("obsidian-excalidraw-plugin:toggle-excalidraw-view")
    for (let i = 0; i < 60 && (!leaf.view.excalidrawAPI || !rt.getSnapshot().elements.length); i++)
      await sleep(100)
    check("same-file replacement is different view", leaf.view !== previousView)
    check(
      "replacement cancels draft and retains stored label",
      !document.querySelector('#lmx-sidepanel-content-root [role="treeitem"] input') &&
        label() === before,
      { label: label(), before },
    )
    input.value = "AK5575 stale replacement input"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new FocusEvent("blur"))
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    )
    await sleep(100)
    check("same IDs in replacement do not revive old editor", writes === 0 && label() === before)
    rt.dispose()
    return {
      title: document.title,
      pluginVersion: p.manifest.version,
      steps,
      pass: steps.every((s) => s.pass),
      mode: "native same-leaf Excalidraw/Markdown/Excalidraw transition with active draft and synthetic stale editor events; native writes counted by delegating observer",
    }
  } finally {
    proto.addElementsToView = add
  }
})()
