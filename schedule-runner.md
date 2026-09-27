---
aliases: [Schedule Runner, Scheduled Block Runner]
created: 2026-09-27
---

# Schedule Runner

```dataviewjs
const config = {
  registryPath: `${dv.current().file.folder}/projects.yaml`,
};
const uiPath = `${dv.current().file.folder}/schedule-runner-ui.js`;
globalThis.__scheduleRunnerEntry = { dv, app, moment, Notice, config };
try {
  (0, eval)(await app.vault.adapter.read(uiPath));
} finally {
  delete globalThis.__scheduleRunnerEntry;
}
```
