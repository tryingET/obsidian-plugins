---
summary: "AK #5565 closeout: optional CRAP failure traced to diff-path scope mismatch; build verified, repair tracked separately."
read_when:
  - "You need the disposition of the post-migration ts-quality finding."
type: "reference"
---

# Optional quality triage

AK #5565 reproduced the migration-range review: process exit 0, semantic outcome fail, CRAP 1162.75 versus budget 30, five sampled mutants killed. The subject is an unchanged runtime factory, not a TypeScript constructor.

The wrapper supplies package-relative changed filenames but repository-relative diff hunks. Exact-path mismatch triggers file-wide function selection. Correcting only hunk paths in memory changes main.ts selection from 55/55 to 0/55 without changing its CRAP score. This is attribution proof, not a passing corrected quality run.

The [triage record](../packages/obsidian-excalidraw-layer-manager/docs/project/2026-09-08-ts-quality-triage.md) explains the mechanism and AK #5566's scoped repair acceptance. The [evidence summary](../packages/obsidian-excalidraw-layer-manager/docs/evidence/2026-09-08-ts-quality-triage.json) records tool provenance, counterfactual measurements, and validation.

- Root `npm run ci`: passed; 654 tests in 62 files, 20 existing lint warnings.
- Explicit package build: passed; bundle SHA-256 `cfef5795e992782c4b56e61ae49dca239d804c815d4b50d1b42c66540398e561`, matching the migration artifact.
- Explicit strict package docs check: passed.
- No production/wrapper/policy changes, personal-vault deployment, or real-host smoke. Unrelated untracked `.ontology/` remains untouched.

Learning: changed-file and hunk coordinates must share an analysis root; process success, semantic verdict, scope attribution, and bundle generation are distinct evidence claims.
