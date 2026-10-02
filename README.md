# Schedule Runner

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for the feature ledger and verification boundary.

This directory contains two deliberately separate runners:

- `routine-runner.md` is the thin configuration/entry note for the checkbox routine/countdown runner. Its Obsidian adapter is `routine-runner-ui.js`, and its testable parsing, tree, timing, and formatting logic is `routine-runner.js`. `routine-runner-embed.js` is the shared nested-task component used by both runners. Schedule Runner does not share Routine Runner's active session or cache state.
- `schedule-runner.md` contains the registry configuration and the thin entry point. It loads `schedule-runner-ui.js`, which executes the `## Plan` in today’s Daily Note and records transitions in that note’s `## Actual` section; pure timeline and classification logic remains in `schedule-runner.js`. Embedded task navigation/timers are stored separately in `schedule-runner-state.yaml`; they never share `routine-runner-state.yaml`, and Actual remains authoritative for schedule-block state.
- Scheduled task blocks show the shared task-selection tree and `Start routine` control directly, without a separate task launcher step.

Select the Daily Note date at the top of Schedule Runner. It initially defaults to today in UTC and is saved in `schedule-runner-state.yaml`, so reloads and UTC midnight keep the selected day. The selected date controls which note receives Actual entries; their timestamps still use the current UTC time. Daily Notes folder and filename settings are respected.

All timestamps and the reusable time editor use UTC. Start times and completed context end times are editable. Every edit is checked against reconstructed starts, ends, parent intervals, descendants, and sibling transitions. The Daily Note is authoritative for running state: active state is reconstructed from Markdown after every render.

## Timeline grammar

```md
## Plan

- 1000 w ^p-work
  - 1000 +25m "Pomodoro" ^p-pomo
    - 1000 [[Project#^task-a|Task A]] ^p-task-a
    - 1010 — ^p-task-a-end
    - 1010 [[Project#^task-b|Task B]] ^p-task-b
    - 1025 — ^p-task-b-end
  - 1025 — ^p-pomo-end
- 1200 p ^p-personal

- 1030-1130 s "coworking" ^p-coworking
```

`HHMM` starts a main block. `HHMM-HHMM` is an anchored context, `HHMM-` is a running Actual context, and `HHMM —` is an explicit main boundary. A `+duration` main timer begins at its actual Start; a context range remains tied to its scheduled clock times. Main blocks use transitions/boundaries—not ranges—for exact allocations.

The runner enforces one active main ancestor-to-leaf chain. **Switch block** reveals the same inline **Select time block** view used for starting work—there is no separate popup. It contains planned blocks, active ancestors, ended planned blocks with Restart controls, and an inline description field for unplanned work. **Start new block** replaces the main chain; **Start new context** starts overlapping activity without ending main work. Opening or cancelling selection leaves the current block running. Choosing a replacement appends its start to Actual; this implicitly ends the replaced interval without a boundary or pause marker. Starting a child preserves its ancestors; switching to a sibling preserves their shared ancestors; returning to an ancestor starts a new occurrence of that ancestor. Restarts preserve the Plan ID's routine session. Pause any affected routine timers before switching away. Contexts remain independent and use End to fill in their inline end time. Nothing auto-starts, auto-ends, auto-switches, or completes a task merely because time elapsed; task completion requires Done. Existing boundaries and legacy pause markers remain readable.

Every Plan line and generated boundary has a native Obsidian block ID. On render, missing Plan IDs receive random ASCII-only IDs in one guarded write; existing IDs are preserved, generated collisions are avoided, and duplicate existing IDs are reported rather than guessed at. Actual IDs are `a-<random-plan-token>-<occurrence>`. The runner can also create running, unplanned contexts with standalone random ASCII IDs.

Existing or manually entered Actual lines without IDs are repaired on render as well. This keeps state reconstruction safe and prevents generated boundary IDs such as `^null-end`.

## TODO

- Narrow automatic Actual-ID assignment. Keep IDs on Schedule Runner-generated Actual blocks and assign them to manually entered blocks only when they are active or become associated with an embedded routine. Completed standalone manual intervals such as `- 1300-1400 Lunch` should remain untouched, since their timestamps are sufficient for reconstruction and display. Preserve stable IDs wherever End, Pause/Resume, source-line recovery, or routine-session identity depends on them.

## Classification expressions

```text
expression   := union
union        := intersection ("," intersection)*
intersection := primary ("/" primary | adjacent-primary)*
primary      := registered-code | "(" expression ")"
```

Concatenation and `/` are intersection (`p運 = p/運`); comma is union (`w,a`). Intersection binds more tightly (`p運,f = (p AND 運) OR f`), and parentheses override precedence. Compact concatenation requires one-grapheme registered codes. `/` never declares hierarchy.

The registry is the `config.registry` object in `schedule-runner.md`. The order of entries under `projects` defines canonical intersection display order. `parents` are transitive implication/subset edges, `aliases` preserve renamed codes, and `exclusive-groups` alone declare logical conflicts. Validation rejects multi-grapheme/duplicate codes or aliases, unknown parents or exclusive members, cycles, and projects that imply impossible exclusive combinations.

Scope output uses the declaration order under `projects`, canonicalizes aliases, and removes duplicate intersection members. Existing slash notation is retained; compact input remains compact. Newly combined scopes use `settings.new-scope-style`. Classification display follows `settings.warning-level` (`all`, `conflicts-and-unconfirmed`, `conflicts-only`, or `none`).

For task evidence `T` and inherited block requirement `B`:

- **Confirmed** means `T ⇒ B`.
- **Conflict** means `T ∧ B` is impossible under explicit registry constraints.
- **Unconfirmed** means they are compatible but `T` does not guarantee `B`.

