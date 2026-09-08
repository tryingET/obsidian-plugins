;(async () => {
  const p = app.plugins.plugins["obsidian-excalidraw-plugin"]
  const leaf = app.workspace
    .getLeavesOfType("excalidraw")
    .find((l) => l.view.file?.path === "testing.md")
  const f = globalThis.__ak5575Fixture
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const cases = []
  for (const kind of ["ordinary", "frame"]) {
    globalThis.excalidrawLayerManagerRuntime?.dispose()
    await p.scriptEngine.executeScriptFile(
      leaf.view,
      app.vault.getAbstractFileByPath("Excalidraw/Scripts/LayerManager.md"),
      "LayerManager",
    )
    await sleep(200)
    const rt = globalThis.excalidrawLayerManagerRuntime
    const id = f[kind],
      get = () => leaf.view.excalidrawAPI.getSceneElements().find((e) => e.id === id)
    const label = () => (kind === "frame" ? get().name : get().customData?.lmx?.label)
    const initial = label()
    const row = [
      ...document.querySelectorAll('#lmx-sidepanel-content-root [role="treeitem"]'),
    ].find((r) => r.id.endsWith(id))
    if (!row) throw Error("row missing " + id)
    row.querySelector('[aria-label="Rename layer"]').click()
    await sleep(80)
    const input = document.querySelector('#lmx-sidepanel-content-root [role="treeitem"] input')
    if (!input) throw Error("input missing")
    const draft = "AK5575 " + kind + " uncommitted draft"
    input.focus()
    input.value = draft
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.setSelectionRange(3, 11, "backward")
    const before = {
      focused: document.activeElement === input,
      value: input.value,
      start: input.selectionStart,
      end: input.selectionEnd,
      direction: input.selectionDirection,
      label: label(),
    }
    // Actual native scene callback, without moving focus away from the draft.
    const api = leaf.view.excalidrawAPI
    const other = api.getSceneElements().find((e) => e.id !== id && e.type === "rectangle")
    api.updateScene({
      elements: api
        .getSceneElements()
        .map((e) =>
          e.id === other.id
            ? { ...e, x: e.x + 1, version: e.version + 1, versionNonce: e.versionNonce + 1 }
            : e,
        ),
      captureUpdate: "IMMEDIATELY",
    })
    await sleep(300)
    rt.refresh()
    await sleep(100)
    const current = document.querySelector('#lmx-sidepanel-content-root [role="treeitem"] input')
    const after = {
      exists: !!current,
      focused: document.activeElement === current,
      value: current?.value,
      start: current?.selectionStart,
      end: current?.selectionEnd,
      direction: current?.selectionDirection,
      label: label(),
      oldConnected: input.isConnected,
    }
    const steps = [
      { name: "draft survives same-view refresh", pass: current?.value === draft },
      { name: "focus survives refresh", pass: !!current && document.activeElement === current },
      {
        name: "selection/caret survives refresh",
        pass:
          current?.selectionStart === 3 &&
          current?.selectionEnd === 11 &&
          current?.selectionDirection === "backward",
      },
      { name: "refresh does not commit", pass: label() === initial },
    ]
    if (!input.isConnected) input.dispatchEvent(new FocusEvent("blur"))
    await sleep(100)
    steps.push({ name: "detached old blur cannot commit", pass: label() === initial })
    const active = document.querySelector('#lmx-sidepanel-content-root [role="treeitem"] input')
    if (active) {
      active.focus()
      active.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      )
      await sleep(100)
    }
    steps.push({ name: "Escape cancels without scene change", pass: label() === initial })
    cases.push({
      kind,
      id,
      before,
      after,
      labelAfterDetachedBlurAndEscape: label(),
      steps,
      pass: steps.every((s) => s.pass),
    })
  }
  return {
    title: document.title,
    pluginVersion: p.manifest.version,
    cases,
    pass: cases.every((c) => c.pass),
    mode: "real native LayerManager DOM button/input/focus/selection; native scene update triggers refresh; synthetic detached blur fault injection and Escape",
  }
})()
