# Routine and Schedule Runners

Obsidian tools for stepping through task lists and tracking time blocks in Daily Notes.

## Setup

1. Copy the `.md` and `.js` files into one folder in your vault.
2. Enable Dataview's JavaScript queries. For Schedule Runner, enable Daily Notes and set its folder and date format.
3. Open `routine-runner.md` or `schedule-runner.md` in Reading view.

The Tasks plugin is optional; the runners use it for completion, recurrence, and custom statuses when available. Both runners edit your notes directly.

## Run a task list

Open **Routine Runner**, choose a note and optional section, select tasks, then start.

```md
- [ ] Morning routine
  - [ ] Stretch ⏱️ 5:00
  - [ ] Push-ups 🎯 20
  - [ ] Make breakfast
```

Use `⏱️ mm:ss` or `⏱️ hh:mm:ss` for a time estimate and `🎯` for a count goal. Tasks without estimates have no countdown target. Nested tasks run in order; click the breadcrumb trail to work on a parent task.

| Control | Action |
| --- | --- |
| Done | Mark the task complete and record elapsed time (`🏁`) and count (`🥅`). |
| Skip | Move on without changing the task in the note. |
| Pause | Stop the task timer; time continues as unassigned time. |
| Pause runner | Take a break; task and unassigned time stop. |
| Stop | Return to task selection. |

A chime sounds when a task reaches its estimate. Desktop notifications appear where supported. Nothing completes automatically. When all children have a status, the runner asks you to choose a status for their parent.

Use **Show task tree** to inspect tasks. The tree lets you reorder tasks, add tasks, edit estimates, or right-click for statuses and deletion. These actions also update the source note. **Undo** on a processed task reverts that action and every later Skip/Done in the run.

The summary excludes breaks. Parent elapsed times include their children; the total counts that time once.

## Run a daily schedule

Add a `## Plan` section to a Daily Note:

```md
## Plan
- 0900 w "Work"
  - 0900 +25m "Pomodoro"
- 1000 p "Errands"
- 1100-1200 "Coworking"
```

**All schedule times are UTC.** The date picker uses your local date initially and remembers your last selection.

Open **Schedule Runner**, select the date, and start a block. The runner records starts and switches under `## Actual` in that Daily Note.

- **Switch block** changes the current activity. Pause any running task timer first.
- **Start new block** records unplanned work.
- **Start new context** records overlapping activity; use **End** to close it.
- **Restart** returns to an ended planned block.
- Click a recorded time to edit it. Schedule edits have a ten-second **Undo** by default.

Indent blocks to nest them. `+25m` starts a timer when you start the block. A range such as `1100-1200` describes an overlapping context. Use `HHMM —` for an explicit main-block boundary. Blocks never start, switch, or end automatically.

To run tasks inside a block, link to a checkbox's Obsidian block ID:

```md
- 0900 w [[Tasks#^morning-routine]]
```

The block shows task selection and **Start routine**, with the same controls as Routine Runner. The runner adds missing schedule block IDs automatically; keep existing IDs when editing your plan.

To replan, add a `###` heading inside `## Plan` and write the replacement plan beneath it. Only the last revision is offered for starting; earlier plans and Actual records remain.

## Project codes

Edit `config.registry.projects` in `schedule-runner.md` to name your codes. The defaults include `w` (Work), `p` (Personal), and `運` (Exercise).

Combine codes with `/` for “and” (`p/運`) or `,` for “or” (`w,p`). Single-character codes can also be joined directly (`p運`). `parents` defines broader categories; `exclusive-groups` defines combinations that conflict.

Linked tasks show **Confirmed**, **Conflict**, or **Unconfirmed** according to their classification and the block's requirements. Unknown codes are unconfirmed.

## Saved state

Both `.md` configs set `cacheDir` to a `cache` folder beside the runners. To use another vault folder, set:

```js
cacheDir: "private/runner-cache",
```

Folders are created automatically. Move existing state files to the new folder before reloading both runners to keep your sessions. **Purge cache** resets the selected routine's saved state.

Caches contain private task text and timing data. The repository ignores `cache/` and runner state files, including sync-conflict copies. Exclude them when sharing a folder manually, too.

Task completion timestamps use your device's local timezone. Schedule block clocks use UTC.

## TODO

- [ ] w blocks both pomodoro and assigned tasks
- [ ] Leave completed, manually entered Actual intervals alone unless they need IDs for runner controls or saved routines.
