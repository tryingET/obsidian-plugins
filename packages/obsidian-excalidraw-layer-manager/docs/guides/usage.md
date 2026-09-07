---
summary: "Operator guide for row selection, naming, organization, quick move, and recoverable host states."
read_when:
  - "You are using Layer Manager and need predictable actions and troubleshooting."
type: "reference"
---

# Use Layer Manager

Start with a disposable drawing while evaluating the [known limitations](../project/2026-09-07-layer-manager-closeout.md#remaining-blockers). Installation is in the [package README](../../README.md).

## Select before acting

Focus is the row receiving keyboard navigation. Selection is the set of rows or elements an action targets. These are related but not interchangeable. Structural commands prefer explicit row selection, then canonical element selection, and use the focused row only when selection is empty. Without a target, the command fails closed.

Use arrow keys to navigate, `Space` to select/deselect the focused row, `Ctrl+Space` to toggle it, and `Shift+Space` to add the visible anchor-to-focus range. Expand groups to inspect members or select a group row to act on its structure. A collapsed group is not a promise that only its representative element will move.

## Keyboard reference

The header `?` displays the implemented help. These defaults come from the renderer and keyboard controller, not from an external application's shortcut conventions.

| Key | Action |
|---|---|
| `↑` / `↓`; `Home` / `End` | Move focus; reach row bounds |
| `Shift+↑` / `Shift+↓` | Extend row selection |
| `PageUp` / `PageDown`; with `Shift` | Move by page; extend by page |
| `←` / `→` | Collapse / expand |
| `Space`; `Ctrl+Space`; `Shift+Space` | Select/deselect; toggle; add visible range |
| `Enter` | Start inline rename |
| `Delete` | Delete the resolved target |
| `Alt+↑` / `Alt+↓` | Nudge order |
| `F` / `B`; `Shift+F` / `Shift+B` | Reorder; move to front/back |
| `Alt+[` / `Alt+]` | Move out of / into a group |
| `Alt+0`; `Alt+1..9` | Move to root; use an indexed group destination |
| `G` / `U` | Group / ungroup-like structural action |

Keyboard routing is intended for the live panel, not arbitrary text inputs. When focus leaves the panel or the drawing is unavailable, typing and tab navigation outside the panel must remain usable. Host or operating-system shortcut conflicts need testing in the target environment.

## Rename and inspect names

Start rename with `Enter`, the row rename action, or double-click. Confirm with `Enter` or cancel with `Escape`; the published editor also has blur-commit behavior. Empty trimmed names are rejected. A rejected outcome keeps the draft rather than presenting an unsuccessful rename as committed.

**Published limitation:** live refresh can detach an editor and lose focus or commit through blur. Focus/caret preservation exists in an unpublished candidate, not current `main`. Finish or cancel a rename before deliberately refreshing or switching drawing context during evaluation.

Ordinary names are LMX labels; frame names are native. Legacy names remain readable without a bulk migration. See [metadata and naming](../reference/metadata-contract.md) before manually changing drawing JSON.

## Filter without changing command scope

Filtering searches visible labels and underlying aliases, including matching descendants inside collapsed groups and bound text. `Escape` clears the filter and returns to the row tree when handled by the filter control.

A filter is a presentation aid, not a new structural selection. Hidden members can still be part of a selected group. Review the selected target and destination before reorder, drag/drop, or quick move. Mixed or incompatible targets should produce an honest disabled/rejected outcome rather than a partial success impression.

## Organize and review

Use row controls for visibility and locking; observe the resulting state rather than assuming each click applied. Relative reorder operates within the applicable structural scope. Same-parent drag/drop is qualified as reorder; a center drop into a group is an explicit containment/reparent operation. Incompatible moves fail closed through the command planner.

Quick move exposes root and group destinations. Its indexed keyboard slots refer to the current destination mapping, not permanent group identities. Remembered destinations/settings use the host's script settings facilities. Enabling remembered settings does **not** enable automatic restoration of the Layer Manager tab on Obsidian startup.

## Drawing transitions and close

With the panel open, switching to Markdown should remove live rows/actions and show an inactive or unbound shell. Normal same-leaf recovery uses the host hooks plus a scoped layout signal and bounded readiness checks. API-readiness variants remain open; do not assume every delayed host initialization will recover.

Closing the **Layer Manager tab** is different from closing its associated drawing. Normal tab close disposes the owning runtime. Associated-view closure leaves the panel available to bind another drawing and must not detach sibling script tabs.

After deploying a new bundle, explicitly rerun the script. Simply copying the file does not replace a running invocation. If a panel remains unavailable, save the drawing, capture the context/version details, and rerun; see the [verification guide](verification.md) before reporting the issue. Keep valuable drawings backed up while the late-write and staging blockers remain unresolved.
