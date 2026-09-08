---
summary: "AK #5580: authorized two-file upstream replacement PR #2925, old PR #2737 cross-linked and closed."
read_when:
  - "You need the published LayerManager PR, payload identity or supersession receipt."
type: "review"
---

# Upstream PR replacement

The operator explicitly authorized a fresh two-file PR, a change-summary comment tagging the maintainer on the old PR, and closing the old PR after the replacement exists.

## Observed GitHub result

- New [PR #2925](https://github.com/zsviczian/obsidian-excalidraw-plugin/pull/2925): **OPEN**.
- Old [PR #2737](https://github.com/zsviczian/obsidian-excalidraw-plugin/pull/2737): **CLOSED**, not merged or deleted.
- [Supersession comment](https://github.com/zsviczian/obsidian-excalidraw-plugin/pull/2737#issuecomment-5583765234): links the replacement, summarizes lifecycle/naming/staging/rename changes, and mentions `@zsviczian` once.
- Before supersession, #2737 had no formal reviews or inline review comments, but did have two maintainer discussion comments, including the May 8 testing feedback. That feedback is explicitly linked from the replacement.
- No upstream checks were reported by GitHub at the final observation; local verification is not a remote CI claim.

## Exact publication boundary

The new branch `tryingET:add-layer-manager-refreshed-2026-09-08` targets upstream `master`, based on `7abf0dfea2c00a711e0561bc560a7e8c3f61781d`. Commit `2d14cb90c5e69f3490f59c4b450e3a762f85d786` adds exactly:

| Path | SHA-256 |
|---|---|
| `ea-scripts/LayerManager.md` | `8039c3abbaf22cd25e7720f8d2970bd626df8584fffe089d59bb177fa60b8889` |
| `ea-scripts/LayerManager.svg` | `00d122332f7c4115597c6390420915c90a47d1c4595a804a4b0a7041e475511e` |

The SVG is byte-identical to #2737 and the local lab icon. Both files retain MIT markers. No plugin source, dependencies, versions, internal task records, local evidence or lab drawing content was pushed to the upstream fork branch. The obsidian-plugins source repository was not pushed by this publication task.

The script was freshly built from local source commit `ebc1099`. Build hash `9032818dda258072ff77a20f380cdade62866996e9bee90e1ee410ae988f42b1` differs from the outgoing hash only because the generator appends an extra terminal blank line. That line was removed in the distribution copy to pass upstream `git diff --check`; an exact string comparison verified no other difference. JavaScript syntax and exact two-path staging checks passed. The outgoing file was then deployed and reverified natively, rather than treating the earlier byte identity as unchanged. Fetching the uploaded file back from GitHub produced the exact outgoing hash.

## Verification and limits

[Retained receipts](../evidence/2026-09-08-upstream-replacement/summary.json) identify the new payload. Native replay used only the owned disposable Linux vault on Obsidian 1.13.7 / Excalidraw 2.27.3. Five final reports pass: rename refresh/caret, commit/cancel/stale events, same-leaf context replacement, unrelated canvas/staging preservation, and external staging/version/undo/save/reopen. The test runtime was disposed and the identity-checked isolated host stopped; no personal vault was used.

Source-project verification remains the [753-test final gate](../evidence/2026-09-08-rename-refresh/summary.json). A publication-only independent reviewer found no evidenced packaging/claim blocker. The full upstream plugin build was not run: this change contains only downloadable script assets and does not change its runtime build inputs. Cross-platform/mobile, exhaustive heap safety and general asynchronous host transaction safety are not claimed.

The branch was pushed and the replacement verified before the old-PR comment and close operations. No force-push, old-branch deletion, merge, release, repeated mention or reviewer-request notification was performed.
