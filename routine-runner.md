---
aliases:
  - Routine Runner
created: 2026-09-19T15:14:37-04:00
modified: 2026-09-27T00:00:00Z
---

# Routine Runner

```dataviewjs
const config = {
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
