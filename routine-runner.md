---
aliases:
  - Routine Runner
created: 2026-09-19
modified: 2026-09-27T00:00:00Z
---

# Routine Runner

```dataviewjs
const config = {
  cacheDir: `${dv.current().file.folder}/cache`, // Vault-relative; may be elsewhere in the vault.
  defaultEstimateMs: 0,
  redrawIntervalMs: 1000,
};
const uiPath = `${dv.current().file.folder}/routine-runner-ui.js`;
globalThis.__routineRunnerEntry = { dv, app, moment, Notice, config };
try {
  (0, eval)(await app.vault.adapter.read(uiPath));
} finally {
  delete globalThis.__routineRunnerEntry;
}
```
