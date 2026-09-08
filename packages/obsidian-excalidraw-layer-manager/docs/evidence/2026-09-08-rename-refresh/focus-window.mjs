const targets = await (await fetch("http://127.0.0.1:19573/json/list")).json()
const page = targets.find(
  (p) => p.id === "663E94D02BAACFE4DEC130C7712EF1F6" && p.url === "app://obsidian.md/index.html",
)
if (!page) throw Error("Owned target missing")
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r, j) => {
  ws.addEventListener("open", r, { once: true })
  ws.addEventListener("error", j, { once: true })
})
let id = 0
const pending = new Map()
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data)
  const p = pending.get(m.id)
  if (p) {
    clearTimeout(p.timer)
    pending.delete(m.id)
    p.resolve(m)
  }
})
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id
    const timer = setTimeout(() => reject(Error("Uncertain CDP effects; reconcile")), 15000)
    pending.set(n, { resolve, timer })
    ws.send(JSON.stringify({ id: n, method, params }))
  })
try {
  const guard = await send("Runtime.evaluate", {
    expression:
      "app.vault.adapter.basePath === '/home/tryinget/.local/state/pi-quests/tmp/ak5573-host-yTjeVY/vault'",
    returnByValue: true,
  })
  if (guard.result?.result?.value !== true) throw Error("Wrong vault")
  console.log(JSON.stringify(await send("Page.bringToFront")))
  console.log(
    JSON.stringify(
      await send("Runtime.evaluate", { expression: "document.hasFocus()", returnByValue: true }),
    ),
  )
} finally {
  ws.close()
}