Unknown codes are preserved and force Unconfirmed. Universal/general is `true`: it confirms an unclassified block, conflicts with nothing, and cannot confirm a specific block. Thus `w甲` confirms `w`; `w` only leaves `w甲` unconfirmed; `w` confirms `w,a`; `w,a` leaves `w` unconfirmed; and `p` conflicts with `w` only when an exclusive group says so.

For linked block tasks, the runner loads the canonical task, applies inline-over-page classification resolution, intersects requirements inherited from main ancestors, and displays the resulting Confirmed/Conflict/Unconfirmed state. Classification never decides whether a block is main or context—the timestamp syntax does.

## Runner and validation states

Schedule mutations require explicit Start, Switch, Restart, context End, time edit, or Undo actions (apart from missing-ID repair). Main switches append starts; context End closes `HHMM-` in place. The block selector lists upcoming and active blocks first, followed by earlier unstarted blocks; earlier blocks remain available through Start late and do not require persisted dismissal markers. The runner creates `## Actual` when required, and all generated entries are inserted before the next heading so later daily-note sections remain outside Actual. The latest generated mutation has a configurable ten-second Undo, applied only if the complete generated slice still matches; unrelated or manually edited content is not removed.

The pure core in `schedule-runner.js` exposes parsing, registry validation, three-state classification, state reconstruction, transactional Start/End transforms, inline task resolution, and guarded Undo. Run its regression tests with:

```sh
node tests/schedule-runner.test.js
node tests/schedule-runner.integration.test.js
node tests/schedule-runner-switch.test.js
node tests/routine-runner.test.js
```

Task Done changes the canonical task checkbox only; it never rewrites an Actual occurrence. Schedule switching and context End are independent of routine completion and routine Pause/Resume.

When an active scheduled block targets a parent checkbox, its card embeds the Routine Runner run view rather than a checklist. On a scheduled block's initial task-selection screen, the editable task tree is collapsed by default; Show task tree and Purge cache sit beside Start routine. The first unfinished leaf starts active, breadcrumbs can focus its ancestors, and the view includes estimate, timer/progress, editable count goals, Pause/Resume, Skip, Done, the right-click Tasks-status menu, and the next-task preview. Embedded Done records `🏁` elapsed time (and `🥅` count), then uses the Tasks plugin's completion transformation when available; otherwise it updates the native Markdown checkbox. Skip advances without changing Markdown. Planned-but-not-active cards remain compact. Embedded state is persisted by canonical task link and its timer requests a screen wake lock. The standalone Routine Runner and embedded cards share parsing, task paths, breadcrumbs, status discovery, result formatting, and completion, while retaining independent timer state.

Both runners play a short two-tone chime once when an active task's elapsed time
reaches its planned duration (`⏱️`). Paused task and runner time does not advance
the alert. A task that is already overdue when its card is opened does not replay
the chime.

After every direct child of an unfinished task has a non-blank checkbox status
(for example `[x]`, `[-]`, or `[/]`), both runners pause normal advancement and
prompt for a status on that parent. Nested parents are offered bottom-up as each
level becomes ready. Skipped or merely deselected children do not count as
status-marked. A parent's recorded `🏁` is an inclusive roll-up of its children's
task time, unassigned time accumulated while tasks in that subtree were paused,
and time spent directly on the parent. Routine totals still count elapsed time
only once rather than adding these roll-ups again.

# Run tree and Undo

Both runners show the run's task tree below the task card. Task labels come from
one shared function (`taskDisplay` in `routine-runner.js`), which hides Tasks
metadata (`📅 ✅ ➕ ⏫ 🔁 🆔 ⛔ …`), runner fields (`⏱ 🎯 🏁 🥅`), bracketed
groups such as `[🏁 5:00, 🥅 3]`, comments, and block IDs. Completing a task
therefore never changes its label or its saved key.

Processed tasks are greyed and struck through: those skipped or completed in this
run, plus any task already checked in the note. Tasks processed in this run have
a **↶ Undo** button (or `u` in the tree). Undo is a rewind: it reopens that task
and reverts it and every later Skip/Done, unchecking completed tasks in the note.
You are asked to confirm when more than one action would be undone. If a completed
line was edited since, the rewind is refused and nothing changes. Tasks that were
checked before the run started have no Undo; uncheck them in the note.

While a task is running, the tree's ↑/↓ controls reorder sibling task blocks in
the source note (a parent moves together with its full subtree). Click a row and
use **Add after selected** to create a new unchecked task in both the live run
and the original document. At the linked root of a scheduled routine, the new
task is added as a child so it remains inside that routine. These edits do not
pause or reset the active timer.

These tree controls are available both before starting and during a run.
Use the checkbox to the left of a task name to mark it `[x]` in the source note;
right-click it to choose another configured Tasks status. The active task and
its active ancestors remain protected. Click the displayed
estimated time to edit its `⏱️` value with a native time input used as a duration
control. Right-click a task label for the task menu, including deletion
from the run and source note. Deleting a parent deletes its
whole Markdown subtree after confirmation; the active task and its active
ancestors are protected during a run.

# Runner pauses

Both runners share two pause controls. The task card's Pause stops only the task
timer; time continues as **unassigned time** (for unwritten tasks). **Pause runner**
beside Stop marks a break and freezes task and unassigned time. Resume runner
restores the task's previous running/paused state. Break state and timing are
saved in the host's state file. Stop still returns to selection.

The summary's total includes task and unassigned time, excludes breaks, and shows
unassigned time separately. Leaf-task `🏁` results contain only their direct task
time; parent `🏁` results use the inclusive subtree roll-up described above.
Schedule timers remain independent. Unassigned time before this feature was
installed cannot be reconstructed.
