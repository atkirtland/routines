---
aliases: [Schedule Runner, Scheduled Block Runner]
created: 2026-09-27
---

# Schedule Runner

```dataviewjs
const config = {
  registry: {
    version: 1,
    projects: {
      w: { label: "Work", parents: [], aliases: [] },
      甲: { label: "Project A", parents: ["w"], aliases: [] },
      p: { label: "Personal", parents: [], aliases: [] },
      運: { label: "Exercise", parents: [], aliases: [] },
    },
    "exclusive-groups": [],
    settings: {
      "warning-level": "conflicts-only",
      "undo-seconds": 10,
      "new-scope-style": "compact",
    },
  },
};
const uiPath = `${dv.current().file.folder}/schedule-runner-ui.js`;
globalThis.__scheduleRunnerEntry = { dv, app, moment, Notice, config };
try {
  (0, eval)(await app.vault.adapter.read(uiPath));
} finally {
  delete globalThis.__scheduleRunnerEntry;
}
```
