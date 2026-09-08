---
summary: "AK #5566 repairs diff coordinates with red/green regressions; real replay removes CRAP blocker but exposes two surviving mutants."
read_when:
  - "You need the closeout for the LayerManager quality-wrapper repair."
type: "reference"
---

# Quality-wrapper repair

AK #5566 adds Git's package-relative patch option without changing range selection, runtime code, or quality policy. The new black-box wrapper suite failed 5/9 assertions before the fix on repository-prefixed hunk headers, then passed all 9. Independent review found no blocker; fixture Git configuration isolation was applied.

The [repair record](../packages/obsidian-excalidraw-layer-manager/docs/project/2026-09-08-ts-quality-wrapper-repair.md) and [evidence summary](../packages/obsidian-excalidraw-layer-manager/docs/evidence/2026-09-08-ts-quality-wrapper-repair.json) retain the exact migration replay and validation boundaries.

- Required CI passes: 663 tests in 63 files, unchanged coverage floors, 20 existing lint warnings.
- Build passes; SHA-256 `cfef5795e992782c4b56e61ae49dca239d804c815d4b50d1b42c66540398e561` matches the migration bundle.
- Real optional review selects 0/55 main.ts functions and has no changed-CRAP finding. A read-only body-hunk probe still selects the factory.
- Optional verdict remains **fail**, exit 0: corrected scope selects two prompt-interaction mutants, both surviving; confidence 56. AK #5572 owns their investigation/resolution.
- No personal-vault sync, lab refresh, real-host smoke, policy weakening, or tool-owner mutation. Unrelated `.ontology/` remains outside the task.

Learning: fixing evidence scope can reveal different blockers. Report the corrected sample and semantic verdict rather than treating removal of the original finding as a universal pass.
