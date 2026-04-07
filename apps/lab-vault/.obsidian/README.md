---
summary: "Minimal committed Obsidian app config surface for the lab vault."
read_when:
  - "You are deciding what parts of the lab vault's .obsidian directory should stay committed."
  - "You need the shortest rule for reproducible vs ephemeral host config in lab-vault."
type: "reference"
---

# .obsidian (lab-vault)

Commit only the minimum reproducible host config needed for the plugin family proving ground.

Good candidates:
- plugin lists
- minimal core-plugin lists
- stable family-specific config we want to reproduce

Do not commit ephemeral host state such as:
- workspace layout state
- transient caches
- machine-specific noise
