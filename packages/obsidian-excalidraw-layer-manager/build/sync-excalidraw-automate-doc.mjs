import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const SOURCE_URL =
  "https://raw.githubusercontent.com/zsviczian/obsidian-excalidraw-plugin/refs/heads/master/docs/AITrainingData/ExcalidrawAutomate%20full%20library%20for%20LLM%20training.md"

const projectRoot = process.cwd()
const docsRoot = resolve(projectRoot, "docs/external/excalidraw")
const historyRoot = resolve(docsRoot, "history")
const latestPath = resolve(docsRoot, "ExcalidrawAutomate.full-library.md")
const metadataPath = resolve(docsRoot, "ExcalidrawAutomate.full-library.meta.json")

const fileExists = async (path) => {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

const computeSha256 = (content) => {
  return createHash("sha256").update(content).digest("hex")
}

const readMetadata = async () => {
  if (!(await fileExists(metadataPath))) {
    return null
  }

  try {
    const raw = await readFile(metadataPath, "utf8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const normalizeMarkdown = (content) => content.replace(/\r\n/g, "\n")

const readPreviousHistoryFile = async (metadata) => {
  if (!metadata?.historyFile) {
    return null
  }

  const path = resolve(historyRoot, metadata.historyFile)
  if (!(await fileExists(path))) {
    return null
  }

  try {
    return await readFile(path, "utf8")
  } catch {
    return null
  }
}

const sync = async () => {
  await mkdir(historyRoot, { recursive: true })

  const previousMetadata = await readMetadata()

  const requestHeaders = {
    "user-agent": "obsidian-excalidraw-layer-manager/docs-sync",
  }

  if (previousMetadata?.etag) {
    requestHeaders["if-none-match"] = previousMetadata.etag
  }

  if (previousMetadata?.lastModified) {
    requestHeaders["if-modified-since"] = previousMetadata.lastModified
  }

  const response = await fetch(SOURCE_URL, {
    headers: requestHeaders,
  })

  if (response.status === 304 && previousMetadata) {
    const refreshedMetadata = {
      ...previousMetadata,
      fetchedAt: new Date().toISOString(),
      sourceUrl: SOURCE_URL,
      changed: false,
      previousSha256: previousMetadata.sha256,
      lastCheckStatus: 304,
    }

    await writeFile(metadataPath, `${JSON.stringify(refreshedMetadata, null, 2)}\n`, "utf8")

    console.log("[docs:ea] Upstream unchanged (304 Not Modified).")
    console.log(`[docs:ea] sha256=${refreshedMetadata.sha256}`)
    return
  }

  if (!response.ok) {
    throw new Error(`[docs:ea] Failed to fetch upstream doc: HTTP ${response.status}`)
  }

  const rawContent = await response.text()
  const normalizedContent = normalizeMarkdown(rawContent)
  const sha256 = computeSha256(normalizedContent)
  const shortHash = sha256.slice(0, 12)
  const historyFile = `ExcalidrawAutomate.full-library.${shortHash}.md`
  const historyPath = resolve(historyRoot, historyFile)

  const previousSha = previousMetadata?.sha256 ?? null
  const changed = previousSha !== sha256

  await writeFile(latestPath, normalizedContent, "utf8")

  if (!(await fileExists(historyPath))) {
    await writeFile(historyPath, normalizedContent, "utf8")
  }

  const metadata = {
    sourceUrl: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    sha256,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    latestFile: "ExcalidrawAutomate.full-library.md",
    historyFile,
    previousSha256: previousSha,
    changed,
    lastCheckStatus: response.status,
  }

  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8")

  if (!changed) {
    console.log("[docs:ea] Upstream content hash unchanged.")
    console.log(`[docs:ea] sha256=${sha256}`)
    return
  }

  console.log("[docs:ea] Upstream changed. Local mirror refreshed.")
  console.log(`[docs:ea] sha256=${sha256}`)
  console.log(`[docs:ea] latest=${latestPath}`)
  console.log(`[docs:ea] snapshot=${historyPath}`)

  const previousContent = await readPreviousHistoryFile(previousMetadata)
  if (previousContent !== null) {
    const previousLines = normalizeMarkdown(previousContent).split("\n").length
    const nextLines = normalizedContent.split("\n").length
    console.log(
      `[docs:ea] previousSnapshot=${previousMetadata.historyFile} (lines=${previousLines}) -> currentSnapshot=${historyFile} (lines=${nextLines})`,
    )
    console.log("[docs:ea] Diff tip: git diff -- docs/external/excalidraw")
  }
}

await sync()
