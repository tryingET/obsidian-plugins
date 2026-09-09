// Workstation-specific Niri focus. Never select by title/app-id ALONE or touch another PID.
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readProcessIdentity } from "./native-process.js"

const execute = promisify(execFile)
export function selectOwnedWindow(windows, pid, nonceTitle) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw Error("invalid owned PID")
  const matches = Object.values(windows).filter(
    (window) => window?.pid === pid && (nonceTitle === undefined || window.title === nonceTitle),
  )
  if (matches.length !== 1 || !Number.isSafeInteger(matches[0].id) || matches[0].id <= 0)
    throw Error("unique exact-PID native window required; no focus fallback")
  return matches[0]
}
export async function focusNativeHost(owned, readFocused) {
  if (typeof owned.nonce !== "string" || owned.nonce.length < 16)
    throw Error("fresh host nonce required for focus")
  const nonceTitle = `AK5583 ${owned.nonce}`
  const verify = async () => {
    const live = await readProcessIdentity(owned.pid)
    if (live.start !== owned.start || !live.cmdline.includes(`--user-data-dir=${owned.profile}`))
      throw Error("focus process identity drift")
  }
  await verify()
  let window
  const mappingDeadline = Date.now() + 3000
  while (Date.now() < mappingDeadline) {
    await verify()
    const { stdout } = await execute("niri", ["msg", "--json", "windows"], {
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    })
    const windows = JSON.parse(stdout)
    if (Object.values(windows).some((w) => w.pid === owned.pid && w.title === nonceTitle)) {
      window = selectOwnedWindow(windows, owned.pid, nonceTitle)
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  if (!window) throw Error("owned native window did not map to exact root PID in Niri")
  await verify()
  await execute("niri", ["msg", "action", "focus-window", "--id", String(window.id)], {
    timeout: 5000,
  })
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    if (await readFocused())
      return {
        method: "Niri exact fresh PID + CDP-set nonce title/window ID then live document.hasFocus",
        pid: owned.pid,
        windowId: window.id,
        documentFocused: true,
      }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw Error("owned native window did not acquire document focus")
}
