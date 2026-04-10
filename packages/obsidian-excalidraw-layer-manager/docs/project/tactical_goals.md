---
summary: "Tactical goals for Layer Manager X after the dense row-surface packet closeout: the board-scale review workflow is now active."
read_when:
  - "You are planning the next implementation waves for Layer Manager X."
  - "You need package-level tactical goals after the professional interaction grammar landed truthfully."
type: "proposal"
proposal_status: "active package direction"
---

# Tactical Goals

Active strategic goal: **SG1 — Turn the stabilized projection kernel into a finished operator-facing interaction surface**

## Recently completed tactical goals

### TG1 — Adopt Layer Manager package direction into AK and cut the post-recovery interaction wave truthfully
- **Why this was active:** the package already had strong direction docs, but they still lived only as prose and recovery-era planning notes. Before the next interaction wave could start truthfully, the package needed its own L3 AK direction substrate instead of hiding behind the monorepo root.
- **Outcome:** the package now imports/checks/exports cleanly through AK as its own L3 direction surface, the recovery wave is preserved as completed history instead of lingering as an active slice, and package read-path guidance now names the package-level direction substrate explicitly.
- **Completed by:** repo-local AK tasks `task:1070-1071`.

### TG2 — Establish the professional interaction grammar
- **Why this was active:** the current gap was no longer kernel truth. The current gap was proving that the now-shared selection grammar stayed coherent across the remaining interaction seams instead of leaving keyboard, drag/drop, and host-sync behavior as adjacent interpretations.
- **Outcome:** Layer Manager X now has one validated interaction grammar across row-click selection, keyboard focus/anchor handling, host-selection synchronization, and drag/drop structural moves, so the panel behaves like one pro interaction surface instead of adjacent input-specific paths.
- **Completed by:** repo-local AK tasks `task:1074`, `task:1072`, and `task:1073`.

## Active tactical goals

### TG3 — Build the dense pro layer operating surface
- **State:** done
- **Why this was active:** with the core interaction grammar now coherent, the panel still needed to feel denser, faster, and more legible as a layer console. That required more than spacing polish: the row shell needed clearer structure surfacing plus stronger visibility/lock scan cues.
- **Outcome:** two TG3 packets now landed a denser row shell, dedicated row-type tags, compact match/state badges, structure badges for collapsed or expanded containers, and row-shell/aria cues for hidden and locked state so the panel reads more like a serious layer console.
- **Completed by:** repo-local AK tasks `task:1083-1084`.

### TG4 — Build the board-scale organization and review workflow
- **State:** active
- **Why this is active:** the dense row surface is now materially cut, so the next differentiator is board-scale speed. The panel should help users reorganize, inspect, and review larger scenes unusually well rather than only exposing row-by-row structure.
- **Outcome target:** Layer Manager X supports fast organization, destination memory, review modes, and cleanup/restructure workflows that make large scenes feel tractable.
- **Packets now landed:** `task:1088` cut the wave, `task:1104` shipped the first board-scale slice around review-scope legibility and quick-move destination reading, and `task:1103` tightened those review actions so quick-move and toolbar affordances stay canonical-selection honest under filter, mixed-selection incompatibility, and failed filtered moves.
- **Current pressure:** cut the next TG4 packet without reopening the landed interaction grammar, dense row-state packet, or the newly tightened review-honesty guardrails.

## Cross-cutting quality bar for TG2-TG4

These are not a separate tactical goal. They are mandatory constraints across every interaction phase:
- **outcome honesty** — do not clear or imply success before the command outcome is known
- **persistence honesty** — remembered state, settings, and host reconciliation must not drift silently
- **structural truth** — visible-row convenience must not override canonical structural targeting
- **performance discipline** — richer UX must remain bounded on larger scenes

Each later interaction wave must ship through those constraints rather than deferring them to a cleanup-only phase.
