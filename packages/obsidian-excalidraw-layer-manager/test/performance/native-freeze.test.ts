import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { treeInventory, verifyTree } from "../../scripts/performance/native-freeze.js"

describe("Given an independently pinned evaluator inventory", () => {
  it("When a checker is bypassed, added, or removed Then byte identity fails closed", async () => {
    const root = await mkdtemp(join(process.env["TMPDIR"] ?? process.cwd(), "ak5583-freeze-test-"))
    try {
      await writeFile(join(root, "check.js"), 'throw Error("required oracle")')
      const frozen = await treeInventory(root)
      await expect(verifyTree(root, frozen)).resolves.toBeUndefined()
      await writeFile(join(root, "check.js"), "return true")
      await expect(verifyTree(root, frozen)).rejects.toThrow("frozen tree changed")
      await writeFile(join(root, "check.js"), 'throw Error("required oracle")')
      await writeFile(join(root, "extra.js"), "bypass")
      await expect(verifyTree(root, frozen)).rejects.toThrow("frozen tree changed")
      await rm(join(root, "extra.js"))
      await rm(join(root, "check.js"))
      await expect(verifyTree(root, frozen)).rejects.toThrow("frozen tree changed")
    } finally {
      await rm(root, { recursive: true })
    }
  })
  it("When a symlink could redirect a frozen input Then reject it", async () => {
    const root = await mkdtemp(join(process.env["TMPDIR"] ?? process.cwd(), "ak5583-freeze-test-"))
    try {
      await symlink("elsewhere", join(root, "subject.js"))
      await expect(treeInventory(root)).rejects.toThrow("symlink")
    } finally {
      await rm(root, { recursive: true })
    }
  })
})
