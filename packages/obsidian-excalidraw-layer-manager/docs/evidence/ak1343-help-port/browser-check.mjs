// Replays a small owned Chromium UI proof, never a personal or Obsidian profile.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, open, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { build } from "esbuild"
import { Cdp } from "../../../scripts/performance/native-host.js"
import {
  readProcessIdentity,
  stopOwnedProcess,
} from "../../../scripts/performance/native-process.js"

const here = dirname(fileURLToPath(import.meta.url))
const out = await mkdtemp(join(process.env.TMPDIR, "ak5613-browser-"))
console.log(`artifacts=${out}`)
const profile = join(out, "profile")
await mkdir(profile)
await build({
  entryPoints: [join(here, "browser-fixture.js")],
  bundle: true,
  outfile: join(out, "fixture.js"),
  format: "iife",
  platform: "browser",
  target: "es2022",
})
await writeFile(
  join(out, "index.html"),
  '<!doctype html><meta charset="utf-8"><title>AK5613 owned browser proof</title><script defer src="fixture.js"></script>',
)
const log = await open(join(out, "chromium.log"), "wx")
let child, owned, cdp
const checks = []
const save = (name, value) => writeFile(join(out, name), JSON.stringify(value, null, 2) + "\n")
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
try {
  child = spawn(
    "/usr/lib/chromium/chromium",
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--no-first-run",
      "--renderer-process-limit=2",
      "--window-size=600,450",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { detached: true, stdio: ["ignore", log.fd, log.fd] },
  )
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve)
    child.once("error", reject)
  })
  const identity = await readProcessIdentity(child.pid)
  owned = { pid: child.pid, start: identity.start, pgid: identity.pgid, profile }
  await save("owned.json", owned)
  let page
  for (let i = 0; i < 100; i++) {
    const port = Number(
      (await readFile(join(profile, "DevToolsActivePort"), "utf8").catch(() => "")).split("\n")[0],
    )
    if (port) {
      page = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())).find(
        (p) => p.type === "page",
      )
      if (page) break
    }
    if (child.exitCode !== null) throw Error("owned browser exited before CDP")
    await sleep(100)
  }
  if (!page) throw Error("owned browser startup timeout")
  cdp = await Cdp.connect(page.webSocketDebuggerUrl, 10000)
  await cdp.call("Runtime.enable")
  await cdp.call("Page.navigate", { url: pathToFileURL(join(out, "index.html")).href })
  for (let i = 0; i < 100 && !(await cdp.evaluate("!!globalThis.probe")); i++) await sleep(50)
  assert.equal(await cdp.evaluate("!!globalThis.probe"), true)
  const key = async (name, code, vk, type = "keyDown") =>
    cdp.call("Input.dispatchKeyEvent", {
      type,
      key: name,
      code,
      windowsVirtualKeyCode: vk,
      ...(type === "keyDown" && (vk === 13 || vk === 32) ? { text: vk === 13 ? "\r" : " " } : {}),
    })
  const press = async (name, code, vk) => {
    await key(name, code, vk)
    await key(name, code, vk, "keyUp")
    await sleep(100)
  }
  const state = () => cdp.evaluate("probe.state()")
  await cdp.evaluate("probe.button().focus()")
  await press("Enter", "Enter", 13)
  let s = await state()
  assert.equal(s.expanded, "true")
  assert.equal(s.clicks.length, 1)
  assert.equal(s.clicks[0].trusted, true)
  checks.push("Enter native input toggles exactly once")
  await press(" ", "Space", 32)
  s = await state()
  assert.equal(s.expanded, "false")
  assert.equal(s.clicks.length, 2)
  checks.push("Space native input toggles exactly once")
  await key(" ", "Space", 32)
  await cdp.evaluate("probe.refresh()")
  await key(" ", "Space", 32, "keyUp")
  s = await state()
  assert.equal(s.expanded, "true")
  assert.equal(s.clicks.length, 3)
  checks.push("Refresh between Space down/up preserves one native activation")
  await press("Tab", "Tab", 9)
  s = await state()
  assert.equal(s.active, s.panel)
  const before = s.scroll
  await press("PageDown", "PageDown", 34)
  await sleep(350)
  s = await state()
  assert.ok(s.scroll > before)
  checks.push("Tab reaches scrolling region; PageDown scrolls with native defaults")
  const reading = s.scroll
  await cdp.evaluate("probe.refresh()")
  s = await state()
  assert.equal(s.active, s.panel)
  assert.equal(s.scroll, reading)
  await press("Escape", "Escape", 27)
  s = await state()
  assert.equal(s.expanded, "false")
  assert.equal(s.active, s.button)
  checks.push("Refresh preserves reading position; Escape closes and returns button focus")
  for (const [name, code, vk] of [
    ["Delete", "Delete", 46],
    ["g", "KeyG", 71],
    ["ArrowDown", "ArrowDown", 40],
  ])
    await press(name, code, vk)
  s = await state()
  assert.equal(s.calls.length, 0)
  checks.push("Help input never invokes layer actions")
  await cdp.evaluate("probe.outside.focus();probe.refresh()")
  assert.equal(await cdp.evaluate("document.activeElement===probe.outside"), true)
  checks.push("Outside focus not stolen by refresh")
  await cdp.evaluate("probe.shell.querySelector('[role=tree]').focus()")
  await press("End", "End", 35)
  assert.ok((await state()).shellScroll > 0)
  await cdp.evaluate("probe.button().focus();probe.shell.scrollTop=0")
  await press("Enter", "Enter", 13)
  await press("Tab", "Tab", 9)
  await cdp.evaluate("probe.shell.scrollTop=0;probe.refresh()")
  await sleep(100)
  s = await state()
  assert.equal(s.active, s.panel)
  assert.equal(s.shellScroll, 0)
  checks.push("Distant row's queued reveals cannot scroll focused help away")
  await cdp.evaluate("probe.migrate();probe.button().focus()")
  s = await state()
  assert.equal(s.expanded, "true")
  assert.ok(s.panel)
  await press("Escape", "Escape", 27)
  s = await state()
  assert.equal(s.expanded, "false")
  assert.equal(s.active, s.button)
  checks.push("Adopted DOM retains disclosure linkage; migrated document keyboard routing works")
  await cdp.evaluate("globalThis.staleButton=probe.button();probe.dispose()")
  assert.equal(
    await cdp.evaluate("probe.shell.querySelector('button[title=\"Keyboard shortcuts\"]')===null"),
    true,
  )
  checks.push("Dispose removes help from mounted output")
  await save("result.json", {
    status: "passed",
    checks,
    browser: await cdp.call("Browser.getVersion"),
    claim:
      "Real Chromium input and DOM against actual renderer; simulated host/actions, not live Obsidian or screen-reader proof",
  })
  console.log(JSON.stringify({ status: "passed", checks }))
} catch (error) {
  await save("failure.json", {
    error: String(error),
    checks,
    state: cdp ? await cdp.evaluate("globalThis.probe?.state()").catch(() => null) : null,
  })
  process.exitCode = 1
  console.error(error)
} finally {
  cdp?.close()
  const cleanup = owned
    ? await stopOwnedProcess(owned)
    : { status: "indeterminate", pid: child?.pid }
  await save("cleanup.json", cleanup)
  await log.close()
  if (!["stopped", "already-absent"].includes(cleanup.status)) process.exitCode = 1
  console.log(`cleanup=${cleanup.status}; retained=${out}`)
}
