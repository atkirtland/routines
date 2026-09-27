# Schedule Runner

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for the feature ledger and verification boundary.

This directory contains two deliberately separate runners:

- `routine-runner.md` is the thin configuration/entry note for the checkbox routine/countdown runner. Its Obsidian adapter is `routine-runner-ui.js`, and its testable parsing, tree, timing, and formatting logic is `routine-runner.js`. Schedule Runner does not load, edit, or share state with it.
- `schedule-runner.md` contains the registry configuration and the thin entry point. It loads `schedule-runner-ui.js`, which executes the `## Plan` in today’s Daily Note and records transitions in that note’s `## Actual` section; pure timeline and classification logic remains in `schedule-runner.js`.

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

The runner enforces one active main ancestor-to-leaf chain. A Start click on a nested main block records its missing ancestors in the same write. Starting a different main leaf is disabled until the active leaf is explicitly ended. A parent cannot end with an active descendant. Contexts are independent and may overlap the main chain and one another. Pause closes the current occurrence and Resume creates another. Nothing auto-starts, auto-ends, auto-switches, or completes a task merely because time elapsed; task completion requires Done.

Every Plan line and generated boundary has a native Obsidian block ID. On render, missing Plan IDs are assigned in one guarded write; existing IDs are preserved, generated collisions are suffixed, and duplicate existing IDs are reported rather than guessed at. Actual IDs are `a-<plan-id>-<occurrence>`. The runner can also create running, unplanned contexts with standalone Actual IDs.

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

The prototype only mutates Markdown after explicit Start, End, start-time edit, or Undo clicks. End appends a boundary for main work and closes `HHMM-` in place for context work. It creates `## Actual` when required. The latest generated mutation has a configurable ten-second Undo, applied only if the complete generated slice still matches; unrelated or manually edited content is not removed.

The pure core in `schedule-runner.js` exposes parsing, registry validation, three-state classification, state reconstruction, transactional Start/End transforms, inline task resolution, and guarded Undo. Run its regression tests with:

```sh
node tests/schedule-runner.test.js
node tests/schedule-runner.integration.test.js
node tests/routine-runner.test.js
```

Done is separate from End. Done closes running occurrences linked to the canonical task, refuses to run while an affected main block has an active unrelated descendant, and then checks the linked Markdown task. A failed cross-file checkbox write rolls the Daily Note back; guarded Undo verifies and restores both files. This does not yet invoke Tasks-plugin recurrence or custom-status semantics.
