// Linux-only owned native host. Never attaches to existing endpoints/profiles.
import { execFileSync, spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import {
  cp,
  mkdir,
  open,
  readFile,
  readlink,
  realpath,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { focusNativeHost } from "./native-focus.js"
import { stopOwnedProcess } from "./native-process.js"
import { assertHostIdentity, RESOURCE_LIMITS } from "./native-safety.js"
import { prepareNativeWindow } from "./native-window.js"

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
export const repoRoot = resolve(packageRoot, "../..")
export const sha = (bytes) => createHash("sha256").update(bytes).digest("hex")
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export async function json(path, data) {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`)
}
export async function processIdentity(pid) {
  const stat = await readFile(`/proc/${pid}/stat`, "utf8")
  return {
    start: stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19],
    cmdline: (await readFile(`/proc/${pid}/cmdline`, "utf8")).split(/[\0 ]/).filter(Boolean),
  }
}
export async function resources(pid) {
  const rows = execFileSync("ps", ["-eo", "pid=,ppid=,rss="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((s) => s.trim().split(/\s+/).map(Number))
  const ids = new Set([pid])
  for (let i = 0; i < 8; i++) for (const [id, parent] of rows) if (ids.has(parent)) ids.add(id)
  const mem = await readFile("/proc/meminfo", "utf8")
  return {
    rssMiB: rows.filter(([id]) => ids.has(id)).reduce((sum, r) => sum + r[2], 0) / 1024,
    availableMiB: Number(mem.match(/^MemAvailable:\s+(\d+)/m)?.[1]) / 1024,
    pids: [...ids],
    label: "summed sampled process-tree RSS; shared pages double-counted, not peak or allocation",
  }
}

export class Cdp {
  constructor(socket) {
    this.socket = socket
    this.next = 0
    this.pending = new Map()
    this.indeterminate = false
    this.events = []
    socket.addEventListener("message", ({ data }) => {
      const msg = JSON.parse(data)
      if (!msg.id && this.events.length < 1000) this.events.push(msg)
      const entry = this.pending.get(msg.id)
      if (entry) {
        this.pending.delete(msg.id)
        clearTimeout(entry.timer)
        msg.error ? entry.reject(Error(JSON.stringify(msg.error))) : entry.resolve(msg.result)
      }
    })
    socket.addEventListener("close", () => {
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer)
        entry.reject(Error("CDP closed: effects indeterminate"))
      }
      this.pending.clear()
      this.indeterminate = true
    })
  }
  static async connect(url, timeout = RESOURCE_LIMITS.startupMs, Socket = WebSocket) {
    const socket = new Socket(url)
    try {
      await new Promise((yes, no) => {
        const timer = setTimeout(() => no(Error("CDP handshake timeout")), timeout)
        const finish = (fn) => (value) => {
          clearTimeout(timer)
          fn(value)
        }
        socket.addEventListener("open", finish(yes), { once: true })
        socket.addEventListener("error", finish(no), { once: true })
        socket.addEventListener(
          "close",
          finish(() => no(Error("CDP closed before open"))),
          { once: true },
        )
      })
      return new Cdp(socket)
    } catch (error) {
      socket.close()
      throw error
    }
  }
  async call(method, params = {}) {
    if (this.indeterminate) throw Error("CDP effects indeterminate: cannot replay")
    const id = ++this.next
    return new Promise((yes, no) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        this.indeterminate = true
        no(Error(`${method}: timeout; effects indeterminate; no retry`))
      }, RESOURCE_LIMITS.operationMs)
      this.pending.set(id, { resolve: yes, reject: no, timer })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async evaluate(expression) {
    const result = await this.call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  close() {
    this.socket.close()
  }
}

export async function launchHost(output, executable) {
  if (!process.env.TMPDIR || resolve(output).startsWith("/tmp/"))
    throw Error("home-backed TMPDIR required")
  // Caller must supply a newly created output directory, never a personal vault or profile.
  const root = await realpath(output)
  if (!root.startsWith(`${await realpath(process.env.TMPDIR)}/`))
    throw Error("output must be inside this heavy-job scratch")
  const vault = join(root, "vault"),
    profile = join(root, "profile"),
    nonce = randomUUID()
  await mkdir(vault)
  await mkdir(profile)
  await mkdir(join(vault, ".obsidian/plugins"), { recursive: true })
  const pluginSource = join(repoRoot, "apps/lab-vault/.obsidian/plugins/obsidian-excalidraw-plugin")
  const pluginDestination = join(vault, ".obsidian/plugins/obsidian-excalidraw-plugin")
  await mkdir(pluginDestination)
  await cp(join(pluginSource, "data.json"), join(pluginDestination, "data.json"))
  const dependencies = JSON.parse(
    await readFile(join(packageRoot, "scripts/performance/host-deps.json"), "utf8"),
  )
  for (const [name, expected] of Object.entries(dependencies.files)) {
    const response = await fetch(dependencies.baseUrl + name)
    if (!response.ok) throw Error(`pinned dependency download failed: ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (sha(bytes) !== expected) throw Error(`pinned dependency changed: ${name}`)
    await writeFile(join(pluginDestination, name), bytes)
  }
  await json(join(root, "dependencies.json"), dependencies)
  await cp(join(repoRoot, "apps/lab-vault/testing.md"), join(vault, "testing.md"))
  await json(join(vault, ".obsidian/community-plugins.json"), ["obsidian-excalidraw-plugin"])
  await json(join(vault, ".obsidian/core-plugins.json"), [])
  await json(join(vault, ".obsidian/app.json"), { livePreview: false })
  await writeFile(join(vault, "AK5583-NONCE"), nonce)
  const settingsPath = join(vault, ".obsidian/plugins/obsidian-excalidraw-plugin/data.json")
  const settings = JSON.parse(await readFile(settingsPath, "utf8"))
  await json(settingsPath, {
    ...settings,
    startupScriptPath: "",
    scriptFolderPath: "Excalidraw/Scripts",
    checkForUpdate: false,
  })
  await mkdir(join(vault, "Excalidraw/Scripts"), { recursive: true })
  const scriptPath = join(vault, "Excalidraw/Scripts/LayerManager.md")
  const bundle = await build({
    entryPoints: [join(packageRoot, "src/main.ts")],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    target: ["es2022"],
    legalComments: "none",
    sourcemap: false,
    charset: "utf8",
  })
  const script = bundle.outputFiles[0].text
  await writeFile(scriptPath, script)
  await json(join(profile, "obsidian.json"), {
    updateDisabled: true,
    vaults: {
      [nonce.replaceAll("-", "").slice(0, 16)]: { path: vault, ts: Date.now(), open: true },
    },
  })
  if (/\s/.test(root)) throw Error("controlled native scratch paths must not contain whitespace")
  // AF_UNIX limit: this alias resolves into the SAME heavy-job root, not another root.
  const tmpAlias = join(homedir(), ".cache", `lmx-${nonce.slice(0, 8)}`)
  let log, child, owned, cdp, stopPromise
  const stop = () =>
    (stopPromise ??= (async () => {
      if (cdp) await json(join(root, "cdp-events.json"), cdp.events).catch(() => {})
      cdp?.close()
      let receipt
      try {
        receipt = owned
          ? await stopOwnedProcess({ ...owned, pgid: owned.pid })
          : child?.pid
            ? {
                status: "indeterminate",
                reason: "spawned PID identity not captured",
                pid: child.pid,
              }
            : { status: "already-absent", reason: "no child spawned" }
      } catch (error) {
        receipt = { status: "indeterminate", error: String(error) }
      }
      await json(join(root, "host-cleanup.json"), receipt).catch(() => {})
      await log?.close().catch(() => {})
      if (
        ["stopped", "already-absent"].includes(receipt.status) &&
        (await readlink(tmpAlias).catch(() => null)) === root
      )
        await unlink(tmpAlias)
      return receipt
    })())
  try {
    log = await open(join(root, "obsidian.log"), "wx")
    await symlink(root, tmpAlias)
    child = spawn(
      executable,
      [
        `--user-data-dir=${profile}`,
        "--remote-debugging-address=127.0.0.1",
        "--remote-debugging-port=0",
        "--no-sandbox",
        "--ozone-platform=wayland",
      ],
      {
        env: {
          ...process.env,
          TMPDIR: tmpAlias,
          TMP: tmpAlias,
          TEMP: tmpAlias,
          XDG_CONFIG_HOME: join(root, "xdg"),
          ELECTRON_ENABLE_LOGGING: "1",
        },
        detached: true,
        stdio: ["ignore", log.fd, log.fd],
      },
    )
    await new Promise((yes, no) => {
      child.once("spawn", yes)
      child.once("error", no)
    })
    const identity = await processIdentity(child.pid)
    owned = {
      vault: await realpath(vault),
      profile: await realpath(profile),
      pid: child.pid,
      start: identity.start,
      targetId: null,
      nonce,
      scriptHash: sha(script),
    }
    await json(join(root, "owned-process.json"), owned)
    const until = Date.now() + RESOURCE_LIMITS.startupMs
    let port, page
    while (Date.now() < until) {
      const text = await readFile(join(profile, "DevToolsActivePort"), "utf8").catch(() => "")
      port = Number(text.split("\n")[0])
      if (port) {
        const pages = await fetch(`http://127.0.0.1:${port}/json/list`, {
          signal: AbortSignal.timeout(Math.max(1, until - Date.now())),
        }).then((r) => r.json())
        page = pages.find((p) => p.url === "app://obsidian.md/index.html" && p.type === "page")
        if (page) break
      }
      if (child.exitCode !== null || child.signalCode !== null)
        throw Error(`owned host exited ${child.exitCode}/${child.signalCode}`)
      await sleep(250)
    }
    if (!page) throw Error("fresh native page did not appear")
    owned.targetId = page.id
    cdp = await Cdp.connect(page.webSocketDebuggerUrl, Math.max(1, until - Date.now()))
    await cdp.call("Runtime.enable")
    const live = await processIdentity(owned.pid)
    if (live.start !== owned.start || !live.cmdline.includes(`--user-data-dir=${profile}`))
      throw Error("owned process identity changed")
    let observed
    while (Date.now() < until) {
      observed = await cdp.evaluate(
        `(() => { if (!globalThis.app?.vault?.adapter) return null; const fs=require('fs'); return {vault:fs.realpathSync(app.vault.adapter.basePath), profile:require('@electron/remote').app.getPath('userData'), nonce:fs.readFileSync(app.vault.adapter.basePath+'/AK5583-NONCE','utf8'), scriptHash:require('crypto').createHash('sha256').update(fs.readFileSync(app.vault.adapter.basePath+'/Excalidraw/Scripts/LayerManager.md')).digest('hex'), native:!!process.versions.electron, url:location.href}; })()`,
      )
      if (observed) break
      await sleep(250)
    }
    assertHostIdentity(owned, { ...observed, pid: child.pid, start: live.start, targetId: page.id })
    const guard = (expression) =>
      `(() => {const fs=require('fs'); if(fs.realpathSync(app.vault.adapter.basePath)!==${JSON.stringify(owned.vault)} || require('@electron/remote').app.getPath('userData')!==${JSON.stringify(owned.profile)} || fs.readFileSync(app.vault.adapter.basePath+'/AK5583-NONCE','utf8')!==${JSON.stringify(nonce)} || require('crypto').createHash('sha256').update(fs.readFileSync(app.vault.adapter.basePath+'/Excalidraw/Scripts/LayerManager.md')).digest('hex')!==${JSON.stringify(owned.scriptHash)}) throw Error('native host identity drift'); return (${expression});})()`
    const evaluate = async (expression) => {
      const liveNow = await processIdentity(owned.pid)
      if (liveNow.start !== owned.start || !liveNow.cmdline.includes(`--user-data-dir=${profile}`))
        throw Error("owned process identity drift")
      return cdp.evaluate(guard(expression))
    }
    await cdp.call("Page.bringToFront")
    const pluginAdmission = await evaluate(`(async()=>{
      const until=Date.now()+60000; let trustClicked=false;
      while(Date.now()<until){
        const manager=app.plugins;
        if(manager?.manifests?.['obsidian-excalidraw-plugin']){
          if(manager.manifests['obsidian-excalidraw-plugin'].version!=='2.27.3' || [...manager.enabledPlugins].some(id=>id!=='obsidian-excalidraw-plugin')) throw Error('unfrozen plugin inventory');
          const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Trust author and enable plugins');
          if(button && !trustClicked){button.click();trustClicked=true;}
          const p=manager.plugins['obsidian-excalidraw-plugin'];
          if(p?.scriptEngine?.executeScriptFile && p.ea) return {trustClicked,version:p.manifest.version,ready:true};
        }
        await new Promise(r=>setTimeout(r,100));
      }
      throw Error('pinned native plugin readiness timeout');
    })()`)
    await json(join(root, "plugin-admission.json"), pluginAdmission)
    const clock = await evaluate(
      `(()=>{let previous=performance.now(),quantum=Infinity,positive=0;for(let i=0;i<100000;i++){const now=performance.now(),delta=now-previous;if(delta>0){quantum=Math.min(quantum,delta);positive++}previous=now}if(!Number.isFinite(quantum)||positive<5)throw Error('timer quantum not established');return {timerQuantumMs:Number(quantum.toPrecision(3)),positiveSteps:positive,probeReads:100000,method:'minimum positive observed performance.now delta; resolution estimate, not clock accuracy'}})()`,
    )
    await json(join(root, "clock.json"), clock)
    await cdp.call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    })
    const nativeWindow = await evaluate(
      `(${prepareNativeWindow.toString()})(require('@electron/remote'))`,
    )
    await json(join(root, "native-window.json"), nativeWindow)
    const focus = async () => {
      await evaluate(
        `require('@electron/remote').getCurrentWindow().setTitle(${JSON.stringify(`AK5583 ${nonce}`)})`,
      )
      return focusNativeHost(owned, () => cdp.evaluate(guard("document.hasFocus()")))
    }
    const focusProof = await focus()
    await json(join(root, "focus.json"), focusProof)
    const environment = await evaluate(
      `({userAgent:navigator.userAgent, versions:process.versions, viewport:[innerWidth,innerHeight,devicePixelRatio], visibility:document.visibilityState, plugin:app.plugins?.plugins?.['obsidian-excalidraw-plugin']?.manifest, obsidian:require('@electron/remote').app.getVersion()})`,
    )
    await json(join(root, "host-identity.json"), {
      owned,
      observed,
      environment,
      clock,
      endpoint: `http://127.0.0.1:${port}`,
      page,
      executable: await realpath(executable),
    })
    const verifyInstalled = async () => {
      if (sha(await readFile(scriptPath)) !== owned.scriptHash)
        throw Error("installed subject drift")
      for (const [name, expected] of Object.entries(dependencies.files))
        if (sha(await readFile(join(pluginDestination, name))) !== expected)
          throw Error(`installed plugin drift: ${name}`)
    }
    return { root, owned, evaluate, cdp, stop, clock, verifyInstalled, focus }
  } catch (error) {
    await json(join(root, "launch-failure.json"), { error: String(error) }).catch(() => {})
    await stop()
    throw error
  }
}
