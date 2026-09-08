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
  const current = () =>
    document.querySelector('#lmx-sidepanel-content-root [role="treeitem"] input')
  const key = (input, k) =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: k, code: k, bubbles: true, cancelable: true }),
    )
  const label = (kind) => {
    const e = leaf.view.excalidrawAPI.getSceneElements().find((e) => e.id === f[kind])
    return kind === "frame" ? e.name : e.customData?.lmx?.label
  }
  const begin = async (kind, draft) => {
    const row = [
      ...document.querySelectorAll('#lmx-sidepanel-content-root [role="treeitem"]'),
    ].find((r) => r.id.endsWith(f[kind]))
    row.querySelector('[aria-label="Rename layer"]').click()
    await sleep(60)
    const i = current()
    i.focus()
    i.value = draft
    i.dispatchEvent(new Event("input", { bubbles: true }))
    i.setSelectionRange(4, 10, "backward")
    return i
  }
  const proto = Object.getPrototypeOf(p.ea),
    add = proto.addElementsToView
  let writes = 0
  proto.addElementsToView = function (...args) {
    writes++
    return add.apply(this, args)
  }
  try {
    for (const kind of ["ordinary", "frame"]) {
      const before = label(kind)
      const original = await begin(kind, "AK5575 " + kind + " verified")
      for (let cycle = 0; cycle < 3; cycle++) {
        rt.refresh()
        await sleep(80)
        const i = current()
        check(
          kind + " refresh " + cycle + " keeps focused draft/caret",
          !!i &&
            document.activeElement === i &&
            i.value === "AK5575 " + kind + " verified" &&
            i.selectionStart === 4 &&
            i.selectionEnd === 10 &&
            i.selectionDirection === "backward",
        )
      }
      const active = current()
      const count = writes
      original.value = "STALE EVENT MUST NOT WRITE"
      original.dispatchEvent(new Event("input", { bubbles: true }))
      key(original, "Enter")
      key(original, "Escape")
      original.dispatchEvent(new FocusEvent("blur"))
      await sleep(100)
      check(
        kind + " stale input/Enter/Escape/blur have no effect",
        writes === count &&
          current() === active &&
          active.value === "AK5575 " + kind + " verified" &&
          label(kind) === before,
        { writesBefore: count, writesAfter: writes },
      )
      if (kind === "ordinary") {
        key(active, "Enter")
        active.dispatchEvent(new FocusEvent("blur"))
      } else {
        const button = document.querySelector("#lmx-sidepanel-content-root button:not([disabled])")
        if (!button) throw Error("No enabled blur target")
        button.focus()
      }
      await sleep(250)
      check(
        kind + " legitimate " + (kind === "ordinary" ? "Enter" : "blur") + " commits exactly once",
        writes === count + 1 && label(kind) === "AK5575 " + kind + " verified",
        { writesBefore: count, writesAfter: writes, label: label(kind) },
      )
      const cancel = await begin(kind, "AK5575 cancelled " + kind)
      key(cancel, "Escape")
      cancel.dispatchEvent(new FocusEvent("blur"))
      await sleep(150)
      check(
        kind + " Escape cancels and late blur stays inert",
        writes === count + 1 && label(kind) === "AK5575 " + kind + " verified",
      )
      check(
        kind + " Escape returns keyboard focus to manager",
        document.activeElement ===
          document.querySelector('#lmx-sidepanel-content-root [role="tree"]'),
      )
    }
    await leaf.view.save()
    await leaf.view.openAsMarkdown()
    await sleep(300)
    app.workspace.setActiveLeaf(leaf, { focus: true })
    app.commands.executeCommandById("obsidian-excalidraw-plugin:toggle-excalidraw-view")
    for (let i = 0; i < 60 && (!leaf.view.excalidrawAPI || !rt.getSnapshot().elements.length); i++)
      await sleep(100)
    for (const kind of ["ordinary", "frame"])
      check(
        kind + " committed name survives saved reopen",
        label(kind) === "AK5575 " + kind + " verified",
      )
    const terminal = await begin("ordinary", "AK5575 disposed must not write")
    const count = writes
    rt.dispose()
    terminal.dispatchEvent(new FocusEvent("blur"))
    key(terminal, "Enter")
    await sleep(120)
    check(
      "disposed input cannot commit or revive",
      writes === count &&
        label("ordinary") === "AK5575 ordinary verified" &&
        !document.querySelector("#lmx-sidepanel-content-root") &&
        !globalThis.excalidrawLayerManagerRuntime,
    )
    return {
      title: document.title,
      pluginVersion: p.manifest.version,
      steps,
      pass: steps.every((s) => s.pass),
      mode: "real native LayerManager DOM; synthetic UI click/input/keyboard/blur with actual focus and native writes counted by delegating observer; native save/reopen/disposal",
    }
  } finally {
    proto.addElementsToView = add
  }
})()
