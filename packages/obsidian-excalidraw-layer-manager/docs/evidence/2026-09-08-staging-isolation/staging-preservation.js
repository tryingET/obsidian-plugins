;(async () => {
  const p = app.plugins.plugins["obsidian-excalidraw-plugin"]
  const leaf = app.workspace
    .getLeavesOfType("excalidraw")
    .find((l) => l.view.file?.path === "testing.md")
  const api = leaf.view.excalidrawAPI
  const rt = globalThis.excalidrawLayerManagerRuntime
  const f = globalThis.__ak5574Fixture
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const steps = []
  const check = (name, pass, detail) => steps.push({ name, pass: !!pass, detail })
  const proto = Object.getPrototypeOf(p.ea)
  const original = proto.copyViewElementsToEAforEditing
  let host
  proto.copyViewElementsToEAforEditing = function (...args) {
    host = this
    return original.apply(this, args)
  }
  try {
    await rt.commands.renameNode({ elementId: f.b, nextName: "AK5574 capture" })
  } finally {
    proto.copyViewElementsToEAforEditing = original
  }
  if (!host) throw Error("native legacy path not used")
  const elements = host.elementsDict,
    images = host.imagesDict
  const sentinel = { id: "ak5574-not-on-canvas", type: "rectangle", x: 1, y: 2 }
  elements[sentinel.id] = sentinel
  images["ak5574-sentinel"] = { id: "ak5574-sentinel", dataURL: "not-an-image" }
  const beforeA = JSON.stringify(api.getSceneElements().find((e) => e.id === f.a))
  const versionBefore = api.getSceneElements().find((e) => e.id === f.b).version
  const outcome = await rt.commands.renameNode({
    elementId: f.b,
    nextName: "AK5574 isolation verified",
  })
  await sleep(150)
  check("native rename applied", outcome.status === "applied", outcome)
  const versionAfter = api.getSceneElements().find((e) => e.id === f.b).version
  check("native element version advances", versionAfter > versionBefore, {
    before: versionBefore,
    after: versionAfter,
  })
  check(
    "external element dictionary identity and sentinel preserved",
    host.elementsDict === elements && elements[sentinel.id] === sentinel,
  )
  check(
    "external image dictionary identity and sentinel preserved",
    host.imagesDict === images && images["ak5574-sentinel"].dataURL === "not-an-image",
  )
  check(
    "staged foreign element not committed",
    !api.getSceneElements().some((e) => e.id === sentinel.id),
  )
  check("staged foreign image not committed", !Object.hasOwn(api.getFiles(), "ak5574-sentinel"))
  check(
    "unrelated element unchanged",
    JSON.stringify(api.getSceneElements().find((e) => e.id === f.a)) === beforeA,
  )
  delete elements[sentinel.id]
  delete images["ak5574-sentinel"]
  const canvas = leaf.view.containerEl.querySelector(".excalidraw")
  canvas.focus()
  const key = (shift) => {
    canvas.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        ctrlKey: true,
        shiftKey: shift,
        bubbles: true,
        cancelable: true,
      }),
    )
    canvas.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: "z",
        code: "KeyZ",
        ctrlKey: true,
        shiftKey: shift,
        bubbles: true,
        cancelable: true,
      }),
    )
  }
  key(false)
  await sleep(200)
  check(
    "native undo reverts latest rename",
    api.getSceneElements().find((e) => e.id === f.b).customData?.lmx?.label === "AK5574 capture",
    api.getSceneElements().find((e) => e.id === f.b).customData,
  )
  key(true)
  await sleep(200)
  check(
    "native redo reapplies rename",
    api.getSceneElements().find((e) => e.id === f.b).customData?.lmx?.label ===
      "AK5574 isolation verified",
  )
  await leaf.view.save()
  await leaf.view.openAsMarkdown()
  await sleep(300)
  app.workspace.setActiveLeaf(leaf, { focus: true })
  app.commands.executeCommandById("obsidian-excalidraw-plugin:toggle-excalidraw-view")
  for (let i = 0; i < 60 && (!leaf.view.excalidrawAPI || !rt.getSnapshot().elements.length); i++)
    await sleep(100)
  const saved = leaf.view.excalidrawAPI.getSceneElements()
  check(
    "saved unrelated canvas edit survives reload",
    saved.find((e) => e.id === f.a)?.x === f.before.x &&
      saved.find((e) => e.id === f.a)?.customData?.foreign5574 === "canvas edit",
  )
  check(
    "saved renamed target survives reload",
    saved.find((e) => e.id === f.b)?.customData?.lmx?.label === "AK5574 isolation verified",
  )
  return {
    title: document.title,
    pluginVersion: p.manifest.version,
    pass: steps.every((s) => s.pass),
    steps,
    mode: "native command facade and staging dictionaries; synthetic DOM keyboard events handled by native undo/redo; native save and same-leaf reload",
  }
})()
